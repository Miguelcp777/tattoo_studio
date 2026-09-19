/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */

/**
 * Canonical lowercase UUID. A pattern rather than 'format', so both runtimes assert it.
 */
export type Uuid = string;
/**
 * RFC 3339. ASCII digits only, so Python and JavaScript agree.
 */
export type Timestamp = string;
/**
 * Raster dimensions of this stored image. These describe the artifact, not the tattoo: the tattoo's authoritative size is in millimetres on the brief, and nothing derives physical size from these (CONTRACTS-INV-001).
 */
export type Pixels = number;

/**
 * A generated artwork and its lineage. Produced by the flash engine from a TattooBrief, consumed by the stencil and mockup engines. Records the brief revision that produced it (CONTRACTS-INV-003). Follows the same conventions as TattooBrief: no 'format' keyword, and every pattern spells out [0-9], so TypeScript and Python reach identical verdicts.
 */
export interface Design {
  /**
   * Fixed for this schema revision (CONTRACTS-INV-004).
   */
  schemaVersion: '1.0.0';
  designId: Uuid;
  /**
   * Canonical lowercase UUID. A pattern rather than 'format', so both runtimes assert it.
   */
  briefId: string;
  /**
   * The exact brief revision used. A design is only meaningful against the revision that produced it (CONTRACTS-INV-003).
   */
  briefRevision: number;
  /**
   * Design version within its lineage. Refinement produces version n+1 and never mutates n (FLASH-INV-002).
   */
  version: number;
  /**
   * Canonical lowercase UUID. A pattern rather than 'format', so both runtimes assert it.
   */
  parentDesignId?: string;
  /**
   * Which pass produced this artwork. 'flash' is the shaded reference render; 'line_art' is the dedicated stencil pass, which is generated natively rather than edge-detected from flash (ADR-0003).
   */
  kind: 'flash' | 'line_art';
  status: 'draft' | 'accepted' | 'superseded';
  createdAt: Timestamp;
  image: ImageRef;
  /**
   * What produced this artwork. Kept so a design can be explained, reproduced and audited.
   */
  provenance: {
    /**
     * Adapter name, not a credential or endpoint.
     */
    provider: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    /**
     * Recorded when the provider exposes one, so a render can be reproduced.
     */
    seed?: number;
  };
}
/**
 * A handle to stored image bytes. Bytes themselves never cross a module boundary or travel through the queue (JOBS-INV-001).
 */
export interface ImageRef {
  /**
   * Opaque key into media storage. Never a signed or public URL (SEC-INV-008).
   */
  storageKey: string;
  mediaType: 'image/png' | 'image/webp' | 'image/jpeg';
  widthPx: Pixels;
  heightPx: Pixels;
  byteSize?: number;
}
