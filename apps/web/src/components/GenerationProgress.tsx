'use client';
import { useEffect, useState, type ReactNode } from 'react';

export function GenerationProgress({
  phase,
}: {
  phase: 'preparing' | 'queued' | 'running';
}): ReactNode {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const label = {
    preparing: 'Preparando y revisando las referencias…',
    queued: 'Tu diseño está en cola…',
    running: 'Creando tu diseño, la vista sobre piel y la plantilla…',
  }[phase];
  return (
    <section className="generation-progress" aria-label="Estado de generación" aria-busy="true">
      <p role="status">{label}</p>
      <div className="progress-track" role="progressbar" aria-label={label}>
        <span />
      </div>
      <p className="small-note">
        Tiempo en esta vista: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}.{' '}
        Puede tardar varios minutos. El proveedor no comunica un porcentaje de avance.
      </p>
    </section>
  );
}
