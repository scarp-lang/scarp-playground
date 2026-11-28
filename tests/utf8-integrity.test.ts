import { describe, expect, it } from 'vitest';
import { measureUtf8, isUtf8Text } from '../src/utf8';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, makeShareUrl, sourceFromHash, validateWorkspace } from '../src/workspace';
import { serializePortableWorkspace, parsePortableWorkspace } from '../src/portable-workspace';
import { saveLocalWorkspace, parseLocalWorkspace, LOCAL_WORKSPACE_KEY } from '../src/persistence';
import { createSourceArchive, parseSourceArchive } from '../src/source-archive';
import { makeWorkspaceShareUrl } from '../src/share-workspace';
import { scarpFileStats } from '../src/source-file';
import { previewProgramInputEdit } from '../src/program-input';
import { validatedCompilerWorkerRequest } from '../src/runner/request';

const encoder = new TextEncoder();
const workspace = (source: string) => ({ entry: 'main.srp', files: { 'main.srp': source } });

describe('lossless scalar measurement', () => {
  it('agrees with UTF-8 encoding for all scalar boundaries and mixed scripts', () => {
    const cases = ['', '\u0000', '\u007f', '\u0080', '\u07ff', '\u0800', '\ud7ff', '\ue000',
      '\uffff', '\ud800\udc00', '\udbff\udfff', 'नमस्ते café e\u0301 😀\r\n'];
    for (const value of cases) {
      const bytes = encoder.encode(value).byteLength;
      expect(measureUtf8(value, bytes)).toEqual({ ok: true, bytes });
      if (bytes > 0) expect(measureUtf8(value, bytes - 1)).toEqual({ ok: false, reason: 'too-large' });
    }
  });

  it('rejects unmatched surrogates without silently replacing them', () => {
    for (const value of ['\ud800', '\udfff', '\ud800x', 'x\udc00', '\ud800\ud800', '\udc00\ud800',
      '😀\ud800', '\udfff😀']) {
      expect(measureUtf8(value, 100)).toEqual({ ok: false, reason: 'invalid-unicode' });
      expect(isUtf8Text(value, 100)).toBe(false);
    }
    expect(measureUtf8('\ufffd', 3)).toEqual({ ok: true, bytes: 3 });
  });

  it('does not allocate encoded copies of oversize input', () => {
    expect(measureUtf8('a'.repeat(200_000), MAX_FILE_BYTES)).toEqual({ ok: false, reason: 'too-large' });
    expect(measureUtf8('😀'.repeat(16385), MAX_FILE_BYTES)).toEqual({ ok: false, reason: 'too-large' });
    expect(measureUtf8('😀'.repeat(16384), MAX_FILE_BYTES)).toEqual({ ok: true, bytes: MAX_FILE_BYTES });
  });
});

describe('consistent source and input boundaries', () => {
  it('rejects malformed scalar sources through every source transport', () => {
    for (const text of ['print("\ud800");', '// \udc00', 'a\ud800b']) {
      const project = workspace(text);
      expect(validateWorkspace(project)).toContain('invalid Unicode');
      expect(serializePortableWorkspace(project, 'main.srp')).toBeNull();
      expect(createSourceArchive(project)).toBeNull();
      expect(makeWorkspaceShareUrl('https://example.test', '/', project, 'main.srp')).toBeNull();
      expect(makeShareUrl('https://example.test', '/', text)).toBeNull();
      expect(scarpFileStats('main.srp', text)).toBeNull();
      expect(validatedCompilerWorkerRequest({ id: 1, mode: 'run', workspace: project })).toBeNull();
    }
  });

  it('rejects escaped malformed Unicode after JSON parsing', () => {
    const project = workspace('\ud800');
    const serialized = JSON.stringify({ format: 'scarp-playground-workspace', version: 1,
      workspace: project, activeFile: 'main.srp' });
    expect(parsePortableWorkspace(serialized)).toBeNull();
    expect(parseLocalWorkspace(JSON.stringify({ version: 1, workspace: project }))).toBeNull();
  });

  it('preserves genuine replacement characters and supplementary scalars', () => {
    const project = workspace('print("� 😀 नमस्ते");\r\n');
    expect(validateWorkspace(project)).toBeNull();
    const archive = createSourceArchive(project)!;
    expect(parseSourceArchive(archive)).toEqual({ ok: true, workspace: project });
    const link = makeShareUrl('https://example.test', '/', project.files['main.srp'])!;
    expect(sourceFromHash(new URL(link).hash)).toBe(project.files['main.srp']);
  });

  it('rejects invalid stdin atomically at editor and worker boundaries', () => {
    for (const candidate of ['\ud800', '\udc00', 'ok\ud800']) {
      expect(previewProgramInputEdit('previous', candidate)).toEqual({ accepted: false, value: 'previous', bytes: 8 });
      expect(validatedCompilerWorkerRequest({ id: 1, mode: 'run', workspace: workspace(''), stdin: candidate })).toBeNull();
    }
    expect(previewProgramInputEdit('', '😀')).toEqual({ accepted: true, value: '😀', bytes: 4 });
  });

  it('supports the exact worst-case JSON escaping budget without changing source caps', () => {
    const source = '\u0000'.repeat(MAX_FILE_BYTES);
    const project = { entry: 'main.srp', files: { 'main.srp': source, 'lib.srp': source } };
    expect(MAX_TOTAL_BYTES).toBe(2 * MAX_FILE_BYTES);
    const serialized = serializePortableWorkspace(project, 'lib.srp')!;
    expect(serialized).toBeTruthy();
    expect(parsePortableWorkspace(serialized)).toEqual({ workspace: project, activeFile: 'lib.srp' });
    const data = new Map<string, string>();
    const store = { getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); } };
    const polluted = { ...project, stdin: 'private transient text', result: { stdout: 'not source' } };
    expect(saveLocalWorkspace(store, polluted, 'lib.srp')).toBeNull();
    expect(data.get(LOCAL_WORKSPACE_KEY)).not.toContain('private transient text');
    expect(data.get(LOCAL_WORKSPACE_KEY)).not.toContain('not source');
    expect(parseLocalWorkspace(data.get(LOCAL_WORKSPACE_KEY)!)).toEqual({ workspace: project, activeFile: 'lib.srp' });
  });
});
