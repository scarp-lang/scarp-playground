import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOURCE_TASK_FILTER, MAX_SOURCE_TASKS,
  MAX_SOURCE_TASK_SUMMARY, MAX_SOURCE_TASK_QUERY,
  SOURCE_TASK_TAGS, scanSourceTasks, filterSourceTasks,
  toggleSourceTaskReview, validatedSourceTaskReviews, sourceTaskSummary,
  type SourceTaskFilter,
} from '../src/source-tasks';
import type { Workspace } from '../src/workspace';

function one(source: string): Workspace {
  return { entry: 'main.srp', files: { 'main.srp': source } };
}
function scan(source: string) {
  const result = scanSourceTasks(one(source));
  if (!result.ok) throw new Error(result.error);
  return result;
}
function filtered(
  report: ReturnType<typeof scanSourceTasks>,
  options: Partial<SourceTaskFilter> = {},
  reviewed: string[] = [],
) {
  return filterSourceTasks(report, { ...DEFAULT_SOURCE_TASK_FILTER, ...options }, reviewed);
}

describe('Scarp source-comment task discovery', () => {
  it('recognizes the six supported tags with predictable priority', () => {
    const source = SOURCE_TASK_TAGS.map(tag => '// ' + tag + ': example ' + tag).join('\n');
    const report = scan(source);
    expect(report.tasks.map(task => task.tag)).toEqual([...SOURCE_TASK_TAGS]);
    expect(report.tasks.map(task => task.priority)).toEqual([
      'normal', 'urgent', 'normal', 'urgent', 'normal', 'informational',
    ]);
    expect(report.tasks.map(task => task.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(report.tasks.every(task => task.summary.startsWith('example'))).toBe(true);
  });

  it('reports no tasks for empty or comment-free programs', () => {
    expect(scan('').tasks).toEqual([]);
    expect(scan('bind value = 12;\nprint(value);\n').tasks).toEqual([]);
    expect(scan('// ordinary comment').tasks).toEqual([]);
  });

  it('handles unpadded, padded and documentation comments', () => {
    const report = scan('//TODO: first\n  // FIXME - second\n/// NOTE third\n');
    expect(report.tasks.map(task => [task.tag, task.summary, task.column])).toEqual([
      ['TODO', 'first', 3],
      ['FIXME', 'second', 6],
      ['NOTE', 'third', 5],
    ]);
  });

  it('normalizes mixed-case tag markers without changing comment bodies', () => {
    const report = scan('// todo: lower\n// FixMe: Mixed\n// opTimiZe: better');
    expect(report.tasks.map(task => task.tag)).toEqual(['TODO', 'FIXME', 'OPTIMIZE']);
    expect(report.tasks.map(task => task.summary)).toEqual(['lower', 'Mixed', 'better']);
  });

  it('supports a marker without a description', () => {
    expect(scan('// TODO\n').tasks[0].summary).toBe('(no description)');
    expect(scan('// FIXME:   \n').tasks[0].summary).toBe('(no description)');
  });

  it('does not match prefixes or markers embedded after ordinary prose', () => {
    const report = scan('// TODAY: not todo\n// We should TODO later\n// TODOitems\n');
    expect(report.tasks).toHaveLength(0);
  });

  it('skips fake comments inside regular strings', () => {
    const report = scan('print("// FIXME: ignored");\n// FIXME: real\n');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]).toMatchObject({
      tag: 'FIXME', line: 2, summary: 'real',
    });
  });

  it('handles escaped quotes without leaking fake comments', () => {
    const escapedQuote = String.fromCharCode(92) + '"';
    const source = 'print("escaped ' + escapedQuote +
      ' // TODO: fake");\n// TODO: real\n';
    const report = scan(source);
    expect(report.tasks.map(task => task.summary)).toEqual(['real']);
  });

  it('skips fake comments inside raw Scarp strings', () => {
    const report = scan('bind literal = r"// TODO: not a task";\n// NOTE: genuine\n');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].tag).toBe('NOTE');
  });

  it('skips multiline triple-quoted string contents', () => {
    const report = scan('bind value = """\n// TODO: fake\n// XXX: fake\n""";\n// HACK: real\n');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]).toMatchObject({ tag: 'HACK', line: 5 });
  });

  it('resumes scanning after closing triple quotes on the same line', () => {
    const report = scan('bind value = """// TODO fake"""; // FIXME: real\n');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].tag).toBe('FIXME');
  });

  it('does not treat identifier suffix r as a raw-string prefix', () => {
    const report = scan('bind car"hello" = 1; // NOTE: after text\n');
    expect(report.tasks.map(task => task.tag)).toEqual(['NOTE']);
  });

  it('handles CRLF, CR and LF without double-counting line positions', () => {
    const report = scan('// TODO: first\r\nprint(1);\r// FIXME: third\n');
    expect(report.tasks.map(task => task.line)).toEqual([1, 3]);
    expect(report.tasks.map(task => task.column)).toEqual([4, 4]);
  });

  it('uses one-based Monaco UTF-16 columns after supplementary Unicode characters', () => {
    const report = scan('print("😀"); // TODO: emoji position');
    expect(report.tasks[0]).toMatchObject({
      path: 'main.srp', line: 1, column: 17,
    });
  });

  it('finds task markers after executable statements as well as full-line comments', () => {
    const report = scan('bind x = 1; // TODO: explain\n');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].summary).toBe('explain');
  });

  it('keeps a bounded Unicode-safe preview for a long comment', () => {
    const long = 'x'.repeat(MAX_SOURCE_TASK_SUMMARY) + '😀';
    const report = scan('// TODO: ' + long);
    const task = report.tasks[0];
    expect(task.previewTruncated).toBe(true);
    expect(task.summary.length).toBeLessThanOrEqual(MAX_SOURCE_TASK_SUMMARY + 1);
    expect(task.summary.endsWith('…')).toBe(true);
  });

  it('changes task identity when text changes beyond the truncated preview', () => {
    const oldTask = scan('// TODO: ' + 'x'.repeat(300) + 'A').tasks[0];
    const newTask = scan('// TODO: ' + 'x'.repeat(300) + 'B').tasks[0];
    expect(oldTask.summary).toBe(newTask.summary);
    expect(oldTask.id).not.toBe(newTask.id);
  });

  it('preserves source task order by virtual path, then by position', () => {
    const input: Workspace = {
      entry: 'z.srp',
      files: {
        'z.srp': '// FIXME: Z',
        'a.srp': '// TODO: A\n// NOTE: B',
      },
    };
    const report = scanSourceTasks(input);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.tasks.map(task => task.path)).toEqual(['a.srp', 'a.srp', 'z.srp']);
    expect(report.tasks.map(task => task.summary)).toEqual(['A', 'B', 'Z']);
  });

  it('limits the number of reported comment findings', () => {
    const report = scan(('// TODO: repeated\n').repeat(MAX_SOURCE_TASKS + 8));
    expect(report.tasks).toHaveLength(MAX_SOURCE_TASKS);
    expect(report.truncated).toBe(true);
    expect(report.counts.TODO).toBe(MAX_SOURCE_TASKS);
  });

  it('rejects invalid workspaces instead of invoking a compiler or coercing input', () => {
    const cases = [
      { entry: 'missing.srp', files: { 'main.srp': '' } },
      { entry: 'main.srp', files: { 'main.srp': 44 } },
      { entry: 'main.srp', files: { 'main.srp': '\uD800' } },
      { entry: 'main.srp', files: {} },
      null,
    ];
    for (const input of cases) {
      expect(scanSourceTasks(input as Workspace).ok).toBe(false);
    }
  });
});

