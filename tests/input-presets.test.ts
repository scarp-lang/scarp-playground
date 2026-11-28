import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_PRESETS, MAX_INPUT_PRESET_NAME_BYTES, MAX_INPUT_PRESET_TOTAL_BYTES,
  emptyInputPresetLibrary, validateInputPresetLibrary,
  createInputPreset, renameInputPreset, replaceInputPreset,
  deleteInputPreset, clearInputPresets, findInputPreset,
  summarizeInputPresets, inputPresetDescription,
  type InputPresetLibrary,
} from '../src/input-presets';

const create = (library: InputPresetLibrary, name = 'Example',
  input = '42\n', allowPrompts = false) =>
  createInputPreset(library, name, input, allowPrompts);

describe('bounded, ephemeral buffered input presets', () => {
  it('starts with no retained program input', () => {
    expect(emptyInputPresetLibrary()).toEqual({ items: [], nextId: 1 });
    expect(summarizeInputPresets(emptyInputPresetLibrary())).toEqual({
      count: 0, maxItems: MAX_INPUT_PRESETS,
      totalBytes: 0, maxBytes: MAX_INPUT_PRESET_TOTAL_BYTES,
      promptEnabled: 0, emptyInputs: 0,
    });
  });

  it('captures exact multiline buffered stdin and prompt opt-in', () => {
    const original = emptyInputPresetLibrary();
    const result = create(original, 'Interactive', 'first\nsecond\r\n', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preset).toEqual({
      id: 1, name: 'Interactive',
      input: 'first\nsecond\r\n',
      allowPrompts: true, inputBytes: 14,
    });
    expect(original.items).toHaveLength(0);
    expect(result.library.nextId).toBe(2);
  });

  it('preserves emoji and Hindi input as UTF-8 bytes, not UTF-16 units', () => {
    const input = '😀 नमस्ते\n';
    const result = create(emptyInputPresetLibrary(), 'Hindi', input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preset?.inputBytes).toBe(new TextEncoder().encode(input).byteLength);
    expect(result.preset?.input).toBe(input);
  });

  it('permits empty input to be explicitly captured', () => {
    const result = create(emptyInputPresetLibrary(), 'No input', '');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset?.inputBytes).toBe(0);
      expect(summarizeInputPresets(result.library)?.emptyInputs).toBe(1);
    }
  });

  it('distinguishes same stdin with different prompt capabilities', () => {
    const first = create(emptyInputPresetLibrary(), 'No prompts', 'true\n', false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = create(first.library, 'Allow prompts', 'true\n', true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.library.items.map(item => item.allowPrompts)).toEqual([false, true]);
    expect(summarizeInputPresets(second.library)?.promptEnabled).toBe(1);
  });

  it('respects 16 KiB total stdin bytes for each preset', () => {
    const valid = 'x'.repeat(16 * 1024);
    const first = create(emptyInputPresetLibrary(), 'Exact capacity', valid);
    expect(first.ok).toBe(true);
    const tooLarge = create(emptyInputPresetLibrary(), 'Over capacity', valid + 'x');
    expect(tooLarge.ok).toBe(false);
    const emoji = '😀'.repeat(4096);
    expect(create(emptyInputPresetLibrary(), 'Emoji capacity', emoji).ok).toBe(true);
    expect(create(emptyInputPresetLibrary(), 'Emoji overflow', emoji + '😀').ok).toBe(false);
  });

  it('rejects invalid surrogate inputs before creating a preset', () => {
    expect(create(emptyInputPresetLibrary(), 'Invalid', '\uD800').ok).toBe(false);
    expect(create(emptyInputPresetLibrary(), 'Invalid', '\uDC00').ok).toBe(false);
  });

  it('refuses coercing numbers, arrays or arbitrary nested objects into stdin text', () => {
    const invalid = createInputPreset(emptyInputPresetLibrary(), 'Bad', 42 as unknown as string, false);
    expect(invalid.ok).toBe(false);
    expect(createInputPreset(emptyInputPresetLibrary(), 'Bad', [] as unknown as string, false).ok)
      .toBe(false);
  });

  it('requires an explicit boolean prompt permission', () => {
    for (const value of ['true', 1, null, undefined]) {
      expect(createInputPreset(emptyInputPresetLibrary(), 'Wrong', 'input',
        value as unknown as boolean).ok).toBe(false);
    }
  });

  it('accepts a bounded human-readable UTF-8 preset name', () => {
    const name = '🧪'.repeat(MAX_INPUT_PRESET_NAME_BYTES / 4);
    expect(create(emptyInputPresetLibrary(), name).ok).toBe(true);
    expect(create(emptyInputPresetLibrary(), name + 'a').ok).toBe(false);
    expect(create(emptyInputPresetLibrary(), 'हिंदी उदाहरण').ok).toBe(true);
  });

  it('rejects empty, multiline, whitespace-padded and bidi control names', () => {
    const invalid = [
      '', ' ', ' Leading', 'Trailing ', 'line\nbreak',
      'tab\tname', 'a\u202Econtrol', '\u2066left', '\u0000null',
    ];
    for (const name of invalid) expect(create(emptyInputPresetLibrary(), name).ok).toBe(false);
  });

  it('requires unique names ignoring case within the session', () => {
    const initial = create(emptyInputPresetLibrary(), 'First', '1');
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const duplicate = create(initial.library, 'fIRST', '2');
    expect(duplicate.ok).toBe(false);
    expect(initial.library.items).toHaveLength(1);
  });

  it('enforces the 12-preset count limit', () => {
    let library = emptyInputPresetLibrary();
    for (let i = 1; i <= MAX_INPUT_PRESETS; i++) {
      const result = create(library, 'Preset ' + i, String(i));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      library = result.library;
    }
    expect(library.items).toHaveLength(MAX_INPUT_PRESETS);
    expect(create(library, 'Thirteenth', '13').ok).toBe(false);
  });

  it('enforces the 64 KiB cumulative stdin data budget', () => {
    let library = emptyInputPresetLibrary();
    for (let i = 1; i <= 4; i++) {
      const result = create(library, 'Chunk ' + i, String(i).repeat(16 * 1024));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      library = result.library;
    }
    expect(summarizeInputPresets(library)?.totalBytes).toBe(MAX_INPUT_PRESET_TOTAL_BYTES);
    expect(create(library, 'Overflow', 'a').ok).toBe(false);
  });

  it('renames exactly one preset without exposing or mutating its input', () => {
    const first = create(emptyInputPresetLibrary(), 'One', 'PRIVATE');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const renamed = renameInputPreset(first.library, 1, 'Renamed');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.library.items[0].name).toBe('Renamed');
    expect(renamed.library.items[0].input).toBe('PRIVATE');
    expect(first.library.items[0].name).toBe('One');
  });

  it('refuses renaming absent IDs or overwriting a name in another record', () => {
    const first = create(emptyInputPresetLibrary(), 'First', '1');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = create(first.library, 'Second', '2');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(renameInputPreset(second.library, 5, 'Another').ok).toBe(false);
    expect(renameInputPreset(second.library, 1, 'SECOND').ok).toBe(false);
    expect(renameInputPreset(second.library, 1, '\n').ok).toBe(false);
  });

  it('updates the selected stdin buffer atomically and keeps source-independent fields', () => {
    const first = create(emptyInputPresetLibrary(), 'First', '42\n', false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replaced = replaceInputPreset(first.library, 1, 'new\n', true);
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.library.items[0]).toMatchObject({
      id: 1, name: 'First', input: 'new\n', allowPrompts: true, inputBytes: 4,
    });
    expect(first.library.items[0].input).toBe('42\n');
  });

  it('rejects an edit if the new content would exceed the aggregate capacity', () => {
    const first = create(emptyInputPresetLibrary(), 'First', 'A'.repeat(16 * 1024));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    let library = first.library;
    for (let i = 2; i <= 4; i++) {
      const result = create(library, 'Preset ' + i, String(i).repeat(16 * 1024));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      library = result.library;
    }
    expect(replaceInputPreset(library, 1, 'a'.repeat(16 * 1024 + 1), false).ok).toBe(false);
    expect(replaceInputPreset(library, 2, 9 as unknown as string, false).ok).toBe(false);
  });

  it('deletes one preset without resetting the sequence number', () => {
    const first = create(emptyInputPresetLibrary(), 'First');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const removed = deleteInputPreset(first.library, 1);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.library.items).toEqual([]);
    expect(removed.library.nextId).toBe(2);
    expect(deleteInputPreset(removed.library, 1).ok).toBe(false);
  });

  it('clears only the input library and preserves monotonic IDs', () => {
    const first = create(emptyInputPresetLibrary());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(clearInputPresets(first.library)).toEqual({ items: [], nextId: 2 });
    expect(findInputPreset(first.library, 999)).toBeNull();
  });

  it('recovers only the selected input preset and not another record', () => {
    const first = create(emptyInputPresetLibrary(), 'First', 'A');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = create(first.library, 'Second', 'B');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(findInputPreset(second.library, 1)?.input).toBe('A');
    expect(findInputPreset(second.library, 2)?.input).toBe('B');
  });

  it('strictly projects unknown extra properties out of in-memory library', () => {
    const first = create(emptyInputPresetLibrary(), 'First', 'sensitive');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const forged = { ...first.library, source: 'SECRET',
      items: [{ ...first.library.items[0], stdout: 'SECRET', diagnostic: { message: 'SECRET' } }],
    };
    const normalized = validateInputPresetLibrary(forged);
    expect(normalized).toEqual(first.library);
    expect(JSON.stringify(normalized)).not.toContain('SECRET');
  });

  it('rejects duplicate IDs, labels, inconsistent bytes and oversized libraries', () => {
    const first = create(emptyInputPresetLibrary(), 'First', 'A');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const item = first.library.items[0];
    const invalid: unknown[] = [
      null, {}, { items: [], nextId: 0 },
      { items: [item, item], nextId: 3 },
      { items: [{ ...item, id: 0 }], nextId: 3 },
      { items: [{ ...item, id: 2 }], nextId: 2 },
      { items: [{ ...item, name: '' }], nextId: 3 },
      { items: [{ ...item, inputBytes: 400 }], nextId: 3 },
      { items: [{ ...item, allowPrompts: 'true' }], nextId: 3 },
      { items: [{ ...item, input: '\uD800' }], nextId: 3 },
      { items: Array.from({ length: MAX_INPUT_PRESETS + 1 }, () => item), nextId: 20 },
    ];
    for (const candidate of invalid) {
      expect(validateInputPresetLibrary(candidate)).toBeNull();
    }
  });

  it('keeps program input contents out of metadata-only statistics', () => {
    const first = create(emptyInputPresetLibrary(), 'Example', 'PRIVATE_USER_INPUT\n');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const summary = summarizeInputPresets(first.library);
    expect(summary?.count).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('PRIVATE');
    const description = inputPresetDescription(first.library.items[0]);
    expect(description).toMatch(/UTF-8 bytes/);
    expect(description).toContain('1 input line(s)');
    expect(description).not.toContain('PRIVATE');
  });

  it('uses no persistence or serialization route for input-bearing presets', () => {
    const library = create(emptyInputPresetLibrary(), 'Secrets', 'PRIVATE_INPUT');
    expect(library.ok).toBe(true);
    if (!library.ok) return;
    expect(Object.keys(library.library)).toEqual(['items', 'nextId']);
    expect(inputPresetDescription(library.preset!)).not.toContain('PRIVATE_INPUT');
  });
});
