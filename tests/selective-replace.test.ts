import { describe, expect, it } from 'vitest';
import {
  MAX_SELECTIVE_FIND_BYTES, MAX_SELECTIVE_REPLACE_BYTES, MAX_SELECTIVE_SITES,
  scanSelectiveReplacement, previewSelectiveReplacement, verifySelectiveUndo,
  sourceLinesWithOffsets, type SelectiveSearch,
} from '../src/selective-replace';
import { undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

function project(main = 'print("alpha alpha");\n// alpha note\n'): Workspace {
  return { entry: 'main.srp', files: {
    'main.srp': main,
    'lib/help.srp': 'pub bind alpha = 1;\n',
  } };
}
function query(options: Partial<SelectiveSearch> = {}): SelectiveSearch {
  return {
    query: 'alpha', replacement: 'beta',
    caseSensitive: false, wholeWord: false, path: 'all', ...options,
  };
}
function scan(workspace = project(), options = query()) {
  const result = scanSelectiveReplacement(workspace, options);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function plan(workspace = project(), options = query(), indices?: number[]) {
  const report = scan(workspace, options);
  const selected = (indices ?? report.sites.map((_, i) => i))
    .map(i => report.sites[i].id);
  const result = previewSelectiveReplacement(workspace, options, selected);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('selective literal matching across Scarp source', () => {
  it('preserves physical line starts for LF, CRLF and CR', () => {
    expect(sourceLinesWithOffsets('a\r\nb\rc\nd')).toEqual([
      { text: 'a', start: 0, number: 1 },
      { text: 'b', start: 3, number: 2 },
      { text: 'c', start: 5, number: 3 },
      { text: 'd', start: 7, number: 4 },
    ]);
  });

  it('retains trailing empty editor line following a newline', () => {
    expect(sourceLinesWithOffsets('one\n')).toEqual([
      { text: 'one', start: 0, number: 1 },
      { text: '', start: 4, number: 2 },
    ]);
  });

  it('supports a one-line empty source file', () => {
    expect(sourceLinesWithOffsets('')).toEqual([{ text: '', start: 0, number: 1 }]);
  });

  it('reports every selected literal offset and one-based editor coordinate', () => {
    const found = scan();
    expect(found.sites.map(s => [s.path, s.line, s.column])).toEqual([
      ['lib/help.srp', 1, 10],
      ['main.srp', 1, 8],
      ['main.srp', 1, 14],
      ['main.srp', 2, 4],
    ]);
  });

  it('preserves Unicode UTF-16 offsets with emoji preceding a match', () => {
    const found = scan(project('print("😀 alpha");'), query());
    const item = found.sites.find(site => site.path === 'main.srp')!;
    expect(item.column).toBe(11);
    expect(item.offset).toBe(10);
    expect(item.endColumn).toBe(16);
  });

  it('supports expanded Unicode case-folding without shifting source offsets', () => {
    const found = scan(project('print("İ");'), query({
      query: 'i\u0307', replacement: 'i',
    }));
    const item = found.sites.find(site => site.path === 'main.srp')!;
    expect(item.matchedText).toBe('İ');
    expect(item.length).toBe(1);
  });

  it('does not treat expression metacharacters as regular expressions', () => {
    const found = scan(project('print("a.b axb");'), query({ query: 'a.b' }));
    expect(found.sites.filter(s => s.path === 'main.srp')).toHaveLength(1);
    expect(found.sites.find(s => s.path === 'main.srp')?.matchedText).toBe('a.b');
  });

  it('supports case-sensitive and insensitive modes exactly', () => {
    const input = project('Alpha alpha ALPHA');
    expect(scan(input, query({ caseSensitive: true })).sites
      .filter(s => s.path === 'main.srp')).toHaveLength(1);
    expect(scan(input, query({ caseSensitive: false })).sites
      .filter(s => s.path === 'main.srp')).toHaveLength(3);
  });

  it('uses Unicode-aware word boundaries, including underscores', () => {
    const input = project('alpha alphabeta alpha_beta alpha');
    expect(scan(input, query({ wholeWord: true })).sites
      .filter(s => s.path === 'main.srp')).toHaveLength(2);
  });

  it('can search only an exact existing .srp file', () => {
    const found = scan(project(), query({ path: 'lib/help.srp' }));
    expect(found.scannedFiles).toBe(1);
    expect(found.sites.map(site => site.path)).toEqual(['lib/help.srp']);
  });

  it('rejects a missing or unsafe path filter', () => {
    expect(scanSelectiveReplacement(project(), query({ path: 'missing.srp' })).ok).toBe(false);
    expect(scanSelectiveReplacement(project(), query({ path: '../main.srp' })).ok).toBe(false);
  });

  it('never interprets source text as compiler syntax', () => {
    const found = scan(project('// alpha in comment\nprint("alpha in string");'));
    expect(found.sites.filter(site => site.path === 'main.srp')).toHaveLength(2);
  });

  it('preserves a leading empty line and handles repeated same-line matches', () => {
    const found = scan(project('\nalpha alpha alpha'));
    expect(found.sites.filter(site => site.path === 'main.srp').map(site => site.column))
      .toEqual([1, 7, 13]);
    expect(found.sites.find(site => site.path === 'main.srp')?.line).toBe(2);
  });

  it('rejects empty, one-character and multiline query terms', () => {
    for (const term of ['', 'x', 'alpha\nbeta', 'alpha\rbeta', '\uD800']) {
      expect(scanSelectiveReplacement(project(), query({ query: term })).ok).toBe(false);
    }
  });

  it('caps find and replace sizes in UTF-8 bytes', () => {
    expect(scanSelectiveReplacement(project(), query({
      query: '😀'.repeat(MAX_SELECTIVE_FIND_BYTES / 4 + 1),
    })).ok).toBe(false);
    expect(scanSelectiveReplacement(project(), query({
      replacement: '😀'.repeat(MAX_SELECTIVE_REPLACE_BYTES / 4 + 1),
    })).ok).toBe(false);
  });

  it('rejects NUL and newlines in replacement values', () => {
    for (const replacement of ['a\nb', 'a\rb', 'a\u0000b', '\uDC00']) {
      expect(scanSelectiveReplacement(project(), query({ replacement })).ok).toBe(false);
    }
  });

  it('rejects invalid flags and a forged runtime query', () => {
    expect(scanSelectiveReplacement(project(), query({
      caseSensitive: 'false' as unknown as boolean,
    })).ok).toBe(false);
    expect(scanSelectiveReplacement(project(), null as unknown as SelectiveSearch).ok)
      .toBe(false);
  });

  it('returns no sites for absent source text without throwing', () => {
    const found = scan(project(), query({ query: 'not_present' }));
    expect(found.sites).toEqual([]);
    expect(found.truncated).toBe(false);
  });

  it('never returns unbounded match lists on adversarial repetitive input', () => {
    const input = project(('alpha ').repeat(MAX_SELECTIVE_SITES + 10));
    const found = scan(input);
    expect(found.sites).toHaveLength(MAX_SELECTIVE_SITES);
    expect(found.truncated).toBe(true);
    expect(previewSelectiveReplacement(input, query(), [found.sites[0].id]).ok)
      .toBe(false);
  });

  it('rejects a malformed or too-large virtual workspace', () => {
    expect(scanSelectiveReplacement(null as unknown as Workspace, query()).ok).toBe(false);
    expect(scanSelectiveReplacement({
      entry: 'main.srp', files: { 'main.srp': 12 },
    } as unknown as Workspace, query()).ok).toBe(false);
  });
});

describe('atomic selected edits, previews and undo verification', () => {
  it('replaces only one explicitly selected occurrence', () => {
    const input = project();
    const chosen = plan(input, query(), [2]);
    expect(chosen.replacementCount).toBe(1);
    expect(chosen.leftUnchanged).toBe(3);
    expect(chosen.workspace.files['main.srp']).toBe('print("alpha beta");\n// alpha note\n');
    expect(chosen.workspace.files['lib/help.srp']).toBe(input.files['lib/help.srp']);
  });

  it('never mutates the input workspace or original source strings', () => {
    const input = project();
    const before = JSON.stringify(input);
    const output = plan(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(output.workspace).not.toBe(input);
    expect(output.workspace.files).not.toBe(input.files);
  });

  it('can apply multiple chosen replacements on the same line', () => {
    const input = project('alpha alpha alpha');
    const found = scan(input).sites.filter(site => site.path === 'main.srp');
    const output = previewSelectiveReplacement(input, query(),
      found.map(site => site.id));
    expect(output.ok).toBe(true);
    if (output.ok) expect(output.workspace.files['main.srp']).toBe('beta beta beta');
  });

  it('can replace across several source files in a single atomic plan', () => {
    const input = project();
    const output = plan(input);
    expect(output.changedFiles).toEqual(['lib/help.srp', 'main.srp']);
    expect(output.replacementCount).toBe(4);
    expect(output.workspace.files['lib/help.srp']).toBe('pub bind beta = 1;\n');
    expect(output.workspace.files['main.srp']).toBe('print("beta beta");\n// beta note\n');
  });

  it('preserves CRLF/CR/LF separators byte-for-byte after one-line edits', () => {
    const input = project('alpha\r\nalpha\ralpha\n');
    const output = plan(input);
    expect(output.workspace.files['main.srp']).toBe('beta\r\nbeta\rbeta\n');
  });

  it('allows deleting chosen literal matches with an empty replacement', () => {
    const input = project('alpha+alpha');
    const output = plan(input, query({ replacement: '' }));
    expect(output.workspace.files['main.srp']).toBe('+');
  });

  it('allows replacement with longer UTF-8 text while preserving exact file positions', () => {
    const input = project('alpha alpha');
    const output = plan(input, query({ replacement: 'हिंदी 😀' }));
    expect(output.workspace.files['main.srp']).toBe('हिंदी 😀 हिंदी 😀');
    expect(output.edits.map(edit => edit.column).filter(Boolean).length).toBeGreaterThan(0);
  });

  it('never truncates source text in the returned replacement workspace', () => {
    const input = project('x'.repeat(1500) + 'alpha' + 'y'.repeat(1500));
    const output = plan(input);
    expect(output.workspace.files['main.srp']).toBe(
      'x'.repeat(1500) + 'beta' + 'y'.repeat(1500),
    );
  });

  it('creates bounded excerpts while leaving unbounded source values intact', () => {
    const input = project('prefix'.repeat(60) + ' alpha ' + 'suffix'.repeat(60));
    const output = plan(input, query(), [1]);
    const preview = output.lines.find(line => line.path === 'main.srp')!;
    expect(preview.excerptTruncated).toBe(true);
    expect(preview.before.length).toBeLessThanOrEqual(281);
    expect(output.workspace.files['main.srp']).toContain('beta');
  });

  it('groups multiple same-line edits into one before/after display', () => {
    const input = project('alpha alpha');
    const output = plan(input);
    const line = output.lines.find(item => item.path === 'main.srp')!;
    expect(line.replacements).toBe(2);
    expect(line.before).toBe('alpha alpha');
    expect(line.after).toBe('beta beta');
  });

  it('provides one entry per selected replacement with original and new literals', () => {
    const output = plan();
    expect(output.edits).toHaveLength(4);
    for (const edit of output.edits) {
      expect(edit.before).toBe('alpha');
      expect(edit.after).toBe('beta');
      expect(edit.id).toBeTruthy();
      expect(edit.line).toBeGreaterThan(0);
      expect(edit.column).toBeGreaterThan(0);
    }
  });

  it('refuses no-op matches before creating an undo token', () => {
    expect(previewSelectiveReplacement(project(), query({ replacement: 'alpha' }),
      scan().sites.map(site => site.id)).ok).toBe(false);
  });

  it('rejects unselected, duplicated or forged occurrence IDs', () => {
    const input = project();
    const id = scan(input).sites[0].id;
    expect(previewSelectiveReplacement(input, query(), []).ok).toBe(false);
    expect(previewSelectiveReplacement(input, query(), [id, id]).ok).toBe(false);
    expect(previewSelectiveReplacement(input, query(), ['forged']).ok).toBe(false);
    expect(previewSelectiveReplacement(input, query(), [23 as unknown as string]).ok).toBe(false);
  });

  it('refuses site selections from a different source position', () => {
    const input = project();
    const old = scan(input).sites[0].id;
    const changed = project();
    changed.files['lib/help.srp'] = '// shifted\n' + changed.files['lib/help.srp'];
    expect(previewSelectiveReplacement(changed, query(), [old]).ok).toBe(false);
  });

  it('refuses source growth beyond the workspace byte quotas atomically', () => {
    const input = project('x'.repeat(65_400) + 'alpha');
    const result = previewSelectiveReplacement(input, query({
      replacement: 'x'.repeat(512),
    }), [scan(input).sites.find(site => site.path === 'main.srp')!.id]);
    expect(result.ok).toBe(false);
    expect(input.files['main.srp'].endsWith('alpha')).toBe(true);
  });

  it('replays and verifies an exact one-step undo', () => {
    const input = project();
    const options = query();
    const output = plan(input, options);
    const undo = verifySelectiveUndo(input, options, output);
    expect(undo?.label).toBe('selective replacement');
    expect(undoBulkEdit(output.workspace, undo)).toBe(input);
  });

  it('refuses undo when selected matches have changed after preview', () => {
    const input = project();
    const options = query();
    const output = plan(input, options);
    const forged = {
      ...output, workspace: {
        entry: input.entry, files: { ...output.workspace.files,
          'main.srp': 'print("tampered");\n',
        },
      },
    };
    expect(verifySelectiveUndo(input, options, forged)).toBeNull();
  });

  it('refuses undo verification against a different workspace snapshot', () => {
    const input = project();
    const output = plan(input);
    const modified = project('alpha in a new position');
    expect(verifySelectiveUndo(modified, query(), output)).toBeNull();
  });

  it('requires the exact previous workspace object for an applied bulk undo', () => {
    const input = project();
    const output = plan(input);
    const undo = verifySelectiveUndo(input, query(), output);
    expect(undoBulkEdit({ ...output.workspace }, undo)).toBeNull();
  });

  it('works across source contents that include Unicode or mixed indentation', () => {
    const input = project('\tprint("😀 alpha")\r\n  // alpha\n');
    const output = plan(input);
    expect(output.workspace.files['main.srp']).toBe(
      '\tprint("😀 beta")\r\n  // beta\n',
    );
  });

  it('preserves exact filename mapping and entry after batch application', () => {
    const input = project();
    const output = plan(input);
    expect(Object.keys(output.workspace.files).sort()).toEqual(
      Object.keys(input.files).sort(),
    );
    expect(output.workspace.entry).toBe(input.entry);
  });

  it('never invokes the compiler, mutates runtime input or exports secrets', () => {
    const input = project('alpha SECRET_INPUT_VALUE alpha');
    const output = plan(input);
    expect(Object.keys(output.workspace).sort()).toEqual(['entry', 'files']);
    expect(Object.keys(output).sort()).toEqual([
      'changedFiles', 'edits', 'leftUnchanged', 'lines', 'ok',
      'replacementCount', 'totalMatches', 'workspace',
    ]);
    expect(JSON.stringify(output)).not.toContain('allowPrompts');
  });
});
