"""TASK-0019 acceptance. Real queue/storage/imaging, no network or paid models."""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path
from typing import Any, cast
from xml.etree import ElementTree

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.studio import Studio, router
from generation.studio import StudioProvider
from jobs.queue import JobQueue
from mockup.engine import composite, visible_size
from mockup.placement import coverage_request, fit_coverage
from safety.gate import ModerationOutcome
from stencil.engine import (
    Master,
    export_pdf,
    export_svg,
    rasterize,
    trace_colour_artwork,
    trace_native_lineart,
)


def picture(lines: bool = True) -> bytes:
    image = Image.new("RGB", (200, 300), "white" if lines else "#c29880")
    if lines:
        draw = ImageDraw.Draw(image)
        draw.ellipse((40, 30, 160, 160), outline="black", width=3)
        draw.line((100, 160, 100, 270), fill="black", width=3)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class FakeProvider(StudioProvider):
    def __init__(self) -> None:
        self.calls = 0
        self.references: list[bytes] = []

    def moderation(self) -> Any:
        return self

    def classify(self, data: bytes) -> ModerationOutcome:
        return ModerationOutcome(explicit=False, contains_person=False)

    def analyze(self, references: list[bytes], subject: str) -> str:
        self.references = references
        return "Referencia de prueba: contorno circular y línea vertical."

    def lineart(self, brief: dict[str, Any], references: list[bytes], analysis: str) -> bytes:
        self.calls += 1
        assert references == self.references
        return picture()

    def background(self, brief: dict[str, Any]) -> bytes:
        return picture(False)

    def colour_artwork(
        self, brief: dict[str, Any], references: list[bytes], analysis: str
    ) -> bytes:
        self.calls += 1
        assert references == self.references
        return colour_picture()


def colour_picture(colour: str = "red") -> bytes:
    image = Image.new("RGB", (200, 300), "white")
    ImageDraw.Draw(image).ellipse((40, 30, 160, 260), fill=colour)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def payload() -> dict[str, Any]:
    root = Path(__file__).resolve().parents[4]
    return cast(
        dict[str, Any],
        json.loads((root / "contracts/fixtures/studio-job/valid/minimal.json").read_text()),
    )


def test_native_master_is_shared_and_pdf_has_physical_size() -> None:
    master = trace_native_lineart(picture(), 80, 150)
    assert master.paths
    svg = ElementTree.fromstring(export_svg(master))
    assert svg.attrib["width"] == "80mm" and svg.attrib["height"] == "150mm"
    mirrored = ElementTree.fromstring(export_svg(master, True))
    ns = {"s": "http://www.w3.org/2000/svg"}
    group = mirrored.find("s:g", ns)
    assert group is not None
    assert group.attrib["transform"] == "translate(80 0) scale(-1 1)"
    assert [p.attrib for p in svg.findall(".//s:polyline", ns)] == [
        p.attrib for p in mirrored.findall(".//s:polyline", ns)
    ]
    pdf = export_pdf(master)
    media = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", pdf)
    assert media
    assert float(media[1]) == pytest.approx(100 * 72 / 25.4, abs=0.001)
    assert float(media[2]) == pytest.approx(185 * 72 / 25.4, abs=0.001)
    assert b"Calibration: 50 mm" in pdf
    assert master.design_hash.encode() in pdf


def test_ink_geometry_is_exactly_resized_master_without_generated_redraw() -> None:
    master = Master([[(5, 5), (20, 25)]], 30, 40, 0.3)
    art = rasterize(master)
    rendered, transform = composite(
        art, picture(False), {"widthMm": 30, "heightMm": 40}, {"x": 0.2, "y": 0.1, "width": 0.3}
    )
    output = np.asarray(Image.open(io.BytesIO(rendered)))
    original = np.asarray(Image.open(io.BytesIO(picture(False))))
    x, y, w, h = [transform[k] for k in ("xPx", "yPx", "widthPx", "heightPx")]
    ink = np.asarray(art.resize((w, h), Image.Resampling.LANCZOS), dtype=np.float32) / 255
    expected = (original[y : y + h, x : x + w] * (0.15 + 0.85 * ink)).astype(np.uint8)
    assert np.array_equal(output[y : y + h, x : x + w], expected)
    assert transform["generativePostprocess"] is False
    assert transform["scaleCalibrated"] is False
    with pytest.raises(ValueError, match="fuera"):
        composite(
            art,
            picture(False),
            {"widthMm": 30, "heightMm": 40},
            {"x": 0.95, "y": 0.9, "width": 0.9},
        )


