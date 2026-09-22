'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GeneratedTattooArtifact } from '@/types/generation';
import { ImageDetail } from './ImageDetail';
export function TattooPreviewModal({
  artifact,
  onClose,
  onEdit,
  editingDisabled = false,
  consentControls,
}: {
  artifact: GeneratedTattooArtifact;
  onClose: () => void;
  onEdit?: (instruction: string, coverage?: 'larger' | 'smaller' | 'full') => void;
  editingDisabled?: boolean;
  consentControls?: ReactNode;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reviewed, setReviewed] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [detail, setDetail] = useState<'mockup' | 'stencil' | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  function closeDetail() {
    setDetail(null);
    requestAnimationFrame(() => detailTrigger.current?.focus());
  }
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const url = (id: string) => `/api/media?id=${id}`;
  return (
    <dialog
      ref={dialog}
      className="studio-dialog"
      onCancel={(event) => {
        if (detail) {
          event.preventDefault();
          closeDetail();
        } else onClose();
      }}
      aria-labelledby="preview-title"
    >
      <header className="result-header">
        <div>
          <p className="eyebrow">DISEÑO MAESTRO · REVISIÓN {artifact.briefRevision}</p>
          <h2 id="preview-title">Revisa tu diseño</h2>
        </div>
        <button onClick={onClose} aria-label="Cerrar vista previa">
          Cerrar ✕
        </button>
      </header>
      <p className="notice-banner">{artifact.notice}</p>
      {onEdit && (
        <form
          className="proposal-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (instruction.trim().length >= 3 && !editingDisabled) onEdit(instruction.trim());
          }}
        >
          <label htmlFor="proposal-change">¿Qué quieres cambiar de esta propuesta?</label>
          <textarea
            id="proposal-change"
            value={instruction}
            maxLength={1000}
            minLength={3}
            required
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Por ejemplo: haz el escudo más pequeño y deja más espacio entre los elementos."
          />
          <p>
            Crearemos otra versión a partir de este dibujo. La anterior se conservará. Revisa
            también los detalles que no hayas pedido cambiar.
          </p>
          {consentControls}
          <div className="coverage-controls">
            <strong>Tamaño del tatuaje sobre la piel</strong>
            <p>
              «Más pequeño» y «Más grande» cambian solo la vista: las medidas del PDF no cambian.
              «Ocupar toda la zona» sí ajusta las medidas de impresión a la zona del cuerpo, con
              anatomía de referencia adulta que debes confirmar con tu tatuador. Ninguna de las tres
              vuelve a dibujar el tatuaje.
            </p>
            <div>
              <button
                type="button"
                disabled={editingDisabled}
                onClick={() => onEdit('Reducir la cobertura del tatuaje sobre piel', 'smaller')}
              >
                Más pequeño
              </button>
              <button
                type="button"
                disabled={editingDisabled}
                onClick={() => onEdit('Ampliar la cobertura del tatuaje sobre piel', 'larger')}
              >
                Más grande
              </button>
              <button
                type="button"
                disabled={editingDisabled}
                onClick={() => onEdit('Que ocupe toda la zona', 'full')}
              >
                Ocupar toda la zona
              </button>
            </div>
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={editingDisabled || instruction.trim().length < 3}
          >
            Crear versión con estos cambios
          </button>
        </form>
      )}
      {artifact.edit && <p>Cambio solicitado: {artifact.edit.instruction}</p>}
      {detail && (
        <ImageDetail
          key={detail}
          src={url(artifact[detail].assetId)}
          label={detail === 'mockup' ? 'Mockup sobre piel' : 'Plantilla a escala'}
          onClose={closeDetail}
        />
      )}
      <p>
        Ambos archivos proceden del mismo maestro. Esto acredita el origen compartido, no la
        exactitud cultural ni la idoneidad para tatuar.
      </p>
      <div className="result-grid" hidden={Boolean(detail)}>
        <figure>
          <button
            className="image-open"
            aria-label="Ampliar mockup"
            onClick={(event) => {
              detailTrigger.current = event.currentTarget;
              setDetail('mockup');
            }}
          >
            <img
              src={url(artifact.mockup.assetId)}
              alt="Diseño maestro colocado geométricamente sobre piel"
            />
            <span>Ampliar mockup ↗</span>
          </button>
          <figcaption>
            {artifact.backgroundKind === 'own_photo'
              ? 'Tu fotografía'
              : 'Anatomía generada, no es tu fotografía'}{' '}
            ·{' '}
            {artifact.transform.scaleCalibrated
              ? 'Escala según tu calibración'
              : 'Tamaño sobre piel orientativo'}
          </figcaption>
        </figure>
        <figure>
          <button
            className="image-open"
            aria-label="Ampliar plantilla"
            onClick={(event) => {
              detailTrigger.current = event.currentTarget;
              setDetail('stencil');
            }}
          >
            <img
              src={url(artifact.stencil.assetId)}
              alt="Stencil vectorial del mismo diseño maestro"
            />
            <span>Ampliar plantilla ↗</span>
          </button>
          <figcaption>
            Plantilla · formato {artifact.size.widthMm} × {artifact.size.heightMm} mm
            {artifact.transform.sourceCropPx && ' · puede incluir márgenes blancos'}
          </figcaption>
        </figure>
      </div>
      <details>
        <summary>Referencias y trazabilidad</summary>
        <p>{artifact.referenceAnalysis}</p>
        <p className="hash">Diseño: {artifact.designId}</p>
        <p>Colocación geométrica; sin regeneración de líneas después de colocar.</p>
      </details>
      <label className="check-row">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        He revisado los símbolos. El tatuador debe validar el trazo y la impresión antes de
        utilizarlo.
      </label>
      {reviewed && (
        <div className="download-row">
          <a
            className="btn-primary"
            href={url(artifact.pdf.assetId)}
            download="inkcraft-stencil.pdf"
          >
            PDF a escala 1:1
          </a>
          <a href={url(artifact.pdfMirror.assetId)} download="inkcraft-stencil-espejo.pdf">
            PDF espejo
          </a>
          <a href={url(artifact.stencil.assetId)} download="inkcraft-stencil.svg">
            SVG
          </a>
          <a href={url(artifact.stencilMirror.assetId)} download="inkcraft-stencil-espejo.svg">
            SVG espejo
          </a>
          <a href={url(artifact.mockup.assetId)} download="inkcraft-mockup.png">
            Mockup
          </a>
        </div>
      )}
      <p>Imprime a tamaño real, sin “ajustar a página”, y mide la barra de 50 mm del PDF.</p>
    </dialog>
  );
}
