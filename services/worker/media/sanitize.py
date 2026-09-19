"""Strip metadata from an uploaded image before it is ever written.

A photograph of someone's pet carries the GPS coordinates of their home, the device that
took it, and often a timestamp. None of that is needed to make a tattoo design, and all
of it is a disclosure risk (MEDIA-INV-001, SEC-INV-002).

Sanitising by decode-and-re-encode drops every metadata block rather than an enumerated
list, so a tag nobody thought of is removed too. The cost is that re-encoding is lossy
for JPEG. For a photograph destined for stylisation that is an acceptable trade, but it
is a real one and is stated here rather than discovered later.
"""

from __future__ import annotations

import io
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from PIL import Image

#: Pillow's TIFF/EXIF parser logs every tag it reads at DEBUG level, including device
#: make, model and the GPS IFD. Those are precisely the identifiers this module exists
#: to remove, so an application running at DEBUG would have the library write them to
#: the log while we strip them from the file (SEC-INV-008). Silenced around every
#: decode rather than globally, so nothing else in the process is affected.
_NOISY_LOGGERS = (
    "PIL",
    "PIL.TiffImagePlugin",
    "PIL.Image",
    "PIL.PngImagePlugin",
    "PIL.JpegImagePlugin",
)


@contextmanager
def _quiet_imaging_logs() -> Iterator[None]:
    previous = [(logging.getLogger(name), logging.getLogger(name).level) for name in _NOISY_LOGGERS]
    disabled = [(logger, logger.propagate) for logger, _ in previous]
    try:
        for logger, _ in previous:
            logger.setLevel(logging.WARNING)
            logger.propagate = False
        yield
    finally:
        for logger, level in previous:
            logger.setLevel(level)
        for logger, propagate in disabled:
            logger.propagate = propagate


#: Formats accepted on upload. Deliberately narrow: each additional decoder is additional
#: attack surface against a library parsing untrusted bytes.
ACCEPTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_DIMENSION_PX = 12000


class SanitizationError(ValueError):
    """The upload could not be read, or is not something we accept."""


class UploadTooLargeError(SanitizationError):
    pass


class UnsupportedFormatError(SanitizationError):
    pass


@dataclass(frozen=True, slots=True)
class SanitizedImage:
    """Metadata-free image bytes, ready to be encrypted and stored."""

    data: bytes
    media_type: str
    width_px: int
    height_px: int


def sanitize(data: bytes) -> SanitizedImage:
    """Decode, drop all metadata, re-encode.

    Raises:
        UploadTooLargeError: the upload exceeds the accepted size.
        UnsupportedFormatError: the bytes are not a format we accept.
        SanitizationError: the bytes could not be decoded at all.
    """
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadTooLargeError(f"upload exceeds {MAX_UPLOAD_BYTES} bytes")
    if not data:
        raise SanitizationError("upload is empty")

    try:
        with _quiet_imaging_logs(), Image.open(io.BytesIO(data)) as source:
            source_format = (source.format or "").upper()
            if source_format not in ACCEPTED_FORMATS:
                raise UnsupportedFormatError(f"unsupported image format: {source_format or '?'}")
            if max(source.size) > MAX_DIMENSION_PX:
                raise SanitizationError(f"image exceeds {MAX_DIMENSION_PX}px on its longest edge")

            # load() forces full decode while the file is open, so a truncated or
            # malformed image fails here rather than midway through re-encoding.
            source.load()

            # Building a new image from the pixel data alone is what discards metadata:
            # EXIF, XMP, IPTC and any private chunks live on the original object and are
            # simply not carried across.
            mode = "RGBA" if source.mode in ("RGBA", "LA", "P") else "RGB"
            converted = source.convert(mode)
            # Rebuild from raw pixels alone. EXIF, XMP, IPTC and any private chunks live
            # on the original object and are simply not carried across, so a tag nobody
            # anticipated is dropped too.
            clean = Image.frombytes(mode, converted.size, converted.tobytes())

            buffer = io.BytesIO()
            if mode == "RGBA":
                clean.save(buffer, format="PNG", optimize=True)
                media_type = "image/png"
            else:
                clean.save(buffer, format="JPEG", quality=95, optimize=True)
                media_type = "image/jpeg"

            return SanitizedImage(
                data=buffer.getvalue(),
                media_type=media_type,
                width_px=clean.width,
                height_px=clean.height,
            )
    except SanitizationError:
        raise
    except Exception as error:
        # Message deliberately omits the library's detail, which can quote file contents.
        raise SanitizationError("image could not be decoded") from error


def has_metadata(data: bytes) -> bool:
    """Whether an image still carries EXIF or other metadata blocks.

    Used by tests to assert sanitisation actually happened, rather than trusting that
    re-encoding did what it is supposed to do.
    """
    try:
        with Image.open(io.BytesIO(data)) as image:
            # getexif() is the public accessor; the private _getexif is untyped and has
            # been removed in newer Pillow releases.
            if len(image.getexif()):
                return True
            if image.info.get("exif"):
                return True
            return any(key in image.info for key in ("XML:com.adobe.xmp", "icc_profile", "comment"))
    except Exception:
        return False
