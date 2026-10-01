'use client';

import type { ReactNode } from 'react';

import { Confirm } from '../Confirm';
import { GenerationProgress } from '../GenerationProgress';
import type { StudioJobStatus } from '@/types/generation';

/** The account's earlier designs, newest first, as the advanced panel lists them (TASK-0046). */
export function VersionList({
  versions,
  onOpen,
}: {
  versions: StudioJobStatus[];
  onOpen: (version: StudioJobStatus) => void;
}): ReactNode {
  const kept = versions.filter((version) => version.result);
  if (!kept.length) return null;
  return (
    <section className="wizard-versions" aria-label="Tus diseños">
      <h3>Tus diseños</h3>
      <div className="wizard-choices">
        {kept.map((version, index) => (
          <button
            key={version.jobId}
            type="button"
            className="wizard-choice"
            onClick={() => onOpen(version)}
          >
            Propuesta {kept.length - index} ·{' '}
            {version.result!.capture
              ? 'Foto con la cámara'
              : (version.result!.edit?.instruction ?? 'Diseño inicial')}
          </button>
        ))}
      </div>
    </section>
  );
}

/** While the studio works (TASK-0065): nothing to answer, only progress. */
export function WorkingStep({ phase }: { phase: 'preparing' | 'queued' | 'running' }): ReactNode {
  return (
    <Confirm belowHeader title="Estamos creando tu diseño" onCancel={() => undefined} actions={[]}>
      <p>Puede tardar unos minutos. Cuando esté listo verás la vista en piel y la plantilla.</p>
      <GenerationProgress phase={phase} />
    </Confirm>
  );
}

/** After a design (TASK-0065): open it again, start another, or open an earlier one. */
export function DoneStep({
  versions,
  onView,
  onNew,
  onOpen,
  onAdvanced,
}: {
  versions: StudioJobStatus[];
  onView: () => void;
  onNew: () => void;
  onOpen: (version: StudioJobStatus) => void;
  onAdvanced: () => void;
}): ReactNode {
  return (
    <Confirm
      belowHeader
      wide
      title="Tu diseño está listo"
      onCancel={() => undefined}
      actions={[
        { label: 'Modo avanzado', onClick: onAdvanced },
        { label: 'Nuevo diseño', onClick: onNew },
        { label: 'Ver mi diseño', primary: true, onClick: onView },
      ]}
    >
      <p>
        Ábrelo para verlo sobre la piel, descargar la plantilla, pedir cambios o probarlo con la
        cámara.
      </p>
      <VersionList versions={versions} onOpen={onOpen} />
    </Confirm>
  );
}
