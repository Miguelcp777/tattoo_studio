/** Image generation belongs exclusively to the Python worker (ARCH-INV-001).
 * Kept as an explicit failure for old imports rather than a silent fixture fallback.
 */
export class VisualCreatorAgent {
  async generateTattoo(): Promise<never> {
    throw new Error('La generación se realiza mediante /api/generate y el worker.');
  }
}
