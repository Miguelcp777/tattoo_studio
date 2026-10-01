'use client';

import type { ReactNode } from 'react';

import { Confirm } from './Confirm';
import { SIGN_IN_IMAGES, SIGN_IN_TERMS } from '@/content/legal';

/**
 * What a client accepts to enter the studio (TASK-0064, ADR-0028): the terms, including being an
 * adult, and the consent to process images. One button accepts both, but they are two sections,
 * because a consent must be distinguishable from the rest of what is agreed.
 */
export function ConsentDialog({
  confirmLabel,
  busy,
  error,
  onAccept,
  onCancel,
}: {
  confirmLabel: string;
  busy: boolean;
  error?: string;
  onAccept: () => void;
  onCancel: () => void;
}): ReactNode {
  return (
    <Confirm
      title="Antes de entrar"
      onCancel={onCancel}
      actions={[
        { label: 'Cancelar', onClick: onCancel, disabled: busy },
        {
          label: busy ? 'Entrando…' : confirmLabel,
          onClick: onAccept,
          primary: true,
          disabled: busy,
        },
      ]}
    >
      <section className="consent-part" aria-labelledby="consent-terms">
        <h3 id="consent-terms">Condiciones de uso</h3>
        <ul>
          {SIGN_IN_TERMS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a href="/condiciones" target="_blank" rel="noreferrer">
          Leer las condiciones completas
        </a>
      </section>
      <section className="consent-part" aria-labelledby="consent-images">
        <h3 id="consent-images">Uso de tus imágenes</h3>
        <ul>
          {SIGN_IN_IMAGES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a href="/privacidad" target="_blank" rel="noreferrer">
          Leer la política de privacidad
        </a>
      </section>
      {error && (
        <p className="sign-in-error" role="alert">
          {error}
        </p>
      )}
    </Confirm>
  );
}
