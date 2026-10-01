'use client';

import { useRef, type ReactNode } from 'react';

import type { OrchestrationSession } from '@tattoo/consultation';

import { Confirm } from '../Confirm';

type Reference = OrchestrationSession['references'][number];

/** Step 3 (TASK-0065): the references to use; remove any, add your own, then confirm. */
export function ReferencesStep({
  references,
  essential,
  busy,
  error,
  onRemove,
  onAdd,
  onSearchAgain,
  onBack,
  onContinue,
}: {
  references: Reference[];
  /** Essential references still missing (a named emblem, flag, landmark…). */
  essential: string[];
  busy: boolean;
  error?: string;
  onRemove: (source: string) => void;
  onAdd: (file: File) => void;
  onSearchAgain: () => void;
  onBack: () => void;
  onContinue: () => void;
}): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Confirm
      wide
      title="Tus referencias"
      onCancel={onBack}
      actions={[
        { label: 'Atrás', onClick: onBack, disabled: busy },
        { label: 'Añadir imagen', onClick: () => input.current?.click(), disabled: busy },
        ...(essential.length
          ? [{ label: 'Buscar otra vez', onClick: onSearchAgain, disabled: busy }]
          : []),
        {
          label: references.length ? 'Usar estas referencias' : 'Continuar sin referencias',
          primary: true,
          disabled: busy || essential.length > 0,
          onClick: onContinue,
        },
      ]}
    >
      <p className="eyebrow">Paso 3 de 4</p>
      <p>
        {references.length
          ? 'Estas son las imágenes que guiarán el diseño. Quita las que no encajen o añade la tuya.'
          : 'No hemos encontrado imágenes adecuadas. Puedes añadir la tuya o seguir sin referencias: el diseño partirá de tu descripción.'}
      </p>
      {essential.length > 0 && (
        <p role="status" className="notice-banner">
          Para ser fieles necesitamos una imagen de {essential.join(', ')}. Añádela o busca otra
          vez.
        </p>
      )}
      {references.length > 0 && (
        <div className="reference-grid wizard-references">
          {references.map((reference, index) => (
            <figure key={reference.source}>
              <img src={reference.source} alt={reference.label ?? `Referencia ${index + 1}`} />
              <figcaption>
                {reference.sourcePage ? (
                  <a href={reference.sourcePage} target="_blank" rel="noreferrer">
                    {reference.label}
                  </a>
                ) : (
                  reference.label
                )}
                <small>{reference.license || 'Aportada por ti'}</small>
              </figcaption>
              <button type="button" disabled={busy} onClick={() => onRemove(reference.source)}>
                Quitar
              </button>
            </figure>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onAdd(file);
          event.target.value = '';
        }}
      />
    </Confirm>
  );
}
