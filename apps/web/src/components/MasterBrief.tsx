'use client';

/**
 * The master brief and its acceptance gate (TASK-0029, ADR-0013).
 *
 * Nothing is generated until the client has read this and said yes. It is a reading of the brief
 * that will be sent, not a second description of it, so a line being wrong here means the tattoo
 * would have been wrong too.
 */

import { useState } from 'react';

import type { MasterPrompt } from '@tattoo/consultation/master-prompt';

export interface MasterBriefProps {
  prompt: MasterPrompt;
  /** The exact brief the worker will receive, shown for anyone who wants to check. */
  brief?: unknown;
  accepted: boolean;
  disabled?: boolean;
  onAccept: () => void;
  onReopen: () => void;
}

export function MasterBrief({
  prompt,
  brief,
  accepted,
  disabled,
  onAccept,
  onReopen,
}: MasterBriefProps): React.JSX.Element {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <section className="master-brief" aria-label="Resumen de tu tatuaje">
      <h3 id="step-resumen">Esto es lo que vamos a tatuar</h3>
      <dl className="master-brief-lines">
        {prompt.lines.map((line) => (
          <div key={line.label} className="master-brief-line">
            <dt>{line.label}</dt>
            <dd>
              {line.value}
              {line.proposed && (
                <span className="master-brief-proposed">propuesto por nosotros</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {!prompt.complete && (
        <p className="master-brief-missing" role="status">
          Falta {prompt.missing.join(', ')}. Complétalo arriba y volvemos a este resumen.
        </p>
      )}

      {brief !== undefined && (
        <div className="master-brief-technical">
          <button
            type="button"
            className="link-button"
            aria-expanded={showTechnical}
            onClick={() => setShowTechnical((open) => !open)}
          >
            {showTechnical ? 'Ocultar' : 'Ver'} los datos técnicos que se envían
          </button>
          {showTechnical && (
            <>
              <p className="small-note">
                Esto es exactamente lo que recibe el estudio. El texto que se le da al modelo se
                compone a partir de estos datos.
              </p>
              <pre className="master-brief-json">{JSON.stringify(brief, null, 2)}</pre>
            </>
          )}
        </div>
      )}

      {accepted ? (
        <p className="master-brief-accepted" role="status">
          Resumen aceptado.{' '}
          <button type="button" className="link-button" onClick={onReopen} disabled={disabled}>
            Cambiar algo
          </button>
        </p>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || !prompt.complete}
          onClick={onAccept}
        >
          Aceptar y continuar
        </button>
      )}
    </section>
  );
}
