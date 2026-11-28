import { describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_BOOKMARKS, MAX_BOOKMARK_LABEL_BYTES, MAX_NAVIGATION_TRAIL,
  emptySourceTrail, validSourcePoint, validatedBookmarks,
  addSourceBookmark, renameSourceBookmark, deleteSourceBookmark, moveSourceBookmark,
  pruneSourceBookmarks, visitSourcePoint, stepSourceTrail, pruneSourceTrail,
  type SourcePoint, type SourceBookmark, type SourceTrail,
} from '../src/source-navigation';
import type { Workspace } from '../src/workspace';

const workspace: Workspace = {
  entry: 'main.srp',
  files: {
    'main.srp': 'bind answer = 42;\nprint(answer);\n',
    'src/other.srp': 'pub bind value = "😀";\n',
  },
};
const point = (path = 'main.srp', line = 1, column = 1): SourcePoint => ({ path, line, column });
const bookmark = (id: number, location: SourcePoint, label = 'Mark ' + id): SourceBookmark =>
  ({ id, point: location, label });

describe('source positions and session-only bookmarks', () => {
  it('accepts exact virtual file positions, including the blank terminal line', () => {
    expect(validSourcePoint(workspace, point())).toBe(true);
    expect(validSourcePoint(workspace, point('main.srp', 3, 1))).toBe(true);
    expect(validSourcePoint(workspace, point('src/other.srp', 1, 1))).toBe(true);
  });

  it('rejects absent files, traversal paths, impossible coordinates and nonintegers', () => {
    const invalid = [
      point('../../secret.srp'), point('absent.srp'),
      point('main.srp', 0, 1), point('main.srp', 4, 1),
      point('main.srp', 1, 500), point('main.srp', 1, 0),
      point('main.srp', 1.5, 1), point('main.srp', 2, -2),
      point('main.srp', NaN, 1), point('main.srp', 1, Infinity),
      null, {}, { path: 4, line: 1, column: 1 },
    ];
    for (const candidate of invalid) {
      expect(validSourcePoint(workspace, candidate)).toBe(false);
    }
  });

  it('rejects editor positions splitting an emoji surrogate pair', () => {
    const source = workspace.files['src/other.srp'];
    const index = source.indexOf('😀');
    expect(index).toBeGreaterThan(0);
    expect(validSourcePoint(workspace, point('src/other.srp', 1, index + 1))).toBe(true);
    expect(validSourcePoint(workspace, point('src/other.srp', 1, index + 2))).toBe(false);
    expect(validSourcePoint(workspace, point('src/other.srp', 1, index + 3))).toBe(true);
  });

  it('adds a validated detached bookmark without mutating its source', () => {
    const first = addSourceBookmark(workspace, [], point('main.srp', 2, 5), 'Output');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.bookmarks).toEqual([bookmark(1, point('main.srp', 2, 5), 'Output')]);
    expect(first.bookmark).toEqual(first.bookmarks[0]);
    expect(first.bookmarks[0].point).not.toBe(workspace);
  });

  it('assigns a default local label and a stable sequence identifier', () => {
    const first = addSourceBookmark(workspace, [], point());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.bookmark?.label).toBe('main.srp:1');
    const second = addSourceBookmark(workspace, first.bookmarks, point('main.srp', 2, 1));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.bookmark?.id).toBe(2);
  });

  it('refuses the same source point twice even with a different label', () => {
    const existing = [bookmark(9, point(), 'First')];
    expect(addSourceBookmark(workspace, existing, point(), 'Duplicate')).toEqual({
      ok: false, error: expect.stringContaining('already exists'),
    });
  });

  it('accepts Unicode labels within UTF-8 budget', () => {
    const result = addSourceBookmark(workspace, [], point(), 'मुख्य फ़ंक्शन');
    expect(result.ok).toBe(true);
    const max = '😀'.repeat(MAX_BOOKMARK_LABEL_BYTES / 4);
    expect(addSourceBookmark(workspace, [], point(), max).ok).toBe(true);
    expect(addSourceBookmark(workspace, [], point(), max + 'x').ok).toBe(false);
  });

  it('refuses empty, multiline, hidden-control and trailing-space labels', () => {
    for (const label of ['', ' ', ' a', 'a ', '\n', 'hello\nworld', 'a\tb', '\u0000']) {
      expect(addSourceBookmark(workspace, [], point(), label).ok).toBe(false);
    }
  });

  it('rejects overflowing bookmark collections', () => {
    const largeWorkspace: Workspace = {
      entry: 'main.srp', files: { 'main.srp': 'x'.repeat(1000) + '\n' },
    };
    const current = Array.from({ length: MAX_SOURCE_BOOKMARKS }, (_, index) =>
      bookmark(index + 1, point('main.srp', 1, index + 1)));
    expect(validatedBookmarks(largeWorkspace, current)).not.toBeNull();
    const additional = addSourceBookmark(largeWorkspace, current, point('main.srp', 2, 1));
    expect(additional.ok).toBe(false);
    expect(validatedBookmarks(largeWorkspace, [...current, bookmark(99, point('main.srp', 2, 1))])).toBeNull();
  });

  it('renames only the chosen bookmark and preserves order and identifiers', () => {
    const current = [bookmark(1, point(), 'A'),
      bookmark(3, point('main.srp', 2, 1), 'B')];
    const changed = renameSourceBookmark(workspace, current, 3, 'New label');
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.bookmarks.map(x => x.id)).toEqual([1, 3]);
    expect(changed.bookmarks.map(x => x.label)).toEqual(['A', 'New label']);
    expect(current[1].label).toBe('B');
  });

  it('cannot rename a missing bookmark or use an invalid label', () => {
    const current = [bookmark(1, point())];
    expect(renameSourceBookmark(workspace, current, 2, 'New').ok).toBe(false);
    expect(renameSourceBookmark(workspace, current, 1, '  ').ok).toBe(false);
  });

  it('deletes exactly one item and does not modify the original array', () => {
    const current = [bookmark(1, point()),
      bookmark(2, point('main.srp', 2, 1))];
    const result = deleteSourceBookmark(workspace, current, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bookmarks).toEqual([current[1]]);
    expect(current).toHaveLength(2);
    expect(deleteSourceBookmark(workspace, current, 500).ok).toBe(false);
  });

  it('moves bookmarks to neighboring positions while preserving identity', () => {
    const current = [bookmark(1, point('main.srp', 1, 1)),
      bookmark(2, point('main.srp', 1, 2)),
      bookmark(3, point('main.srp', 1, 3))];
    const up = moveSourceBookmark(workspace, current, 3, -1);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.bookmarks.map(x => x.id)).toEqual([1, 3, 2]);
    expect(moveSourceBookmark(workspace, up.bookmarks, 3, 1).ok).toBe(true);
    expect(moveSourceBookmark(workspace, current, 1, -1).ok).toBe(false);
    expect(moveSourceBookmark(workspace, current, 3, 1).ok).toBe(false);
  });

  it('rejects malformed and duplicate bookmark identifiers and locations', () => {
    const first = bookmark(1, point());
    for (const input of [
      [first, { ...first, id: 1, point: point('main.srp', 2, 1) }],
      [first, { ...first, id: 2 }],
      [{ ...first, id: -1 }],
      [{ ...first, id: 1.5 }],
      [{ ...first, label: '' }],
      [{ ...first, point: point('unavailable.srp') }],
      'not a collection', null, {}, [{ code: 9 }],
    ]) {
      expect(validatedBookmarks(workspace, input)).toBeNull();
    }
  });

  it('projects source-free bookmark records rather than accepting arbitrary nested fields', () => {
    const data = { ...bookmark(3, point()), source: 'SECRET', point: { ...point(), extra: 'SECRET' } };
    const accepted = validatedBookmarks(workspace, [data])!;
    expect(accepted).toEqual([bookmark(3, point())]);
    expect(JSON.stringify(accepted)).not.toContain('SECRET');
  });

  it('prunes deleted files and invalid line/column positions', () => {
    const current = [
      bookmark(1, point('main.srp', 1, 1)),
      bookmark(2, point('src/other.srp', 1, 1)),
    ];
    const next: Workspace = { entry: 'main.srp', files: { 'main.srp': 'x\n' } };
    expect(pruneSourceBookmarks(next, current)).toEqual([current[0]]);
    const shorter: Workspace = { entry: 'main.srp', files: { 'main.srp': 'x' } };
    expect(pruneSourceBookmarks(shorter, [bookmark(1, point('main.srp', 3, 1))])).toEqual([]);
  });

  it('does not mutate bookmarks or source files while pruning', () => {
    const original = [bookmark(1, point())];
    const before = JSON.stringify(workspace);
    const result = pruneSourceBookmarks(workspace, original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result[0].point).not.toBe(original[0].point);
    expect(JSON.stringify(workspace)).toBe(before);
  });
});