def test_blank_lineart_is_rejected() -> None:
    with pytest.raises(ValueError, match="line-art"):
        trace_native_lineart(picture(False), 80, 150)


def test_fresh_ink_is_deterministic_local_and_keeps_source_unchanged() -> None:
    source = Image.open(io.BytesIO(colour_picture())).convert("RGB")
    before = source.tobytes()
    args = (source, picture(False), {"widthMm": 80.0, "heightMm": 150.0})
    result, transform = composite(*args, fresh=True, curvature=0.5)
    assert result == composite(*args, fresh=True, curvature=0.5)[0]
    assert source.tobytes() == before
    original = np.asarray(Image.open(io.BytesIO(picture(False))))
    image = np.asarray(Image.open(io.BytesIO(result)))
    x, y = transform["xPx"], transform["yPx"]
    assert np.array_equal(image[:y], original[:y])
    assert np.array_equal(image[:, :x], original[:, :x])
    assert transform["method"] == "fresh-ink-composite"
    assert transform["generativePostprocess"] is False
    assert transform["curvature"] == 0.5


def test_owned_media_job_idempotency_lineage_and_deletion(tmp_path: Path) -> None:
    provider = FakeProvider()
    studio = Studio(tmp_path, b"x" * 32, provider)
    owner = "11111111-1111-4111-8111-111111111111"
    ref = studio.ingest(
        owner,
        {
            "data": base64.b64encode(picture()).decode(),
            "kind": "reference",
            "adult": True,
            "consent": True,
        },
    )
    request = payload()
    request["referenceIds"] = [ref["assetId"]]
    a = studio.jobs.enqueue(owner, request)
    b = studio.jobs.enqueue(owner, request)
    assert a["jobId"] == b["jobId"]
    assert studio.jobs.tick()
    result = studio.jobs.get(owner, a["jobId"])
    assert result["state"] == "succeeded", result
    artifact = result["result"]
    assert provider.calls == 1
    assert artifact["stencil"]["designId"] == artifact["mockup"]["designId"] == artifact["designId"]
    assert not studio.jobs.tick()
    with pytest.raises(KeyError):
        studio.owned("another-owner", ref["assetId"])
    with pytest.raises(KeyError):
        studio.jobs.get("another-owner", a["jobId"])
    studio.delete(owner)
    assert studio.media.all_assets() == []
    assert studio.jobs.get(owner, a["jobId"])["result"] is None


def test_provider_failure_never_returns_an_artifact(tmp_path: Path) -> None:
    def fail(owner: str, body: dict[str, Any]) -> dict[str, Any]:
        raise ValueError("Proveedor no disponible")

    queue = JobQueue(tmp_path / "jobs.db", fail)
    request = payload()
    job = queue.enqueue("owner", request)
    queue.tick()
    result = queue.get("owner", job["jobId"])
    assert result["state"] == "failed" and result["result"] is None
    assert result["error"] == "Proveedor no disponible"


def test_interrupted_job_is_not_automatically_recharged(tmp_path: Path) -> None:
    calls: list[str] = []

    def execute(owner: str, body: dict[str, Any]) -> dict[str, Any]:
        calls.append(owner)
        return {}

    queue = JobQueue(tmp_path / "jobs.db", execute)
    job = queue.enqueue("owner", payload())
    with queue.connect() as db:
        db.execute("UPDATE jobs SET state='running'")
    restarted = JobQueue(tmp_path / "jobs.db", execute)
    assert restarted.get("owner", job["jobId"])["state"] == "failed"
    assert not restarted.tick()
    assert calls == []


