/**
 * Generate TypeScript artifacts from the canonical schemas.
 *
 * For every contracts/schemas/*.schema.json, two outputs, both committed
 * (ADR-0004 refinement, TASK-0002/DEC-003):
 *
 *   src/generated/<name>.ts     interfaces, for editor support only
 *   src/generated/schemas.ts    every schema embedded as one module
 *
 * Schemas are embedded rather than imported as JSON because JSON imports behave
 * differently across Node ESM, vitest and the Next bundler, and a contract that only
 * loads under some bundlers is not much of a contract. The embedded copies are
 * generated from the canonical files and a check proves regeneration produces no
 * diff, so the two cannot drift.
 *
 * Neither output carries validating authority. Validation runs `ajv` against the
 * schemas themselves, because generated types cannot express conditional rules.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '../schemas');
const generatedDir = resolve(here, '../src/generated');

const BANNER = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */
`;

/** `tattoo-brief.schema.json` -> `tattoo-brief` */
const schemaName = (file) => file.replace(/\.schema\.json$/, '');

/** `tattoo-brief` -> `TattooBrief` */
const typeName = (name) =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const files = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();

if (files.length === 0) {
  throw new Error(`no schemas found in ${schemaDir}`);
}

const embedded = [];

for (const file of files) {
  const name = schemaName(file);
  const schema = JSON.parse(readFileSync(resolve(schemaDir, file), 'utf8'));

  const types = await compile(schema, typeName(name), {
    bannerComment: BANNER,
    additionalProperties: false,
    style: { singleQuote: true, printWidth: 100 },
  });
  writeFileSync(resolve(generatedDir, `${name}.ts`), types, 'utf8');

  embedded.push({ name, schema });
}

const entries = embedded
  .map(({ name, schema }) => `  '${name}': ${JSON.stringify(schema, null, 2)},`)
  .join('\n');

const schemasModule = `${BANNER}
export const schemas: Record<string, Record<string, unknown>> = {
${entries}
};

export type SchemaName = ${embedded.map(({ name }) => `'${name}'`).join(' | ')};

export const schemaNames: readonly SchemaName[] = [
${embedded.map(({ name }) => `  '${name}',`).join('\n')}
];
`;

writeFileSync(resolve(generatedDir, 'schemas.ts'), schemasModule, 'utf8');

console.log(`generated: ${files.map(schemaName).join(', ')} (+ schemas.ts) into src/generated/`);