describe('bounded back/forward source navigation trail', () => {
  it('initializes with a source-free empty trail', () => {
    expect(emptySourceTrail()).toEqual({ back: [], current: null, forward: [] });
  });

  it('records an explicit jump from one cursor location to another', () => {
    const from = point('main.srp', 1, 6);
    const to = point('main.srp', 2, 1);
    const result = visitSourcePoint(workspace, emptySourceTrail(), from, to);
    expect(result).toEqual({
      back: [from], current: to, forward: [],
    });
  });

  it('does not create a redundant step when a jump targets the current position', () => {
    const original = emptySourceTrail();
    const result = visitSourcePoint(workspace, original, point(), point());
    expect(result.back).toEqual([]);
    expect(result.current).toEqual(point());
  });

  it('can navigate back and then forward, preserving the true departure cursor', () => {
    const a = point('main.srp', 1, 1);
    const b = point('src/other.srp', 1, 1);
    const initial = visitSourcePoint(workspace, emptySourceTrail(), a, b);
    const back = stepSourceTrail(workspace, initial, b, -1);
    expect(back?.point).toEqual(a);
    expect(back?.trail).toEqual({
      back: [], current: a, forward: [b],
    });
    const forward = stepSourceTrail(workspace, back!.trail, a, 1);
    expect(forward?.point).toEqual(b);
    expect(forward?.trail).toEqual(initial);
  });

  it('records actual cursor positions when navigating back from a moved cursor', () => {
    const a = point('main.srp', 1, 1);
    const b = point('main.srp', 2, 1);
    const moved = point('main.srp', 2, 4);
    const initial = visitSourcePoint(workspace, emptySourceTrail(), a, b);
    const back = stepSourceTrail(workspace, initial, moved, -1);
    expect(back?.point).toEqual(a);
    expect(back?.trail.forward[0]).toEqual(moved);
  });

  it('clears forward history after a new jump', () => {
    const a = point();
    const b = point('main.srp', 1, 4);
    const c = point('main.srp', 2, 1);
    const original = visitSourcePoint(workspace, emptySourceTrail(), a, b);
    const back = stepSourceTrail(workspace, original, b, -1)!;
    const branched = visitSourcePoint(workspace, back.trail, a, c);
    expect(branched.forward).toEqual([]);
    expect(branched.current).toEqual(c);
  });

  it('deduplicates repeated departure positions', () => {
    const a = point();
    const b = point('main.srp', 1, 2);
    const c = point('main.srp', 1, 3);
    const once = visitSourcePoint(workspace, emptySourceTrail(), a, b);
    const twice = visitSourcePoint(workspace, once, a, c);
    expect(twice.back).toEqual([a]);
  });

  it('bounds historic positions after many jumps', () => {
    const largeWorkspace: Workspace = {
      entry: 'main.srp',
      files: { 'main.srp': 'x'.repeat(1000) + '\n' },
    };
    let trail = emptySourceTrail();
    for (let i = 1; i < MAX_NAVIGATION_TRAIL + 30; i++) {
      trail = visitSourcePoint(
        largeWorkspace, trail, point('main.srp', 1, i), point('main.srp', 1, i + 1),
      );
    }
    expect(trail.back).toHaveLength(MAX_NAVIGATION_TRAIL);
  });

  it('refuses invalid targets instead of adding untrusted paths', () => {
    const original = visitSourcePoint(workspace, emptySourceTrail(),
      point(), point('main.srp', 2, 1));
    const result = visitSourcePoint(workspace, original, point(), point('../../escape.srp'));
    expect(result).toEqual(original);
  });

  it('returns no step when back or forward history is empty', () => {
    expect(stepSourceTrail(workspace, emptySourceTrail(), point(), -1)).toBeNull();
    expect(stepSourceTrail(workspace, emptySourceTrail(), point(), 1)).toBeNull();
  });

  it('skips duplicate targets rather than trapping back navigation on the same line', () => {
    const a = point('main.srp', 1, 1);
    const b = point('main.srp', 1, 4);
    const trail: SourceTrail = { back: [a, b], current: b, forward: [] };
    const step = stepSourceTrail(workspace, trail, b, -1);
    expect(step?.point).toEqual(a);
    expect(step?.trail.back).toEqual([]);
  });

  it('prunes no-longer-valid locations without snapping to other symbols', () => {
    const original: SourceTrail = {
      back: [point(), point('main.srp', 2, 4)],
      current: point('src/other.srp'),
      forward: [point('src/other.srp', 1, 15)],
    };
    const next: Workspace = { entry: 'main.srp', files: { 'main.srp': 'x\n' } };
    const result = pruneSourceTrail(next, original);
    expect(result.back).toEqual([point()]);
    expect(result.current).toBeNull();
    expect(result.forward).toEqual([]);
    expect(original.back).toHaveLength(2);
  });

  it('does not admit more history than the configured capacity', () => {
    const long: SourceTrail = {
      back: Array.from({ length: 200 }, (_, i) => point('main.srp', 1, (i % 10) + 1)),
      current: point(),
      forward: Array.from({ length: 200 }, (_, i) => point('main.srp', 2, (i % 10) + 1)),
    };
    const result = pruneSourceTrail(workspace, long);
    expect(result.back).toHaveLength(MAX_NAVIGATION_TRAIL);
    expect(result.forward).toHaveLength(MAX_NAVIGATION_TRAIL);
  });
});
