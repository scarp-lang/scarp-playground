import { MAX_PROGRAM_INPUT_BYTES } from './runner/limits';
import { measureUtf8 } from './utf8';

export const MAX_INPUT_PRESETS = 12;
export const MAX_INPUT_PRESET_NAME_BYTES = 64;
export const MAX_INPUT_PRESET_TOTAL_BYTES = 64 * 1024;

export type InputPreset = Readonly<{
  id: number;
  name: string;
  input: string;
  allowPrompts: boolean;
  inputBytes: number;
}>;

export type InputPresetLibrary = Readonly<{ items: InputPreset[]; nextId: number }>;
export type InputPresetOperation =
  | { ok: true; library: InputPresetLibrary; preset?: InputPreset }
  | { ok: false; error: string };

export type InputPresetSummary = Readonly<{
  count: number;
  totalBytes: number;
  maxBytes: number;
  maxItems: number;
  promptEnabled: number;
  emptyInputs: number;
}>;

const fail = (error: string): InputPresetOperation => ({ ok: false, error });

function validName(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.length === 0 ||
      !measureUtf8(raw, MAX_INPUT_PRESET_NAME_BYTES).ok) return false;
  for (const character of raw) {
    const code = character.codePointAt(0)!;
    if (code < 32 || code === 127 || code === 0x061c ||
        code === 0x200e || code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)) return false;
  }
  return true;
}

function validateInput(raw: unknown): { ok: true; bytes: number } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Program input must be Unicode text.' };
  const measurement = measureUtf8(raw, MAX_PROGRAM_INPUT_BYTES);
  if (!measurement.ok) return { ok: false,
    error: measurement.reason === 'invalid-unicode'
      ? 'Program input contains invalid Unicode.'
      : 'Program input exceeds the 16 KiB browser limit.',
  };
  return { ok: true, bytes: measurement.bytes };
}

export function emptyInputPresetLibrary(): InputPresetLibrary {
  return { items: [], nextId: 1 };
}

/**
 * Every call returns a detached, projected library. It retains no source code,
 * output, secrets API, storage handles or raw prototype-bearing objects.
 */
export function validateInputPresetLibrary(raw: unknown): InputPresetLibrary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.items) || candidate.items.length > MAX_INPUT_PRESETS ||
      !Number.isSafeInteger(candidate.nextId) || Number(candidate.nextId) < 1) return null;
  const nextId = Number(candidate.nextId);
  const items: InputPreset[] = [];
  const names = new Set<string>();
  let total = 0;
  let previousId = 0;
  for (const rawItem of candidate.items) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    if (!Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        Number(item.id) <= previousId || Number(item.id) >= nextId ||
        !validName(item.name) || typeof item.allowPrompts !== 'boolean') return null;
    const measured = validateInput(item.input);
    if (!measured.ok || item.inputBytes !== measured.bytes) return null;
    const lower = item.name.toLocaleLowerCase();
    if (names.has(lower)) return null;
    names.add(lower);
    previousId = Number(item.id);
    total += measured.bytes;
    if (total > MAX_INPUT_PRESET_TOTAL_BYTES) return null;
    items.push({
      id: previousId, name: item.name, input: item.input as string,
      allowPrompts: item.allowPrompts, inputBytes: measured.bytes,
    });
  }
  return { items, nextId };
}

export function createInputPreset(
  library: InputPresetLibrary, name: string, input: string, allowPrompts: boolean,
): InputPresetOperation {
  const valid = validateInputPresetLibrary(library);
  if (!valid) return fail('The input preset library is invalid.');
  if (!validName(name)) return fail('Use a unique, readable 1–64 byte single-line preset name.');
  if (typeof allowPrompts !== 'boolean') return fail('Buffered prompt capability must be explicitly selected.');
  const measurement = validateInput(input);
  if (!measurement.ok) return fail(measurement.error);
  if (valid.items.length >= MAX_INPUT_PRESETS) {
    return fail('A tab can keep at most 12 input presets.');
  }
  if (valid.items.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return fail('An input preset with this name already exists.');
  }
  const total = valid.items.reduce((sum, item) => sum + item.inputBytes, 0) + measurement.bytes;
  if (total > MAX_INPUT_PRESET_TOTAL_BYTES) {
    return fail('The session input preset library exceeds its 64 KiB total limit.');
  }
  if (!Number.isSafeInteger(valid.nextId + 1)) return fail('No more valid input preset identifiers are available.');
  const preset: InputPreset = {
    id: valid.nextId, name, input, allowPrompts, inputBytes: measurement.bytes,
  };
  return {
    ok: true, library: { items: [...valid.items, preset], nextId: valid.nextId + 1 }, preset,
  };
}

