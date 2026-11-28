import {
  MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES,
  validPath, validateWorkspace, type Workspace,
} from './workspace';
import { measureUtf8 } from './utf8';

export const INTEGRITY_FORMAT = 'scarp-playground-source-integrity';
export const INTEGRITY_VERSION = 1;
export const MAX_INTEGRITY_MANIFEST_BYTES = 32 * 1024;
export const SOURCE_INTEGRITY_ALGORITHM = 'SHA-256';

const HEX_256 = /^[a-f0-9]{64}$/;
const DOMAIN = 'Scarp Playground source integrity / v1\n';

export type FileFingerprint = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type WorkspaceIntegrityManifest = Readonly<{
  format: typeof INTEGRITY_FORMAT;
  version: typeof INTEGRITY_VERSION;
  algorithm: typeof SOURCE_INTEGRITY_ALGORITHM;
  entry: string;
  files: FileFingerprint[];
  workspaceSha256: string;
}>;

export type FileIntegrityComparison = Readonly<{
  path: string;
  status: 'same' | 'changed' | 'added' | 'removed';
  expectedBytes: number | null;
  actualBytes: number | null;
}>;

export type IntegrityComparison = Readonly<{
  ok: true;
  matches: boolean;
  expectedRoot: string;
  actualRoot: string;
  entryChanged: boolean;
  expectedEntry: string;
  actualEntry: string;
  files: FileIntegrityComparison[];
  unchanged: number;
  modified: number;
  missing: number;
  added: number;
}>;

export type IntegrityResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = <T>(error: string): IntegrityResult<T> => ({ ok: false, error });
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validFingerprint(raw: unknown): raw is FileFingerprint {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  return validPath(value.path) && Number.isSafeInteger(value.bytes) &&
    Number(value.bytes) >= 0 && Number(value.bytes) <= MAX_FILE_BYTES &&
    typeof value.sha256 === 'string' && HEX_256.test(value.sha256);
}

function canonicalPayload(entry: string, files: readonly FileFingerprint[]): string {
  return DOMAIN + JSON.stringify({
    entry, files: files.map(item => ({
      path: item.path, bytes: item.bytes, sha256: item.sha256,
    })),
  });
}

function subtleCrypto(explicit?: SubtleCrypto): SubtleCrypto | null {
  try {
    return explicit ?? globalThis.crypto?.subtle ?? null;
  } catch { return null; }
}

async function sha256(source: Uint8Array | string, subtle: SubtleCrypto): Promise<string> {
  const buffer = typeof source === 'string' ? encoder.encode(source) : source;
  return hex(await subtle.digest('SHA-256', buffer as BufferSource));
}

/**
 * Decode an untrusted external JSON manifest. Extra fields are never copied;
 * duplicate, unsorted or noncanonical virtual filenames are refused.
 */
