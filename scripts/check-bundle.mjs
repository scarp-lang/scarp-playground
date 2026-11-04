import process from 'node:process';
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
process.stdout.write('Browser JS bundle (raw/gzip): ' + JSON.stringify(report) + '\n');
// Keep the quickly rendered application shell separate from the large editor.
// This is a build size guard, not a simulated network performance benchmark.
const shell = measurements.find(({ name }) => /^index-[\w-]+\.js$/.test(name));
if (!shell || shell.bytes > 400_000) {
  process.stderr.write('Initial React shell exceeds 400 KiB or is missing.\n');
  process.exitCode = 1;
}
if (extras.length) {
  process.stderr.write('Unrelated language chunks detected: ' + extras.join(', ') + '\n');
  process.exitCode = 1;
}

// GitHub Pages cannot set CSP response headers. Require a production-only
// meta CSP in emitted HTML before the first executable script, and reject any
// accidental reintroduction of inline JavaScript or unrestricted eval.
const html = readFileSync('dist/index.html', 'utf8');
const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?\s*>/i);
if (!cspMatch) {
  process.stderr.write('Production index.html is missing the early CSP meta tag.\n');
  process.exitCode = 1;
} else {
  const csp = cspMatch[1];
  const required = [
    "default-src 'none'", "base-uri 'none'", "object-src 'none'",
    "form-action 'none'", "frame-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "connect-src 'self'", "worker-src 'self'",
  ];
  const directives = csp.split(';').map((part) => part.trim());
  const script = directives.find((part) => part.startsWith('script-src ')) ?? '';
  if (
    required.some((directive) => !directives.includes(directive)) ||
    script.includes("'unsafe-inline'") || script.includes("'unsafe-eval'") ||
    html.indexOf(cspMatch[0]) > html.indexOf('<script')
  ) {
    process.stderr.write('Production CSP is incomplete, too permissive, or appears after scripts.\n');
    process.exitCode = 1;
  }
}
