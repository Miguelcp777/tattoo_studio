"""Asset lifecycle: ingest, sanitise, encrypt, store, delete.

The only module that touches durable image storage. Ingesting a photograph requires a
`SafetyClearance` bound to those exact bytes, so nothing unscreened is ever persisted.
"""

from .sanitize import (
    ACCEPTED_FORMATS,
    MAX_UPLOAD_BYTES,
    SanitizationError,
    SanitizedImage,
    UnsupportedFormatError,
    UploadTooLargeError,
    has_metadata,
    sanitize,
)
from .store import (
    AssetNotFoundError,
    ClearanceRequiredError,
    DeletionIncompleteError,
    DeletionReceipt,
    EncryptedFileStore,
    MediaError,
    RetentionClass,
    StoredAsset,
)

__all__ = [
    "ACCEPTED_FORMATS",
    "MAX_UPLOAD_BYTES",
    "AssetNotFoundError",
    "ClearanceRequiredError",
    "DeletionIncompleteError",
    "DeletionReceipt",
    "EncryptedFileStore",
    "MediaError",
    "RetentionClass",
    "SanitizationError",
    "SanitizedImage",
    "StoredAsset",
    "UnsupportedFormatError",
    "UploadTooLargeError",
    "has_metadata",
    "sanitize",
]
