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
from datetime import UTC, datetime, timedelta
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
from mockup.geometry import BLEND_TOLERANCE, GeometryCheck
from mockup.placement import Coverage, coverage_request, fit_coverage
from orchestration import PipelineState, build_finish_graph, build_generation_graph
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


class _StudioBlend:
    """The mockup finish over the configured provider (TASK-0040, ADR-0018).

    Declines an own photograph: ADR-0016 requires a provider whose no-training and no-retention
    terms are verified (GEN-INV-002), and none is yet. A generated plate is no one's photograph.
    Every provider output is moderated before it returns (`accept_output`, SEC-INV-006).
    """

    def __init__(self, provider: StudioProvider) -> None:
        self.provider = provider

    def blend(
        self, warped_mockup: bytes, photo: bytes | None, clearance: Any, finish: str
    ) -> bytes | None:
        if photo is not None:
            return None
        return self.provider.blend_mockup(warped_mockup, finish)


def finished_transform(state: PipelineState) -> dict[str, Any]:
    """The composite's transform, saying whether an AI finish replaced it and why not if not."""
    assert state.transform is not None
    return {
        **state.transform,
        "generativePostprocess": state.blended,
        **({"finish": state.blend_outcome} if state.blend_outcome else {}),
    }


FINISH_NOTICE = (
    "Acabado de piel con IA sobre la composición; el diseño se ha comparado con la plantilla "
    "antes de mostrarlo. "
)

# TASK-0047: what a client sees when a version's own-body photo has expired.
PHOTO_GONE = (
    "La foto de tu cuerpo ya no está: se borra a las 24 horas. Súbela de nuevo para volver a "
    "ver el diseño sobre ella."
)

#: The files that show the client's body when the background is their own photo.
LIKENESS_FILES = frozenset({"mockup", "background"})


def lifecycle(name: str, payload: dict[str, Any]) -> tuple[RetentionClass, str]:
    """
    Which lifecycle a stored file follows, and what it descends from (TASK-0047, MEDIA-INV-006).

    On the client's own photo, the composite and its background show their body: they follow the
    photograph, expire with it and are erased with it. Everything else is the design - master,
    stencils, PDFs, the vector, a generated plate and a mockup on it - which shows nobody and stays
    until its owner deletes it. It descends from the first reference, itself design material, so
    no photograph's expiry can cascade into it.
    """
    photo = payload.get("bodyPhotoId")
    if photo and name in LIKENESS_FILES:
        return RetentionClass.PHOTO_DERIVED, str(photo)
    return RetentionClass.DESIGN, str(payload["referenceIds"][0])


# ADR-0022: the version a kept camera photograph becomes. The ink is superimposed on the device, so
# the notice says what the picture is and what it is not.
CAPTURE_NOTICE = (
    "Foto hecha con la cámara en tu dispositivo: el tatuaje está superpuesto, no hecho. "
    "El diseño y la plantilla son los de la propuesta original. "
    "Visualización ilustrativa. Revisa los símbolos y el trazo con tu tatuador."
)