export function parseWorkspaceIntegrityManifest(raw: unknown): IntegrityResult<WorkspaceIntegrityManifest> {
  if (typeof raw !== 'string' || raw.length > MAX_INTEGRITY_MANIFEST_BYTES) {
    return fail('Choose a source integrity JSON manifest within the 32 KiB browser limit.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return fail('The selected source integrity manifest is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail('Expected a Scarp Playground source integrity manifest.');
  }
  const value = parsed as Record<string, unknown>;
  if (value.format !== INTEGRITY_FORMAT ||
      value.version !== INTEGRITY_VERSION ||
      value.algorithm !== SOURCE_INTEGRITY_ALGORITHM ||
      !validPath(value.entry) ||
      !Array.isArray(value.files) || value.files.length < 1 ||
      value.files.length > MAX_FILES ||
      typeof value.workspaceSha256 !== 'string' || !HEX_256.test(value.workspaceSha256)) {
    return fail('Unsupported or invalid Scarp source integrity manifest.');
  }
  const files: FileFingerprint[] = [];
  let previous = '';
  let total = 0;
  for (const candidate of value.files) {
    if (!validFingerprint(candidate) || (previous && candidate.path <= previous)) {
      return fail('Manifest source entries are invalid, duplicated or not sorted.');
    }
    previous = candidate.path;
    total += candidate.bytes;
    if (total > MAX_TOTAL_BYTES) return fail('Manifest source byte totals exceed the workspace limit.');
    files.push({
      path: candidate.path, bytes: candidate.bytes, sha256: candidate.sha256,
    });
  }
  if (!files.some(file => file.path === value.entry)) {
    return fail('The manifest entrypoint is not one of its recorded source files.');
  }
  return { ok: true, value: {
    format: INTEGRITY_FORMAT, version: INTEGRITY_VERSION,
    algorithm: SOURCE_INTEGRITY_ALGORITHM,
    entry: value.entry, files, workspaceSha256: value.workspaceSha256,
  } };
}

/** Re-hash a parsed metadata tree before comparing it with any source files. */
export async function validateIntegrityManifest(
  manifest: WorkspaceIntegrityManifest, crypto?: SubtleCrypto,
): Promise<IntegrityResult<WorkspaceIntegrityManifest>> {
  const normalized = parseWorkspaceIntegrityManifest(JSON.stringify(manifest));
  if (!normalized.ok) return normalized;
  const subtle = subtleCrypto(crypto);
  if (!subtle) return fail('This browser does not provide Web Crypto SHA-256.');
  try {
    const root = await sha256(canonicalPayload(normalized.value.entry, normalized.value.files), subtle);
    if (root !== normalized.value.workspaceSha256) {
      return fail('Manifest metadata fingerprint mismatch. The manifest may have been edited.');
    }
    return normalized;
  } catch {
    return fail('Unable to validate the source integrity manifest with Web Crypto.');
  }
}

/**
 * Create a deterministic, source-free SHA-256 manifest. File contents are
 * processed in browser memory; the returned object contains only filenames,
 * byte lengths and digests. This is an integrity fingerprint, not a signature.
 */
export async function buildWorkspaceIntegrityManifest(
  workspace: Workspace, crypto?: SubtleCrypto,
): Promise<IntegrityResult<WorkspaceIntegrityManifest>> {
  const invalid = validateWorkspace(workspace);
  if (invalid) return fail(invalid);
  const subtle = subtleCrypto(crypto);
  if (!subtle) return fail('Web Crypto SHA-256 is unavailable in this browser.');
  try {
    const files: FileFingerprint[] = [];
    for (const path of Object.keys(workspace.files).sort()) {
      const source = workspace.files[path];
      const measure = measureUtf8(source, MAX_FILE_BYTES);
      if (!measure.ok) return fail('Cannot fingerprint an invalid Unicode source file.');
      files.push({ path, bytes: measure.bytes, sha256: await sha256(source, subtle) });
    }
    const workspaceSha256 = await sha256(canonicalPayload(workspace.entry, files), subtle);
    return { ok: true, value: {
      format: INTEGRITY_FORMAT, version: INTEGRITY_VERSION,
      algorithm: SOURCE_INTEGRITY_ALGORITHM,
      entry: workspace.entry, files, workspaceSha256,
    } };
  } catch {
    return fail('Unable to calculate source fingerprints with Web Crypto.');
  }
}

/**
 * Compare the exact current source bytes with a previously trusted manifest.
 * This detects accidental changes, but does not authenticate the original
 * author: an adversary can replace both contents and their unsigned manifest.
 */
export async function compareWorkspaceIntegrity(
  workspace: Workspace, baseline: WorkspaceIntegrityManifest, crypto?: SubtleCrypto,
): Promise<IntegrityResult<IntegrityComparison>> {
  const verified = await validateIntegrityManifest(baseline, crypto);
  if (!verified.ok) return fail(verified.error);
  const current = await buildWorkspaceIntegrityManifest(workspace, crypto);
  if (!current.ok) return fail(current.error);
  const previous = verified.value;
  const actual = current.value;
  const old = new Map(previous.files.map(file => [file.path, file]));
  const now = new Map(actual.files.map(file => [file.path, file]));
  const files: FileIntegrityComparison[] = [];
  const paths = [...new Set([...old.keys(), ...now.keys()])].sort();
  for (const path of paths) {
    const expected = old.get(path);
    const found = now.get(path);
    const status = !expected ? 'added' : !found ? 'removed' :
      expected.sha256 === found.sha256 && expected.bytes === found.bytes
        ? 'same' : 'changed';
    files.push({
      path, status,
      expectedBytes: expected?.bytes ?? null,
      actualBytes: found?.bytes ?? null,
    });
  }
  const count = (status: FileIntegrityComparison['status']) =>
    files.filter(file => file.status === status).length;
  const entryChanged = previous.entry !== actual.entry;
  return { ok: true, value: {
    ok: true, matches: previous.workspaceSha256 === actual.workspaceSha256 &&
      !entryChanged && files.every(file => file.status === 'same'),
    expectedRoot: previous.workspaceSha256, actualRoot: actual.workspaceSha256,
    expectedEntry: previous.entry, actualEntry: actual.entry, entryChanged,
    files, unchanged: count('same'), modified: count('changed'),
    added: count('added'), missing: count('removed'),
  } };
}

export function serializeWorkspaceIntegrityManifest(manifest: WorkspaceIntegrityManifest): string | null {
  const normalized = parseWorkspaceIntegrityManifest(JSON.stringify(manifest));
  return normalized.ok ? JSON.stringify(normalized.value, null, 2) + '\n' : null;
}

/** Short, non-source preview for copyable verification summaries. */
export function formatIntegrityComparison(result: IntegrityComparison): string {
  const lines = [
    'Scarp Playground source integrity check',
    'Expected SHA-256: ' + result.expectedRoot,
    'Actual SHA-256: ' + result.actualRoot,
    result.matches ? 'Result: exact match' : 'Result: differences detected',
    result.entryChanged ? 'Entrypoint: ' + result.expectedEntry + ' → ' + result.actualEntry : '',
    result.unchanged + ' matching files, ' + result.modified +
      ' modified, ' + result.added + ' added, ' + result.missing + ' missing',
  ].filter(Boolean);
  for (const file of result.files.filter(item => item.status !== 'same')) {
    lines.push('- ' + file.path + ' (' + file.status + ')');
  }
  return lines.join('\n') + '\n';
}
