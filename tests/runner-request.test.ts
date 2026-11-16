import { describe, expect, it } from 'vitest';
import {
  validatedCompilerWorkerRequest, rejectedCompilerWorkerRequest,
} from '../src/runner/request';

const workspace = {
  entry: 'main.srp',
  files: { 'main.srp': 'print("hello");', 'lib/math.srp': 'pub bind answer = 42;' },
};

describe('compiler Worker request boundary', () => {
  it('accepts only the exact valid Run, Check, Verify and navigation request shapes', () => {
    for (const mode of ['run', 'check', 'verify']) {
      const data = { id: 1, workspace, mode };
      expect(validatedCompilerWorkerRequest(data)).toEqual(data);
    }
    expect(validatedCompilerWorkerRequest({
      id: 1, workspace, mode: 'run', stdin: 'नमस्ते\n',
    })).not.toBeNull();
    for (const mode of ['definition', 'references']) {
      const data = { id: 1, workspace, mode, path: 'main.srp', offset: 4 };
      expect(validatedCompilerWorkerRequest(data)).toEqual(data);
    }
    const rename = {
      id: 1, workspace, mode: 'rename', path: 'lib/math.srp',
      offset: 9, new_name: 'new_answer',
    };
    expect(validatedCompilerWorkerRequest(rename)).toEqual(rename);
  });

  it('rejects unknown operation modes rather than falling back to program execution', () => {
    const malicious = { id: 1, workspace, mode: 'unknown', stdin: 'hello' };
    expect(validatedCompilerWorkerRequest(malicious)).toBeNull();
    expect(rejectedCompilerWorkerRequest(malicious)).toEqual({
      id: 1, result: {
        ok: false, stdout: '', stderr: '',
        error: 'Invalid Scarp compiler worker request.',
      },
    });
  });

  it('rejects malformed Unicode input, workspace and navigation envelopes before WASM', () => {
    const invalid: unknown[] = [
      null, {}, { id: 2, workspace, mode: 'run' },
      { id: 1, workspace: null, mode: 'run' },
      { id: 1, workspace: { entry: 'main.srp', files: { 'main.srp': 42 } }, mode: 'run' },
      { id: 1, workspace, mode: 'run', stdin: 42 },
      { id: 1, workspace, mode: 'run', stdin: '😀'.repeat(5000) },
      { id: 1, workspace, mode: 'check', stdin: '' },
      { id: 1, workspace, mode: 'verify', stdin: 'leak' },
      { id: 1, workspace, mode: 'definition', path: '../../main.srp', offset: 1 },
      { id: 1, workspace, mode: 'definition', path: 'main.srp', offset: -1 },
      { id: 1, workspace, mode: 'references', path: 'main.srp', offset: 2.5 },
      { id: 1, workspace, mode: 'references', path: 'main.srp', offset: 100000 },
      { id: 1, workspace, mode: 'definition', path: 'absent.srp', offset: 0 },
      { id: 1, workspace, mode: 'rename', path: 'main.srp', offset: 2, new_name: 'a.b' },
      { id: 1, workspace, mode: 'rename', path: 'main.srp', offset: 2, new_name: '' },
      { id: 1, workspace, mode: 'references', path: 'main.srp', offset: 2, stdin: 'unexpected' },
    ];
    for (const request of invalid) {
      expect(validatedCompilerWorkerRequest(request)).toBeNull();
    }
  });

  it('returns a shape-correct rejection for each navigation action', () => {
    for (const mode of ['definition', 'references', 'rename'] as const) {
      const reply = rejectedCompilerWorkerRequest({ id: 1, mode, workspace: {} });
      expect(reply).toMatchObject({
        id: 1,
        [mode === 'definition' ? 'definition' : mode === 'references' ? 'references' : 'rename']:
          { ok: false, error: expect.stringMatching(/Invalid Scarp compiler worker request/) },
      });
    }
    expect(rejectedCompilerWorkerRequest({ id: 2, mode: 'run' })).toBeNull();
    expect(rejectedCompilerWorkerRequest(null)).toBeNull();
  });

  it('rejects renames outside the actual source byte range', () => {
    const utf8 = { entry: 'main.srp', files: { 'main.srp': 'print("😀");' } };
    const byteLen = new TextEncoder().encode(utf8.files['main.srp']).byteLength;
    expect(validatedCompilerWorkerRequest({
      id: 1, workspace: utf8, mode: 'rename', path: 'main.srp',
      offset: byteLen, new_name: 'valid',
    })).toBeNull();
    expect(validatedCompilerWorkerRequest({
      id: 1, workspace: utf8, mode: 'definition', path: 'main.srp',
      offset: byteLen,
    })).not.toBeNull();
  });
});
