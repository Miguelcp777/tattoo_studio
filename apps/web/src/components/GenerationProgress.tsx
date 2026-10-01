'use client';
import type { ReactNode } from 'react';

import { InkWorking } from './InkWorking';

/** A design on its way (TASK-0069): the tattooing hand, from the first moment. */
export function GenerationProgress({
  phase,
}: {
  phase: 'preparing' | 'queued' | 'running';
}): ReactNode {
  return (
    <div className="generation-progress" aria-label="Estado de generación">
      <InkWorking task={phase} delay={0} note="suele tardar unos minutos" />
    </div>
  );
}
