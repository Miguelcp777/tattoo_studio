/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */

/**
 * The closed curated vocabulary from product-behavior.spec.md (CONTRACTS-INV-002). Free-text style input is mapped onto this list by the consultation, never passed through raw.
 */
export type StyleName =
  | 'american_traditional'
  | 'fine_line'
  | 'black_and_grey_realism'
  | 'neo_traditional'
  | 'irezumi'
  | 'blackwork'
  | 'illustrative'
  | 'ornamental'
  | 'lettering'
  | 'surrealism';
/**
 * Curated anatomical placements. Several of these are torso areas whose reference photographs are sensitive personal data; see quality-and-security.spec.md.
 */
export type BodyPart =
  | 'inner_forearm'
  | 'outer_forearm'
  | 'upper_arm_inner'
  | 'upper_arm_outer'
  | 'shoulder'
  | 'collarbone'
  | 'chest'
  | 'sternum'
  | 'ribs'
  | 'stomach'
  | 'upper_back'
  | 'lower_back'
  | 'spine'
  | 'hip'
  | 'thigh_front'
  | 'thigh_outer'
  | 'calf'
  | 'shin'
  | 'ankle'
  | 'foot'
  | 'wrist_inner'
  | 'wrist_outer'
  | 'hand'
  | 'finger'
  | 'neck'
  | 'behind_ear';
/**
 * Bounded to what is physically plausible: smaller than 5mm will not hold detail, larger than 600mm exceeds a single sitting's placement.
 */
export type Millimetres = number;

export interface StudioJob {
  /**
   * The system's central contract. The consultation produces it; the flash, stencil and mockup engines consume it. Size is authoritative in millimetres (CONTRACTS-INV-001) and style is drawn from a closed vocabulary (CONTRACTS-INV-002). No 'format' keyword is used and every pattern spells out [0-9], so that TypeScript and Python reach identical verdicts.
   */
  brief: {
    /**
     * Fixed for this schema revision. A breaking change bumps it and carries a migration (CONTRACTS-INV-004).
     */
    schemaVersion: '1.0.0';
    /**
     * Canonical lowercase UUID. Uses a pattern rather than 'format' so both runtimes assert it.
     */
    briefId: string;
    /**
     * Increments on every accepted change. A Design records the revision that produced it (CONTRACTS-INV-003).
     */
    revision: number;
    /**
     * RFC 3339 timestamp. ASCII digits only, so Python and JavaScript agree.
     */
    createdAt: string;
    /**
     * What the tattoo depicts.
     */
    subject: {
      description: string;
      /**
       * Key motifs, kept structured so engines can weight them individually.
       *
       * @maxItems 20
       */
      elements?:
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string, string]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ];
    };
    style: {
      primary: StyleName;
      secondary?: StyleName;
      /**
       * Free text for nuance within a style. Never a route around the closed vocabulary, and never a place to name a living artist (PROD-INV-004, enforced by the safety module).
       */
      notes?: string;
    };
    linework: {
      /**
       * Drives the stencil's single-weight linework as much as the flash render.
       */
      weight: 'fine' | 'medium' | 'bold' | 'mixed';
      notes?: string;
    };
    shading: {
      technique: 'none' | 'whip' | 'dotwork' | 'smooth_blend' | 'solid_fill' | 'mixed';
      intensity: 'light' | 'medium' | 'heavy';
    };
    colour: {
      [k: string]: unknown;
    } & {
      mode: 'black_and_grey' | 'colour' | 'black_and_grey_with_accent';
      /**
       * Optional client colour preferences. Omit to leave colour selection to the design process using the idea and reviewed references. Forbidden for pure black-and-grey.
       *
       * @minItems 1
       * @maxItems 8
       */
      palette?:
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string];
    };
    /**
     * Where on the body. Embedded rather than extracted into its own schema until a second consumer exists (TASK-0002/DEC-004).
     */
    placement: {
      bodyPart: BodyPart;
      orientation: 'vertical' | 'horizontal' | 'diagonal' | 'wrapping';
      side?: 'left' | 'right' | 'centre';
    };
    /**
     * Millimetres are authoritative. No pixel dimension appears anywhere in this contract (CONTRACTS-INV-001).
     */
    size: {
      widthMm: Millimetres;
      heightMm: Millimetres;
    };
    constraints?: {
      /**
       * Covering existing work constrains density and darkness heavily.
       */
      coverUp?: boolean;
      /**
       * @maxItems 20
       */
      avoid?:
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string, string]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ]
        | [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
          ];
    };
  };
  /**
   * @minItems 1
   * @maxItems 5
   */
  referenceIds:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string];
  bodyPhotoId?: string;
  idempotencyKey: string;
  referencesReviewed: true;
  placement?: {
    x: number;
    y: number;
    width: number;
    photoWidthMm?: number;
  };
  edit?: {
    parentJobId: string;
    instruction: string;
    coverage?: 'larger' | 'smaller' | 'full';
    mode?: 'artwork' | 'placement';
  };
}