describe('ephemeral review and task filtering', () => {
  const report = scan([
    '// TODO: improve parsing',
    '// FIXME: crash regression',
    '// NOTE: documentation reminder',
    '// HACK: workaround',
    '// XXX: rare bug',
  ].join('\n'));

  it('starts with an empty review collection and clear summary', () => {
    expect(validatedSourceTaskReviews(report, [])).toEqual([]);
    expect(sourceTaskSummary(report, [])).toEqual({
      total: 5, urgent: 2, reviewed: 0, pending: 5, truncated: false,
    });
  });

  it('toggles one task acknowledgement without modifying a source task', () => {
    const item = report.tasks[0];
    const first = toggleSourceTaskReview(report, [], item.id);
    expect(first).toEqual([item.id]);
    expect(toggleSourceTaskReview(report, first, item.id)).toEqual([]);
    expect(item.summary).toBe('improve parsing');
  });

  it('ignores unknown, duplicated, or non-string review identifiers', () => {
    const id = report.tasks[0].id;
    expect(validatedSourceTaskReviews(report, [id, id, 42, null, 'missing'])).toEqual([id]);
    expect(toggleSourceTaskReview(report, [], 'unknown')).toEqual([]);
  });

  it('drops reviews when the corresponding source comment has been edited', () => {
    const initial = scan('// TODO: old content');
    const updated = scan('// TODO: new content');
    expect(validatedSourceTaskReviews(updated, [initial.tasks[0].id])).toEqual([]);
  });

  it('rejects oversized acknowledgement collections', () => {
    const values = Array.from({ length: MAX_SOURCE_TASKS + 1 }, () => 'fake');
    expect(validatedSourceTaskReviews(report, values)).toEqual([]);
  });

  it('filters by tag and by urgency', () => {
    expect(filtered(report, { tag: 'FIXME' }).map(task => task.summary))
      .toEqual(['crash regression']);
    expect(filtered(report, { priority: 'urgent' }).map(task => task.tag))
      .toEqual(['FIXME', 'XXX']);
  });

  it('filters text case-insensitively across path, tag, and comment body', () => {
    expect(filtered(report, { query: 'REGRESSION' }).map(task => task.tag))
      .toEqual(['FIXME']);
    expect(filtered(report, { query: 'NOTE' }).map(task => task.tag))
      .toEqual(['NOTE']);
  });

  it('filters reviewed and pending results independently', () => {
    const reviewed = [report.tasks[1].id];
    expect(filtered(report, { review: 'reviewed' }, reviewed)).toHaveLength(1);
    expect(filtered(report, { review: 'pending' }, reviewed)).toHaveLength(4);
  });

  it('filters by an exact virtual filename without inspecting outside source files', () => {
    const input: Workspace = {
      entry: 'main.srp', files: {
        'main.srp': '// TODO: main',
        'lib/extra.srp': '// FIXME: helper',
      },
    };
    const result = scanSourceTasks(input);
    expect(filtered(result, { path: 'lib/extra.srp' }).map(task => task.summary))
      .toEqual(['helper']);
  });

  it('rejects invalid filters instead of leaking source comments', () => {
    const invalid: Partial<SourceTaskFilter>[] = [
      { query: 'x'.repeat(MAX_SOURCE_TASK_QUERY + 1) },
      { path: '../escape.srp' },
      { tag: 'INVALID' as SourceTaskFilter['tag'] },
      { review: 'done' as SourceTaskFilter['review'] },
    ];
    for (const item of invalid) {
      expect(filtered(report, item)).toEqual([]);
    }
  });

  it('summary exposes counts without embedding task body text', () => {
    const secret = scan('// TODO: PRIVATE_SECRET_PLACEHOLDER');
    expect(JSON.stringify(sourceTaskSummary(secret, []))).not.toContain('PRIVATE_SECRET_PLACEHOLDER');
  });
});