class _StudioGenerationDeps:
    """Per-call `GenerationDeps` for the `orchestration` graph (TASK-0032).

    Each method runs exactly what `Studio.generate` used to run inline; the graph only fixes the
    order. It closes over the request context (edit/parent, coverage, zone, payload) so placement
    and artwork decisions stay identical, which is what makes this delegation behaviour-preserving.
    Image-model calls still go through the injected provider (ARCH-INV-001); this adapter opens no
    socket of its own.
    """

    def __init__(
        self,
        studio: Studio,
        owner: str,
        edit: dict[str, Any] | None,
        parent: dict[str, Any] | None,
        coverage: Coverage | None,
        zone: bool,
        payload: dict[str, Any],
    ) -> None:
        self.studio = studio
        self.owner = owner
        self.edit = edit
        self.parent = parent
        self.coverage = coverage
        self.zone = zone
        self.payload = payload

    def make_artwork(self, state: PipelineState) -> bytes:
        brief = state.brief
        edited_native = (
            self.studio.provider.edit_artwork(
                brief,
                self.studio.owned(self.owner, self.parent["master"]["assetId"], "artifact"),
                state.references,
                self.edit["instruction"],
                rendered=state.rendered,
                attached=len(self.edit.get("referenceIds") or []),
            )
            if self.parent and self.edit
            else None
        )
        if state.rendered:
            native = edited_native or self.studio.provider.colour_artwork(
                brief, state.references, state.analysis
            )
            if not state.colour and not self.edit:
                with Image.open(io.BytesIO(native)) as source:
                    monochrome = io.BytesIO()
                    source.convert("L").convert("RGB").save(monochrome, format="PNG")
                    native = monochrome.getvalue()
        else:
            native = edited_native or self.studio.provider.lineart(
                brief, state.references, state.analysis
            )
        return native

    def trace(self, state: PipelineState, native: bytes) -> tuple[Any, Any]:
        brief = state.brief
        width, height = brief["size"]["widthMm"], brief["size"]["heightMm"]
        if state.rendered:
            return trace_colour_artwork(native, width, height, state.weight)
        master = trace_native_lineart(native, width, height, state.weight)
        return master, rasterize(master)

    def master_preview(self, raster: Any) -> bytes:
        preview = io.BytesIO()
        raster.save(preview, format="PNG")
        return preview.getvalue()

    def stencil_files(self, master: Any) -> dict[str, tuple[bytes, str]]:
        return {
            "stencil": (export_svg(master), "image/svg+xml"),
            "stencilMirror": (export_svg(master, True), "image/svg+xml"),
            "pdf": (export_pdf(master), "application/pdf"),
            "pdfMirror": (export_pdf(master, True), "application/pdf"),
        }

    def ensure_background(self, state: PipelineState) -> bytes:
        if state.background is not None:
            return state.background
        return self.studio.provider.background(state.brief)

    def compose(
        self, state: PipelineState, raster: Any, background: bytes
    ) -> tuple[bytes, dict[str, Any]]:
        payload, brief = self.payload, state.brief
        body_part = brief["placement"]["bodyPart"]
        auto_placed = (
            not payload.get("placement")
            and not payload.get("bodyPhotoId")
            and (body_part == "calf" or (self.zone and body_part in ZONE_SPAN_MM))
        )
        fit_visible = bool(self.coverage) or auto_placed
        projection_size = visible_size(raster, brief["size"]) if fit_visible else brief["size"]
        if self.coverage:
            previous = dict(payload.get("placement") or {})
            if self.parent:
                with Image.open(io.BytesIO(background)) as photo:
                    photo.thumbnail((2048, 2048))
                    previous["width"] = self.parent["transform"]["widthPx"] / photo.width
            payload["placement"] = fit_coverage(
                background, projection_size, self.coverage.kind, previous, body_part=body_part
            )
        elif auto_placed:
            payload["placement"] = fit_coverage(
                background,
                projection_size,
                "full" if self.zone else "auto",
                body_part=body_part,
            )
        curved = body_part in {
            "calf",
            "shin",
            "inner_forearm",
            "outer_forearm",
            "upper_arm_inner",
            "upper_arm_outer",
            "thigh_front",
            "thigh_outer",
        }
        return composite(
            raster,
            background,
            brief["size"],
            payload.get("placement"),
            fresh=True,
            fit_visible=fit_visible,
            curvature=1.05 if curved else 0,
            taper=0.25 if body_part == "calf" else 0,
            # Read from the photograph, so it suits a back or a chest as readily as a limb.
            surface=DEFAULT_SURFACE,
            # TASK-0039: centred on, tapered with and kept on the body actually photographed.
            fit_body=True,
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
            # When an owner last erased everything (TASK-0046). Not a blocklist: see `still_mine`.
            db.execute("CREATE TABLE IF NOT EXISTS deleted (owner TEXT PRIMARY KEY, at REAL)")
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

    def purge_expired(self, now: datetime | None = None) -> None:
        """
        Erase what has outlived its lifecycle (TASK-0047).

        Photographs of a body and everything composed on them expire; designs do not. Versions
        are kept, so a design made weeks ago still opens, with a notice where its photo was. Only
        runs that produced nothing - failed or cancelled - are swept, and a kept camera photo's
        version goes with its photo, because without it there is nothing left to show.
        """
        moment = now or datetime.now(UTC)
        with self.lock:
            for asset in self.media.expired(moment):
                try:
                    receipt = self.media.delete_cascade(asset.asset_id)
                except AssetNotFoundError:
                    continue
                with self.db() as db:
                    db.executemany("DELETE FROM assets WHERE id=?", [(a,) for a in receipt.removed])
            with self.jobs.connect() as db:
                db.execute(
                    "DELETE FROM jobs WHERE created < ? AND state IN ('failed','cancelled')",
                    (moment.timestamp() - 86400,),
                )
            self.drop_orphaned_captures()
            with self.db() as db:
                db.execute("DELETE FROM consent WHERE created < datetime('now','-1 day')")

    def drop_orphaned_captures(self) -> None:
        """A kept camera photo's version whose photo has expired shows nothing: remove it."""
        with self.jobs.connect() as db:
            rows = db.execute(
                "SELECT id, result FROM jobs WHERE state='succeeded' AND result LIKE ?",
                ('%"capture"%',),
            ).fetchall()
        gone: list[str] = []
        with self.db() as db:
            for row in rows:
                photo = (json.loads(row["result"]).get("capture") or {}).get("photo") or {}
                held = db.execute("SELECT 1 FROM assets WHERE id=?", (photo.get("assetId"),))
                if not held.fetchone():
                    gone.append(row["id"])
        if gone:
            with self.jobs.connect() as db:
                db.executemany("DELETE FROM jobs WHERE id=?", [(job,) for job in gone])

    def own_photo(self, owner: str, asset_id: str) -> bytes:
        """The client's own body photo, or a clear refusal once it has expired (TASK-0047)."""
        try:
            return self.owned(owner, asset_id, "body")
        except (KeyError, ValueError) as error:
            raise ValueError(PHOTO_GONE) from error

    def db(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=10)

    def deletion_mark(self, owner: str) -> float:
        """When this owner last erased everything, or 0 if they never have (TASK-0046)."""
        with self.db() as db:
            row = db.execute("SELECT at FROM deleted WHERE owner=?", (owner,)).fetchone()
        return float(row[0]) if row else 0.0

    def still_mine(self, owner: str, mark: float) -> None:
        """
        Refuse to store work for an owner who erased everything while it was being made.

        A generation runs for minutes, so a deletion can land in the middle of one and the work
        would otherwise be registered after it, outliving the erasure. The guard this replaces
        refused a deleted owner forever: correct for a throwaway session id, a permanent lockout
        for an account id (TASK-0046/DEC-002). Comparing against the mark taken when the work
        started refuses the straddling case and nothing else, so deleting is not a lockout.
        """
        if self.deletion_mark(owner) != mark:
            raise ValueError("Se eliminaron tus datos durante esta operación. Vuelve a empezar.")

    def owned(self, owner: str, asset_id: str, kind: str | None = None) -> bytes:
        if not re.fullmatch("[a-f0-9]{32}", asset_id):
            raise KeyError("Archivo no encontrado")
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
        mark = self.deletion_mark(owner)
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
            self.still_mine(owner, mark)
            with self.db() as db:
                if (
                    db.execute(
                        "SELECT count(*) FROM assets WHERE owner=? AND kind!='artifact'", (owner,)
                    ).fetchone()[0]
                    >= 10
                ):
                    raise ValueError(
                        "Límite de diez imágenes por cuenta. Elimina tus datos para empezar "
                        "de nuevo."
                    )
                db.execute(
                    "INSERT INTO consent(owner,version) VALUES (?,?)",
                    (owner, "studio-own-photo-v1" if kind == "body" else "studio-reference-v1"),
                )
            # A reference passed a gate that refuses any person, so it shows nobody and follows
            # the design lifecycle; a body photo is a photograph and expires (TASK-0047).
            asset = self.media.ingest_photo(
                normalized,
                gate.clearance,
                retention=RetentionClass.PHOTO if kind == "body" else RetentionClass.DESIGN,
            )
            self.register(owner, asset.asset_id, kind)
        return {"assetId": asset.asset_id, "mimeType": asset.media_type}

    def generate(self, owner: str, payload: dict[str, Any]) -> dict[str, Any]:
        # Taken before any work starts, so a deletion arriving mid-generation is detected at the
        # storage step rather than silently outlived by it (TASK-0046/REQ-005).
        mark = self.deletion_mark(owner)
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
            self.own_photo(owner, payload["bodyPhotoId"]) if payload.get("bodyPhotoId") else None
        )
        edit = payload.get("edit")
        parent = self.jobs.get(owner, edit["parentJobId"])["result"] if edit else None
        if edit and parent is None:
            raise ValueError("La propuesta original no está disponible.")
        if parent and parent.get("background") and background is None:
            background = self.owned(owner, parent["background"]["assetId"], "artifact")
        coverage = coverage_request(edit) if edit else None
        attached = len(edit.get("referenceIds") or []) if edit else 0
        # Attached photos always mean the drawing changes, whatever else the sentence says.
        if coverage and parent and coverage.placement_only and not attached:
            if background is None:
                background = self.provider.background(brief)
            return self.reposition(owner, payload, parent, background, coverage, mark)
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
        if edit and attached:
            # The new photos lead the reference list; record what they show for traceability.
            added = self.provider.analyze(references[:attached], edit["instruction"])
            analysis = f"{analysis}\n\nFotos añadidas con el cambio: {added}"[:3000]
        # The creation sequence (artwork -> stencil -> compose) runs through the orchestration
        # graph (TASK-0032, ADR-0015). The adapter reproduces the previous inline behaviour; the
        # graph fixes the order and hosts the future AI-blend / output-gate nodes.
        deps = _StudioGenerationDeps(self, owner, edit, parent, coverage, zone, payload)
        state = build_generation_graph(
            deps, blend=_StudioBlend(self.provider), geometry=GeometryCheck(BLEND_TOLERANCE)
        ).invoke(
            PipelineState(
                brief=brief,
                references=references,
                analysis=analysis,
                rendered=rendered,
                colour=colour,
                weight={"fine": 0.25, "medium": 0.35, "bold": 0.6}.get(
                    brief["linework"]["weight"], 0.35
                ),
                background=background,
                # An own photo is marked as such so the finish declines it (ADR-0018).
                body_photo=background if payload.get("bodyPhotoId") else None,
            )
        )
        # The graph always fills these on the success path; assert to narrow the optional state
        # fields and to fail loudly rather than storing a half-built result.
        assert state.mockup is not None and state.background is not None
        assert state.transform is not None
        master, raster, mockup = state.master, state.raster, state.mockup
        transform, background, files = finished_transform(state), state.background, state.files
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
            + (FINISH_NOTICE if state.blended else "")
            + "Simulación de tinta reciente; curvatura aproximada en extremidades, "
            "no reconstrucción anatómica. "
            "Visualización ilustrativa. Revisa los símbolos y el trazo con "
            "tu tatuador. Imprime el PDF al 100 %, sin ajustar a página.",
        }
        with self.lock:
            self.still_mine(owner, mark)
            self.store_vector(owner, master, payload)
            if edit:
                result["edit"] = edit
            for asset_id in payload["referenceIds"]:
                self.owned(owner, asset_id, "reference")
            if payload.get("bodyPhotoId"):
                self.own_photo(owner, payload["bodyPhotoId"])
            for name, (data, mime) in files.items():
                with Image.open(io.BytesIO(mockup)) as rendered:
                    dimensions = rendered.size if name in ("mockup", "background") else raster.size
                asset = self.media.store_artifact(
                    data,
                    media_type=mime,
                    width_px=dimensions[0],
                    height_px=dimensions[1],
                    retention=lifecycle(name, payload)[0],
                    parent_id=lifecycle(name, payload)[1],
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
            # The geometry shows nobody: it is the design itself (TASK-0047).
            retention=RetentionClass.DESIGN,
            parent_id=payload["referenceIds"][0],
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
        except (AssetNotFoundError, HTTPException, KeyError):
            # The row can outlive its asset (expiry, deletion). A missing vector is a case the
            # caller already handles; it is not an error.
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
        mark: float,
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
                fit_body=True,
            )
        # TASK-0040: a re-placed design gets the same finish, through the same nodes, as a new one.
        own_photo = bool(payload.get("bodyPhotoId")) or parent.get("backgroundKind") == "own_photo"
        finished = build_finish_graph(
            blend=_StudioBlend(self.provider), geometry=GeometryCheck(BLEND_TOLERANCE)
        ).invoke(
            PipelineState(
                brief=brief,
                mockup=mockup,
                transform=transform,
                body_photo=background if own_photo else None,
            )
        )
        assert finished.mockup is not None
        mockup, transform = finished.mockup, finished_transform(finished)
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
            "notice": notice
            + (FINISH_NOTICE if finished.blended else "")
            + "La curvatura no es una reconstrucción anatómica.",
        }
        with self.lock:
            self.still_mine(owner, mark)
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
                    retention=lifecycle(name, payload)[0],
                    parent_id=lifecycle(name, payload)[1],
                )
                result[name] = {
                    "assetId": self.register(owner, asset.asset_id, "artifact"),
                    "designId": design_id,
                    "mimeType": mime,
                }
        return result

    def capture(self, owner: str, body: dict[str, Any]) -> dict[str, Any]:
        """
        Keep a photograph taken with the camera try-on as a version of its design (ADR-0022).

        The photograph is a picture of the client's body, so it takes exactly the own-photo path:
        adult consent, the safety gate with own-body consent, EXIF stripped, encrypted at rest,
        counted against the account's images and erased with everything else. It is stored, shown
        back to its owner and nothing more: no image model ever receives it.

        The design does not change. Every field of the version is the parent's except the
        photograph and the notice, so an edit started from it edits the same design.
        """
        key = body.get("idempotencyKey")
        parent_id = body.get("parentJobId")
        if not isinstance(key, str) or not re.fullmatch("[a-f0-9-]{36}", key):
            raise ValueError("Identificador de solicitud inválido.")
        if not isinstance(parent_id, str) or not re.fullmatch("[a-f0-9]{32}", parent_id):
            raise ValueError("Propuesta original inválida.")
        # A retry of a request that already succeeded does not screen or store the photo twice.
        existing = self.jobs.find(owner, key)
        if existing:
            return existing
        parent = self.jobs.get(owner, parent_id)
        if parent["state"] != "succeeded" or not parent["result"]:
            raise ValueError("La propuesta original no está disponible.")
        # The parent's stored request, so a change asked from this version finds its brief.
        source = self.jobs.source_payload(owner, parent_id)
        photo = self.ingest(
            owner,
            {
                "data": body.get("data", ""),
                "kind": "body",
                "adult": body.get("adult"),
                "consent": body.get("consent"),
            },
        )
        result = {k: v for k, v in parent["result"].items() if k not in ("capture", "edit")}
        result["capture"] = {
            "parentJobId": parent_id,
            "photo": {
                "assetId": photo["assetId"],
                "designId": result["designId"],
                "mimeType": photo["mimeType"],
            },
        }
        result["notice"] = CAPTURE_NOTICE
        payload = {k: v for k, v in source.items() if k != "edit"}
        return self.jobs.record(owner, {**payload, "idempotencyKey": key}, result)

    def delete(self, owner: str) -> None:
        with self.lock:
            with self.db() as db:
                # A watermark, not a blocklist: the account keeps working, with a clean slate.
                db.execute("INSERT OR REPLACE INTO deleted VALUES (?,?)", (owner, time.time()))
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
                # Without this the account keeps rows pointing at artwork it no longer owns.
                db.execute("DELETE FROM design_vector WHERE owner=?", (owner,))


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
        """
        Whose work this is: the account id, since TASK-0046. The header used to carry the
        browser's consultation session id, which made the same person on a second device a
        different owner. The name follows the meaning so the next reader is not misled.
        """
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            raise HTTPException(401, "No autorizado")
        value = request.headers.get("x-owner-id", "")
        if not re.fullmatch("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", value):
            raise HTTPException(401, "Propietario inválido")
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
                # TASK-0036: the stored payload predates any whole-zone resize, so the parent's
                # result is where its millimetres live. Without this an edit of a resized
                # version silently shrank back to the original size.
                body["brief"]["size"] = dict(parent["size"])
            if validate("studio-job", body):
                raise ValueError("Revisa la petición de cambios (entre 3 y 1000 caracteres).")
            attached = (body.get("edit") or {}).get("referenceIds") or []
            if attached:
                # TASK-0036: photos attached to a change guide it first and stay with the design
                # for later versions. The contract caps a design at five references.
                body["referenceIds"] = list(dict.fromkeys([*attached, *body["referenceIds"]]))[:5]
            for asset_id in body["referenceIds"]:
                studio.owned(who, asset_id, "reference")
            if body.get("bodyPhotoId"):
                studio.own_photo(who, body["bodyPhotoId"])
            return studio.jobs.enqueue(who, body)
        except (KeyError, ValueError) as error:
            raise HTTPException(422, str(error)) from error

    @routes.post("/captures", status_code=201)
    async def capture(request: Request) -> dict[str, Any]:
        """A camera try-on photograph the client chose to keep (ADR-0022)."""
        who = owner(request)
        body = await bounded_json(request)
        try:
            from starlette.concurrency import run_in_threadpool

            # The photo is screened by the moderation provider; keep status polling responsive.
            return await run_in_threadpool(studio.capture, who, body)
        except KeyError as error:
            raise HTTPException(404, "La propuesta original no está disponible.") from error
        except ValueError as error:
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
