import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  INTEGRITY_FORMAT, INTEGRITY_VERSION, SOURCE_INTEGRITY_ALGORITHM,
  MAX_INTEGRITY_MANIFEST_BYTES,
  buildWorkspaceIntegrityManifest, parseWorkspaceIntegrityManifest,
  validateIntegrityManifest, compareWorkspaceIntegrity,
  serializeWorkspaceIntegrityManifest, formatIntegrityComparison,
  type WorkspaceIntegrityManifest,
} from '../src/workspace-integrity';
import type { Workspace } from '../src/workspace';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const workspace = (main = 'print("Hello");\n'): Workspace => ({
  entry: 'main.srp',
  files: {
    'main.srp': main,
    'lib/math.srp': 'pub bind answer = 42;\n',
  },
});
const create = (value: Workspace) => buildWorkspaceIntegrityManifest(value, subtle);

function changed(manifest: WorkspaceIntegrityManifest, change: Partial<WorkspaceIntegrityManifest>) {
  return JSON.stringify({ ...manifest, ...change });
}

describe('source-only SHA-256 workspace integrity', () => {
  it('generates a canonical manifest from exact source bytes', async () => {
    const result = await create(workspace());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      format: INTEGRITY_FORMAT, version: INTEGRITY_VERSION,
      algorithm: SOURCE_INTEGRITY_ALGORITHM, entry: 'main.srp',
    });
    expect(result.value.files.map(file => file.path)).toEqual(['lib/math.srp', 'main.srp']);
    expect(result.value.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    expect(result.value.workspaceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.value)).not.toContain('Hello');
  });

  it('uses the standard SHA-256 of the exact file source', async () => {
    const input: Workspace = { entry: 'main.srp', files: { 'main.srp': 'abc' } };
    const result = await create(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files[0].sha256).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(result.value.files[0].bytes).toBe(3);
  });

  it('is stable under filesystem key insertion order', async () => {
    const original = workspace();
    const reverse = { entry: original.entry,
      files: Object.fromEntries(Object.entries(original.files).reverse()) };
    const [a, b] = await Promise.all([create(original), create(reverse)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value).toEqual(a.value);
  });

  it('detects Unicode scalars and exact CRLF changes rather than normalizing text', async () => {
    const original = workspace('print("😀 हिंदी");\r\n');
    const updated = workspace('print("😀 हिंदी");\n');
    const baseline = await create(original);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.value.files.find(item => item.path === 'main.srp')?.bytes)
      .toBe(new TextEncoder().encode(original.files['main.srp']).byteLength);
    const result = await compareWorkspaceIntegrity(updated, baseline.value, subtle);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toBe(false);
    expect(result.value.modified).toBe(1);
    expect(result.value.files.find(item => item.path === 'main.srp')?.status).toBe('changed');
  });

  it('reports an exact match to a stored manifest', async () => {
    const initial = workspace();
    const baseline = await create(initial);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const compared = await compareWorkspaceIntegrity(initial, baseline.value, subtle);
    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    expect(compared.value.matches).toBe(true);
    expect(compared.value.unchanged).toBe(2);
    expect(compared.value.modified).toBe(0);
    expect(compared.value.added).toBe(0);
    expect(compared.value.missing).toBe(0);
    expect(compared.value.entryChanged).toBe(false);
  });

  it('reports changed files without exposing old or new source contents', async () => {
    const before = workspace('print("PRIVATE_OLD");\n');
    const baseline = await create(before);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const after = workspace('print("PRIVATE_NEW");\n');
    const compared = await compareWorkspaceIntegrity(after, baseline.value, subtle);
    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    expect(compared.value.modified).toBe(1);
    expect(JSON.stringify(compared.value)).not.toMatch(/PRIVATE_(OLD|NEW)/);
    const summary = formatIntegrityComparison(compared.value);
    expect(summary).toContain('main.srp (changed)');
    expect(summary).not.toContain('print(');
  });

  it('detects added and removed modules without inventing a text diff', async () => {
    const baseline = await create(workspace());
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const changedFiles: Workspace = { entry: 'main.srp',
      files: { 'main.srp': 'print("Hello");\n', 'other.srp': 'print(0);' } };
    const compared = await compareWorkspaceIntegrity(changedFiles, baseline.value, subtle);
    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    expect(compared.value.added).toBe(1);
    expect(compared.value.missing).toBe(1);
    expect(compared.value.files.find(file => file.path === 'other.srp')).toMatchObject({
      status: 'added', expectedBytes: null,
    });
    expect(compared.value.files.find(file => file.path === 'lib/math.srp')).toMatchObject({
      status: 'removed', actualBytes: null,
    });
  });

  it('flags entrypoint changes even when every source byte is identical', async () => {
    const initial = workspace();
    const baseline = await create(initial);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const alternative = { ...initial, entry: 'lib/math.srp' };
    const compared = await compareWorkspaceIntegrity(alternative, baseline.value, subtle);
    expect(compared.ok).toBe(true);
    if (compared.ok) {
      expect(compared.value.matches).toBe(false);
      expect(compared.value.entryChanged).toBe(true);
      expect(compared.value.modified).toBe(0);
      expect(compared.value.expectedRoot).not.toBe(compared.value.actualRoot);
    }
  });

  it('round-trips a source-free manifest with no unexpected fields', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const serialized = serializeWorkspaceIntegrityManifest(original.value)!;
    const parsed = parseWorkspaceIntegrityManifest(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(original.value);
    expect(serialized).not.toContain('pub bind');
    expect(serialized).not.toContain('print(');
  });

  it('detects tampering with a single file fingerprint', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const forged = { ...original.value, files: original.value.files.map((item, index) =>
      index === 0 ? { ...item, sha256: '0'.repeat(64) } : item) };
    const result = await validateIntegrityManifest(forged, subtle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('metadata fingerprint mismatch');
    expect((await compareWorkspaceIntegrity(workspace(), forged, subtle)).ok).toBe(false);
  });

  it('detects manifest filename, byte count and entrypoint edits through root verification', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const changes = [
      { ...original.value, entry: 'lib/math.srp' },
      { ...original.value, files: original.value.files.map((item, index) =>
        index === 0 ? { ...item, bytes: item.bytes + 1 } : item) },
      { ...original.value, files: original.value.files.map((item, index) =>
        index === 0 ? { ...item, path: 'a.srp' } : item) },
    ];
    for (const forged of changes) {
      expect((await validateIntegrityManifest(forged, subtle)).ok).toBe(false);
    }
  });

  it('rejects wrong format, version or digest algorithm before accessing Web Crypto', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    for (const invalid of [
      changed(original.value, { format: 'not-a-playground' as typeof INTEGRITY_FORMAT }),
      changed(original.value, { version: 2 as typeof INTEGRITY_VERSION }),
      changed(original.value, { algorithm: 'MD5' as typeof SOURCE_INTEGRITY_ALGORITHM }),
    ]) expect(parseWorkspaceIntegrityManifest(invalid).ok).toBe(false);
  });

  it('rejects invalid digests, oversized byte counts and illegal Unicode paths', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const badFiles: unknown[] = [
      [{ ...original.value.files[0], sha256: 'X'.repeat(64) }, original.value.files[1]],
      [{ ...original.value.files[0], bytes: -1 }, original.value.files[1]],
      [{ ...original.value.files[0], bytes: 65_537 }, original.value.files[1]],
      [{ ...original.value.files[0], path: '../escape.srp' }, original.value.files[1]],
      [{ ...original.value.files[0], path: '数学.srp' }, original.value.files[1]],
      [{ ...original.value.files[0], path: 'C:\\secret.srp' }, original.value.files[1]],
    ];
    for (const files of badFiles) {
      expect(parseWorkspaceIntegrityManifest(JSON.stringify({ ...original.value, files })).ok).toBe(false);
    }
  });

  it('rejects unsorted or duplicated manifest file records', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    for (const files of [
      [...original.value.files].reverse(),
      [original.value.files[0], original.value.files[0]],
    ]) expect(parseWorkspaceIntegrityManifest(JSON.stringify({
      ...original.value, files,
    })).ok).toBe(false);
  });

  it('rejects a manifest without its own entrypoint', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(parseWorkspaceIntegrityManifest(JSON.stringify({
      ...original.value, entry: 'absent.srp',
    })).ok).toBe(false);
  });

  it('rejects huge JSON before attempting to parse it', () => {
    expect(parseWorkspaceIntegrityManifest('X'.repeat(MAX_INTEGRITY_MANIFEST_BYTES + 1)).ok).toBe(false);
    expect(parseWorkspaceIntegrityManifest('{').ok).toBe(false);
    expect(parseWorkspaceIntegrityManifest(null).ok).toBe(false);
  });

  it('sanitizes extraneous manifest metadata and does not forward untrusted nested fields', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const polluted = JSON.stringify({
      ...original.value, source: 'SECRET',
      files: original.value.files.map(item => ({ ...item, stdin: 'SECRET' })),
    });
    const parsed = parseWorkspaceIntegrityManifest(polluted);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(original.value);
    expect(JSON.stringify(parsed.value)).not.toContain('SECRET');
  });

  it('handles invalid source Unicode before creating a manifest', async () => {
    const malformed: Workspace = { entry: 'main.srp',
      files: { 'main.srp': '\uD800' } };
    expect((await create(malformed)).ok).toBe(false);
  });

  it('rejects an invalid workspace or mismatched actual workspace before comparison', async () => {
    const baseline = await create(workspace());
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const invalid = { entry: 'missing.srp', files: { 'main.srp': '' } };
    expect((await compareWorkspaceIntegrity(invalid, baseline.value, subtle)).ok).toBe(false);
  });

  it('converts Web Crypto exceptions into safe non-source-bearing errors', async () => {
    const broken = { digest: async () => { throw new Error('SECRET PROGRAM TEXT'); } } as unknown as SubtleCrypto;
    const result = await buildWorkspaceIntegrityManifest(workspace(), broken);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('does not use an unsigned manifest as proof of authorship', async () => {
    const original = await create(workspace());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    // Valid digests alone cannot authenticate the person who generated a
    // manifest. That must be conveyed in UI/help rather than misrepresented.
    const other = await create(workspace('print("changed");\n'));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect((await validateIntegrityManifest(other.value, subtle)).ok).toBe(true);
    expect(other.value.workspaceSha256).not.toBe(original.value.workspaceSha256);
  });

  it('refuses a forged response with an invalid digest string without throwing', () => {
    const result = serializeWorkspaceIntegrityManifest({
      format: INTEGRITY_FORMAT, version: 1, algorithm: SOURCE_INTEGRITY_ALGORITHM,
      entry: 'main.srp',
      files: [{ path: 'main.srp', bytes: 10, sha256: 'x' }],
      workspaceSha256: 'y',
    });
    expect(result).toBeNull();
  });
});
