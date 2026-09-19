"""Asset lifecycle: ingest, store, retrieve, delete.

The only module that touches durable image storage. Everything it holds is encrypted at
rest (MEDIA-INV-002), records where it came from (MEDIA-INV-004) and carries a retention
class that decides whether it expires (MEDIA-INV-006).

Ingesting a photograph requires a `SafetyClearance` bound to those exact bytes. That is
the module dependency direction FINDING-0003 settled: the gate runs first, on bytes, and
`media` demands its evidence.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from safety import SafetyClearance

from .sanitize import SanitizedImage, sanitize

NONCE_BYTES = 12
KEY_BYTES = 32


class RetentionClass(StrEnum):
    """Decides whether an asset expires.

    Photographs and anything derived from them carry a likeness and expire. Designs -
    flash, line art, stencils - contain no likeness and follow the design lifecycle
    instead (MEDIA-INV-006).
    """

    PHOTO = "photo"
    PHOTO_DERIVED = "photo_derived"
    DESIGN = "design"


EXPIRING_CLASSES = frozenset({RetentionClass.PHOTO, RetentionClass.PHOTO_DERIVED})


class MediaError(Exception):
    """Base for media failures."""


class ClearanceRequiredError(MediaError):
    """Ingest was attempted without a clearance, or with one for different bytes."""


class AssetNotFoundError(MediaError):
    pass


class DeletionIncompleteError(MediaError):
    """Some part of a cascade could not be removed. Never silently swallowed."""


@dataclass(frozen=True, slots=True)
class StoredAsset:
    """Metadata for one stored asset. Contains no bytes and no key material."""

    asset_id: str
    media_type: str
    width_px: int
    height_px: int
    byte_size: int
    retention: RetentionClass
    created_at: str
    parent_id: str | None = None
    expires_at: str | None = None


@dataclass(frozen=True, slots=True)
class DeletionReceipt:
    """What a cascade actually removed, so completeness is auditable."""

    requested: str
    removed: tuple[str, ...] = field(default_factory=tuple)

    @property
    def count(self) -> int:
        return len(self.removed)


class EncryptedFileStore:
    """Local filesystem backend with AES-GCM encryption at rest.

    A development implementation behind the port a cloud object store will implement.
    It is not production storage: there is no durability guarantee, no replication, no
    residency control and no key rotation. What it does provide honestly is encryption,
    because MEDIA-INV-002 is the reason this module exists and a plaintext development
    store would make that invariant a comment rather than a property.
    """

    def __init__(self, root: Path, encryption_key: bytes, *, retention: timedelta) -> None:
        if len(encryption_key) != KEY_BYTES:
            raise ValueError(f"encryption key must be {KEY_BYTES} bytes")
        self._root = root
        self._blobs = root / "blobs"
        self._meta = root / "meta"
        self._blobs.mkdir(parents=True, exist_ok=True)
        self._meta.mkdir(parents=True, exist_ok=True)
        self._aes = AESGCM(encryption_key)
        self._retention = retention

    # ------------------------------------------------------------------
    # Writing
    # ------------------------------------------------------------------

    def ingest_photo(self, upload: bytes, clearance: SafetyClearance) -> StoredAsset:
        """Sanitise, encrypt and store an uploaded photograph.

        Refuses unless the clearance was issued for exactly these bytes. Nothing is
        written on refusal (MEDIA-INV-003, SEC-INV-007).
        """
        if not isinstance(clearance, SafetyClearance):
            raise ClearanceRequiredError("ingest requires a safety clearance; refusing")
        if not clearance.covers(upload):
            # The clearance is real but was issued for a different image. Accepting it
            # would let a caller screen something harmless and ingest something else.
            raise ClearanceRequiredError("clearance does not cover these bytes; refusing to ingest")

        clean = sanitize(upload)
        return self._write(clean, retention=RetentionClass.PHOTO, parent_id=None)

    def store_artifact(
        self,
        data: bytes,
        *,
        media_type: str,
        width_px: int,
        height_px: int,
        retention: RetentionClass,
        parent_id: str | None = None,
    ) -> StoredAsset:
        """Store generated output. No clearance needed: this is our own artwork."""
        return self._write(
            SanitizedImage(
                data=data, media_type=media_type, width_px=width_px, height_px=height_px
            ),
            retention=retention,
            parent_id=parent_id,
        )

    def _write(
        self,
        image: SanitizedImage,
        *,
        retention: RetentionClass,
        parent_id: str | None,
    ) -> StoredAsset:
        asset_id = uuid.uuid4().hex
        nonce = os.urandom(NONCE_BYTES)
        ciphertext = self._aes.encrypt(nonce, image.data, asset_id.encode("ascii"))
        (self._blobs / asset_id).write_bytes(nonce + ciphertext)

        now = datetime.now(UTC)
        expires = now + self._retention if retention in EXPIRING_CLASSES else None
        asset = StoredAsset(
            asset_id=asset_id,
            media_type=image.media_type,
            width_px=image.width_px,
            height_px=image.height_px,
            byte_size=len(image.data),
            retention=retention,
            created_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            parent_id=parent_id,
            expires_at=expires.strftime("%Y-%m-%dT%H:%M:%SZ") if expires else None,
        )
        self._write_meta(asset)
        return asset

    def _write_meta(self, asset: StoredAsset) -> None:
        payload = {
            "assetId": asset.asset_id,
            "mediaType": asset.media_type,
            "widthPx": asset.width_px,
            "heightPx": asset.height_px,
            "byteSize": asset.byte_size,
            "retention": asset.retention.value,
            "createdAt": asset.created_at,
            "parentId": asset.parent_id,
            "expiresAt": asset.expires_at,
        }
        (self._meta / f"{asset.asset_id}.json").write_text(
            json.dumps(payload, indent=2), encoding="utf-8"
        )

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def read(self, asset_id: str) -> bytes:
        """Decrypt and return the stored bytes."""
        blob = self._blobs / asset_id
        if not blob.is_file():
            raise AssetNotFoundError(f"no such asset: {asset_id}")
        raw = blob.read_bytes()
        nonce, ciphertext = raw[:NONCE_BYTES], raw[NONCE_BYTES:]
        return self._aes.decrypt(nonce, ciphertext, asset_id.encode("ascii"))

    def metadata(self, asset_id: str) -> StoredAsset:
        path = self._meta / f"{asset_id}.json"
        if not path.is_file():
            raise AssetNotFoundError(f"no such asset: {asset_id}")
        raw = json.loads(path.read_text(encoding="utf-8"))
        return StoredAsset(
            asset_id=raw["assetId"],
            media_type=raw["mediaType"],
            width_px=raw["widthPx"],
            height_px=raw["heightPx"],
            byte_size=raw["byteSize"],
            retention=RetentionClass(raw["retention"]),
            created_at=raw["createdAt"],
            parent_id=raw["parentId"],
            expires_at=raw["expiresAt"],
        )

    def all_assets(self) -> list[StoredAsset]:
        return [self.metadata(p.stem) for p in sorted(self._meta.glob("*.json"))]

    # ------------------------------------------------------------------
    # Deletion
    # ------------------------------------------------------------------

    def _children_of(self, asset_id: str) -> list[str]:
        return [a.asset_id for a in self.all_assets() if a.parent_id == asset_id]

    def delete_cascade(self, asset_id: str) -> DeletionReceipt:
        """Remove an asset and every descendant, at any depth.

        Deleting a photograph must remove everything derived from it (SEC-INV-004). A
        design that is not derived from it survives, because it carries no likeness.
        """
        if not (self._meta / f"{asset_id}.json").is_file():
            raise AssetNotFoundError(f"no such asset: {asset_id}")

        order: list[str] = []
        pending = [asset_id]
        while pending:
            current = pending.pop()
            if current in order:
                continue
            order.append(current)
            pending.extend(self._children_of(current))

        removed: list[str] = []
        failures: list[str] = []
        for target in reversed(order):
            try:
                (self._blobs / target).unlink(missing_ok=True)
                (self._meta / f"{target}.json").unlink(missing_ok=True)
                removed.append(target)
            except OSError:
                failures.append(target)

        if failures:
            # Alerted, not swallowed: an incomplete deletion is a live compliance issue.
            raise DeletionIncompleteError(
                f"{len(failures)} of {len(order)} assets could not be removed"
            )
        return DeletionReceipt(requested=asset_id, removed=tuple(removed))

    def expired(self, now: datetime | None = None) -> list[StoredAsset]:
        """Assets past their retention window. The sweep itself is a scheduled concern."""
        moment = now or datetime.now(UTC)
        due: list[StoredAsset] = []
        for asset in self.all_assets():
            if asset.expires_at is None:
                continue
            if (
                datetime.strptime(asset.expires_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
                <= moment
            ):
                due.append(asset)
        return due
