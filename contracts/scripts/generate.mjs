/**
 * Generate TypeScript artifacts from the canonical schema.
 *
 * Two outputs, both committed (ADR-0004 refinement, TASK-0002/DEC-003):
 *
 *   src/generated/tattoo-brief.ts  interfaces, for editor support only
 *   src/generated/schema.ts        the schema embedded as a module
 *
 * The schema is embedded rather than imported as JSON because JSON imports behave
 * differently across Node ESM, vitest and the Next bundler, and a contract that only
 * loads under some bundlers is not much of a contract. The embedded copy is generated
 * from the canonical file and a check proves regeneration produces no diff, so the two
 * cannot drift.
 *
 * Neither output carries validating authority. Validation runs `ajv` against the schema
 * itself, because generated types cannot express the schema's conditional rules.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../schemas/tattoo-brief.schema.json');
const generatedDir = resolve(here, '../src/generated');

const raw = readFileSync(schemaPath, 'utf8');
const schema = JSON.parse(raw);

const BANNER = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/tattoo-brief.schema.json
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */
`;

const types = await compile(schema, 'TattooBrief', {
  bannerComment: BANNER,
  additionalProperties: false,
  style: { singleQuote: true, printWidth: 100 },
});

writeFileSync(resolve(generatedDir, 'tattoo-brief.ts'), types, 'utf8');

const schemaModule = `${BANNER}
export const tattooBriefSchema: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};
`;

writeFileSync(resolve(generatedDir, 'schema.ts'), schemaModule, 'utf8');

console.log('generated: src/generated/tattoo-brief.ts, src/generated/schema.ts');
