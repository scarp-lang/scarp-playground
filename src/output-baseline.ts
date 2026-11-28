import type { RunResult } from './runner/types';
import { validatedRunResult } from './runner/protocol';
import {
  compareWorkspaceFiles, type FileComparison,
  type FileComparisonOptions,
} from './source-file-compare';
import { isUtf8Text } from './utf8';

export const MAX_BASELINE_STREAM_BYTES = 64 * 1024;
export const MAX_BASELINE_LABEL = 64;
export const OUTPUT_COMPARE_CONTEXT = 2;

export type OutputBaseline = Readonly<{
  stdout: string;
  stderr: string;
  label: string;
}>;

export type OutputCompareOptions = Readonly<{
  stream: 'stdout' | 'stderr';
  ignoreLineEndings: boolean;
  ignoreTrailingWhitespace: boolean;
  context: number;
}>;

export type OutputBaselinePlan =
  | { ok: true; baseline: OutputBaseline }
  | { ok: false; error: string };

export type OutputComparison =
  | { ok: true; stream: 'stdout' | 'stderr';
      report: Extract<FileComparison, { ok: true }>;
      baselineLabel: string; baselineBytes: number; latestBytes: number }
  | { ok: false; error: string };

function validStreams(value: unknown): value is { stdout: string; stderr: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.stdout === 'string' && typeof input.stderr === 'string' &&
    isUtf8Text(input.stdout, MAX_BASELINE_STREAM_BYTES) &&
    isUtf8Text(input.stderr, MAX_BASELINE_STREAM_BYTES);
}

function validLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value === value.trim() && isUtf8Text(value, MAX_BASELINE_LABEL) &&
    ![...value].some(character => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069);
    });
}

/**
 * Only an explicitly authorized user action may pin successful captured
 * output. Never store source, program stdin, diagnostics, prompt flags or
 * browser telemetry with the baseline; it exists solely in React memory.
 */
export function captureOutputBaseline(
  result: RunResult | null, name = 'Pinned Run',
): OutputBaselinePlan {
  const valid = validatedRunResult(result);
  if (!valid || !valid.ok) {
    return { ok: false, error: 'Run a successful Scarp program before pinning its output.' };
  }
  if (!validStreams(valid)) {
    return { ok: false, error: 'Output exceeds the 64 KiB per-stream comparison cap.' };
  }
  if (!validLabel(name)) {
    return { ok: false, error: 'Enter a safe baseline label within 64 UTF-8 bytes.' };
  }
  return { ok: true, baseline: { stdout: valid.stdout, stderr: valid.stderr, label: name } };
}

/**
 * Compare only prior and latest successful Run output. Uses the same bounded
 * UTF-16 source-line diff engine via *temporary* virtual buffers; these
 * buffers never become part of the actual project or the compiler worker.
 */
export function compareOutputBaseline(
  baseline: OutputBaseline | null, latest: RunResult | null,
  options: OutputCompareOptions,
): OutputComparison {
  const valid = validatedRunResult(latest);
  if (!baseline || !valid || !valid.ok || !validStreams(baseline) ||
      !validStreams(valid) || !validLabel(baseline.label)) {
    return { ok: false, error: 'Both a valid pinned baseline and a successful latest Run are required.' };
  }
  if (!options || !['stdout', 'stderr'].includes(options.stream) ||
      typeof options.ignoreLineEndings !== 'boolean' ||
      typeof options.ignoreTrailingWhitespace !== 'boolean' ||
      !Number.isSafeInteger(options.context) || options.context < 0 || options.context > 5) {
    return { ok: false, error: 'Invalid output comparison options.' };
  }
  const oldOutput = baseline[options.stream];
  const newOutput = valid[options.stream];
  const compareOptions: FileComparisonOptions = {
    left: 'baseline.srp', right: 'latest.srp',
    ignoreLineEndings: options.ignoreLineEndings,
    ignoreTrailingWhitespace: options.ignoreTrailingWhitespace,
    context: options.context,
  };
  const result = compareWorkspaceFiles({
    entry: 'baseline.srp',
    files: { 'baseline.srp': oldOutput, 'latest.srp': newOutput },
  }, compareOptions);
  if (!result.ok) {
    return { ok: false, error: 'Output diff cannot be inspected safely: ' + result.error };
  }
  const encoder = new TextEncoder();
  return {
    ok: true, stream: options.stream, report: result, baselineLabel: baseline.label,
    baselineBytes: encoder.encode(oldOutput).byteLength,
    latestBytes: encoder.encode(newOutput).byteLength,
  };
}
