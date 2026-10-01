import type { GeneratedTattooArtifact } from '@tattoo/contracts';

/**
 * How far to trust a stencil, in the client's words (TASK-0086, audit ARQ-03).
 *
 * A shared origin proves lineage, not equivalence: contours of a colour or shaded design are an
 * approximation, and a dense design may have been traced at coarser detail. Both are said beside
 * the stencil, and either makes it a preliminary stencil for the tattooer to correct.
 */
export function stencilNotes(review: GeneratedTattooArtifact['stencilReview']): {
  preliminary: boolean;
  notes: string[];
} {
  if (!review)
    return { preliminary: true, notes: ['Plantilla preliminar: revísala con tu tatuador.'] };
  const notes: string[] = [];
  if (review.method === 'colour_contours')
    notes.push('Contornos aproximados de un diseño con color o sombreado.');
  if (review.simplification > 0)
    notes.push(
      `Simplificada por exceso de detalle (nivel ${review.simplification} de 3): faltan líneas finas.`,
    );
  return {
    preliminary: notes.length > 0,
    notes: notes.length ? notes : ['Trazada de un dibujo de líneas a detalle completo.'],
  };
}
