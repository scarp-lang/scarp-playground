import { readFileSync } from 'node:fs';

// Playwright runs these tests directly in Node ESM, not through Vite's JSON
// transform. Read the same immutable metadata without a JSON module import.
const metadata: unknown = JSON.parse(readFileSync(
  new URL('../../../compiler-compatibility.json', import.meta.url), 'utf8',
));
if (typeof metadata !== 'object' || metadata === null ||
    !('version' in metadata) || typeof metadata.version !== 'string' ||
    !('commit' in metadata) || typeof metadata.commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(metadata.commit)) {
  throw new Error('Invalid compiler compatibility metadata in browser tests');
}
export const compilerCompatibility = { version: metadata.version, commit: metadata.commit };
