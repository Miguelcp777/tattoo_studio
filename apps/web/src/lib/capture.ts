/**
 * Keeping one photograph from the camera try-on (TASK-0050, ADR-0022).
 *
 * The live preview never leaves the phone (ADR-0019), and that stays true. This module is the one
 * narrow exception, and the only code on the try-on that can turn a frame into bytes or send them:
 *
 * - `snapshot` composes **one** frame, when the client presses the shutter. It is local: the
 *   picture exists only in this page until the client decides otherwise.
 * - `saveCapture` sends that one picture, when the client chooses to keep it, under the adult
 *   image consent given at sign-in (TASK-0064). It goes to `/api/captures` and nowhere else, where
 *   it takes the same path as any own-body photograph: screened, stripped, encrypted, deletable,
 *   and never shown to an image model.
 *
 * A source scan in `probar/no-upload.test.ts` holds the page to calling these and nothing else.
 */

import { composeFrame, type Placement } from './try-on';

/** A kept photograph is composed at the camera's resolution, up to this width. */
export const CAPTURE_MAX_WIDTH = 1440;

/** JPEG, as the media store keeps own-body photographs anyway; a PNG of a photo is several MB. */
const CAPTURE_TYPE = 'image/jpeg';
const CAPTURE_QUALITY = 0.9;

export interface Snapshot {
  blob: Blob;
  /** A local object URL for showing the picture before it is kept. Revoke it when done. */
  preview: string;
}

/** Compose the current frame with the design, once, at full resolution. Nothing is sent. */
export async function snapshot(options: {
  video: HTMLVideoElement;
  design: HTMLCanvasElement;
  placement: Placement;
  freshness: number;
}): Promise<Snapshot | null> {
  const canvas = document.createElement('canvas');
  const drawn = composeFrame({
    ...options,
    canvas,
    work: document.createElement('canvas'),
    maxWidth: CAPTURE_MAX_WIDTH,
  });
  if (!drawn) return null;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, CAPTURE_TYPE, CAPTURE_QUALITY),
  );
  return blob ? { blob, preview: URL.createObjectURL(blob) } : null;
}

export class CaptureRefused extends Error {}

export interface KeptVersion {
  jobId: string;
}

/**
 * Keep the picture as a version of the design it shows. Age and consent were given at sign-in
 * (TASK-0064); the server checks them.
 */
export async function saveCapture(options: {
  blob: Blob;
  parentJobId: string;
  idempotencyKey: string;
}): Promise<KeptVersion> {
  const { blob, parentJobId, idempotencyKey } = options;
  if (!/^[a-f0-9]{32}$/.test(parentJobId))
    throw new CaptureRefused('Abre la cámara desde tu diseño para poder guardar la foto.');

  const response = await fetch('/api/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentJobId,
      idempotencyKey,
      data: await base64(blob),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!response.ok || !body.jobId)
    throw new CaptureRefused(body.error ?? 'No se ha podido guardar la foto.');
  return { jobId: body.jobId };
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
