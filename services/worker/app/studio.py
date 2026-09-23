"""Composition root for the local studio: media, jobs, imaging and HTTP boundary."""

from __future__ import annotations

import base64
import hmac
import io
import json
import re
import sqlite3
import threading
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image
from tattoo_contracts.validation import validate

from app.settings import Settings, SettingsError
from generation.bfl_studio import BflStudioProvider
from generation.studio import StudioProvider
from jobs.queue import JobQueue
from media.sanitize import sanitize
from media.store import AssetNotFoundError, EncryptedFileStore, RetentionClass
from mockup.anatomy import ZONE_SPAN_MM, zone_size
from mockup.engine import DEFAULT_SURFACE, composite, visible_artwork, visible_size
from mockup.placement import Coverage, coverage_request, fit_coverage
from safety.gate import InputGate
from stencil.engine import (
    Master,
    deserialize_master,
    export_pdf,
    export_svg,
    rasterize,
    rescale,
    serialize_master,
    trace_colour_artwork,
    trace_native_lineart,
)


class Studio:
    def __init__(self, root: Path, key: bytes, provider: StudioProvider) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.provider = provider
        self.media = EncryptedFileStore(root / "media", key, retention=timedelta(hours=24))
        self.db_path = root / "ownership.sqlite"
        self.lock = threading.RLock()
        with self.db() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, owner TEXT, kind TEXT)"
            )
            db.execute("CREATE TABLE IF NOT EXISTS revoked (owner TEXT PRIMARY KEY)")
            # The authoritative vector geometry (ADR-0007). Internal: it is not a client
            # artifact, so it stays out of the studio-status contract.
            db.execute(
                "CREATE TABLE IF NOT EXISTS design_vector "
                "(design_id TEXT PRIMARY KEY, owner TEXT, asset_id TEXT)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS consent (owner TEXT, version TEXT, created TEXT "
                "DEFAULT CURRENT_TIMESTAMP)"
            )
        self.jobs = JobQueue(root / "jobs.sqlite", self.generate, self.purge_expired)

    def purge_expired(self) -> None:
        with self.lock:
            for asset in self.media.expired():
                try:
                    receipt = self.media.delete_cascade(asset.asset_id)
                except AssetNotFoundError:
                    continue
                with self.db() as db:
                    db.executemany("DELETE FROM assets WHERE id=?", [(a,) for a in receipt.removed])
            with self.jobs.connect() as db:
                db.execute(
                    "DELETE FROM jobs WHERE created < ? AND state NOT IN ('running','queued')",
                    (time.time() - 86400,),
                )
            with self.db() as db:
                db.execute("DELETE FROM consent WHERE created < datetime('now','-1 day')")

    def db(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=10)

    def active(self, owner: str) -> None:
        with self.db() as db:
            if db.execute("SELECT owner FROM revoked WHERE owner=?", (owner,)).fetchone():
                raise ValueError("Esta sesión se ha eliminado. Inicia una nueva consulta.")

    def owned(self, owner: str, asset_id: str, kind: str | None = None) -> bytes:
        if not re.fullmatch("[a-f0-9]{32}", asset_id):
            raise KeyError("Archivo no encontrado")
        self.active(owner)
        with self.db() as db:
            row = db.execute(
                "SELECT kind FROM assets WHERE id=? AND owner=?", (asset_id, owner)
            ).fetchone()
        if not row or (kind and row[0] != kind):
            raise KeyError("Archivo no encontrado")
        try:
            asset = self.media.metadata(asset_id)
        except AssetNotFoundError as error:
            raise KeyError("Archivo no disponible") from error
        if asset in self.media.expired():
            raise ValueError("El archivo ha caducado. Adjunta la imagen de nuevo.")
        return self.media.read(asset_id)

    def register(self, owner: str, asset_id: str, kind: str) -> str:
        with self.db() as db:
            db.execute("INSERT INTO assets VALUES (?,?,?)", (asset_id, owner, kind))
        return asset_id

    def ingest(self, owner: str, body: dict[str, Any]) -> dict[str, str]:
        self.active(owner)
        kind = body.get("kind", "reference")
        if (
            kind not in ("reference", "body")
            or body.get("consent") is not True
            or body.get("adult") is not True
        ):
            raise ValueError("Confirma mayoría de edad y permiso para procesar la imagen.")
        if body.get("sourceUrl"):
            data = self.provider.download_reference(body["sourceUrl"])
        else:
            try:
                data = base64.b64decode(body.get("data", ""), validate=True)
            except (ValueError, TypeError) as error:
                raise ValueError("Imagen inválida") from error
        if not data or len(data) > 8_000_000:
            raise ValueError("La imagen debe ocupar entre 1 byte y 8 MB.")
        clean = sanitize(data)
        # Moderate sanitized PNG; no EXIF or unapproved bytes reach durable storage.
        with Image.open(io.BytesIO(clean.data)) as image:
            output = io.BytesIO()
            image.convert("RGB").save(output, format="PNG")
        normalized = output.getvalue()
        gate = InputGate(self.provider.moderation()).screen_upload(
            normalized, own_body_consented=kind == "body"
        )
        if not gate.passed or gate.clearance is None:
            raise ValueError(
                "La imagen no ha superado la revisión de contenido. Usa una referencia sin "
                "personas o una foto corporal propia no explícita."
            )
        with self.lock:
            self.active(owner)
            with self.db() as db:
                if (
                    db.execute(
                        "SELECT count(*) FROM assets WHERE owner=? AND kind!='artifact'", (owner,)
                    ).fetchone()[0]
                    >= 10
                ):
                    raise ValueError("Límite de diez imágenes por sesión. Inicia una nueva sesión.")
                db.execute(
                    "INSERT INTO consent(owner,version) VALUES (?,?)",
                    (owner, "studio-own-photo-v1" if kind == "body" else "studio-reference-v1"),
                )
            asset = self.media.ingest_photo(normalized, gate.clearance)
            self.register(owner, asset.asset_id, kind)
        return {"assetId": asset.asset_id, "mimeType": asset.media_type}

    def generate(self, owner: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.active(owner)
        brief = payload["brief"]
        colour = brief["colour"]["mode"] != "black_and_grey"
        rendered = (
            bool(payload.get("edit"))
            or colour
            or brief["style"]["primary"] == "black_and_grey_realism"
            or brief["shading"]["technique"] != "none"
        )
        references = [
            self.owned(owner, asset_id, "reference") for asset_id in payload["referenceIds"]
        ]
        background = (
            self.owned(owner, payload["bodyPhotoId"], "body")
            if payload.get("bodyPhotoId")
            else None
        )
        edit = payload.get("edit")
        parent = self.jobs.get(owner, edit["parentJobId"])["result"] if edit else None
        if edit and parent is None:
            raise ValueError("La propuesta original no está disponible.")
        if parent and parent.get("background") and background is None:
            background = self.owned(owner, parent["background"]["assetId"], "artifact")
        coverage = coverage_request(edit) if edit else None
        if coverage and parent and coverage.placement_only:
            if background is None:
                background = self.provider.background(brief)
            return self.reposition(owner, payload, parent, background, coverage)
        # A whole-zone request is a statement about the body, so it settles the millimetres
        # before anything is drawn at them (ADR-0008, TASK-0024/REQ-004).
        zone = self.zone_intent(brief, payload, coverage, bool(edit))
        if zone:
            brief["size"] = self.zone_millimetres(brief)
        analysis = (
            parent["referenceAnalysis"]
            if parent
            else self.provider.analyze(references, brief["subject"]["description"])
        )
        edited_native = (
            self.provider.edit_artwork(
                brief,
                self.owned(owner, parent["master"]["assetId"], "artifact"),
                references,
                edit["instruction"],
                rendered=rendered,
            )
            if parent and edit
            else None
        )
        weight = {"fine": 0.25, "medium": 0.35, "bold": 0.6}.get(brief["linework"]["weight"], 0.35)
        if rendered:
            native = edited_native or self.provider.colour_artwork(brief, references, analysis)
            if not colour and not edit:
                with Image.open(io.BytesIO(native)) as source:
                    monochrome = io.BytesIO()
                    source.convert("L").convert("RGB").save(monochrome, format="PNG")
                    native = monochrome.getvalue()
            master, raster = trace_colour_artwork(
                native, brief["size"]["widthMm"], brief["size"]["heightMm"], weight
            )
        else:
            native = edited_native or self.provider.lineart(brief, references, analysis)
            master = trace_native_lineart(
                native, brief["size"]["widthMm"], brief["size"]["heightMm"], weight
            )
            raster = rasterize(master)
        if background is None:
            background = self.provider.background(brief)
        body_part = brief["placement"]["bodyPart"]
        # Auto placement stays calf-only, as before; a zone request extends it to any zone
        # with reference anatomy, which is the only widening TASK-0024 needs.
        auto_placed = (
            not payload.get("placement")
            and not payload.get("bodyPhotoId")
            and (body_part == "calf" or (zone and body_part in ZONE_SPAN_MM))
        )
        fit_visible = bool(coverage) or auto_placed
        projection_size = visible_size(raster, brief["size"]) if fit_visible else brief["size"]
        if coverage:
            previous = dict(payload.get("placement") or {})
            if parent:
                with Image.open(io.BytesIO(background)) as photo:
                    photo.thumbnail((2048, 2048))
                    previous["width"] = parent["transform"]["widthPx"] / photo.width
            payload["placement"] = fit_coverage(
                background, projection_size, coverage.kind, previous, body_part=body_part
            )
        elif auto_placed:
            payload["placement"] = fit_coverage(
                background, projection_size, "full" if zone else "auto", body_part=body_part
            )
        curved = brief["placement"]["bodyPart"] in {
            "calf",
            "shin",
            "inner_forearm",
            "outer_forearm",
            "upper_arm_inner",
            "upper_arm_outer",
            "thigh_front",
            "thigh_outer",
        }
        mockup, transform = composite(
            raster,
            background,
            brief["size"],
            payload.get("placement"),
            fresh=True,
            fit_visible=fit_visible,
            curvature=1.05 if curved else 0,
            taper=0.25 if body_part == "calf" else 0,
            # Unlike the cylinder, this is read from the photograph, so it suits a back or a
            # chest as readily as a limb and is not restricted to the curved zones.
            surface=DEFAULT_SURFACE,
        )
        preview = io.BytesIO()
        raster.save(preview, format="PNG")
        files = {
            "master": (preview.getvalue(), "image/png"),
            "stencil": (export_svg(master), "image/svg+xml"),
            "stencilMirror": (export_svg(master, True), "image/svg+xml"),
            "pdf": (export_pdf(master), "application/pdf"),
            "pdfMirror": (export_pdf(master, True), "application/pdf"),
            "mockup": (mockup, "image/png"),
            "background": (background, "image/png"),
        }
        result: dict[str, Any] = {
            "designId": master.design_hash,
            "briefId": brief["briefId"],
            "briefRevision": brief["revision"],
            "size": brief["size"],
            "referenceAnalysis": analysis,
            "transform": transform,
            "reviewRequired": True,
            "backgroundKind": "own_photo" if payload.get("bodyPhotoId") else "generated_anatomy",
            "notice": (
                "Propuesta con acabado y sombreado. El stencil aproxima los contornos "
                "del mismo dibujo; "
                "el tatuador debe revisar y corregir los detalles antes de transferirlo. "
                if rendered
                else "Propuesta de contornos negros. "
            )
            + "Simulación de tinta reciente; curvatura aproximada en extremidades, "
            "no reconstrucción anatómica. "
            "Visualización ilustrativa. Revisa los símbolos y el trazo con "
            "tu tatuador. Imprime el PDF al 100 %, sin ajustar a página.",
        }
        with self.lock:
            self.active(owner)
            self.store_vector(owner, master, payload)
            if edit:
                result["edit"] = edit
            for asset_id in payload["referenceIds"]:
                self.owned(owner, asset_id, "reference")
            if payload.get("bodyPhotoId"):
                self.owned(owner, payload["bodyPhotoId"], "body")
            for name, (data, mime) in files.items():
                with Image.open(io.BytesIO(mockup)) as rendered:
                    dimensions = rendered.size if name in ("mockup", "background") else raster.size
                asset = self.media.store_artifact(
                    data,
                    media_type=mime,
                    width_px=dimensions[0],
                    height_px=dimensions[1],
                    retention=RetentionClass.PHOTO,
                    parent_id=payload.get("bodyPhotoId") or payload["referenceIds"][0],
                )
                result[name] = {
                    "assetId": self.register(owner, asset.asset_id, "artifact"),
                    "designId": master.design_hash,
                    "mimeType": mime,
                }
        return result

    def store_vector(self, owner: str, master: Master, payload: dict[str, Any]) -> None:
        """Keep the authoritative geometry so a later resize is an exact scale, not a retrace."""
        asset = self.media.store_artifact(
            serialize_master(master),
            media_type="application/json",
            width_px=0,
            height_px=0,
            retention=RetentionClass.PHOTO,
            parent_id=payload.get("bodyPhotoId") or payload["referenceIds"][0],
        )
        with self.db() as db:
            db.execute(
                "INSERT OR REPLACE INTO design_vector VALUES (?, ?, ?)",
                (master.design_hash, owner, self.register(owner, asset.asset_id, "artifact")),
            )

    def load_vector(self, owner: str, design_id: str) -> bytes | None:
        """A design created before TASK-0024 has no stored vector; the caller must cope."""
        with self.db() as db:
            row = db.execute(
                "SELECT asset_id FROM design_vector WHERE design_id = ? AND owner = ?",
                (design_id, owner),
            ).fetchone()
        if row is None:
            return None
        try:
            return self.owned(owner, row[0], "artifact")
        except (AssetNotFoundError, HTTPException):
            return None

    def zone_intent(
        self,
        brief: dict[str, Any],
        payload: dict[str, Any],
        coverage: Coverage | None,
        is_edit: bool,
    ) -> bool:
        """Whether this request asks for a whole body zone to be covered (ADR-0008)."""
        if (payload.get("placement") or {}).get("photoWidthMm"):
            # A calibrated photograph carries real millimetres; it supersedes the table.
            return False
        if brief["placement"]["bodyPart"] not in ZONE_SPAN_MM:
            return False
        if coverage:
            return coverage.resizes_zone
        if is_edit:
            return False
        initial = coverage_request({"instruction": brief["subject"]["description"]})
        return bool(initial and initial.resizes_zone)

    def zone_millimetres(self, brief: dict[str, Any]) -> dict[str, float]:
        """The zone's own span, which is what the artwork is then composed to fill."""
        body_part = brief["placement"]["bodyPart"]
        span_width, span_height = ZONE_SPAN_MM[body_part]
        return zone_size(body_part, span_height / span_width)

    def reposition(
        self,
        owner: str,
        payload: dict[str, Any],
        parent: dict[str, Any],
        background: bytes,
        coverage: Coverage,
    ) -> dict[str, Any]:
        """Reuse the accepted artwork, with no retracing, no AI editing and no provider call.

        A nudge changes the projection alone. A whole-zone request also resolves the millimetres
        from reference anatomy and re-exports the print assets by exact vector scale (ADR-0008).
        A parent stored before TASK-0024 has no vector master, so it keeps its millimetres rather
        than letting the brief and the stencil disagree.
        """
        brief = payload["brief"]
        body_part = brief["placement"]["bodyPart"]
        previous = dict(payload.get("placement") or {})
        with Image.open(io.BytesIO(background)) as image:
            image.thumbnail((2048, 2048))
            previous["width"] = parent["transform"]["widthPx"] / image.width
        stored_vector = (
            self.load_vector(owner, parent["designId"])
            if coverage.resizes_zone and not previous.get("photoWidthMm")
            else None
        )
        resize = stored_vector is not None and body_part in ZONE_SPAN_MM
        files: dict[str, tuple[bytes, str]] = {}
        design_id = parent["designId"]
        result_master = parent["master"]
        with Image.open(
            io.BytesIO(self.owned(owner, parent["master"]["assetId"], "artifact"))
        ) as source:
            artwork_size = source.size
            if resize:
                _, bounds = visible_artwork(source)
                brief["size"] = zone_size(body_part, bounds["height"] / bounds["width"])
            placement = fit_coverage(
                background,
                visible_size(source, brief["size"]),
                coverage.kind,
                previous,
                body_part=body_part,
            )
            mockup, transform = composite(
                source.convert("RGB"),
                background,
                brief["size"],
                placement,
                fresh=True,
                fit_visible=True,
                curvature=parent["transform"].get("curvature", 1.05 if body_part == "calf" else 0),
                taper=parent["transform"].get("taper", 0.25 if body_part == "calf" else 0),
                surface=parent["transform"].get("surface", DEFAULT_SURFACE),
            )
        if resize:
            assert stored_vector is not None
            master = rescale(
                deserialize_master(stored_vector),
                brief["size"]["widthMm"],
                brief["size"]["heightMm"],
            )
            design_id = master.design_hash
            self.store_vector(owner, master, payload)
            # The artwork bytes are reused, but their physical identity changed with the size.
            result_master = {**parent["master"], "designId": design_id}
            files = {
                "stencil": (export_svg(master), "image/svg+xml"),
                "stencilMirror": (export_svg(master, True), "image/svg+xml"),
                "pdf": (export_pdf(master), "application/pdf"),
                "pdfMirror": (export_pdf(master, True), "application/pdf"),
            }
        if resize:
            notice = (
                f"Tamaño ajustado a la zona: {brief['size']['widthMm']:.0f} x "
                f"{brief['size']['heightMm']:.0f} mm. Plantilla y PDF reexportados a esa medida; "
                "el dibujo no se ha modificado. La medida procede de anatomía de referencia "
                "adulta, no de tu cuerpo: confírmala con tu tatuador. "
            )
        elif coverage.resizes_zone:
            notice = (
                "Cobertura visual ampliada. No he podido cambiar las medidas de impresión de "
                "esta propuesta, así que el PDF conserva las originales. "
            )
        else:
            notice = (
                "Tamaño sobre piel actualizado. Dibujo y plantilla conservados sin cambios. "
                "Cobertura visual orientativa; las medidas del PDF siguen siendo las originales. "
            )
        result = {
            **parent,
            **({"master": result_master} if resize else {}),
            "designId": design_id,
            "size": brief["size"],
            "briefRevision": brief["revision"],
            "transform": transform,
            "edit": payload["edit"],
            "notice": notice + "La curvatura no es una reconstrucción anatómica.",
        }
        with self.lock:
            self.active(owner)
            reused = [("mockup", mockup, "image/png")]
            if not parent.get("background"):
                reused.append(("background", background, "image/png"))
            for name, data, mime in reused:
                files[name] = (data, mime)
            for name, (data, mime) in files.items():
                if mime == "image/png":
                    with Image.open(io.BytesIO(data)) as image:
                        dimensions = image.size
                else:
                    dimensions = artwork_size
                asset = self.media.store_artifact(
                    data,
                    media_type=mime,
                    width_px=dimensions[0],
                    height_px=dimensions[1],
                    retention=RetentionClass.PHOTO,
                    parent_id=payload.get("bodyPhotoId") or payload["referenceIds"][0],
                )
                result[name] = {
                    "assetId": self.register(owner, asset.asset_id, "artifact"),
                    "designId": design_id,
                    "mimeType": mime,
                }
        return result

    def delete(self, owner: str) -> None:
        with self.lock:
            with self.db() as db:
                db.execute("INSERT OR IGNORE INTO revoked VALUES (?)", (owner,))
                ids = [
                    row[0] for row in db.execute("SELECT id FROM assets WHERE owner=?", (owner,))
                ]
            for asset_id in ids:
                try:
                    self.media.metadata(asset_id)
                except AssetNotFoundError:
                    continue
                self.media.delete_cascade(asset_id)
            with self.jobs.connect() as db:
                db.execute(
                    "UPDATE jobs SET state='cancelled',payload='{}',result=NULL WHERE owner=?",
                    (owner,),
                )
            with self.db() as db:
                db.execute("DELETE FROM assets WHERE owner=?", (owner,))
                db.execute("DELETE FROM consent WHERE owner=?", (owner,))


async def bounded_json(request: Request) -> dict[str, Any]:
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 12_000_000:
            raise HTTPException(413, "La solicitud supera el límite permitido.")
    try:
        body = json.loads(data)
    except ValueError as error:
        raise HTTPException(400, "JSON inválido") from error
    if not isinstance(body, dict):
        raise HTTPException(400, "Se requiere un objeto JSON")
    return body


def router(studio: Studio, token: str) -> APIRouter:
    routes = APIRouter(prefix="/studio")

    def owner(request: Request) -> str:
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            raise HTTPException(401, "No autorizado")
        value = request.headers.get("x-session-id", "")
        if not re.fullmatch("[a-f0-9-]{36}", value):
            raise HTTPException(401, "Sesión inválida")
        return value

    @routes.post("/media")
    async def upload(request: Request) -> dict[str, str]:
        who = owner(request)
        body = await bounded_json(request)
        try:
            # Sync CPU/network work is offloaded, preserving status polling responsiveness.
            from starlette.concurrency import run_in_threadpool

            return await run_in_threadpool(studio.ingest, who, body)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @routes.get("/media/{asset_id}")
    def media(asset_id: str, request: Request) -> Response:
        try:
            data = studio.owned(owner(request), asset_id)
            return Response(
                data,
                media_type=studio.media.metadata(asset_id).media_type,
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            )
        except (KeyError, ValueError) as error:
            raise HTTPException(404, "Archivo no disponible") from error

    @routes.post("/jobs", status_code=202)
    async def submit(request: Request) -> dict[str, Any]:
        who = owner(request)
        body = await bounded_json(request)
        try:
            if body.get("edit"):
                if not isinstance(body["edit"], dict) or not isinstance(
                    body["edit"].get("parentJobId"), str
                ):
                    raise ValueError("Propuesta original inválida.")
                instruction = body["edit"].get("instruction")
                if not isinstance(instruction, str) or not 3 <= len(instruction.strip()) <= 1000:
                    raise ValueError("Escribe entre 3 y 1000 caracteres para describir el cambio.")
                body["edit"]["instruction"] = instruction.strip()
                original = studio.jobs.source_payload(who, body["edit"]["parentJobId"])
                # Parent owns the brief/placement, never a client-supplied artifact ID.
                body = {**original, "idempotencyKey": body["idempotencyKey"], "edit": body["edit"]}
                body["brief"]["revision"] += 1
                parent = studio.jobs.get(who, body["edit"]["parentJobId"])["result"]
                studio.owned(who, parent["master"]["assetId"], "artifact")
            if validate("studio-job", body):
                raise ValueError("Revisa la petición de cambios (entre 3 y 1000 caracteres).")
            for asset_id in body["referenceIds"]:
                studio.owned(who, asset_id, "reference")
            if body.get("bodyPhotoId"):
                studio.owned(who, body["bodyPhotoId"], "body")
            return studio.jobs.enqueue(who, body)
        except (KeyError, ValueError) as error:
            raise HTTPException(422, str(error)) from error

    @routes.get("/jobs")
    def history(request: Request) -> list[dict[str, Any]]:
        return studio.jobs.history(owner(request))

    @routes.get("/jobs/{job_id}")
    def status(job_id: str, request: Request) -> dict[str, Any]:
        try:
            return studio.jobs.get(owner(request), job_id)
        except KeyError as error:
            raise HTTPException(404, "Trabajo no encontrado") from error

    @routes.delete("/session")
    def delete(request: Request) -> dict[str, bool]:
        studio.delete(owner(request))
        return {"deleted": True}

    return routes


def build_studio(settings: Settings) -> Studio | None:
    if not settings.worker_token or not settings.media_key or not settings.openai_api_key:
        return None
    return Studio(
        Path(settings.data_dir),
        bytes.fromhex(settings.media_key.get_secret_value()),
        build_provider(settings),
    )


def build_provider(settings: Settings) -> StudioProvider:
    """Select the image backend by configuration (TASK-0025), never by caller."""
    if settings.openai_api_key is None:
        raise SettingsError("OPENAI_API_KEY is required for vision and moderation.")
    openai_key = settings.openai_api_key.get_secret_value()
    if settings.image_backend == "bfl":
        if settings.bfl_api_key is None:
            # Fail loudly: silently falling back to OpenAI would bill the wrong vendor.
            raise SettingsError(
                "TATTOO_IMAGE_BACKEND=bfl requires BFL_API_KEY. Values are redacted."
            )
        return BflStudioProvider(
            openai_key,
            settings.bfl_api_key.get_secret_value(),
            image_model=settings.image_model,
            vision_model=settings.vision_model,
            base_url=settings.bfl_base_url,
            background_model=settings.bfl_background_model,
        )
    return StudioProvider(openai_key, settings.image_model, settings.vision_model)
