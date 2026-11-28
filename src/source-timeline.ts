import {
  captureSourceCheckpoint, compareWorkspaceCheckpoint, previewCheckpointRestore,
  type SourceCheckpoint, type WorkspaceComparison, type CheckpointRestorePlan,
} from './source-checkpoint';
import { measureUtf8 } from './utf8';
import { validateWorkspace, type Workspace } from './workspace';
import { sameWorkspaceContents } from './session-safety';

export const MAX_TIMELINE_SNAPSHOTS = 8;
export const MAX_TIMELINE_SOURCE_BYTES = 512 * 1024;
export const MAX_TIMELINE_LABEL_BYTES = 80;

export type TimelineSnapshot = Readonly<{
  id: number;
  label: string;
  checkpoint: SourceCheckpoint;
  sourceBytes: number;
}>;

export type SourceTimeline = Readonly<{
  items: TimelineSnapshot[];
  nextId: number;
}>;

export type TimelineOperation =
  | { ok: true; timeline: SourceTimeline; item?: TimelineSnapshot }
  | { ok: false; error: string };

export type TimelineComparison =
  | { ok: true; base: TimelineSnapshot; comparedTo: 'current' | number;
      target: SourceCheckpoint; comparison: WorkspaceComparison }
  | { ok: false; error: string };

const fail = (error: string): TimelineOperation => ({ ok: false, error });
const encoder = new TextEncoder();

function workspaceBytes(workspace: Workspace): number {
  return Object.values(workspace.files).reduce((sum, source) => sum + encoder.encode(source).byteLength, 0);
}

function validLabel(label: unknown): label is string {
  return typeof label === 'string' && label.trim() === label &&
    label.trim().length > 0 && label.length <= MAX_TIMELINE_LABEL_BYTES &&
    !Array.from(label).some(character => {
      const cp = character.codePointAt(0)!;
      return cp < 32 || cp === 127 || (cp >= 0x202a && cp <= 0x202e) ||
        (cp >= 0x2066 && cp <= 0x2069);
    }) && measureUtf8(label, MAX_TIMELINE_LABEL_BYTES).ok;
}

export function emptySourceTimeline(): SourceTimeline {
  return { items: [], nextId: 1 };
}

/**
 * Project untrusted or stale timeline-like records onto known fields. The
 * existing per-snapshot validator rejects invalid paths, Unicode and sizes.
 * No compiler input, stdout, error or result is ever part of this schema.
 */
export function validateSourceTimeline(value: unknown): SourceTimeline | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.items) || candidate.items.length > MAX_TIMELINE_SNAPSHOTS ||
      !Number.isSafeInteger(candidate.nextId) || Number(candidate.nextId) < 1) return null;
  const nextId = candidate.nextId as number;
  let lastId = 0;
  let totalBytes = 0;
  const items: TimelineSnapshot[] = [];

  for (const raw of candidate.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    if (!Number.isSafeInteger(record.id) || Number(record.id) <= lastId ||
        Number(record.id) >= nextId || !validLabel(record.label) ||
        !record.checkpoint || typeof record.checkpoint !== 'object' ||
        Array.isArray(record.checkpoint)) return null;
    const checkpoint = record.checkpoint as Record<string, unknown>;
    if (typeof checkpoint.activeFile !== 'string' ||
        validateWorkspace(checkpoint.workspace) ||
        !Object.hasOwn((checkpoint.workspace as Workspace).files, checkpoint.activeFile)) return null;
    const workspace = checkpoint.workspace as Workspace;
    const size = workspaceBytes(workspace);
    if (size !== record.sourceBytes) return null;
    totalBytes += size;
    if (totalBytes > MAX_TIMELINE_SOURCE_BYTES) return null;
    lastId = Number(record.id);
    const snapshot = captureSourceCheckpoint(workspace, checkpoint.activeFile);
    if (!snapshot) return null;
    items.push({
      id: lastId, label: record.label, checkpoint: snapshot, sourceBytes: size,
    });
  }
  return { items, nextId };
}

