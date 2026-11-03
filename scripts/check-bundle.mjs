import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Detect accidental import of monaco-editor's package root. That entrypoint
// automatically emits unrelated language definition chunks.
const assetDir = 'dist/assets';
const files = readdirSync(assetDir).filter((name) => name.endsWith('.js'));
const unwanted = /^(?:typescript|javascript|python|java|cpp|kotlin|lua|yaml|sql|html|css|xml|php|rust|csharp|powershell|jsonMode|tsMode)-[\w-]+\.js$/i;
const extras = files.filter((name) => unwanted.test(name));
const measurements = files.map((name) => {
  const content = readFileSync(join(assetDir, name));
  return { name, bytes: content.length, gzipBytes: gzipSync(content).length };
});
const report = {
  schema: 1,
  jsFiles: files.length,
  jsBytes: measurements.reduce((sum, item) => sum + item.bytes, 0),
  jsGzipBytes: measurements.reduce((sum, item) => sum + item.gzipBytes, 0),
  files: measurements.sort((a, b) => b.bytes - a.bytes).slice(0, 8),
};
writeFileSync('dist/bundle-report.json', JSON.stringify(report, null, 2) + '\n');
console.log('Browser JS bundle (raw/gzip):', JSON.stringify(report));
if (extras.length) {
  console.error('Unrelated language chunks detected:', extras.join(', '));
  process.exitCode = 1;
}
