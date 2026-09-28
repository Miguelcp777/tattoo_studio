'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GeneratedTattooArtifact } from '@/types/generation';
import { ImageDetail } from './ImageDetail';
export function TattooPreviewModal({
  artifact,
  onClose,
  onEdit,
  onAttach,
  editingDisabled = false,
  consentControls,
}: {
  artifact: GeneratedTattooArtifact;
  onClose: () => void;
  onEdit?: (
    instruction: string,
    coverage?: 'larger' | 'smaller' | 'full',
    referenceIds?: string[],
  ) => void;
  /** Uploads a photo for the change request; resolves to its asset ID (TASK-0036). */
  onAttach?: (file: File) => Promise<string>;
  editingDisabled?: boolean;
  consentControls?: ReactNode;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reviewed, setReviewed] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [attached, setAttached] = useState<{ assetId: string; name: string }[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
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
            if (instruction.trim().length >= 3 && !editingDisabled && !attaching)
              onEdit(
                instruction.trim(),
                undefined,
                attached.length ? attached.map((a) => a.assetId) : undefined,
              );
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
            placeholder="Por ejemplo: haz el escudo más pequeño, o «quiero una virgen como en la foto adjunta»."
          />
          {onAttach && (
            <div className="edit-attachments">
              <button
                type="button"
                disabled={editingDisabled || attaching || attached.length >= 3}
                onClick={() => fileInput.current?.click()}
              >
                {attaching ? 'Subiendo foto…' : 'Adjuntar foto de referencia'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setAttaching(true);
                  setAttachError('');
                  try {
                    const assetId = await onAttach(file);
                    setAttached((list) => [...list, { assetId, name: file.name }]);
                  } catch (error) {
                    setAttachError(error instanceof Error ? error.message : String(error));
                  } finally {
                    setAttaching(false);
                  }
                }}
              />
              <span>
                {attached.length >= 3
                  ? 'Máximo tres fotos por cambio.'
                  : 'Opcional, hasta tres. Di en el texto qué quieres tomar de ella.'}
              </span>
              {attachError && <p role="alert">{attachError}</p>}
              {attached.length > 0 && (
                <ul>
                  {attached.map((photo) => (
                    <li key={photo.assetId}>
                      <img src={url(photo.assetId)} alt={`Foto adjunta: ${photo.name}`} />
                      <button
                        type="button"
                        aria-label={`Quitar ${photo.name}`}
                        onClick={() =>
                          setAttached((list) => list.filter((a) => a.assetId !== photo.assetId))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
            disabled={editingDisabled || attaching || instruction.trim().length < 3}
          >
            Crear versión con estos cambios
          </button>
        </form>
      )}
      {artifact.edit && (
        <p>
          Cambio solicitado: {artifact.edit.instruction}
          {artifact.edit.referenceIds?.length
            ? ` · con ${artifact.edit.referenceIds.length} foto${artifact.edit.referenceIds.length > 1 ? 's' : ''} adjunta${artifact.edit.referenceIds.length > 1 ? 's' : ''}`
            : ''}
        </p>
      )}
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
      {/* TASK-0042: the try-on runs on the client's own device; the design travels as its id. */}
      <p className="try-on-link">
        <a className="btn-primary" href={`/probar?design=${artifact.master.assetId}`}>
          Pruébalo con la cámara
        </a>
        <small>Se procesa en tu dispositivo; ninguna imagen de la cámara se envía.</small>
      </p>
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
