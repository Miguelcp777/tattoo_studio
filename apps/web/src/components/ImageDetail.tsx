'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function ImageDetail({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}): ReactNode {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const previousZoom = useRef(1);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) {
      const ratio = zoom / previousZoom.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    closeButton.current?.focus();
  }, []);
  function reset() {
    setZoom(1);
    viewport.current?.scrollTo(0, 0);
  }
  return (
    <section className="image-detail" aria-label={`Detalle: ${label}`}>
      <div className="detail-toolbar">
        <strong>{label}</strong>
        <button
          aria-label="Reducir zoom"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
        >
          −
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)} %</output>
        <button
          aria-label="Ampliar zoom"
          disabled={zoom >= 4}
          onClick={() => setZoom(Math.min(4, zoom + 0.5))}
        >
          +
        </button>
        <button onClick={reset}>Restablecer</button>
        <button ref={closeButton} onClick={onClose}>
          Volver a las dos vistas
        </button>
      </div>
      <p className="small-note">
        Amplía con + y desplázate arrastrando o con las barras. Doble clic para ampliar. En móvil
        puedes deslizar; con teclado, usa las flechas dentro de la imagen.
      </p>
      <div
        ref={viewport}
        className="detail-viewport"
        tabIndex={0}
        role="region"
        aria-label={`Imagen ampliada: ${label}`}
        onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse') return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.x;
          event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.y;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <img
            src={src}
            alt={label}
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>
    </section>
  );
}