export function captureTimelineSnapshot(
  timeline: SourceTimeline, workspace: Workspace, activeFile: string, label: string,
): TimelineOperation {
  const current = validateSourceTimeline(timeline);
  if (!current) return fail('The source timeline is invalid.');
  if (!validLabel(label)) return fail('Use 1–80 UTF-8 bytes for a single-line snapshot name.');
  if (current.items.length >= MAX_TIMELINE_SNAPSHOTS) {
    return fail('This tab can retain at most eight source snapshots. Remove one to continue.');
  }
  const snapshot = captureSourceCheckpoint(workspace, activeFile);
  if (!snapshot) return fail('Choose a valid source workspace and active file before capturing.');
  if (current.items.some(item =>
      item.checkpoint.activeFile === snapshot.activeFile &&
      sameWorkspaceContents(item.checkpoint.workspace, snapshot.workspace))) {
    return fail('An identical source-and-entry snapshot already exists in the timeline.');
  }
  const size = workspaceBytes(snapshot.workspace);
  const used = current.items.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (size + used > MAX_TIMELINE_SOURCE_BYTES) {
    return fail('The in-memory timeline exceeds its 512 KiB total source limit.');
  }
  if (!Number.isSafeInteger(current.nextId + 1)) {
    return fail('No more valid timeline identifiers are available.');
  }
  const item: TimelineSnapshot = {
    id: current.nextId, label, checkpoint: snapshot, sourceBytes: size,
  };
  return {
    ok: true, timeline: {
      items: [...current.items, item],
      nextId: current.nextId + 1,
    }, item,
  };
}

export function renameTimelineSnapshot(
  timeline: SourceTimeline, id: number, label: string,
): TimelineOperation {
  const valid = validateSourceTimeline(timeline);
  if (!valid) return fail('The source timeline is invalid.');
  if (!validLabel(label)) return fail('Use a safe snapshot label of at most 80 UTF-8 bytes.');
  if (!valid.items.some(item => item.id === id)) return fail('Snapshot is no longer available.');
  return {
    ok: true, timeline: {
      nextId: valid.nextId,
      items: valid.items.map(item => item.id === id ? { ...item, label } : item),
    },
  };
}

export function discardTimelineSnapshot(timeline: SourceTimeline, id: number): TimelineOperation {
  const valid = validateSourceTimeline(timeline);
  if (!valid) return fail('The source timeline is invalid.');
  if (!valid.items.some(item => item.id === id)) return fail('Snapshot is no longer available.');
  return {
    ok: true,
    timeline: { nextId: valid.nextId, items: valid.items.filter(item => item.id !== id) },
  };
}

export function clearSourceTimeline(timeline: SourceTimeline): SourceTimeline {
  const valid = validateSourceTimeline(timeline);
  return { items: [], nextId: valid?.nextId ?? 1 };
}

export function findTimelineSnapshot(timeline: SourceTimeline, id: number): TimelineSnapshot | null {
  const valid = validateSourceTimeline(timeline);
  return valid?.items.find(item => item.id === id) ?? null;
}

/**
 * Compare two explicit snapshots, or one snapshot against the live workspace.
 * The comparison only includes filenames, change states and UTF-8 byte sizes.
 */
export function compareTimelineSnapshot(
  timeline: SourceTimeline, sourceId: number, currentWorkspace: Workspace,
  to: number | 'current' = 'current',
): TimelineComparison {
  const source = findTimelineSnapshot(timeline, sourceId);
  if (!source) return { ok: false, error: 'Select an existing source timeline snapshot.' };
  const target = to === 'current'
    ? captureSourceCheckpoint(currentWorkspace, currentWorkspace.entry)
    : findTimelineSnapshot(timeline, to)?.checkpoint ?? null;
  if (!target) return { ok: false, error: 'Choose a valid comparison target.' };
  const comparison = compareWorkspaceCheckpoint(source.checkpoint, target.workspace);
  if (!comparison) return { ok: false, error: 'The snapshots cannot be compared within source limits.' };
  return {
    ok: true, base: source, comparedTo: to, target, comparison,
  };
}

export function previewTimelineRestore(
  timeline: SourceTimeline, id: number,
  workspace: Workspace, activeFile: string,
): CheckpointRestorePlan | null {
  const source = findTimelineSnapshot(timeline, id);
  if (!source) return null;
  return previewCheckpointRestore(workspace, activeFile, source.checkpoint);
}

export function timelineSummary(timeline: SourceTimeline): {
  count: number; bytes: number; capacity: number; lastId: number | null;
} | null {
  const valid = validateSourceTimeline(timeline);
  if (!valid) return null;
  return {
    count: valid.items.length,
    bytes: valid.items.reduce((sum, item) => sum + item.sourceBytes, 0),
    capacity: MAX_TIMELINE_SOURCE_BYTES,
    lastId: valid.items.at(-1)?.id ?? null,
  };
}

/** Optional source-free manifest export for audit or issue reproduction. */
export function serializeTimelineManifest(timeline: SourceTimeline): string | null {
  const valid = validateSourceTimeline(timeline);
  if (!valid) return null;
  return JSON.stringify({
    format: 'scarp-playground-source-timeline-manifest',
    version: 1,
    count: valid.items.length,
    items: valid.items.map(item => ({
      id: item.id, label: item.label, activeFile: item.checkpoint.activeFile,
      entry: item.checkpoint.workspace.entry,
      files: Object.keys(item.checkpoint.workspace.files).sort(),
      sourceBytes: item.sourceBytes,
    })),
  }, null, 2) + '\n';
}
