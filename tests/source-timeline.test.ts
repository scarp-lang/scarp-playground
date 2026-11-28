import { describe, expect, it } from 'vitest';
import {
  MAX_TIMELINE_SNAPSHOTS, MAX_TIMELINE_SOURCE_BYTES, MAX_TIMELINE_LABEL_BYTES,
  emptySourceTimeline, validateSourceTimeline, captureTimelineSnapshot,
  renameTimelineSnapshot, discardTimelineSnapshot, clearSourceTimeline,
  findTimelineSnapshot, compareTimelineSnapshot, previewTimelineRestore,
  timelineSummary, serializeTimelineManifest,
  type SourceTimeline,
} from '../src/source-timeline';
import { undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

const workspace = (source = 'print("first");\n'): Workspace => ({
  entry: 'main.srp',
  files: { 'main.srp': source, 'lib/utils.srp': 'pub bind value = 42;\n' },
});
const capture = (timeline: SourceTimeline, source = 'print("first");\n', name = 'First') =>
  captureTimelineSnapshot(timeline, workspace(source), 'main.srp', name);

describe('bounded, session-only source snapshot timeline', () => {
  it('starts with no source copies or application records', () => {
    expect(emptySourceTimeline()).toEqual({ items: [], nextId: 1 });
    expect(timelineSummary(emptySourceTimeline())).toEqual({
      count: 0, bytes: 0, capacity: MAX_TIMELINE_SOURCE_BYTES, lastId: null,
    });
    expect(serializeTimelineManifest(emptySourceTimeline())).toContain('"count": 0');
  });

  it('captures and freezes only detached source/entry/active-file state', () => {
    const original = workspace('print("hello");\r\n');
    const outcome = captureTimelineSnapshot(emptySourceTimeline(), original, 'main.srp', 'Baseline');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.timeline.items).toHaveLength(1);
    const snapshot = outcome.item!;
    expect(snapshot.id).toBe(1);
    expect(snapshot.checkpoint.workspace).toEqual(original);
    expect(snapshot.checkpoint.workspace.files).not.toBe(original.files);
    expect(Object.isFrozen(snapshot.checkpoint.workspace.files)).toBe(true);
    original.files['main.srp'] = 'print("different");\n';
    expect(snapshot.checkpoint.workspace.files['main.srp']).toBe('print("hello");\r\n');
    expect(JSON.stringify(snapshot)).not.toMatch(/stdin|stdout|error|result/);
  });

  it('allows distinct source versions and increments stable timeline IDs', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = capture(first.timeline, 'print("second");\n', 'Second');
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.timeline.items.map(item => [item.id, item.label])).toEqual([
      [1, 'First'], [2, 'Second'],
    ]);
    expect(next.timeline.nextId).toBe(3);
  });

  it('allows the same source when the selected active file is different', () => {
    const input = workspace();
    const first = captureTimelineSnapshot(emptySourceTimeline(), input, 'main.srp', 'Entry');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = captureTimelineSnapshot(first.timeline, input, 'lib/utils.srp', 'Library');
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.timeline.items).toHaveLength(2);
  });

  it('rejects exact duplicate captures instead of consuming memory capacity', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const duplicate = capture(first.timeline);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toMatch(/identical/);
    expect(first.timeline.items).toHaveLength(1);
  });

  it('refuses invalid active filenames and malformed source data', () => {
    const original = workspace();
    expect(captureTimelineSnapshot(emptySourceTimeline(), original, 'absent.srp', 'Test').ok)
      .toBe(false);
    const invalid: Workspace = { entry: 'main.srp', files: { 'main.srp': '\uD800' } };
    expect(captureTimelineSnapshot(emptySourceTimeline(), invalid, 'main.srp', 'Test').ok).toBe(false);
  });

  it('enforces human-readable, bounded UTF-8 labels', () => {
    const valid = '😀'.repeat(MAX_TIMELINE_LABEL_BYTES / 4);
    expect(capture(emptySourceTimeline(), 'print(1);', valid).ok).toBe(true);
    for (const label of [
      '', ' ', ' Leading', 'Trailing ', 'New\nline', 'a\tb',
      'a\u202Econtrol', 'a\u2066control', '\u0000',
      '😀'.repeat(MAX_TIMELINE_LABEL_BYTES / 4 + 1),
    ]) {
      expect(capture(emptySourceTimeline(), 'print(1);', label).ok).toBe(false);
    }
  });

  it('blocks a ninth source snapshot even when each one is very small', () => {
    let timeline = emptySourceTimeline();
    for (let i = 1; i <= MAX_TIMELINE_SNAPSHOTS; i++) {
      const result = capture(timeline, 'print(' + i + ');\n', 'Version ' + i);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      timeline = result.timeline;
    }
    expect(timeline.items).toHaveLength(MAX_TIMELINE_SNAPSHOTS);
    const ninth = capture(timeline, 'print(999);\n', 'Ninth');
    expect(ninth.ok).toBe(false);
    expect(timeline.items).toHaveLength(MAX_TIMELINE_SNAPSHOTS);
  });

  it('enforces the 512 KiB aggregate source-copy budget', () => {
    let timeline = emptySourceTimeline();
    const first = 'x'.repeat(64 * 1024);
    const second = 'y'.repeat(64 * 1024);
    for (let i = 0; i < 5; i++) {
      const left = String.fromCharCode(65 + i) + first.slice(1);
      const right = String.fromCharCode(70 + i) + second.slice(1);
      const input: Workspace = { entry: 'main.srp', files: {
        'main.srp': left, 'other.srp': right,
      } };
      const result = captureTimelineSnapshot(timeline, input, 'main.srp', 'Large ' + i);
      expect(result.ok).toBe(i < 4);
      if (result.ok) timeline = result.timeline;
    }
    expect(timelineSummary(timeline)?.bytes).toBe(MAX_TIMELINE_SOURCE_BYTES);
  });

  it('stores accurate UTF-8 byte usage rather than UTF-16 code-unit length', () => {
    const source = 'print("😀 हिंदी");\n';
    const result = capture(emptySourceTimeline(), source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = new TextEncoder().encode(source).byteLength +
      new TextEncoder().encode(workspace().files['lib/utils.srp']).byteLength;
    expect(result.item?.sourceBytes).toBe(expected);
    expect(timelineSummary(result.timeline)?.bytes).toBe(expected);
  });

  it('renames the selected snapshot without changing its captured content', () => {
    const initial = capture(emptySourceTimeline());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const renamed = renameTimelineSnapshot(initial.timeline, 1, 'Reviewed version');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.timeline.items[0].label).toBe('Reviewed version');
    expect(renamed.timeline.items[0].checkpoint.workspace)
      .toEqual(initial.timeline.items[0].checkpoint.workspace);
    expect(initial.timeline.items[0].label).toBe('First');
  });

  it('rejects renaming missing IDs or invalid labels', () => {
    const initial = capture(emptySourceTimeline());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(renameTimelineSnapshot(initial.timeline, 2, 'Missing').ok).toBe(false);
    expect(renameTimelineSnapshot(initial.timeline, 1, ' Bad ').ok).toBe(false);
  });

  it('discards one selected snapshot without reusing old identifiers', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = capture(first.timeline, 'print(2);', 'Second');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const removed = discardTimelineSnapshot(second.timeline, 1);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.timeline.items.map(item => item.id)).toEqual([2]);
    const third = capture(removed.timeline, 'print(3);', 'Third');
    expect(third.ok).toBe(true);
    if (third.ok) expect(third.item?.id).toBe(3);
  });

  it('clear removes all retained sources but maintains monotonic IDs', () => {
    const original = capture(emptySourceTimeline());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(clearSourceTimeline(original.timeline)).toEqual({ items: [], nextId: 2 });
    expect(findTimelineSnapshot(original.timeline, 999)).toBeNull();
  });

  it('refuses deleting a missing snapshot without modifying the current timeline', () => {
    const original = capture(emptySourceTimeline());
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(discardTimelineSnapshot(original.timeline, 999).ok).toBe(false);
    expect(original.timeline.items).toHaveLength(1);
  });

  it('compares a snapshot to current source with exact file statuses', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const current = workspace('print("changed");\n');
    const result = compareTimelineSnapshot(first.timeline, 1, current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparedTo).toBe('current');
    expect(result.comparison.changed).toBe(1);
    expect(result.comparison.files.find(file => file.path === 'main.srp')?.status)
      .toBe('modified');
  });

  it('compares two named snapshots without requiring the current source to match either', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = capture(first.timeline, 'print(2);', 'Second');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const result = compareTimelineSnapshot(second.timeline, 1, workspace('print(99);'), 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.comparedTo).toBe(2);
      expect(result.target.workspace.files['main.srp']).toBe('print(2);');
    }
  });

  it('detects entrypoint changes even with no source-content changes', () => {
    const input = workspace();
    const saved = captureTimelineSnapshot(emptySourceTimeline(), input, 'main.srp', 'First');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const current = { ...input, entry: 'lib/utils.srp' };
    const result = compareTimelineSnapshot(saved.timeline, 1, current);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.comparison.changed).toBe(0);
      expect(result.comparison.entryAfter).toBe('lib/utils.srp');
    }
  });

  it('rejects absent comparison targets or invalid current workspaces', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(compareTimelineSnapshot(first.timeline, 99, workspace()).ok).toBe(false);
    expect(compareTimelineSnapshot(first.timeline, 1, workspace(), 99).ok).toBe(false);
    expect(compareTimelineSnapshot(first.timeline, 1,
      { entry: 'missing.srp', files: {} }).ok).toBe(false);
  });

  it('restores a complete source-only snapshot and creates one-use bulk undo', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const current = workspace('print("current");\n');
    const plan = previewTimelineRestore(first.timeline, 1, current, 'main.srp')!;
    expect(plan.workspace.files['main.srp']).toBe('print("first");\n');
    expect(plan.undo.label).toBe('checkpoint restore');
    expect(undoBulkEdit(plan.workspace, plan.undo)).toBe(current);
    expect(undoBulkEdit({ ...plan.workspace }, plan.undo)).toBeNull();
  });

  it('refuses a no-op restore or unavailable snapshot', () => {
    const initial = workspace();
    const first = captureTimelineSnapshot(emptySourceTimeline(), initial, 'main.srp', 'First');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(previewTimelineRestore(first.timeline, 1, initial, 'main.srp')).toBeNull();
    expect(previewTimelineRestore(first.timeline, 55, initial, 'main.srp')).toBeNull();
  });

  it('rejects duplicate, out-of-order, oversized and forged timeline records', () => {
    const first = capture(emptySourceTimeline());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const one = first.timeline.items[0];
    const bad: unknown[] = [
      null, {}, { items: [], nextId: 0 }, { items: [one], nextId: 1 },
      { items: [one, one], nextId: 3 },
      { items: [{ ...one, id: -1 }], nextId: 3 },
      { items: [{ ...one, label: '\n' }], nextId: 3 },
      { items: [{ ...one, sourceBytes: 999 }], nextId: 3 },
      { items: [{ ...one, checkpoint: { activeFile: 'missing.srp', workspace: workspace() } }], nextId: 3 },
      { items: [null], nextId: 3 },
      { items: Array.from({ length: MAX_TIMELINE_SNAPSHOTS + 1 }, () => one), nextId: 10 },
    ];
    for (const entry of bad) expect(validateSourceTimeline(entry)).toBeNull();
  });

  it('projects only allowed snapshot fields and strips source-bearing extras', () => {
    const one = capture(emptySourceTimeline());
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const forged = {
      ...one.timeline, stdin: 'secret',
      items: [{ ...one.item, stdout: 'secret', checkpoint: {
        ...one.item!.checkpoint, stderr: 'secret', workspace: {
          ...one.item!.checkpoint.workspace, programInput: 'secret',
        },
      } }],
    };
    const validated = validateSourceTimeline(forged)!;
    expect(JSON.stringify(validated)).not.toMatch(/stdin|stdout|stderr|programInput|secret/);
    expect(validated.items).toHaveLength(1);
  });

  it('never includes source code in the metadata-only exported manifest', () => {
    const first = capture(emptySourceTimeline(), 'print("SECRET_RESEARCH");\n', 'Reviewed');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const text = serializeTimelineManifest(first.timeline)!;
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('scarp-playground-source-timeline-manifest');
    expect(parsed.version).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].files).toEqual(['lib/utils.srp', 'main.srp']);
    expect(text).not.toContain('SECRET_RESEARCH');
    expect(text).not.toContain('print(');
    expect(text).not.toContain('stdout');
  });

  it('does not silently trim labels inside the core state schema', () => {
    const original = capture(emptySourceTimeline(), 'print(1);', ' precise ');
    expect(original.ok).toBe(false);
  });
});
