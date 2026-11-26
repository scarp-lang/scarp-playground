import { describe, expect, it } from 'vitest';
import { decodeDefinitionReply, validatedDefinitionResult } from '../src/navigation/protocol';
import { decodeReferencesReply, validatedReferencesResult } from '../src/navigation/references';
import { validatedRenameResult, verifyRenameSnapshot } from '../src/navigation/rename';

const clean = {
  path: 'main.srp',
  start: { line: 1, column: 6 },
  end: { line: 1, column: 12 },
};

function pollutedRange() {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  return {
    ...clean,
    start: { ...clean.start, extra: cycle },
    end: { ...clean.end, extra: cycle },
    extra: cycle,
  };
}

describe('successful navigation response projection', () => {
  it('copies definition coordinates and discards unrecognized cyclic fields', () => {
    const input = pollutedRange();
    const result = validatedDefinitionResult({ ok: true, target: input });
    expect(result).toEqual({ ok: true, target: clean });
    expect(result.target?.start).not.toBe(input.start);
    expect(result.target?.end).not.toBe(input.end);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(decodeDefinitionReply(JSON.stringify({
      ok: true, target: { ...clean, start: { ...clean.start, extra: 'unexpected' } },
    }))).toEqual({ ok: true, target: clean });
  });

  it('copies reference declarations, sites and all nested coordinates', () => {
    const declaration = pollutedRange();
    const reference = { ...pollutedRange(), kind: 'read' };
    const input = {
      ok: true, symbol: { name: 'answer', kind: 'binding', extra: true },
      declaration, references: [reference], truncated: false,
    };
    const expected = {
      ok: true, symbol: { name: 'answer', kind: 'binding' },
      declaration: clean, references: [{ ...clean, kind: 'read' }], truncated: false,
    };
    const result = validatedReferencesResult(input);
    expect(result).toEqual(expected);
    if (!result.ok) throw new Error('Expected valid references');
    expect(result.declaration).not.toBe(declaration);
    expect(result.references[0].start).not.toBe(reference.start);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(decodeReferencesReply(JSON.stringify({
      ...expected, declaration: { ...clean, extra: 'unexpected' },
    }))).toEqual(expected);
  });

  it('copies rename paths and source maps and refuses sparse path arrays', () => {
    const source = { entry: 'main.srp', files: { 'main.srp': 'bind answer = 42;' } };
    const input = {
      ok: true, old_name: 'answer', new_name: 'result', kind: 'binding',
      changes: 1, changed_files: ['main.srp'],
      edits: [{ path: 'main.srp', start: 5, end: 11 }],
      files: { 'main.srp': 'bind result = 42;' },
    };
    const decoded = validatedRenameResult(input);
    expect(decoded).toEqual(input);
    if (!decoded.ok) throw new Error('Expected valid rename');
    expect(decoded.files).not.toBe(input.files);
    expect(decoded.changed_files).not.toBe(input.changed_files);
    input.files['main.srp'] = 'changed';
    input.changed_files[0] = 'other.srp';
    expect(verifyRenameSnapshot(source, 'result', decoded).ok).toBe(true);
    expect(validatedRenameResult({
      ...decoded, changed_files: Array(1),
    }).ok).toBe(false);
    expect(validatedRenameResult({
      ...decoded, changed_files: ['main.srp', ,],
    }).ok).toBe(false);
  });
});