@pytest.mark.parametrize("mode", ["colour", "black_and_grey_with_accent", "black_and_grey"])
def test_colour_uses_one_artwork_for_preview_and_contours(tmp_path: Path, mode: str) -> None:
    provider = FakeProvider()
    studio = Studio(tmp_path, b"x" * 32, provider)
    request = payload()
    request["brief"]["colour"] = {"mode": mode}
    if mode == "black_and_grey":
        request["brief"]["style"]["primary"] = "black_and_grey_realism"
    ref = studio.ingest(
        "owner",
        {
            "data": base64.b64encode(picture()).decode(),
            "adult": True,
            "consent": True,
            "kind": "reference",
        },
    )
    request["referenceIds"] = [ref["assetId"]]
    result = studio.generate("owner", request)
    assert provider.calls == 1
    assert request["brief"]["colour"] == {"mode": mode}
    assert "aproxima" in result["notice"]
    for name in ("master", "stencil", "mockup", "pdf"):
        assert result[name]["designId"] == result["designId"]
    pixels = np.asarray(Image.open(io.BytesIO(studio.owned("owner", result["master"]["assetId"]))))
    if mode == "black_and_grey":
        assert np.array_equal(pixels[:, :, 0], pixels[:, :, 1])
        assert np.array_equal(pixels[:, :, 1], pixels[:, :, 2])
        assert np.any((pixels[:, :, 0] > 40) & (pixels[:, :, 0] < 180))
    else:
        assert np.any((pixels[:, :, 0] > 200) & (pixels[:, :, 1] < 30))
    expected, _ = composite(
        Image.fromarray(pixels),
        picture(False),
        request["brief"]["size"],
        fresh=True,
        curvature=1.05,
        taper=0.25 if request["brief"]["placement"]["bodyPart"] == "calf" else 0,
    )
    assert studio.owned("owner", result["mockup"]["assetId"]) == expected


def test_calf_wrap_narrows_lower_design_and_redness_surrounds_ink() -> None:
    art = Image.new("RGB", (200, 300), "white")
    ImageDraw.Draw(art).rectangle((30, 20, 170, 280), fill="black")
    skin = Image.new("RGB", (400, 600), (190, 145, 120))
    buffer = io.BytesIO()
    skin.save(buffer, format="PNG")
    data, transform = composite(
        art,
        buffer.getvalue(),
        {"widthMm": 200.0, "heightMm": 300.0},
        {"x": 0.25, "y": 0.2, "width": 0.5},
        fresh=True,
        curvature=1.05,
        taper=0.25,
    )
    pixels = np.asarray(Image.open(io.BytesIO(data)))
    upper = np.count_nonzero(pixels[180, :, 0] < 50)
    lower = np.count_nonzero(pixels[380, :, 0] < 50)
    assert 0 < lower < upper
    # Pink skin exists outside dark pigment, while remote skin is untouched.
    assert np.any((pixels[:, :, 0] > 190) & (pixels[:, :, 1] < 145))
    assert np.array_equal(pixels[0, 0], [190, 145, 120])
    assert transform["taper"] == 0.25


def test_colour_contours_share_physical_fit_and_identity_includes_colour() -> None:
    master, preview = trace_colour_artwork(colour_picture(), 80, 150)
    blue, _ = trace_colour_artwork(colour_picture("blue"), 80, 150)
    assert master.design_hash != blue.design_hash
    assert master.paths == blue.paths
    assert preview.size == (473, 886)
    points = np.array([point for path in master.paths for point in path])
    # Source ellipse x=40..160, with the same 0.39 mm/px fit and offsets (1,16.5).
    assert points[:, 0].min() == pytest.approx(16.6, abs=0.8)
    assert points[:, 0].max() == pytest.approx(63.4, abs=0.8)
    assert points[:, 1].min() == pytest.approx(28.2, abs=0.8)


def test_expired_uploads_are_removed(tmp_path: Path) -> None:
    studio = Studio(tmp_path, b"x" * 32, FakeProvider())
    studio.ingest(
        "owner",
        {
            "data": base64.b64encode(picture()).decode(),
            "kind": "reference",
            "adult": True,
            "consent": True,
        },
    )
    for path in (tmp_path / "media" / "meta").glob("*.json"):
        meta = json.loads(path.read_text())
        meta["expiresAt"] = "2000-01-01T00:00:00Z"
        path.write_text(json.dumps(meta))
    studio.purge_expired()
    assert studio.media.all_assets() == []


def test_http_requires_service_auth_and_valid_contract(tmp_path: Path) -> None:
    studio = Studio(tmp_path, b"x" * 32, FakeProvider())
    app = FastAPI()
    app.include_router(router(studio, "test-only-token"))
    client = TestClient(app)
    assert client.post("/studio/jobs", json={}).status_code == 401
    headers = {
        "Authorization": "Bearer test-only-token",
        "X-Session-Id": "11111111-1111-4111-8111-111111111111",
    }
    assert client.post("/studio/jobs", json={"brief": {}}, headers=headers).status_code == 422
    assert (
        client.post(
            "/studio/media", json={"kind": "body", "adult": False}, headers=headers
        ).status_code
        == 422
    )


