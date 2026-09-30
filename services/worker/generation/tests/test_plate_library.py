"""TASK-0060 (ADR-0027): the reviewed skin plate library."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from generation.plate_library import (
    BODIES,
    PLATES,
    Plate,
    PlateLibrary,
    build,
    planned,
)
from generation.studio import ZONE_VIEWS


def two_tone() -> bytes:
    """Red on the left half, blue on the right: a mirror swaps them."""
    image = Image.new("RGB", (64, 96), "blue")
    image.paste((255, 0, 0), (0, 0, 32, 96))
    output = io.BytesIO()
    image.save(output, format="WEBP", lossless=True)
    return output.getvalue()


def left_pixel(data: bytes) -> tuple[int, int, int]:
    with Image.open(io.BytesIO(data)) as image:
        pixel = image.convert("RGB").getpixel((4, 48))
    assert isinstance(pixel, tuple)
    return (int(pixel[0]), int(pixel[1]), int(pixel[2]))


def test_every_zone_has_a_man_and_a_woman() -> None:
    plates = planned()
    assert len(plates) == 2 * len(ZONE_VIEWS)
    assert {plate.body for plate in plates} == set(BODIES)
    assert len({plate.filename for plate in plates}) == len(plates)
    with pytest.raises(SystemExit, match="unknown zone"):
        planned(["tail"])


def test_a_plate_is_generated_for_the_right_side_or_the_centre_line() -> None:
    assert Plate("thigh_front", "feminine").brief()["placement"]["side"] == "right"
    assert Plate("spine", "masculine").brief()["placement"]["side"] == "centre"


def test_the_library_serves_mirrors_and_declines(tmp_path: Path) -> None:
    (tmp_path / "thigh_front-feminine.webp").write_bytes(two_tone())
    (tmp_path / "chest-feminine.webp").write_bytes(two_tone())
    library = PlateLibrary(tmp_path)

    def brief(zone: str, side: str) -> dict[str, object]:
        return {"placement": {"bodyPart": zone, "side": side, "bodyType": "feminine"}}

    right = library.plate(brief("thigh_front", "right"))
    left = library.plate(brief("thigh_front", "left"))
    assert right is not None and left is not None
    assert right.startswith(b"\x89PNG")
    assert left_pixel(right) == (255, 0, 0)
    assert left_pixel(left) == (0, 0, 255)
    # A centred zone is not mirrored, whatever side the brief names.
    chest = library.plate(brief("chest", "left"))
    assert chest is not None and left_pixel(chest) == (255, 0, 0)
    # Nothing on disk, or not a zone at all: the caller generates one instead.
    assert library.plate(brief("calf", "right")) is None
    assert library.plate(brief("tail", "right")) is None


def test_no_body_named_is_one_body_for_every_version_of_a_design(tmp_path: Path) -> None:
    for body in BODIES:
        image = Image.new("RGB", (8, 8), "white" if body == "feminine" else "black")
        image.save(tmp_path / f"calf-{body}.webp", format="WEBP", lossless=True)
    library = PlateLibrary(tmp_path)

    def colour(brief_id: str) -> tuple[int, int, int]:
        data = library.plate({"briefId": brief_id, "placement": {"bodyPart": "calf"}})
        assert data is not None
        return left_pixel_small(data)

    ids = [f"0b8c3a5e-1f2d-4c3b-8a9e-{n:012d}" for n in range(12)]
    seen = {colour(brief_id) for brief_id in ids}
    assert seen == {(0, 0, 0), (255, 255, 255)}
    assert all(colour(brief_id) == colour(brief_id) for brief_id in ids)


def left_pixel_small(data: bytes) -> tuple[int, int, int]:
    with Image.open(io.BytesIO(data)) as image:
        pixel = image.convert("RGB").getpixel((0, 0))
    assert isinstance(pixel, tuple)
    return (int(pixel[0]), int(pixel[1]), int(pixel[2]))


def test_building_skips_what_exists_and_waits_out_a_failure(tmp_path: Path) -> None:
    (tmp_path / "calf-masculine.webp").write_bytes(b"kept")
    asked: list[str] = []
    pauses: list[float] = []
    failures_left = {"calf-feminine.webp": 1}

    def background(brief: dict[str, object]) -> bytes:
        placement = brief["placement"]
        assert isinstance(placement, dict)
        name = f"{placement['bodyPart']}-{placement['bodyType']}.webp"
        asked.append(name)
        if failures_left.get(name):
            failures_left[name] -= 1
            raise ValueError("El proveedor no ha completado la solicitud (429).")
        if placement["bodyPart"] == "hip":
            raise ValueError("refused")
        image = io.BytesIO()
        Image.new("RGB", (8, 12), "tan").save(image, format="PNG")
        return image.getvalue()

    failures = build(
        background,
        tmp_path,
        planned(["calf", "hip"]),
        attempts=2,
        pause=pauses.append,
        report=lambda line: None,
    )
    # The existing plate is not paid for again; the rate limit was waited out once.
    assert "calf-masculine.webp" not in asked
    assert (tmp_path / "calf-masculine.webp").read_bytes() == b"kept"
    assert asked.count("calf-feminine.webp") == 2
    assert (tmp_path / "calf-feminine.webp").read_bytes()[:4] == b"RIFF"
    # A plate that fails every attempt is reported, not written, and does not stop the rest.
    assert [plate.filename for plate, _ in failures] == ["hip-masculine.webp", "hip-feminine.webp"]
    assert not (tmp_path / "hip-masculine.webp").exists()
    assert pauses == [30.0, 30.0, 30.0]


def test_the_committed_library_is_complete() -> None:
    """Every zone and body has a reviewed plate in the repository, at the plate size."""
    missing = [plate.filename for plate in planned() if not (PLATES / plate.filename).is_file()]
    assert missing == []
    for plate in planned():
        with Image.open(PLATES / plate.filename) as image:
            assert image.size == (1024, 1536), plate.filename
