import { describe, expect, it } from 'vitest';
import {
  initialReferenceIndex, referenceDecorationsForFile, stepReferenceIndex,
} from '../src/navigation/reference-view';
import type { ReferenceSite } from '../src/navigation/references';

const sites: ReferenceSite[] = [
  { path: 'math.srp', start: { line: 1, column: 17 },
    end: { line: 1, column: 22 }, kind: 'declaration' },
  { path: 'main.srp', start: { line: 2, column: 13 },
    end: { line: 2, column: 18 }, kind: 'call' },
  { path: 'math.srp', start: { line: 1, column: 38 },
    end: { line: 1, column: 43 }, kind: 'read' },
];

describe('compiler reference editor presentation', () => {
  it('highlights only the active file, with the selected result distinguished', () => {
    const decorations = referenceDecorationsForFile(sites, 'math.srp',
      '012345678901234567890123456789012345678901234567890', 2);
    expect(decorations).toHaveLength(2);
    expect(decorations.map(x => x.active)).toEqual([false, true]);
    expect(decorations.map(x => x.kind)).toEqual(['declaration', 'read']);
    expect(referenceDecorationsForFile(sites, 'missing.srp', 'twice', 0)).toEqual([]);
    expect(referenceDecorationsForFile(null, 'main.srp', '', 0)).toEqual([]);
  });

  it('honours Unicode scalar columns while Monaco uses UTF-16', () => {
    const unicodeSite: ReferenceSite = {
      path: 'main.srp',
      start: { line: 1, column: 9 }, end: { line: 1, column: 13 }, kind: 'read',
    };
    const source = 'print("😀"); name;';
    const decorations = referenceDecorationsForFile([unicodeSite], 'main.srp', source, 0);
    // Unicode scalar #9 is the ' closing string' location and maps past emoji.
    expect(decorations[0].range.startColumn).toBe(10);
    expect(decorations[0].range.endColumn).toBe(14);
  });

  it('never decorates malformed or zero-width compiler locations', () => {
    expect(referenceDecorationsForFile([
      { path: 'main.srp', start: { line: 99, column: 1 },
        end: { line: 99, column: 4 }, kind: 'read' },
      { path: 'main.srp', start: { line: 1, column: 2 },
        end: { line: 1, column: 2 }, kind: 'read' },
    ], 'main.srp', 'hello', 0)).toEqual([]);
  });

  it('selects the reference actually under the cursor, not the first declaration', () => {
    expect(initialReferenceIndex(sites, 'main.srp', 'first line\nprint(math.twice(4));',
      2, 15)).toBe(1);
    expect(initialReferenceIndex(sites, 'main.srp', 'first line\nprint(math.twice(4));',
      2, 2)).toBe(0);
    expect(initialReferenceIndex([], 'main.srp', '', 1, 1)).toBe(-1);
  });

  it('cycles backwards and forwards without crossing list bounds', () => {
    expect(stepReferenceIndex(0, 3, -1)).toBe(2);
    expect(stepReferenceIndex(2, 3, 1)).toBe(0);
    expect(stepReferenceIndex(1, 3, 1)).toBe(2);
    expect(stepReferenceIndex(0, 0, 1)).toBe(-1);
    expect(stepReferenceIndex(999, 3, 1)).toBe(1);
  });
});
