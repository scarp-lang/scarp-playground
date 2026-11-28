import { describe, expect, it } from 'vitest';
import { decodeOutlineReply, locateOutline, validatedOutlineResult, type OutlineResult } from '../src/navigation/outline-protocol';
import { validatedCompilerWorkerRequest, rejectedCompilerWorkerRequest } from '../src/runner/request';

const source = '// 😀\r\nbind value = 1;\rvar second = 2;\n';
const workspace = { entry: 'main.srp', files: { 'main.srp': source } };
const encoder = new TextEncoder();
function token(name: string, kind: 'bind' | 'var') {
  const index = source.indexOf(name);
  const start = encoder.encode(source.slice(0, index)).length;
  return { name, kind, start, end: start + name.length, depth: 0, public: false };
}
const result = { ok: true as const, path: 'main.srp', entries: [token('value', 'bind'), token('second', 'var')], truncated: false };

describe('source outline response boundary', () => {
  it('detaches entries and projects only supported fields', () => {
    const original = { ...result, extra: 'ignored', entries: result.entries.map(entry => ({ ...entry, extra: 'ignored' })) };
    expect(validatedOutlineResult(original)).toEqual(result);
    expect(decodeOutlineReply(JSON.stringify(original))).toEqual(result);
    const validated = validatedOutlineResult(original);
    if (validated.ok) expect(validated.entries[0]).not.toBe(original.entries[0]);
  });

  it('rejects malformed, overlapping, oversized, sparse and unsupported entries', () => {
    for (const value of [
      null, { ...result, path: '../main.srp' }, { ...result, truncated: 1 },
      { ...result, entries: Array(1) }, { ...result, entries: Array(257).fill(result.entries[0]) },
      { ...result, entries: [...result.entries].reverse() },
      { ...result, entries: [{ ...result.entries[0], name: 'different' }] },
      { ...result, entries: [{ ...result.entries[0], start: -1 }] },
      { ...result, entries: [{ ...result.entries[0], depth: 66 }] },
      { ...result, entries: [{ ...result.entries[0], kind: 'unknown' }] },
      { ...result, entries: [{ ...result.entries[0], public: 'yes' }] },
    ]) expect(validatedOutlineResult(value).ok).toBe(false);
    expect(decodeOutlineReply('x'.repeat(256 * 1024 + 1)).ok).toBe(false);
  });

  it('validates real byte ownership and converts CRLF, CR and astral scalars', () => {
    const located = locateOutline(result, 'main.srp', source);
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(located.entries.map(entry => [entry.line, entry.column])).toEqual([[2, 6], [3, 5]]);
    expect(locateOutline(result, 'other.srp', source).ok).toBe(false);
    expect(locateOutline(result, 'main.srp', source.replace('value', 'other')).ok).toBe(false);
    const sameLine = 'print("😀"); bind name = 1;';
    const start = encoder.encode(sameLine.slice(0, sameLine.indexOf('name'))).length;
    const exact: OutlineResult = { ok: true, path: 'main.srp', truncated: false, entries: [
      { name: 'name', kind: 'bind', start, end: start + 4, depth: 0, public: false },
    ] };
    const position = locateOutline(exact, 'main.srp', sameLine);
    if (position.ok) expect(position.entries[0].column).toBe(sameLine.indexOf('name') + 1);
    else throw new Error(position.error);
    expect(locateOutline({ ...exact, entries: [{ ...exact.entries[0], start: 8, end: 12 }] }, 'main.srp', sameLine).ok).toBe(false);
  });

  it('retains parser error code only in a bounded failure envelope', () => {
    expect(validatedOutlineResult({ ok: false, error: 'error[E0085]', code: 'E0085', extra: 1 }))
      .toEqual({ ok: false, error: 'error[E0085]', code: 'E0085' });
    expect(validatedOutlineResult({ ok: false, error: 'error', code: 'invented' }).ok).toBe(false);
  });
});

describe('outline Worker admission', () => {
  it('accepts only source inspection with an existing file and no runtime or rename fields', () => {
    const request = { id: 1, mode: 'outline', workspace, path: 'main.srp' };
    expect(validatedCompilerWorkerRequest(request)).toEqual(request);
    for (const extra of [{ stdin: '' }, { allowPrompts: false }, { offset: 0 }, { new_name: 'x' }, { path: 'missing.srp' }]) {
      expect(validatedCompilerWorkerRequest({ ...request, ...extra })).toBeNull();
    }
    expect(rejectedCompilerWorkerRequest(request)).toMatchObject({ id: 1, outline: { ok: false } });
  });
});
