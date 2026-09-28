'use client';

/**
 * Live camera try-on (TASK-0042, ADR-0019).
 *
 * The camera frames stay in the page: they are drawn to a canvas, blended with the design by
 * `try-on`/`skin-blend` and thrown away. Nothing here uploads a frame, and the only request the
 * page makes is the GET that fetches the client's own design.
 *
 * This file owns the camera, the loop and the controls; the per-frame composite lives in
 * `lib/try-on.ts` so it can be exercised without a camera.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { VISUALIZATION_DISCLAIMER_ES } from '@/content/disclaimers';
import { DEFAULT_FRESHNESS } from '@/lib/skin-blend';
import {
  cameraAvailable,
  cameraFailure,
  composeFrame,
  trimArtwork,
  type CameraState,
  type Placement,
} from '@/lib/try-on';

export default function TryOnPage(): ReactNode {
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const design = useRef<HTMLCanvasElement | null>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frameRequest = useRef<number>(0);
  const placement = useRef<Placement>({ x: 0.5, y: 0.5, scale: 0.55, angle: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const freshness = useRef<number>(DEFAULT_FRESHNESS);

  const [camera, setCamera] = useState<CameraState>('idle');
  const [designError, setDesignError] = useState('');
  const [ready, setReady] = useState(false);
  const [fresh, setFresh] = useState(true);
  const [view, setView] = useState<Placement>(placement.current);

  const update = useCallback((next: Partial<Placement>) => {
    placement.current = { ...placement.current, ...next };
    setView(placement.current);
  }, []);

  // The design: the client's own master artwork, fetched once. This is the page's only request.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('design') ?? '';
    if (!/^[a-f0-9]{32}$/.test(id)) {
      setDesignError('Falta el diseño. Abre esta página desde tu diseño generado.');
      return;
    }
    const image = new Image();
    image.onload = () => {
      design.current = trimArtwork(image);
      setReady(true);
    };
    image.onerror = () =>
      setDesignError('No se ha podido cargar tu diseño. Vuelve a abrirlo desde el estudio.');
    image.src = `/api/media?id=${id}`;
  }, []);

  /** One frame, against whatever the refs hold now. Also the loop's body. */
  const paint = useCallback((): boolean => {
    const source = video.current;
    const target = canvas.current;
    const art = design.current;
    if (!source || !target || !art) return false;
    return composeFrame({
      video: source,
      canvas: target,
      design: art,
      work: (work.current ??= document.createElement('canvas')),
      placement: placement.current,
      freshness: freshness.current,
    });
  }, []);

  const loop = useCallback(() => {
    frameRequest.current = requestAnimationFrame(loop);
    paint();
  }, [paint]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRequest.current);
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!cameraAvailable(navigator.mediaDevices)) {
      setCamera('unsupported');
      return;
    }
    setCamera('starting');
    try {
      const live = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      stream.current = live;
      const element = video.current;
      if (element) {
        element.srcObject = live;
        await element.play().catch(() => undefined);
      }
      setCamera('live');
      cancelAnimationFrame(frameRequest.current);
      frameRequest.current = requestAnimationFrame(loop);
    } catch (error) {
      setCamera(cameraFailure(error));
    }
  }, [loop]);

  useEffect(() => stop, [stop]);

  // A hidden tab stops `requestAnimationFrame`, so the preview resumes when the page comes back.
  useEffect(() => {
    const resume = (): void => {
      if (document.visibilityState !== 'visible' || !stream.current) return;
      cancelAnimationFrame(frameRequest.current);
      frameRequest.current = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [loop]);

  // A handle for driving one frame without the loop, which is how the composite is checked where
  // there is no camera and no visible tab (TASK-0042/ev-003).
  useEffect(() => {
    (window as unknown as { __tryOnPaint?: () => boolean }).__tryOnPaint = paint;
    return () => {
      delete (window as unknown as { __tryOnPaint?: () => boolean }).__tryOnPaint;
    };
  }, [paint]);

  function pointer(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }

  return (
    <main className="try-on">
      <header>
        <h1>Pruébalo con la cámara</h1>
        <p className="privacy">
          La cámara se procesa en tu propio dispositivo. Ninguna imagen se envía ni se guarda.
        </p>
      </header>

      {designError && <p role="alert">{designError}</p>}

      <div className="try-on-stage">
        <video ref={video} playsInline muted hidden />
        <canvas
          ref={canvas}
          className="try-on-canvas"
          aria-label="Vista de la cámara con el tatuaje superpuesto"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = pointer(event);
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            const now = pointer(event);
            update({
              x: Math.min(1, Math.max(0, placement.current.x + (now.x - dragging.current.x))),
              y: Math.min(1, Math.max(0, placement.current.y + (now.y - dragging.current.y))),
            });
            dragging.current = now;
          }}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        />
        {camera !== 'live' && (
          <div className="try-on-overlay">
            {camera === 'denied' && (
              <p>No has dado permiso para la cámara. Actívalo y reintenta.</p>
            )}
            {camera === 'unsupported' && (
              <p>Este navegador no da acceso a la cámara. Prueba en el móvil, con HTTPS.</p>
            )}
            {camera === 'failed' && <p>No se ha podido abrir la cámara.</p>}
            <button onClick={() => void start()} disabled={!ready || camera === 'starting'}>
              {camera === 'starting' ? 'Abriendo…' : 'Abrir la cámara'}
            </button>
          </div>
        )}
      </div>

      <div className="try-on-controls">
        <label>
          Tamaño
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(view.scale * 100)}
            onChange={(event) => update({ scale: Number(event.target.value) / 100 })}
          />
        </label>
        <label>
          Giro
          <input
            type="range"
            min={-180}
            max={180}
            value={Math.round(view.angle)}
            onChange={(event) => update({ angle: Number(event.target.value) })}
          />
        </label>
        <label className="try-on-toggle">
          <input
            type="checkbox"
            checked={fresh}
            onChange={(event) => {
              setFresh(event.target.checked);
              freshness.current = event.target.checked ? DEFAULT_FRESHNESS : 0;
            }}
          />
          Tinta recién hecha
        </label>
      </div>

      <p className="notice-banner">{VISUALIZATION_DISCLAIMER_ES}</p>
    </main>
  );
}
