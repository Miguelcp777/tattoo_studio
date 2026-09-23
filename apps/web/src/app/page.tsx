'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { OrchestrationSession } from '@tattoo/consultation';

import { BODY_OPTIONS, STYLE_OPTIONS } from '@tattoo/consultation/preferences';

import { styleOffers } from '@tattoo/consultation/style-library';

import { buildMasterPrompt } from '@tattoo/consultation/master-prompt';

import { TattooPreviewModal } from '@/components/TattooPreviewModal';
import { GenerationProgress } from '@/components/GenerationProgress';
import { StepFlow } from '@/components/StepFlow';
import { StylePicker } from '@/components/StylePicker';
import { MasterBrief } from '@/components/MasterBrief';

import { buildSteps } from '@/lib/steps';

import type { StudioJobStatus, GeneratedTattooArtifact } from '@/types/generation';

interface Form {
  style: string;

  body: string;

  side: string;

  color: string;

  palette: string;

  width: string;

  height: string;
}

const empty: Form = {
  style: '',

  body: '',

  side: '',

  color: '',

  palette: '',

  width: '',

  height: '',
};

export default function ConsultationPage(): ReactNode {
  const [session, setSession] = useState<OrchestrationSession | null>(null);

  const [text, setText] = useState('');

  const [form, setForm] = useState<Form>(empty);

  const [savedForm, setSavedForm] = useState<Form>(empty);

  const [busy, setBusy] = useState(false);
  const [submittingGeneration, setSubmittingGeneration] = useState(false);

  const [error, setError] = useState('');

  const [adult, setAdult] = useState(false);

  const [consent, setConsent] = useState(false);

  const [referencesReviewed, setReferencesReviewed] = useState(false);

  // TASK-0029: nothing is generated until the client has read the brief and said yes.
  // Storing what they accepted, rather than that they accepted, means any later change
  // invalidates it on its own: they agreed to what they read, not to whatever it becomes.
  const [acceptedSignature, setAcceptedSignature] = useState('');

  const [bodyPhotoId, setBodyPhotoId] = useState('');

  const [placement, setPlacement] = useState({ x: 0.32, y: 0.22, width: 0.36, photoWidthMm: '' });
  const [manualPlacement, setManualPlacement] = useState(false);

  const [job, setJob] = useState<StudioJobStatus | null>(null);

  const [artifact, setArtifact] = useState<GeneratedTattooArtifact | null>(null);
  const [versions, setVersions] = useState<StudioJobStatus[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');

  async function refreshVersions(restoreLatest = false) {
    try {
      const response = await fetch('/api/generate?history=true');
      if (response.ok) {
        const history: StudioJobStatus[] = await response.json();
        setVersions(history);
        const latest = history[0];
        if (restoreLatest && latest?.result) {
          setArtifact(latest.result);
          setSelectedJobId(latest.jobId);
        }
      }
    } catch {
      setError('No se ha podido cargar el historial. Tu propuesta actual sigue disponible.');
    }
  }

  const [showResult, setShowResult] = useState(false);

  const referenceInput = useRef<HTMLInputElement>(null);

  const bodyInput = useRef<HTMLInputElement>(null);

  const messagesEnd = useRef<HTMLDivElement>(null);

  const activeJob = job?.state === 'queued' || job?.state === 'running';

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/consultation')
      .then((r) => r.json())

      .then(async (data) => {
        if (!cancelled && data.session) {
          accept(data.session);

          setBodyPhotoId(data.bodyPhotoId ?? '');
          let restoreLatest = true;

          if (data.jobId) {
            const response = await fetch(`/api/generate?id=${data.jobId}`);

            if (response.ok && !cancelled) {
              const status: StudioJobStatus = await response.json();

              setJob(status);
              restoreLatest = status.state !== 'queued' && status.state !== 'running';

              if (status.state === 'succeeded') {
                setArtifact(status.result);
                setSelectedJobId(status.jobId);
              }
            }
          }
          if (!cancelled) await refreshVersions(restoreLatest);
        }
      })

      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [session?.messages.length]);

  useEffect(() => {
    if (submittingGeneration)
      document.querySelector('[role="progressbar"]')?.scrollIntoView({ block: 'center' });
  }, [submittingGeneration]);

  useEffect(() => {
    if (!activeJob || !job) return;

    let stopped = false;

    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/generate?id=${job.jobId}`);

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            setJob(null);

            setError(data.error);

            return;
          }

          throw new Error(data.error);
        }

        if (stopped) return;

        setJob(data);

        if (data.state === 'succeeded') {
          setArtifact(data.result);
          setSelectedJobId(data.jobId);
          void refreshVersions();

          setShowResult(true);
        } else if (data.state === 'failed') setError(data.error);

        if (data.state === 'queued' || data.state === 'running') timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!stopped) {
          setError(String(e));

          timer = setTimeout(poll, 5000);
        }
      }
    };

    timer = setTimeout(poll, 1000);

    return () => {
      stopped = true;

      clearTimeout(timer);
    };
  }, [activeJob, job?.jobId]);

  function accept(next: OrchestrationSession) {
    setSession(next);

    const s = next.slots;

    const nextForm = {
      style: s.style?.primary ?? '',

      body: s.placement?.bodyPart ?? '',

      side: s.placement?.side ?? '',

      color: s.colour?.mode ?? '',

      palette: s.colour?.palette?.join(', ') ?? '',

      width: s.size?.widthMm?.toString() ?? '',

      height: s.size?.heightMm?.toString() ?? '',
    };

    setForm(nextForm);

    setSavedForm(nextForm);

    setArtifact(null);

    setReferencesReviewed(false);
  }

  async function call(url: string, body: unknown, method = 'POST') {
    const res = await fetch(url, {
      method,

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error ?? 'No se pudo completar la solicitud.');

    return data;
  }

  async function run(action: () => Promise<void>) {
    setError('');

    setBusy(true);

    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!text.trim()) return;

    await run(async () => {
      const data = await call('/api/consultation', { action: 'orchestrate', userMessage: text });

      accept(data.session);

      setText('');
    });
  }

  async function save() {
    const preferences: Record<string, unknown> = {};

    if (form.style) preferences['style'] = { primary: form.style };

    if (form.body)
      preferences['placement'] = {
        bodyPart: form.body,

        orientation: 'vertical',

        ...(form.side ? { side: form.side } : {}),
      };

    if (form.color)
      preferences['colour'] = {
        mode: form.color,

        ...(form.color === 'black_and_grey' || !form.palette.trim()
          ? {}
          : {
              palette: form.palette

                .split(',')

                .map((x) => x.trim())

                .filter(Boolean),
            }),
      };

    if (form.width && form.height)
      preferences['size'] = { widthMm: Number(form.width), heightMm: Number(form.height) };

    await run(async () =>
      accept((await call('/api/consultation', { action: 'preferences', preferences })).session),
    );
  }

  async function upload(file: File | undefined, kind: 'reference' | 'body') {
    if (!file) return;

    await run(async () => {
      if (file.size > 8000000) throw new Error('La imagen supera 8 MB.');

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result).split(',')[1]!);

        reader.onerror = reject;

        reader.readAsDataURL(file);
      });

      const data = await call('/api/media', { data: base64, kind, adult, consent });

      accept(data.session);

      if (kind === 'body') setBodyPhotoId(data.assetId);
    });
  }

  async function generate() {
    setSubmittingGeneration(true);
    try {
      await run(async () => {
        const data = await call('/api/generate', {
          idempotencyKey: crypto.randomUUID(),

          adult,

          consent,

          referencesReviewed,

          ...(bodyPhotoId ? { bodyPhotoId } : {}),

          ...(manualPlacement || bodyPhotoId
            ? {
                placement: {
                  x: placement.x,

                  y: placement.y,

                  width: placement.width,

                  ...(placement.photoWidthMm
                    ? { photoWidthMm: Number(placement.photoWidthMm) }
                    : {}),
                },
              }
            : {}),
        });

        setJob(data);

        setShowResult(false);
      });
    } finally {
      setSubmittingGeneration(false);
    }
  }

  const disabled = busy || activeJob;

  async function editProposal(instruction: string, coverage?: 'larger' | 'smaller' | 'full') {
    setSubmittingGeneration(true);
    setShowResult(false);
    try {
      await run(async () => {
        const data = await call('/api/generate', {
          idempotencyKey: crypto.randomUUID(),
          adult,
          consent,
          edit: {
            parentJobId: selectedJobId,
            instruction,
            ...(coverage ? { coverage, mode: 'placement' } : {}),
          },
        });
        setJob(data);
      });
    } finally {
      setSubmittingGeneration(false);
    }
  }

  const unsaved = JSON.stringify(form) !== JSON.stringify(savedForm);

  // TASK-0026: the rail reads state the page already holds; it decides nothing (WEB-INV-001).
  const slots = session?.slots;
  const hasBrief = Boolean(
    slots?.style?.primary && slots?.placement?.bodyPart && slots?.colour?.mode,
  );
  // TASK-0029: a reading of the brief that will be sent, not a second description of it.
  const masterPrompt = buildMasterPrompt(slots ?? {}, session?.references ?? []);

  const briefSignature = JSON.stringify(masterPrompt.lines);
  const briefAccepted = masterPrompt.complete && briefSignature === acceptedSignature;

  // TASK-0028: offer catalogue variants once a style is known, so the client chooses by
  // looking rather than by imagining.
  const offers = styleOffers(slots?.style?.primary);
  const chosenVariant = session?.references.find((r) => r.verification === 'style_library');
  const chosenOfferId = offers.find((o) => o.image === chosenVariant?.source)?.id;

  async function chooseStyleVariant(variantId: string) {
    await run(async () =>
      accept((await call('/api/consultation', { action: 'style_variant', variantId })).session),
    );
  }

  const steps = buildSteps({
    hasIdea: Boolean(slots?.subject?.description),
    hasBrief,
    referenceCount: session?.references.length ?? 0,
    adult,
    consent,
    referencesReviewed,
    hasArtifact: Boolean(artifact),
    proposedSize: slots?.size,
  });

  function goToStep(id: string) {
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      <header className="studio-header">
        <div className="studio-title">
          INKCRAFT <span className="studio-subtitle">Estudio de tatuaje</span>
        </div>

        <span className="model-badge">Diseño · Piel · Stencil</span>
      </header>

      <StepFlow steps={steps} onSelect={goToStep} />

      <main className="studio-container">
        <section id="step-idea" className="chat-surface" aria-label="Consulta de diseño">
          <div className="studio-intro">
            <p className="eyebrow">DE LA IDEA AL TRAZO</p>

            <h1>Tu idea, un solo diseño.</h1>

            <p>
              Describe el tatuaje que imaginas. Usaremos referencias reales y un mismo maestro para
              la plantilla y la vista en piel.
            </p>

            <p className="small-note">
              Hasta 3 preguntas. Proponemos el tamaño según la zona del cuerpo; puedes cambiarlo en
              el panel cuando quieras.
            </p>
          </div>

          <div className="studio-messages" aria-live="polite">
            {session?.messages.map((m, i) => (
              <article
                key={i}

                className={m.senderLabel === 'Cliente' ? 'studio-message user' : 'studio-message'}
              >
                <strong>{m.senderLabel}</strong>

                <p>{m.content}</p>
              </article>
            ))}

            <div ref={messagesEnd} />
          </div>

          <form
            className="studio-composer"

            onSubmit={(e) => {
              e.preventDefault();

              void send();
            }}
          >
            <label htmlFor="idea">Describe tu idea</label>

            <textarea
              id="idea"

              value={text}

              onChange={(e) => setText(e.target.value)}

              disabled={disabled}

              maxLength={2000}

              placeholder="Un león de línea fina en el antebrazo izquierdo, en negro, de 8 × 15 cm…"
            />

            <button className="btn-primary" disabled={disabled || !text.trim()}>
              {busy ? 'Procesando…' : 'Enviar idea'}
            </button>
          </form>

          <p className="small-note">
            Visualización orientativa. El tatuador debe revisar el diseño y el stencil antes de
            utilizarlos.
          </p>
        </section>

        <aside className="brief-panel" aria-label="Preferencias y entrega">
          <h2 id="step-brief">Tu proyecto</h2>

          <p>{session ? `Preguntas: ${session.questionsAsked} / 3` : 'Empieza por tu idea'}</p>

          <div className="studio-fields">
            <label>
              Estilo
              <select
                value={form.style}

                onChange={(e) => setForm({ ...form, style: e.target.value })}

                disabled={disabled}
              >
                <option value="">Seleccionar</option>

                {Object.entries(STYLE_OPTIONS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Zona
              <select
                value={form.body}

                onChange={(e) => setForm({ ...form, body: e.target.value })}

                disabled={disabled}
              >
                <option value="">Seleccionar</option>

                {Object.entries(BODY_OPTIONS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Lado
              <select
                value={form.side}

                onChange={(e) => setForm({ ...form, side: e.target.value })}

                disabled={disabled}
              >
                <option value="">Sin especificar</option>

                <option value="left">Izquierdo</option>

                <option value="right">Derecho</option>

                <option value="centre">Centro</option>
              </select>
            </label>

            <label>
              Color
              <select
                value={form.color}

                onChange={(e) => setForm({ ...form, color: e.target.value })}

                disabled={disabled}
              >
                <option value="">Seleccionar</option>

                <option value="black_and_grey">Negro y gris</option>

                <option value="colour">Color</option>

                <option value="black_and_grey_with_accent">Negro con acentos</option>
              </select>
            </label>

            {form.color && form.color !== 'black_and_grey' && (
              <label className="wide">
                ¿Algún color que quieras incluir? (opcional)
                <input
                  placeholder="Por ejemplo: rojo, azul"

                  value={form.palette}

                  onChange={(e) => setForm({ ...form, palette: e.target.value })}

                  disabled={disabled}
                />
                <small>
                  Puedes dejarlo vacío. La idea y las referencias guiarán la elección de colores.
                </small>
              </label>
            )}

            <label>
              Ancho (mm) <span className="field-optional">opcional</span>
              <input
                type="number"
                min="5"
                max="600"
                placeholder={
                  slots?.size?.widthMm ? String(slots.size.widthMm) : 'Lo propone el estudio'
                }
                value={form.width}
                onChange={(e) => setForm({ ...form, width: e.target.value })}
                disabled={disabled}
              />
            </label>

            <label>
              Alto (mm) <span className="field-optional">opcional</span>
              <input
                type="number"
                min="5"
                max="600"
                placeholder={
                  slots?.size?.heightMm ? String(slots.size.heightMm) : 'Lo propone el estudio'
                }
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}

                disabled={disabled}
              />
            </label>
          </div>

          <button onClick={() => void save()} disabled={disabled || !session}>
            Guardar preferencias
          </button>

          <p className="small-note">
            Trazo técnico propuesto: {session?.slots.linework?.weight === 'fine' ? 'fino' : 'medio'}
            . El diseño usará el modo de color elegido y un acabado de tinta reciente sobre piel. La
            curvatura y el tamaño son orientativos. El tatuador debe revisar los símbolos y los
            contornos de la plantilla.
          </p>

          <StylePicker
            offers={offers}
            selected={chosenOfferId}
            disabled={disabled}
            onSelect={(id) => void chooseStyleVariant(id)}
          />

          <MasterBrief
            prompt={masterPrompt}
            brief={session?.brief}
            accepted={briefAccepted}
            disabled={disabled}
            onAccept={() => setAcceptedSignature(briefSignature)}
            onReopen={() => setAcceptedSignature('')}
          />

          <h3 id="step-referencias">Referencias</h3>
          {session?.missingFields.some((field) => field.startsWith('referencia')) && (
            <button
              disabled={disabled}
              onClick={() =>
                void run(async () =>
                  accept((await call('/api/consultation', { action: 'retry_references' })).session),
                )
              }
            >
              Buscar las referencias pendientes
            </button>
          )}

          <div className="reference-grid">
            {session?.references.map((r, i) => (
              <figure key={r.source}>
                <img src={r.source} alt={r.label ?? `Referencia ${i + 1}`} />

                <figcaption>
                  {r.sourcePage ? (
                    <a href={r.sourcePage} target="_blank" rel="noreferrer">
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}

                  <small>{r.license || 'Aportada por ti'}</small>
                </figcaption>

                <button
                  disabled={disabled}

                  onClick={() =>
                    void run(async () =>
                      accept(
                        (
                          await call('/api/consultation', {
                            action: 'references',

                            removeReference: r.source,
                          })
                        ).session,
                      ),
                    )
                  }
                >
                  Quitar
                </button>
              </figure>
            ))}
          </div>

          <label className="check-row">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            Soy mayor de 18 años.
          </label>

          <label className="check-row">
            <input
              type="checkbox"

              checked={consent}

              onChange={(e) => setConsent(e.target.checked)}
            />
            Tengo permiso para estas imágenes y acepto su revisión de contenido y procesamiento para
            este diseño. La foto corporal debe ser mía.
          </label>

          <div className="upload-actions">
            <button
              disabled={disabled || !adult || !consent}

              onClick={() => referenceInput.current?.click()}
            >
              Adjuntar referencia
            </button>

            <button
              disabled={disabled || !adult || !consent}

              onClick={() => bodyInput.current?.click()}
            >
              Mi foto de piel
            </button>

            <input
              hidden

              ref={referenceInput}

              type="file"

              accept="image/png,image/jpeg,image/webp"

              onChange={(e) => {
                void upload(e.target.files?.[0], 'reference');

                e.target.value = '';
              }}
            />

            <input
              hidden

              ref={bodyInput}

              type="file"

              accept="image/png,image/jpeg,image/webp"

              onChange={(e) => {
                void upload(e.target.files?.[0], 'body');

                e.target.value = '';
              }}
            />
          </div>

          {bodyPhotoId && (
            <figure className="body-preview">
              <img
                src={`/api/media?id=${bodyPhotoId}`}

                alt="Tu fotografía para colocar el diseño"
              />

              <figcaption>Tu foto · la generación del diseño no recibe esta imagen</figcaption>
            </figure>
          )}

          <details>
            <summary>Posición y escala sobre piel</summary>

            <p className="small-note">
              Sin foto propia se genera una anatomía ilustrativa. La escala sobre piel solo es
              orientativa si no calibras.
              {!manualPlacement &&
                !bodyPhotoId &&
                ' Colocación automática según las medidas. Mover un control activa la colocación manual.'}
            </p>

            {(['x', 'y', 'width'] as const).map((key) => (
              <label key={key}>
                {key === 'x'
                  ? 'Posición horizontal'
                  : key === 'y'
                    ? 'Posición vertical'
                    : 'Anchura en foto'}
                : {Math.round(placement[key] * 100)} %
                <input
                  type="range"

                  min={key === 'width' ? 0.05 : 0}

                  max={key === 'width' ? 0.8 : 0.9}

                  step="0.01"

                  value={placement[key]}

                  onChange={(e) => {
                    setManualPlacement(true);
                    setPlacement({ ...placement, [key]: Number(e.target.value) });
                  }}
                />
              </label>
            ))}

            <label>
              Anchura real de toda la foto (mm, opcional)
              <input
                type="number"

                min="20"

                max="3000"

                value={placement.photoWidthMm}

                onChange={(e) => {
                  setManualPlacement(true);
                  setPlacement({ ...placement, photoWidthMm: e.target.value });
                }}
              />
            </label>
          </details>

          <label className="check-row">
            <input
              type="checkbox"

              checked={referencesReviewed}

              onChange={(e) => setReferencesReviewed(e.target.checked)}
            />
            He revisado que las referencias corresponden a mi idea.
          </label>

          {unsaved && <p role="status">Guarda los cambios del panel antes de generar.</p>}

          <button
            className="btn-primary generate-button"

            disabled={
              disabled ||
              unsaved ||
              session?.phase !== 'ready_to_generate' ||
              !adult ||
              !consent ||
              !referencesReviewed ||
              !briefAccepted
            }

            onClick={() => void generate()}
          >
            {activeJob ? 'Generando…' : 'Generar diseño y plantilla'}
          </button>

          {(submittingGeneration || activeJob) && (
            <GenerationProgress
              phase={
                submittingGeneration ? 'preparing' : job?.state === 'queued' ? 'queued' : 'running'
              }
            />
          )}

          {session?.missingFields.length ? (
            <p className="small-note">Pendiente: {session.missingFields.join(', ')}</p>
          ) : null}

          {artifact && <button onClick={() => setShowResult(true)}>Ver diseño y descargar</button>}
          {versions.length > 0 && (
            <section aria-label="Historial de propuestas">
              <h2>Tus versiones</h2>
              <p className="small-note">
                Conservadas durante 24 horas. Abre cualquiera para seguir cambiándola.
              </p>
              {versions.map(
                (version, index) =>
                  version.result && (
                    <button
                      key={version.jobId}
                      onClick={() => {
                        setArtifact(version.result);
                        setSelectedJobId(version.jobId);
                        setShowResult(true);
                      }}
                    >
                      Propuesta {versions.length - index} ·{' '}
                      {version.result.edit?.instruction ?? 'Diseño inicial'}
                    </button>
                  ),
              )}
            </section>
          )}

          <button
            className="delete-session"

            disabled={busy}

            onClick={() =>
              void run(async () => {
                await call('/api/media', {}, 'DELETE');

                setSession(null);

                setForm(empty);

                setBodyPhotoId('');

                setArtifact(null);
                setVersions([]);
                setSelectedJobId('');

                setJob(null);

                setReferencesReviewed(false);
              })
            }
          >
            Eliminar sesión y archivos
          </button>
        </aside>
      </main>

      {error && (
        <div className="studio-error" role="alert">
          <span>{error}</span>

          <button onClick={() => setError('')} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {showResult && artifact && (
        <TattooPreviewModal
          key={selectedJobId}
          artifact={artifact}
          onClose={() => setShowResult(false)}
          onEdit={(instruction, coverage) => void editProposal(instruction, coverage)}
          editingDisabled={Boolean(
            disabled || submittingGeneration || !adult || !consent || !selectedJobId,
          )}
          consentControls={
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={adult}
                  onChange={(e) => setAdult(e.target.checked)}
                />
                Soy mayor de 18 años.
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Tengo permiso para procesar estas imágenes y crear otra versión.
              </label>
            </>
          }
        />
      )}
    </div>
  );
}