def test_edit_versions_are_owned_idempotent_and_keep_previous(tmp_path: Path) -> None:
    class EditingProvider(FakeProvider):
        edit_input: bytes = b""
        fail = False

        def edit_artwork(
            self,
            brief: dict[str, Any],
            master: bytes,
            references: list[bytes],
            instruction: str,
            *,
            rendered: bool,
        ) -> bytes:
            self.edit_input = master
            if self.fail:
                raise ValueError("Edición fallida")
            assert instruction == "Añade azul"
            return colour_picture("blue")

    provider = EditingProvider()
    studio = Studio(tmp_path, b"x" * 32, provider)
    owner = "11111111-1111-4111-8111-111111111111"
    ref = studio.ingest(
        owner,
        {
            "data": base64.b64encode(picture()).decode(),
            "adult": True,
            "consent": True,
            "kind": "reference",
        },
    )
    original = payload()
    original["referenceIds"] = [ref["assetId"]]
    parent_id = studio.jobs.enqueue(owner, original)["jobId"]
    assert studio.jobs.tick()
    parent = studio.jobs.get(owner, parent_id)["result"]
    app = FastAPI()
    app.include_router(router(studio, "test-only-token"))
    client = TestClient(app)
    headers = {"Authorization": "Bearer test-only-token", "X-Session-Id": owner}
    change = {
        "edit": {"parentJobId": parent_id, "instruction": "Añade azul"},
        "idempotencyKey": "22222222-2222-4222-8222-222222222222",
    }
    response = client.post("/studio/jobs", json=change, headers=headers)
    assert response.status_code == 202, response.text
    child_id = response.json()["jobId"]
    assert client.post("/studio/jobs", json=change, headers=headers).json()["jobId"] == child_id
    assert studio.jobs.tick()
    child = studio.jobs.get(owner, child_id)["result"]
    assert child["briefRevision"] == parent["briefRevision"] + 1
    assert provider.edit_input == studio.owned(owner, parent["master"]["assetId"])
    assert child["edit"] == change["edit"]
    assert child["designId"] != parent["designId"]
    assert studio.owned(owner, child["background"]["assetId"]) == studio.owned(
        owner, parent["background"]["assetId"]
    )
    assert (
        child["master"]["designId"] == child["stencil"]["designId"] == child["mockup"]["designId"]
    )
    assert len(client.get("/studio/jobs", headers=headers).json()) == 2
    other = {**headers, "X-Session-Id": "33333333-3333-4333-8333-333333333333"}
    assert client.post("/studio/jobs", json=change, headers=other).status_code == 422
    assert client.get("/studio/jobs", headers=other).json() == []
    for instruction in ["  ", "a", "x" * 1001, None]:
        invalid = {**change, "edit": {"parentJobId": parent_id, "instruction": instruction}}
        assert client.post("/studio/jobs", json=invalid, headers=headers).status_code == 422
    provider.fail = True
    change["idempotencyKey"] = "44444444-4444-4444-8444-444444444444"
    failed_id = client.post("/studio/jobs", json=change, headers=headers).json()["jobId"]
    assert studio.jobs.tick()
    assert studio.jobs.get(owner, failed_id)["state"] == "failed"
    assert studio.jobs.get(owner, parent_id)["result"] == parent
    assert len(studio.jobs.history(owner)) == 2


