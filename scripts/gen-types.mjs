#!/usr/bin/env node
// Regenerates src/app/models/discography.model.ts from schemas/.
// The app never hand-writes these types, so the runtime validator and the
// compile-time types cannot drift apart. CI regenerates and fails if the
// committed file differs.
//
// Run: npm run types:gen

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/app/models/discography.model.ts');

const options = {
  bannerComment: '',
  additionalProperties: false,
  declareExternallyReferenced: true,
  enableConstEnums: false,
  style: { printWidth: 100, singleQuote: true },
};

const header = `/**
 * GENERATED FILE. Do not edit by hand.
 *
 * Source: schemas/discography.schema.json, schemas/index.schema.json
 * Regenerate with: npm run types:gen
 */

`;

const parts = await Promise.all([
  compileFromFile(join(ROOT, 'schemas/index.schema.json'), options),
  compileFromFile(join(ROOT, 'schemas/discography.schema.json'), options),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  header +
    parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() +
    '\n',
);
console.log(`Wrote ${OUT}`);
