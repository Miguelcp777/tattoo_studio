'use client';

import type { ReactNode } from 'react';
import type { BriefExtractionResult, ConsultationSlots } from '@tattoo/consultation';

export interface BriefTrackerProps {
  slots: ConsultationSlots;
  briefResult?: BriefExtractionResult | undefined;
}

const STYLE_LABELS: Record<string, string> = {
  american_traditional: 'Tradicional Americano',
  fine_line: 'Línea Fina',
  black_and_grey_realism: 'Realismo Negro y Gris',
  neo_traditional: 'Neotradicional',
  irezumi: 'Irezumi (Japonés Tradicional)',
  blackwork: 'Blackwork',
  illustrative: 'Ilustrativo',
  ornamental: 'Ornamental',
  lettering: 'Lettering',
  surrealism: 'Surrealismo',
};

const LINEWORK_LABELS: Record<string, string> = {
  fine: 'Fino',
  medium: 'Medio',
  bold: 'Grueso',
  mixed: 'Mixto',
};

const SHADING_LABELS: Record<string, string> = {
  none: 'Sin sombreado',
  whip: 'Whip / Barrido',
  dotwork: 'Puntillismo',
  smooth_blend: 'Degradado Suave',
  solid_fill: 'Relleno Sólido',
  mixed: 'Mixto',
};

const COLOUR_LABELS: Record<string, string> = {
  black_and_grey: 'Negro y Gris',
  colour: 'A Todo Color',
  black_and_grey_with_accent: 'Negro y Gris con Toques de Color',
};

const BODY_PART_LABELS: Record<string, string> = {
  inner_forearm: 'Antebrazo Interior',
  outer_forearm: 'Antebrazo Exterior',
  upper_arm_inner: 'Brazo Superior Interior',
  upper_arm_outer: 'Brazo Superior Exterior',
  shoulder: 'Hombro',
  collarbone: 'Clavícula',
  chest: 'Pecho',
  sternum: 'Esternón',
  ribs: 'Costillas',
  stomach: 'Abdomen',
  upper_back: 'Espalda Alta',
  lower_back: 'Espalda Baja',
  spine: 'Columna',
  hip: 'Cadera',
  thigh_front: 'Muslo Frontal',
  thigh_outer: 'Muslo Exterior',
  calf: 'Gemelo',
  shin: 'Espinilla',
  ankle: 'Tobillo',
  foot: 'Pie',
  wrist_inner: 'Muñeca Interior',
  wrist_outer: 'Muñeca Exterior',
  hand: 'Mano',
  finger: 'Dedo',
  neck: 'Cuello',
  behind_ear: 'Detrás de la Oreja',
};

export function BriefTracker({ slots, briefResult }: BriefTrackerProps): ReactNode {
  const isComplete = briefResult?.complete === true;
  const missingSlots = briefResult && !briefResult.complete ? briefResult.missingSlots : [];

  return (
    <aside className="brief-panel" id="brief-tracker-panel" aria-label="Seguimiento del Contrato">
      <div className="brief-header">
        <h2 className="brief-title">Contrato del Tatuaje</h2>
        <span
          className={`status-tag ${isComplete ? 'status-complete' : 'status-incomplete'}`}
          id="brief-status-tag"
        >
          {isComplete ? 'Contrato Válido' : 'Borrador en Curso'}
        </span>
      </div>

      <div className="slot-group">
        <span className="slot-label">Estilo Estético</span>
        <div className="slot-value">
          {slots.style?.primary ? (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span className="badge badge-style" id="slot-style-primary">
                {STYLE_LABELS[slots.style.primary] ?? slots.style.primary}
              </span>
              {slots.style.secondary && (
                <span className="badge" id="slot-style-secondary">
                  + {STYLE_LABELS[slots.style.secondary] ?? slots.style.secondary}
                </span>
              )}
            </div>
          ) : (
            <span className="slot-empty">Pendiente de clasificar estilo</span>
          )}
          {slots.style?.notes && (
            <p
              style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}
            >
              {slots.style.notes}
            </p>
          )}
        </div>
      </div>

      <div className="slot-group">
        <span className="slot-label">Motivos y Tema</span>
        <div className="slot-value">
          {slots.subject?.description ? (
            <div>
              <p style={{ fontSize: '0.86rem' }}>{slots.subject.description}</p>
              {slots.subject.elements && slots.subject.elements.length > 0 && (
                <div
                  style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}
                >
                  {slots.subject.elements.map((el, i) => (
                    <span key={i} className="badge">
                      {el}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="slot-empty">Sin elementos definidos todavía</span>
          )}
        </div>
      </div>

      <div className="slot-group">
        <span className="slot-label">Trazos y Sombreado</span>
        <div className="slot-value" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {slots.linework?.weight ? (
            <span className="badge">
              Líneas: {LINEWORK_LABELS[slots.linework.weight] ?? slots.linework.weight}
            </span>
          ) : (
            <span className="slot-empty">Grosor no definido</span>
          )}
          {slots.shading?.technique ? (
            <span className="badge">
              Sombreado: {SHADING_LABELS[slots.shading.technique] ?? slots.shading.technique}{' '}
              (intensidad:{' '}
              {slots.shading.intensity === 'heavy'
                ? 'alta'
                : slots.shading.intensity === 'light'
                  ? 'suave'
                  : 'media'}
              )
            </span>
          ) : (
            <span className="slot-empty">Sombreado no definido</span>
          )}
        </div>
      </div>

      <div className="slot-group">
        <span className="slot-label">Paleta de Tinta</span>
        <div className="slot-value">
          {slots.colour?.mode ? (
            <div>
              <span className="badge" style={{ marginBottom: '0.3rem' }}>
                {COLOUR_LABELS[slots.colour.mode] ?? slots.colour.mode}
              </span>
              {slots.colour.palette && slots.colour.palette.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {slots.colour.palette.map((c, i) => (
                    <span key={i} className="badge">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="slot-empty">Tipo de tinta no definido</span>
          )}
        </div>
      </div>

      <div className="slot-group">
        <span className="slot-label">Ubicación y Medidas</span>
        <div className="slot-value">
          {slots.placement?.bodyPart || slots.size?.widthMm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {slots.placement?.bodyPart && (
                <div>
                  <span className="badge">
                    {BODY_PART_LABELS[slots.placement.bodyPart] ?? slots.placement.bodyPart} (
                    {slots.placement.orientation === 'vertical'
                      ? 'vertical'
                      : slots.placement.orientation === 'horizontal'
                        ? 'horizontal'
                        : slots.placement.orientation === 'wrapping'
                          ? 'envolvente'
                          : 'diagonal'}
                    )
                  </span>
                </div>
              )}
              {slots.size?.widthMm && slots.size?.heightMm && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--accent-gold)',
                  }}
                >
                  {slots.size.widthMm} mm &times; {slots.size.heightMm} mm (
                  {(slots.size.widthMm / 10).toFixed(1)} cm &times;{' '}
                  {(slots.size.heightMm / 10).toFixed(1)} cm)
                </div>
              )}
            </div>
          ) : (
            <span className="slot-empty">Ubicación y medidas en mm no definidas</span>
          )}
        </div>
      </div>

      {missingSlots.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <strong>Campos pendientes para completar el contrato:</strong>
          <ul style={{ paddingLeft: '1.1rem', marginTop: '0.25rem' }}>
            {missingSlots.slice(0, 4).map((slot, idx) => (
              <li key={idx}>{slot}</li>
            ))}
            {missingSlots.length > 4 && <li>+ {missingSlots.length - 4} campos más</li>}
          </ul>
        </div>
      )}
    </aside>
  );
}