@pytest.mark.parametrize(
    "instruction",
    [
        "quiero que ocupe casi todo el gemelo",
        "es muy pequeño, quiero que me ocupe casi todo el gemelo y abarque hacia los lados, "
        "casi envolviendo el gemelo",
    ],
)
def test_whole_calf_request_reuses_art_and_stencil_without_generation(
    tmp_path: Path, instruction: str
) -> None:
    provider = FakeProvider()
    studio = Studio(tmp_path, b"x" * 32, provider)
    owner = "11111111-1111-4111-8111-111111111111"
    ref = studio.ingest(
        owner, {"data": base64.b64encode(picture()).decode(), "adult": True, "consent": True}
    )
    original = payload()
    original["referenceIds"] = [ref["assetId"]]
    original["placement"] = {"x": 0.32, "y": 0.22, "width": 0.36}
    parent_id = studio.jobs.enqueue(owner, original)["jobId"]
    assert studio.jobs.tick()
    parent = studio.jobs.get(owner, parent_id)["result"]
    app = FastAPI()
    app.include_router(router(studio, "test-only-token"))
    client = TestClient(app)
    response = client.post(
        "/studio/jobs",
        json={
            "edit": {"parentJobId": parent_id, "instruction": instruction},
            "idempotencyKey": "22222222-2222-4222-8222-222222222222",
        },
        headers={"Authorization": "Bearer test-only-token", "X-Session-Id": owner},
    )
    assert response.status_code == 202
    assert studio.jobs.tick()
    status = studio.jobs.get(owner, response.json()["jobId"])
    assert status["state"] == "succeeded", status
    result = status["result"]
    assert result["transform"]["widthPx"] > parent["transform"]["widthPx"] * 1.5
    assert result["transform"]["heightPx"] > parent["transform"]["heightPx"] * 1.5
    for name in ("master", "stencil", "stencilMirror", "pdf", "pdfMirror", "background"):
        assert result[name] == parent[name]
    assert result["size"] == parent["size"]
    assert result["mockup"]["assetId"] != parent["mockup"]["assetId"]
    assert provider.calls == 1


def test_visual_coverage_bounds_calibration_and_mixed_requests() -> None:
    small = fit_coverage(picture(False), {"widthMm": 80.0, "heightMm": 120.0}, "auto")
    large = fit_coverage(picture(False), {"widthMm": 200.0, "heightMm": 300.0}, "auto")
    assert large["width"] > small["width"]
    assert large["x"] + large["width"] <= 1
    with pytest.raises(ValueError, match="calibrada"):
        fit_coverage(
            picture(False), {"widthMm": 200.0, "heightMm": 300.0}, "full", {"photoWidthMm": 400.0}
        )
    assert coverage_request({"instruction": "Haz el escudo más pequeño"}) == (None, False)
    assert coverage_request({"instruction": "Que ocupe casi todo el gemelo y añade flores"}) == (
        "full",
        False,
    )
    assert coverage_request(
        {"instruction": "Ampliar", "coverage": "larger", "mode": "placement"}
    ) == ("larger", True)


def test_tall_print_canvas_fills_visible_ink_not_white_padding() -> None:
    master = Image.new("RGB", (900, 3000), "white")
    ImageDraw.Draw(master).rectangle((100, 1000, 800, 2000), fill="black")
    original = master.tobytes()
    size = {"widthMm": 150.0, "heightMm": 500.0}
    background = picture(False)
    old, _ = composite(master, background, size, fit_coverage(background, size, "full"))
    placement = fit_coverage(background, visible_size(master, size), "full")
    new, transform = composite(master, background, size, placement, fit_visible=True)

    def ink_height(data: bytes) -> int:
        pixels = np.asarray(Image.open(io.BytesIO(data)))
        rows = np.where((pixels.min(axis=2) < 50).any(axis=1))[0]
        return int(rows[-1] - rows[0] + 1)

    assert ink_height(new) > 2 * ink_height(old)
    assert ink_height(new) > 200  # Background is 300 px high; visible ink must fill it.
    assert transform["sourceCropPx"]["height"] < 1100
    assert master.tobytes() == original
    calibrated = {"x": 0.3, "y": 0.1, "width": 0.2, "photoWidthMm": 600.0}
    a, metadata = composite(master, background, size, calibrated, fit_visible=True)
    assert a == composite(master, background, size, calibrated)[0]
    assert "sourceCropPx" not in metadata


def test_initial_full_calf_prompt_uses_visible_bounds(tmp_path: Path) -> None:
    studio = Studio(tmp_path, b"x" * 32, FakeProvider())
    ref = studio.ingest(
        "owner", {"data": base64.b64encode(picture()).decode(), "adult": True, "consent": True}
    )
    request = payload()
    request["referenceIds"] = [ref["assetId"]]
    request.pop("placement", None)
    request["brief"]["placement"]["bodyPart"] = "calf"
    request["brief"]["subject"]["description"] = (
        "Un diseño que ocupe todo el gemelo de arriba a abajo"
    )
    request["brief"]["size"] = {"widthMm": 150, "heightMm": 500}
    request["brief"]["style"]["primary"] = "black_and_grey_realism"
    result = studio.generate("owner", request)
    assert result["transform"]["sourceCropPx"]["height"] > 0
    assert result["transform"]["heightPx"] >= 240
