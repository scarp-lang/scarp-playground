import type { BrowserRunMode, BrowserRunStats } from './runner/browser-stats';
import type { RunResult } from './runner/types';

export const MAX_RUN_HISTORY = 60;
export const RUN_HISTORY_EXPORT_FORMAT = 'scarp-playground-run-history';
export const RUN_HISTORY_EXPORT_VERSION = 1;
const MAX_HISTORY_ELAPSED_MS = 60_000;
const MAX_HISTORY_OUTPUT_BYTES = 1024 * 1024;

export type RunOutcome = 'success' | 'diagnostic' | 'error' | 'timeout' | 'cancelled';
export type RunHistoryEntry = Readonly<{
  sequence: number;
  mode: BrowserRunMode;
  outcome: RunOutcome;
  elapsedMs: number;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  diagnosticCode: string | null;
}>;

export type RunHistoryFilter =
  | { mode: BrowserRunMode | 'all'; outcome: RunOutcome | 'all' };

export type RunHistorySummary = Readonly<{
  count: number;
  succeeded: number;
  failed: number;
  p50Ms: number | null;
  p90Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
  averageMs: number | null;
  totalOutputBytes: number;
}>;

export type RunHistoryComparison = Readonly<{
  current: RunHistoryEntry;
  previous: RunHistoryEntry | null;
  changeMs: number | null;
  percentChange: number | null;
}>;

const MODES: BrowserRunMode[] = ['run', 'check', 'verify'];
const OUTCOMES: RunOutcome[] = ['success', 'diagnostic', 'error', 'timeout', 'cancelled'];

function validEntry(value: unknown): value is RunHistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Partial<RunHistoryEntry>;
  return typeof item.sequence === 'number' && Number.isSafeInteger(item.sequence) && item.sequence > 0 &&
    typeof item.mode === 'string' && MODES.includes(item.mode as BrowserRunMode) &&
    typeof item.outcome === 'string' && OUTCOMES.includes(item.outcome as RunOutcome) &&
    typeof item.elapsedMs === 'number' && Number.isFinite(item.elapsedMs) &&
    item.elapsedMs >= 0 && item.elapsedMs <= MAX_HISTORY_ELAPSED_MS &&
    (item.stdoutBytes === null || isValidByteCount(item.stdoutBytes)) &&
    (item.stderrBytes === null || isValidByteCount(item.stderrBytes)) &&
    ((item.stdoutBytes === null && item.stderrBytes === null) ||
      (isValidByteCount(item.stdoutBytes) && isValidByteCount(item.stderrBytes))) &&
    (item.diagnosticCode === null ||
      (typeof item.diagnosticCode === 'string' && /^E[0-9]{4}$/.test(item.diagnosticCode))) &&
    ((item.stdoutBytes ?? 0) + (item.stderrBytes ?? 0) <= MAX_HISTORY_OUTPUT_BYTES);
}

function isValidByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_HISTORY_OUTPUT_BYTES;
}

function outcomeOf(result: RunResult): RunOutcome {
  if (result.ok) return 'success';
  if (result.diagnostic?.code) return 'diagnostic';
  const error = result.error ?? '';
  if (/cancelled/i.test(error)) return 'cancelled';
  if (/exceeded the .*browser limit|timed out|timeout/i.test(error)) return 'timeout';
  return 'error';
}

/**
 * Return a standalone metadata-only entry. The compiler result is inspected,
 * never stored. Do not record stderr, stdout, source, stdin, help or messages.
 */
export function makeRunHistoryEntry(
  sequence: number, mode: BrowserRunMode, result: RunResult,
  stats: BrowserRunStats | null,
): RunHistoryEntry | null {
  if (!Number.isSafeInteger(sequence) || sequence < 1 ||
      !MODES.includes(mode) || !stats || stats.mode !== mode ||
      !Number.isFinite(stats.elapsedMs) || stats.elapsedMs < 0 ||
      stats.elapsedMs > MAX_HISTORY_ELAPSED_MS) return null;
  const output = mode === 'run' && result.ok ? stats.output : null;
  const stdoutBytes = output?.stdoutBytes ?? null;
  const stderrBytes = output?.stderrBytes ?? null;
  const code = result.ok ? null : result.diagnostic?.code ?? null;
  const entry: RunHistoryEntry = {
    sequence, mode, outcome: outcomeOf(result), elapsedMs: stats.elapsedMs,
    stdoutBytes, stderrBytes,
    diagnosticCode: code && /^E[0-9]{4}$/.test(code) ? code : null,
  };
  return validEntry(entry) ? entry : null;
}

