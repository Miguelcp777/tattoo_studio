import { randomUUID } from 'node:crypto';
import { brief as extractBrief } from '../state-machine';
import type { ConsultationSlots, ReferenceImage } from '../types';
import type { MultiAgentMessage, OrchestrationSession } from './types';
import { VisualSearchAgent, referenceQueries } from './image-scout';
import { extractPreferences, missingPreferences, withTechnicalDefaults } from './researcher';

const message = (sender: MultiAgentMessage['sender'], content: string): MultiAgentMessage => ({
  sender,
  senderLabel: sender === 'image_scout' ? 'Referencias' : 'Asistente de diseño',
  content,
  timestamp: new Date().toISOString(),
});
export class OrchestratorAgent {
  constructor(private readonly scout = new VisualSearchAgent()) {}
  createSession(sessionId: string = randomUUID()): OrchestrationSession {
    return {
      sessionId,
      revision: 0,
      phase: 'investigation',
      questionsAsked: 0,
      maxQuestions: 3,
      slots: {},
      references: [],
      messages: [],
      missingFields: [],
    };
  }
  async handleUserInteraction(
    session: OrchestrationSession,
    input: string,
    references: ReferenceImage[] = [],
    preferences?: ConsultationSlots,
    retryReferences = false,
  ): Promise<OrchestrationSession> {
    const next = structuredClone(session);
    next.revision++;
    if (input.trim())
      next.messages.push({ ...message('orchestrator', input), senderLabel: 'Cliente' });
    if (/(?:estilo de|style of)\s+\S/i.test(input)) {
      delete next.brief;
      next.phase = 'needs_details';
      next.messages.push(
        message(
          'orchestrator',
          'Elige un estilo general del panel, sin pedir la imitación de un artista concreto. Conserva los motivos que quieras representar.',
        ),
      );
      return next;
    }
    next.slots = withTechnicalDefaults(
      extractPreferences(input, { ...next.slots, ...preferences }),
    );
    next.references = [...next.references, ...references]
      .filter((r, i, a) => a.findIndex((x) => x.source === r.source) === i)
      .slice(0, 5);
    const subjectChanged = Boolean(
      session.slots.subject?.description &&
      next.slots.subject?.description !== session.slots.subject.description,
    );
    if (subjectChanged)
      next.references = next.references.filter((r) => r.verification === 'user_supplied');
    // Search the subject, never replace it with an answer about placement or style.
    if (
      retryReferences ||
      ((!session.slots.subject?.description || subjectChanged) &&
        !next.references.length &&
        input.trim())
    ) {
      try {
        const result = await this.scout.scoutReferenceImages({
          userInput: next.slots.subject?.description ?? input,
          ...(retryReferences
            ? {
                queries: referenceQueries(next.slots.subject?.description ?? input).filter(
                  (query) => !next.references.some((ref) => ref.referenceQuery === query),
                ),
              }
            : {}),
        });
        next.references = [...next.references, ...result.scoutedImages]
          .filter((r, i, all) => all.findIndex((other) => other.source === r.source) === i)
          .slice(0, 5);
        next.messages.push({
          ...message('image_scout', result.reportMessage),
          referenceImages: result.scoutedImages,
        });
      } catch {
        next.messages.push(
          message(
            'image_scout',
            'La búsqueda no está disponible. Puedes adjuntar referencias; no se ha verificado ninguna imagen.',
          ),
        );
      }
    }
    const missing = missingPreferences(next.slots);
    const result = extractBrief({
      sessionId: next.sessionId,
      revision: next.revision,
      status: 'active',
      slots: next.slots,
      turns: [],
      nextQuestion: '',
    });
    delete next.brief;
    if (result.complete && missing.length === 0) next.brief = result.brief;
    next.missingFields = [...missing];
    // TASK-0026 (ADR-0010): size is not a missing client answer. The design process proposes
    // it from the anatomy and the idea, and the client may override it. Reporting it as
    // pending asked for a decision that had already been taken for them.
    if (!next.references.length) next.missingFields.push('referencia visual');
    const searched = next.references.filter((r) => r.referenceQuery);
    if (searched.length && !next.references.some((r) => r.verification === 'user_supplied')) {
      for (const query of referenceQueries(next.slots.subject?.description ?? '')) {
        if (!searched.some((r) => r.referenceQuery === query))
          next.missingFields.push(`referencia: ${query}`);
      }
    }
    if (input.trim() && missing.length && next.questionsAsked < 3) {
      const questions: Record<string, string> = {
        tema: '¿Qué quieres representar?',
        zona: '¿En qué zona y lado del cuerpo lo quieres?',
        estilo: '¿Qué estilo prefieres?',
        color: '¿Lo quieres en negro y gris o con color?',
      };
      next.questionsAsked++;
      next.phase = 'investigation';
      next.messages.push(message('prompt_architect', questions[missing[0]!]!));
    } else {
      next.phase =
        next.brief && next.references.length && !next.missingFields.length
          ? 'ready_to_generate'
          : 'needs_details';
      next.messages.push(
        message(
          'orchestrator',
          next.phase === 'ready_to_generate'
            ? 'Brief preparado. Revisa las referencias y las medidas antes de generar el diseño maestro.'
            : `Conservo tu idea. Completa los campos pendientes en el panel: ${next.missingFields.join(', ') || 'revisa los valores del brief'}.`,
        ),
      );
    }
    next.messages = next.messages.slice(-30);
    return next;
  }
}
