/**
 * Whether the stencil PDF also carries A4 pieces (TASK-0088): the worker adds them when the
 * design with its margins does not fit an A4 page. The same rule, to say so beside the download.
 */
export function needsA4Pieces(size: { widthMm: number; heightMm: number }): boolean {
  return size.widthMm + 20 > 210 || size.heightMm + 35 > 297;
}
