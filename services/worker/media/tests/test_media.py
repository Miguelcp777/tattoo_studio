"""Media lifecycle: sanitisation, encryption, clearance enforcement, cascade deletion.

The assertions here are about properties that protect a real person's data, so they check
the stored artifact rather than trusting that the library did what it claims.
"""

from __future__ import annotations

import io
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import piexif
import pytest
from cryptography.exceptions import InvalidTag
from PIL import Image, UnidentifiedImageError

from media import (
    AssetNotFoundError,
    ClearanceRequiredError,
    EncryptedFileStore,
    RetentionClass,
    SanitizationError,
    UnsupportedFormatError,
    UploadTooLargeError,
    has_metadata,
    sanitize,
)
from safety import mint_clearance

KEY = b"0123456789abcdef0123456789abcdef"


def photo_with_exif(width: int = 64, height: int = 64) -> bytes:
    """A JPEG carrying real GPS and device EXIF, as a phone photograph would.

    Built rather than committed as a binary fixture so the tags under test are explicit
    and a reader can see exactly what should be gone afterwards.
    """
    image = Image.new("RGB", (width, height), (120, 90, 60))
    exif = {
        "0th": {
            piexif.ImageIFD.Make: b"ACME Phone",
            piexif.ImageIFD.Model: b"Model X Pro",
            piexif.ImageIFD.Software: b"CameraApp 4.2",
        },
        "Exif": {piexif.ExifIFD.DateTimeOriginal: b"2026:09:19 10:30:00"},
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((40, 1), (25, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"W",
            piexif.GPSIFD.GPSLongitude: ((3, 1), (42, 1), (0, 1)),
        },
        "1st": {},
        "thumbnail": None,
    }
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=piexif.dump(exif))
    return buffer.getvalue()


def plain_png(width: int = 32, height: int = 32) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (10, 200, 10)).save(buffer, format="PNG")
    return buffer.getvalue()


def cleared(data: bytes):  # type: ignore[no-untyped-def]
    return mint_clearance(data, gate_version="test", reason_code="ok")


@pytest.fixture
def store(tmp_path: Path) -> EncryptedFileStore:
    return EncryptedFileStore(tmp_path / "media", KEY, retention=timedelta(days=7))


# ---------------------------------------------------------------------------
# MEDIA-INV-001 / SEC-INV-002: EXIF stripping
# ---------------------------------------------------------------------------


def test_the_fixture_actually_carries_exif() -> None:
    """Guards the guard: if the fixture had no EXIF, the stripping test proves nothing."""
    raw = photo_with_exif()

    assert has_metadata(raw), "fixture must carry metadata for the next test to mean anything"
    assert piexif.load(raw)["GPS"], "fixture must carry GPS specifically"


def test_gps_and_device_tags_are_gone_after_ingest(store: EncryptedFileStore) -> None:
    raw = photo_with_exif()

    asset = store.ingest_photo(raw, cleared(raw))
    stored = store.read(asset.asset_id)

    assert not has_metadata(stored)
    loaded = piexif.load(stored)
    assert not loaded["GPS"], "GPS coordinates survived sanitisation"
    assert not loaded["0th"], "device identifiers survived sanitisation"


def test_the_image_itself_survives_sanitisation() -> None:
    """Stripping metadata must not destroy the picture."""
    raw = photo_with_exif(width=80, height=40)

    clean = sanitize(raw)

    assert (clean.width_px, clean.height_px) == (80, 40)
    with Image.open(io.BytesIO(clean.data)) as image:
        assert image.size == (80, 40)


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (b"", SanitizationError),
        (b"not an image at all", SanitizationError),
        (b"GIF89a" + b"\x00" * 64, SanitizationError),
    ],
    ids=["empty", "garbage", "gif-header"],
)
def test_undecodable_uploads_are_refused(payload: bytes, expected: type[Exception]) -> None:
    with pytest.raises(expected):
        sanitize(payload)


def test_oversized_upload_is_refused() -> None:
    with pytest.raises(UploadTooLargeError):
        sanitize(b"\xff" * (26 * 1024 * 1024))


def test_unsupported_format_is_refused() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="BMP")

    with pytest.raises(UnsupportedFormatError):
        sanitize(buffer.getvalue())


# ---------------------------------------------------------------------------
# MEDIA-INV-002 / SEC-INV-003: encryption at rest
# ---------------------------------------------------------------------------


def test_bytes_on_disk_are_not_the_image(store: EncryptedFileStore, tmp_path: Path) -> None:
    raw = photo_with_exif()

    asset = store.ingest_photo(raw, cleared(raw))

    blob = (tmp_path / "media" / "blobs" / asset.asset_id).read_bytes()
    assert blob != raw
    assert not blob.startswith(b"\xff\xd8"), "JPEG signature visible: not encrypted"
    assert not blob.startswith(b"\x89PNG"), "PNG signature visible: not encrypted"
    with pytest.raises(UnidentifiedImageError):
        Image.open(io.BytesIO(blob)).load()


def test_round_trip_returns_a_usable_image(store: EncryptedFileStore) -> None:
    raw = photo_with_exif()

    asset = store.ingest_photo(raw, cleared(raw))
    recovered = store.read(asset.asset_id)

    with Image.open(io.BytesIO(recovered)) as image:
        assert image.size == (64, 64)


def test_a_different_key_cannot_read_the_asset(store: EncryptedFileStore, tmp_path: Path) -> None:
    raw = plain_png()
    asset = store.store_artifact(
        raw, media_type="image/png", width_px=32, height_px=32, retention=RetentionClass.DESIGN
    )

    other = EncryptedFileStore(tmp_path / "media", os.urandom(32), retention=timedelta(days=7))

    with pytest.raises(InvalidTag):
        other.read(asset.asset_id)


