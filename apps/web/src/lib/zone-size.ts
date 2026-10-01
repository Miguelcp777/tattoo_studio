/**
 * The print size «Ocupar toda la zona» would give a design (TASK-0073, audit UX-01).
 *
 * The worker resolves it from the visible ink, so this is the same rule on the page's aspect: the
 * largest size of the design's proportions that fits the zone's reference span. It is shown, as
 * approximate, before the client confirms the change.
 */
export function zoneProposal(
  size: { widthMm: number; heightMm: number },
  span: { widthMm: number; heightMm: number } | undefined,
): { widthMm: number; heightMm: number } | undefined {
  if (!span || !(size.widthMm > 0) || !(size.heightMm > 0)) return undefined;
  const aspect = size.heightMm / size.widthMm;
  const width = Math.min(span.widthMm, span.heightMm / aspect);
  return { widthMm: Math.round(width), heightMm: Math.round(width * aspect) };
}
