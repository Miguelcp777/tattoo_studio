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
