/**
 * TypeScript half of the shared fixture corpus.
 *
 * The Python suite reads the same manifest and the same fixture files. Both must reach
 * the identical verdict on every case; that agreement is what ARCH-INV-005 asks for,
 * and is why the corpus lives outside either runtime.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertTattooBrief, TattooBriefValidationError, validateTattooBrief } from './index';

const here = dirname(fileURLToPath(import.meta.url));
const corpusRoot = resolve(here, '../fixtures/tattoo-brief');

interface Case {
  name: string;
  file: string;
  valid: boolean;
  why: string;
}

const manifest: { cases: Case[] } = JSON.parse(
  readFileSync(resolve(corpusRoot, 'manifest.json'), 'utf8'),
);

function load(file: string): unknown {
  return JSON.parse(readFileSync(resolve(corpusRoot, file), 'utf8'));
}

const validCases = manifest.cases.filter((c) => c.valid);
const invalidCases = manifest.cases.filter((c) => !c.valid);

describe('shared fixture corpus', () => {
  it('is substantial enough to be meaningful', () => {
    // Guards against the corpus being quietly emptied, which would make every other
    // test in this file pass vacuously.
    expect(validCases.length).toBeGreaterThanOrEqual(5);
    expect(invalidCases.length).toBeGreaterThanOrEqual(12);
  });

  it.each(validCases.map((c) => [c.name, c] as const))('accepts %s', (_name, testCase) => {
    const result = validateTattooBrief(load(testCase.file));
    if (!result.valid) {
      throw new Error(`expected valid (${testCase.why}) but got: ${JSON.stringify(result.issues)}`);
    }
    expect(result.valid).toBe(true);
  });

  it.each(invalidCases.map((c) => [c.name, c] as const))('rejects %s', (_name, testCase) => {
    const result = validateTattooBrief(load(testCase.file));
    expect(result.valid, `expected rejection because ${testCase.why}`).toBe(false);
  });
});

describe('validation surface', () => {
  it('reports every problem at once rather than only the first', () => {
    const payload = load('invalid/size-below-minimum.json') as Record<string, unknown>;
    const broken = { ...payload, revision: 0 };

    const result = validateTattooBrief(broken);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeGreaterThan(1);
    }
  });

  it('names the failing path in a thrown error', () => {
    try {
      assertTattooBrief(load('invalid/size-below-minimum.json'));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TattooBriefValidationError);
      const issues = (error as TattooBriefValidationError).issues;
      expect(issues.some((i) => i.path.includes('widthMm'))).toBe(true);
    }
  });

  it('rejects a payload carrying pixel dimensions (CONTRACTS-INV-001)', () => {
    // Stated as its own test because it is an invariant, not merely a schema detail:
    // millimetres are authoritative and pixels have no place in the contract.
    const result = validateTattooBrief(load('invalid/pixel-dimensions-instead-of-mm.json'));

    expect(result.valid).toBe(false);
  });

  it('rejects a style outside the closed vocabulary (CONTRACTS-INV-002)', () => {
    const result = validateTattooBrief(load('invalid/style-free-text.json'));

    expect(result.valid).toBe(false);
  });
});