export function renameInputPreset(
  library: InputPresetLibrary, id: number, name: string,
): InputPresetOperation {
  const valid = validateInputPresetLibrary(library);
  if (!valid) return fail('The input preset library is invalid.');
  if (!validName(name)) return fail('Use a readable 1–64 UTF-8 byte single-line preset name.');
  const target = valid.items.find(item => item.id === id);
  if (!target) return fail('Input preset was not found.');
  if (valid.items.some(item => item.id !== id &&
      item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return fail('An input preset with this name already exists.');
  }
  return {
    ok: true, library: { nextId: valid.nextId,
      items: valid.items.map(item => item.id === id ? { ...item, name } : item) },
  };
}

export function replaceInputPreset(
  library: InputPresetLibrary, id: number, input: string, allowPrompts: boolean,
): InputPresetOperation {
  const valid = validateInputPresetLibrary(library);
  if (!valid) return fail('The input preset library is invalid.');
  if (!valid.items.some(item => item.id === id)) return fail('Input preset was not found.');
  if (typeof allowPrompts !== 'boolean') return fail('Buffered prompt capability must be explicit.');
  const measured = validateInput(input);
  if (!measured.ok) return fail(measured.error);
  const others = valid.items.filter(item => item.id !== id)
    .reduce((sum, item) => sum + item.inputBytes, 0);
  if (others + measured.bytes > MAX_INPUT_PRESET_TOTAL_BYTES) {
    return fail('The session preset library would exceed 64 KiB.');
  }
  return {
    ok: true, library: { nextId: valid.nextId,
      items: valid.items.map(item => item.id === id
        ? { ...item, input, allowPrompts, inputBytes: measured.bytes } : item) },
  };
}

export function deleteInputPreset(
  library: InputPresetLibrary, id: number,
): InputPresetOperation {
  const valid = validateInputPresetLibrary(library);
  if (!valid) return fail('The input preset library is invalid.');
  if (!valid.items.some(item => item.id === id)) return fail('Input preset was not found.');
  return {
    ok: true, library: { nextId: valid.nextId, items: valid.items.filter(item => item.id !== id) },
  };
}

export function clearInputPresets(library: InputPresetLibrary): InputPresetLibrary {
  const valid = validateInputPresetLibrary(library);
  return { items: [], nextId: valid?.nextId ?? 1 };
}

export function findInputPreset(library: InputPresetLibrary, id: number): InputPreset | null {
  return validateInputPresetLibrary(library)?.items.find(item => item.id === id) ?? null;
}

/** Stats are metadata only; avoid listing the contents of a potentially secret stdin buffer. */
export function summarizeInputPresets(library: InputPresetLibrary): InputPresetSummary | null {
  const valid = validateInputPresetLibrary(library);
  if (!valid) return null;
  return {
    count: valid.items.length, maxItems: MAX_INPUT_PRESETS,
    totalBytes: valid.items.reduce((sum, item) => sum + item.inputBytes, 0),
    maxBytes: MAX_INPUT_PRESET_TOTAL_BYTES,
    promptEnabled: valid.items.filter(item => item.allowPrompts).length,
    emptyInputs: valid.items.filter(item => item.inputBytes === 0).length,
  };
}

/**
 * A full preset includes buffered user input. It is intentionally NOT
 * serializable by this module: a persistent export or browser URL could
 * disclose sensitive stdin. Only metadata can be copied for a report.
 */
export function inputPresetDescription(preset: InputPreset): string {
  const validated = validateInput(preset.input);
  if (!validated.ok || validated.bytes !== preset.inputBytes) return 'Invalid input';
  const lineCount = preset.input === '' ? 0 :
    1 + (preset.input.match(/\n/g) ?? []).length - (preset.input.endsWith('\n') ? 1 : 0);
  return preset.inputBytes + ' UTF-8 bytes · ' + lineCount + ' input line(s) · ' +
    (preset.allowPrompts ? 'buffered prompts enabled' : 'prompts disabled');
}
