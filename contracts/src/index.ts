/**
 * The contracts module.
 *
 * Validation authority lives here and nowhere else. `validateTattooBrief` runs the
 * canonical schema document through ajv; the generated types are for editor support
 * and carry no authority (ADR-0004 refinement).
 *
 * Do not add a hand-written type guard alongside this. The whole point of the module
 * is that one document decides what is valid, in both runtimes.
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

import { tattooBriefSchema } from './generated/schema';
import type { TattooBrief } from './generated/tattoo-brief';

export type { TattooBrief } from './generated/tattoo-brief';
export type { BodyPart, StyleName } from './generated/tattoo-brief';
export { tattooBriefSchema } from './generated/schema';

/** A validation failure, reduced to what a caller can act on. */
export interface ValidationIssue {
  /** JSON Pointer into the payload, e.g. `/size/widthMm`. Empty string means the root. */
  path: string;
  message: string;
  keyword: string;
}

export type ValidationResult =
  { valid: true; brief: TattooBrief } | { valid: false; issues: ValidationIssue[] };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // `strictRequired` expects every property named in `required` to be declared in the
  // same subschema. The colour rules legitimately put `required` inside an if/then
  // branch while `palette` is declared on the parent, which trips it. This is an ajv
  // authoring lint with no counterpart in Python's `jsonschema`, so relaxing it cannot
  // make the two runtimes disagree — the corpus would catch it if it could. Every other
  // strict-mode check stays on.
  strictRequired: false,
  // `format` is deliberately unused in the schema: it is assertive only when a format
  // checker is wired up, and the two runtimes wire it differently. Patterns are used
  // instead so both reach identical verdicts.
  validateFormats: false,
});

const compiled: ValidateFunction = ajv.compile(tattooBriefSchema);

function toIssue(error: ErrorObject): ValidationIssue {
  return {
    path: error.instancePath,
    message: error.message ?? 'invalid',
    keyword: error.keyword,
  };
}

/**
 * Validate an unknown payload against the canonical TattooBrief schema.
 *
 * Returns a result rather than throwing, because callers at a boundary generally need
 * to report every problem at once rather than the first one.
 */
export function validateTattooBrief(payload: unknown): ValidationResult {
  if (compiled(payload)) {
    return { valid: true, brief: payload as TattooBrief };
  }
  const issues = (compiled.errors ?? []).map(toIssue);
  return { valid: false, issues };
}

/** Thrown by {@link assertTattooBrief}. Names the schema and every failing path. */
export class TattooBriefValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const detail = issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ');
    super(`TattooBrief failed validation: ${detail}`);
    this.name = 'TattooBriefValidationError';
    this.issues = issues;
  }
}

/** Validate, or throw a typed error naming the schema and the failing paths. */
export function assertTattooBrief(payload: unknown): TattooBrief {
  const result = validateTattooBrief(payload);
  if (!result.valid) {
    throw new TattooBriefValidationError(result.issues);
  }
  return result.brief;
}
