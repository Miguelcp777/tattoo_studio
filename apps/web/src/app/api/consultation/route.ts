import { NextResponse } from 'next/server';

import { findOffer, offerAsReference, type ConsultationSlots } from '@tattoo/consultation';

import { validateTattooBrief } from '@tattoo/contracts';

import {
  errorResponse,
  input,
  orchestrator,
  reply,
  RequestError,
  session,
} from '../../../lib/studio-server';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const current = session(request);

    return reply(
      { session: current.state, bodyPhotoId: current.bodyPhotoId, jobId: current.jobId },

      current,
    );
  } catch {
    return NextResponse.json({ session: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let current: ReturnType<typeof session> | undefined;

  let locked = false;

  try {
    const body = await input(request);

    if (
      ![
        'start',
        'advance',
        'orchestrate',
        'preferences',
        'references',
        'retry_references',
        'style_variant',
      ].includes(String(body['action']))
    )
      throw new RequestError('Acción inválida.');

    current = session(request, true);

    if (current.busy) throw new RequestError('Espera a que termine el mensaje anterior.', 409);

    current.busy = true;

    locked = true;

    const text = body['idea'] ?? body['userMessage'] ?? '';

    if (typeof text !== 'string' || text.length > 2000)
      throw new RequestError('El mensaje debe tener como máximo 2000 caracteres.');

    if (
      !text.trim() &&
      !['preferences', 'references', 'retry_references', 'style_variant'].includes(
        String(body['action']),
      )
    )
      throw new RequestError('Escribe tu idea.');

    let preferences: ConsultationSlots | undefined;

    if (body['preferences']) {
      const patch = body['preferences'];

      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new RequestError('Preferencias inválidas.');

      // Older clients send an empty array for the optional colour preference.

      const colour = (patch as Record<string, unknown>)['colour'];

      if (colour && typeof colour === 'object' && !Array.isArray(colour)) {
        const preference = colour as Record<string, unknown>;

        if (Array.isArray(preference['palette']) && preference['palette'].length === 0)
          delete preference['palette'];
      }

      const candidate = {
        schemaVersion: '1.0.0',

        briefId: current.state.sessionId,

        revision: 1,

        createdAt: new Date().toISOString(),

        subject: { description: 'Validación de preferencias' },

        style: { primary: 'fine_line' },

        linework: { weight: 'fine' },

        shading: { technique: 'none', intensity: 'light' },

        colour: { mode: 'black_and_grey' },

        placement: { bodyPart: 'calf', orientation: 'vertical' },

        size: { widthMm: 100, heightMm: 150 },

        ...patch,
      };

      if (
        Object.keys(patch).some(
          (k) =>
            !['subject', 'style', 'colour', 'placement', 'size', 'linework', 'shading'].includes(k),
        )
      )
        throw new RequestError('El panel contiene un campo no permitido.');

      const validation = validateTattooBrief(candidate);

      if (!validation.valid) {
        const messages = new Set<string>();

        for (const issue of validation.issues) {
          const field = issue.path.split('/')[1];

          if (field === 'colour')
            messages.add(
              'Revisa la preferencia de color. Puedes dejar los colores vacíos o indicar hasta 8 colores distintos (por ejemplo, rojo, azul).',
            );
          else if (field === 'size')
            messages.add('Revisa el ancho y el alto: ambos deben estar entre 5 y 600 mm.');
          else if (field === 'placement') messages.add('Revisa la zona, el lado y la orientación.');
          else if (field === 'style') messages.add('Selecciona un estilo válido del panel.');
          else messages.add('Revisa los campos del panel: hay un valor incompleto o no válido.');
        }

        throw new RequestError([...messages].join(' '));
      }

      preferences = patch as ConsultationSlots;
    }

    // TASK-0028: a catalogue pick is resolved here, never taken from the request. The client
    // sends an identifier; anything that does not resolve against the catalogue is refused, so
    // no caller can inject an arbitrary image as a studio reference.
    if (body['action'] === 'style_variant') {
      const offer = findOffer(String(body['variantId'] ?? ''));
      if (!offer) throw new RequestError('Esa referencia de estilo no existe.');
      current.state.references = [
        ...current.state.references.filter((r) => r.verification !== 'style_library'),
        offerAsReference(offer),
      ];
      if (current.state.slots.style?.primary !== offer.style)
        current.state.slots.style = { ...current.state.slots.style, primary: offer.style };
    }

    if (body['removeReference'] !== undefined)
      current.state.references = current.state.references.filter(
        (r) => r.source !== body['removeReference'],
      );

    current.state = await orchestrator.handleUserInteraction(
      current.state,
      text,
      [],
      preferences,
      body['action'] === 'retry_references',
    );

    delete current.jobId;

    return reply({ session: current.state }, current);
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (current && locked) current.busy = false;
  }
}
