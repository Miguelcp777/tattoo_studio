/**
 * TypeScript half of the shared fixture corpus.
 *
 * The Python suite reads the same manifests and the same fixture files. Both must reach
 * the identical verdict on every case; that agreement is what ARCH-INV-005 asks for, and
 * is why the corpus lives outside either runtime.
 *
 * The suite is driven by `schemaNames`, so a new schema is covered the moment it is
 * generated — there is no per-schema test to forget to write.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertDesign,
  assertTattooBrief,
  ContractValidationError,
  type SchemaName,
  schemaNames,
  validateAgainst,
  validateTattooBrief,
} from './index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../fixtures');

interface Case {
  name: string;
  file: string;
  valid: boolean;
  why: string;
}

function manifest(schema: SchemaName): { cases: Case[] } {
  return JSON.parse(readFileSync(resolve(fixtures, schema, 'manifest.json'), 'utf8'));
}

function load(schema: SchemaName, file: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtures, schema, file), 'utf8'));
}

function cases(valid: boolean): Array<[string, SchemaName, Case]> {
  return schemaNames.flatMap((schema) =>
    manifest(schema)
      .cases.filter((c) => c.valid === valid)
      .map((c) => [`${schema}:${c.name}`, schema, c] as [string, SchemaName, Case]),
  );
}

describe.each(schemaNames)('corpus for %s', (schema) => {
  it('is substantial enough to be meaningful', () => {
    // Guards against a corpus being quietly emptied, which would make every other
    // test in this file pass vacuously.
    const all = manifest(schema).cases;
    expect(all.filter((c) => c.valid).length).toBeGreaterThanOrEqual(5);
    expect(all.filter((c) => !c.valid).length).toBeGreaterThanOrEqual(12);
  });
});

describe('shared fixture corpus', () => {
  it.each(cases(true))('accepts %s', (_id, schema, testCase) => {
    const result = validateAgainst(schema, load(schema, testCase.file));
    if (!result.valid) {
      throw new Error(`expected valid (${testCase.why}) but got: ${JSON.stringify(result.issues)}`);
    }
    expect(result.valid).toBe(true);
  });

  it.each(cases(false))('rejects %s', (_id, schema, testCase) => {
    const result = validateAgainst(schema, load(schema, testCase.file));
    expect(result.valid, `expected rejection because ${testCase.why}`).toBe(false);
  });
});

describe('validation surface', () => {
  it('rejects an unknown schema name rather than silently passing', () => {
    expect(() => validateAgainst('not-a-schema' as SchemaName, {})).toThrow(/unknown schema/);
  });

  it('reports every problem at once rather than only the first', () => {
    const payload = load('tattoo-brief', 'invalid/size-below-minimum.json') as Record<
      string,
      unknown
    >;

    const result = validateTattooBrief({ ...payload, revision: 0 });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeGreaterThan(1);
    }
  });

  it('names the failing path in a thrown brief error', () => {
    try {
      assertTattooBrief(load('tattoo-brief', 'invalid/size-below-minimum.json'));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      const issues = (error as ContractValidationError).issues;
      expect(issues.some((i) => i.path.includes('widthMm'))).toBe(true);
    }
  });

  it('names the schema in a thrown design error', () => {
    try {
      assertDesign(load('design', 'invalid/missing-provenance.json'));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).schemaName).toBe('Design');
    }
  });

  it('rejects pixel dimensions on a brief (CONTRACTS-INV-001)', () => {
    const result = validateAgainst(
      'tattoo-brief',
      load('tattoo-brief', 'invalid/pixel-dimensions-instead-of-mm.json'),
    );

    expect(result.valid).toBe(false);
  });

  it('rejects physical size on a design (CONTRACTS-INV-001, mirrored)', () => {
    // A design's raster has pixels and no millimetres. Putting mm on a design would
    // create a second source of truth for the tattoo's size.
    const result = validateAgainst(
      'design',
      load('design', 'invalid/unknown-top-level-field.json'),
    );

    expect(result.valid).toBe(false);
  });

  it('rejects a signed URL as a storage key (SEC-INV-008)', () => {
    const result = validateAgainst('design', load('design', 'invalid/storage-key-is-a-url.json'));

    expect(result.valid).toBe(false);
  });

  it('rejects a style outside the closed vocabulary (CONTRACTS-INV-002)', () => {
    const result = validateAgainst(
      'tattoo-brief',
      load('tattoo-brief', 'invalid/style-free-text.json'),
    );

    expect(result.valid).toBe(false);
  });
});