def test_short_key_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        EncryptedFileStore(tmp_path / "m", b"too-short", retention=timedelta(days=1))


# ---------------------------------------------------------------------------
# MEDIA-INV-003 / SEC-INV-007: nothing is persisted without a clearance
# ---------------------------------------------------------------------------


def test_ingest_without_clearance_refuses(store: EncryptedFileStore) -> None:
    with pytest.raises(ClearanceRequiredError):
        store.ingest_photo(photo_with_exif(), None)  # type: ignore[arg-type]


def test_refused_ingest_writes_nothing(store: EncryptedFileStore, tmp_path: Path) -> None:
    """A refusal that still wrote the file would satisfy the type checker and nothing else."""
    with pytest.raises(ClearanceRequiredError):
        store.ingest_photo(photo_with_exif(), object())  # type: ignore[arg-type]

    assert list((tmp_path / "media" / "blobs").iterdir()) == []
    assert store.all_assets() == []


def test_clearance_for_different_bytes_is_refused(store: EncryptedFileStore) -> None:
    """A clearance must not be replayable against another image.

    Otherwise a caller screens something harmless, gets a token, and ingests something
    else entirely - defeating SEC-INV-007 while appearing to satisfy it.
    """
    screened = photo_with_exif(width=64)
    other = photo_with_exif(width=96)

    with pytest.raises(ClearanceRequiredError):
        store.ingest_photo(other, cleared(screened))


def test_clearance_cannot_be_forged() -> None:
    """Only the gate may mint one; the dataclass constructor refuses."""
    from safety import SafetyClearance

    with pytest.raises(PermissionError):
        SafetyClearance(content_sha256="deadbeef", gate_version="x", reason_code="ok")


# ---------------------------------------------------------------------------
# MEDIA-INV-004 / SEC-INV-004: cascade deletion
# ---------------------------------------------------------------------------


def _lineage(store: EncryptedFileStore):  # type: ignore[no-untyped-def]
    raw = photo_with_exif()
    photo = store.ingest_photo(raw, cleared(raw))
    child = store.store_artifact(
        plain_png(),
        media_type="image/png",
        width_px=32,
        height_px=32,
        retention=RetentionClass.PHOTO_DERIVED,
        parent_id=photo.asset_id,
    )
    grandchild = store.store_artifact(
        plain_png(),
        media_type="image/png",
        width_px=32,
        height_px=32,
        retention=RetentionClass.PHOTO_DERIVED,
        parent_id=child.asset_id,
    )
    return photo, child, grandchild


def test_cascade_removes_every_descendant(store: EncryptedFileStore) -> None:
    photo, child, grandchild = _lineage(store)

    receipt = store.delete_cascade(photo.asset_id)

    assert receipt.count == 3
    for asset_id in (photo.asset_id, child.asset_id, grandchild.asset_id):
        with pytest.raises(AssetNotFoundError):
            store.metadata(asset_id)


def test_cascade_receipt_names_what_it_removed(store: EncryptedFileStore) -> None:
    photo, child, grandchild = _lineage(store)

    receipt = store.delete_cascade(photo.asset_id)

    assert set(receipt.removed) == {photo.asset_id, child.asset_id, grandchild.asset_id}
    assert receipt.requested == photo.asset_id


def test_unrelated_design_survives_a_photo_cascade(store: EncryptedFileStore) -> None:
    """MEDIA-INV-006: a design carries no likeness and follows its own lifecycle."""
    photo, _child, _grandchild = _lineage(store)
    design = store.store_artifact(
        plain_png(),
        media_type="image/png",
        width_px=32,
        height_px=32,
        retention=RetentionClass.DESIGN,
    )

    store.delete_cascade(photo.asset_id)

    assert store.metadata(design.asset_id).asset_id == design.asset_id


def test_deleting_a_missing_asset_raises(store: EncryptedFileStore) -> None:
    with pytest.raises(AssetNotFoundError):
        store.delete_cascade("does-not-exist")


# ---------------------------------------------------------------------------
# MEDIA-INV-006: retention classes
# ---------------------------------------------------------------------------


def test_photos_expire_and_designs_do_not(store: EncryptedFileStore) -> None:
    raw = photo_with_exif()
    photo = store.ingest_photo(raw, cleared(raw))
    design = store.store_artifact(
        plain_png(),
        media_type="image/png",
        width_px=32,
        height_px=32,
        retention=RetentionClass.DESIGN,
    )

    assert photo.expires_at is not None
    assert design.expires_at is None


def test_expired_lists_only_assets_past_their_window(store: EncryptedFileStore) -> None:
    raw = photo_with_exif()
    photo = store.ingest_photo(raw, cleared(raw))

    assert store.expired(now=datetime.now(UTC)) == []
    due = store.expired(now=datetime.now(UTC) + timedelta(days=8))
    assert [a.asset_id for a in due] == [photo.asset_id]


# ---------------------------------------------------------------------------
# SEC-INV-008: leakage
# ---------------------------------------------------------------------------


def test_no_image_bytes_or_key_in_logs(
    store: EncryptedFileStore, caplog: pytest.LogCaptureFixture
) -> None:
    raw = photo_with_exif()

    with caplog.at_level(logging.DEBUG):
        asset = store.ingest_photo(raw, cleared(raw))
        store.read(asset.asset_id)

    assert KEY.decode("ascii") not in caplog.text
    assert "ACME Phone" not in caplog.text


def test_error_messages_carry_no_image_content(store: EncryptedFileStore) -> None:
    with pytest.raises(SanitizationError) as raised:
        sanitize(b"definitely-not-an-image-but-recognisable-text")

    assert "definitely-not-an-image" not in str(raised.value)
