/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */

export type StudioJobStatus = {
  jobId: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  result: GeneratedTattooArtifact | null;
  error: string | null;
};

export interface GeneratedTattooArtifact {
  designId: string;
  briefId: string;
  briefRevision: number;
  size: {
    widthMm: number;
    heightMm: number;
  };
  master: StudioAsset;
  stencil: StudioAsset;
  stencilMirror: StudioAsset;
  pdf: StudioAsset;
  pdfMirror: StudioAsset;
  mockup: StudioAsset;
  referenceAnalysis: string;
  reviewRequired: true;
  backgroundKind: 'own_photo' | 'generated_anatomy';
  transform: {
    xPx: number;
    yPx: number;
    widthPx: number;
    heightPx: number;
    method: 'geometric-multiply' | 'fresh-ink-composite';
    /**
     * Approximate cylindrical warp in radians, not inferred anatomy.
     */
    curvature?: number;
    /**
     * Illustrative narrowing towards the lower calf, not measured anatomy.
     */
    taper?: number;
    scaleCalibrated: boolean;
    generativePostprocess: false;
    sourceCropPx?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    /**
     * How strongly the ink is attenuated where the photograph's own shading says the body turns away. An illustrative approximation of surface form, not recovered depth, and never a displacement: the artwork's geometry is authoritative (ADR-0014, MOCKUP-INV-001).
     */
    surface?: number;
    /**
     * Strength of the fresh-ink reddening around the strokes. 0 when the render is a plain multiply. Illustrative, never a clinical prediction of healing (PROD-INV-003).
     */
    freshness?: number;
  };
  notice: string;
  background?: StudioAsset;
  edit?: {
    parentJobId: string;
    instruction: string;
    coverage?: 'larger' | 'smaller' | 'full';
    mode?: 'artwork' | 'placement';
  };
}
export interface StudioAsset {
  assetId: string;
  designId: string;
  mimeType: 'image/png' | 'image/svg+xml' | 'application/pdf';
}