/** The caller owns the array. Never mutate an entry or retain the result. */
export function appendRunHistory(
  previous: readonly RunHistoryEntry[],
  mode: BrowserRunMode, result: RunResult, stats: BrowserRunStats | null,
): RunHistoryEntry[] {
  const valid = validateRunHistory(previous) ?? [];
  const last = valid.at(-1);
  const sequence = last ? last.sequence + 1 : 1;
  if (!Number.isSafeInteger(sequence)) return valid;
  const entry = makeRunHistoryEntry(sequence, mode, result, stats);
  if (!entry) return valid;
  const entries = [...valid, entry];
  return entries.slice(Math.max(0, entries.length - MAX_RUN_HISTORY));
}

/**
 * Validate a metadata history before filtering, exporting or summarizing it.
 * Reject duplicate/reordered sequences and caller-provided arbitrary fields.
 */
export function validateRunHistory(value: unknown): RunHistoryEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_RUN_HISTORY) return null;
  const entries: RunHistoryEntry[] = [];
  let previous = 0;
  for (const raw of value) {
    if (!validEntry(raw) || raw.sequence <= previous) return null;
    previous = raw.sequence;
    entries.push({
      sequence: raw.sequence, mode: raw.mode, outcome: raw.outcome,
      elapsedMs: raw.elapsedMs,
      stdoutBytes: raw.stdoutBytes, stderrBytes: raw.stderrBytes,
      diagnosticCode: raw.diagnosticCode,
    });
  }
  return entries;
}

export function filterRunHistory(
  entries: readonly RunHistoryEntry[], filter: RunHistoryFilter,
): RunHistoryEntry[] {
  if ((filter.mode !== 'all' && !MODES.includes(filter.mode)) ||
      (filter.outcome !== 'all' && !OUTCOMES.includes(filter.outcome))) return [];
  const valid = validateRunHistory(entries);
  if (!valid) return [];
  return valid.filter(entry =>
    (filter.mode === 'all' || entry.mode === filter.mode) &&
    (filter.outcome === 'all' || entry.outcome === filter.outcome));
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Median/p90 use bounded linear interpolation over sorted metadata timings.
 * These are whole-browser elapsed times, not per-Worker CPU measurements.
 */
export function summarizeRunHistory(entries: readonly RunHistoryEntry[]): RunHistorySummary {
  const valid = validateRunHistory(entries) ?? [];
  const timings = valid.map(item => item.elapsedMs).sort((a, b) => a - b);
  const succeeded = valid.filter(item => item.outcome === 'success').length;
  const total = timings.reduce((sum, number) => sum + number, 0);
  return {
    count: valid.length,
    succeeded,
    failed: valid.length - succeeded,
    p50Ms: percentile(timings, 0.5),
    p90Ms: percentile(timings, 0.9),
    minMs: timings[0] ?? null,
    maxMs: timings.at(-1) ?? null,
    averageMs: timings.length > 0 ? total / timings.length : null,
    totalOutputBytes: valid.reduce((sum, item) => sum +
      (item.stdoutBytes ?? 0) + (item.stderrBytes ?? 0), 0),
  };
}

/** Compare a run with the immediately preceding run of the same mode. */
export function compareRecentRun(
  entries: readonly RunHistoryEntry[], currentSequence?: number,
): RunHistoryComparison | null {
  const valid = validateRunHistory(entries);
  if (!valid || valid.length === 0) return null;
  const currentIndex = currentSequence === undefined
    ? valid.length - 1 : valid.findIndex(item => item.sequence === currentSequence);
  if (currentIndex < 0) return null;
  const current = valid[currentIndex];
  let previous: RunHistoryEntry | null = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (valid[i].mode === current.mode) { previous = valid[i]; break; }
  }
  const changeMs = previous ? current.elapsedMs - previous.elapsedMs : null;
  const percentChange = previous && previous.elapsedMs > 0
    ? 100 * changeMs! / previous.elapsedMs : null;
  return { current, previous, changeMs, percentChange };
}

export function formatRunElapsed(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1 ? '<1 ms' : ms < 1_000 ? Math.round(ms) + ' ms' :
    (ms / 1_000).toFixed(2) + ' s';
}

/** Export schema intentionally has no fields for source/input/diagnostic text. */
export function serializeRunHistory(entries: readonly RunHistoryEntry[]): string | null {
  const validated = validateRunHistory(entries);
  if (!validated) return null;
  return JSON.stringify({
    format: RUN_HISTORY_EXPORT_FORMAT, version: RUN_HISTORY_EXPORT_VERSION,
    entries: validated,
    summary: summarizeRunHistory(validated),
  }, null, 2) + '\n';
}

/** Optional local reader for examining a previously exported metadata report. */
export function parseRunHistoryExport(text: unknown): RunHistoryEntry[] | null {
  if (typeof text !== 'string' || text.length > 48_000) return null;
  try {
    const decoded: unknown = JSON.parse(text);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const envelope = decoded as Record<string, unknown>;
    if (envelope.format !== RUN_HISTORY_EXPORT_FORMAT ||
        envelope.version !== RUN_HISTORY_EXPORT_VERSION) return null;
    return validateRunHistory(envelope.entries);
  } catch {
    return null;
  }
}
