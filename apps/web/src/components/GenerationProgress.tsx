'use client';
import type { ReactNode } from 'react';

import type { InkStep } from '@/lib/ink-progress';

import { InkWorking } from './InkWorking';

/** A design on its way (TASK-0069): the tattooing hand, from the first moment. */
export function GenerationProgress({
  phase,
  stage,
  queuePosition,
}: {
  phase: 'preparing' | 'queued' | 'running';
  /** As the worker reports them (TASK-0076). */
  stage?: InkStep | undefined;
  queuePosition?: number | undefined;
}): ReactNode {
  return (
    <div className="generation-progress" aria-label="Estado de generación">
      <InkWorking
        task={phase}
        stage={stage}
        queuePosition={queuePosition}
        delay={0}
        note="suele tardar unos minutos; puedes cerrar la página y volver"
      />
    </div>
  );
}
