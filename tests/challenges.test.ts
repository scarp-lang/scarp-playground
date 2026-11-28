import { describe, expect, it } from 'vitest';
import { buildCatalogue, challenges, copyChallengeStarter, filterChallenges, tracks } from '../src/challenges/model';
import { validateWorkspace } from '../src/workspace';
import { validateTestCases } from '../src/runner/test-cases';

describe('learning catalogue', () => {
  it('registers every exercise and validates both workspaces and all public cases', () => {
    expect(challenges.length).toBeGreaterThanOrEqual(25);
    expect(new Set(challenges.map(item => item.id)).size).toBe(challenges.length);
    expect(challenges.reduce((total, item) => total + item.cases.length, 0)).toBeGreaterThanOrEqual(85);
    for (const item of challenges) {
      expect(validateWorkspace(item.starter)).toBeNull();
      expect(validateWorkspace(item.solution)).toBeNull();
      expect(validateTestCases(item.cases).ok).toBe(true);
      expect(item.cases.every(entry => !entry.allowPrompts)).toBe(true);
      expect(Object.keys(item.starter.files).sort()).toEqual(Object.keys(item.solution.files).sort());
    }
    expect(tracks).toContain('Modules');
  });

  it('filters by case-insensitive query, track and difficulty', () => {
    expect(filterChallenges(challenges, '  ECHO ', '', '').map(item => item.id)).toEqual(['echo-name']);
    expect(filterChallenges(challenges, '', 'Modules', 'advanced').map(item => item.id)).toEqual(['module-generic']);
    expect(filterChallenges(challenges, 'nonexistent challenge', '', '')).toEqual([]);
  });

  it('copies starter workspaces without editing the catalogue', () => {
    const first = challenges[0];
    const copy = copyChallengeStarter(first);
    copy.files[first.starter.entry] = 'changed';
    expect(first.starter.files[first.starter.entry]).not.toBe('changed');
  });

  it('rejects missing, extra and duplicate fixture registrations', () => {
    const row = { id: 'x', title: 'X', track: 'Math', level: 'beginner', goal: 'Goal',
      hints: ['Hint'], entry: 'main.srp', files: ['main.srp'],
      cases: [{ name: 'One', stdin: '', stdout: '1\\n', stderr: '' }] };
    const fixtures = { './fixtures/x/starter/main.srp': 'print(0);', './fixtures/x/solution/main.srp': 'print(1);' };
    expect(buildCatalogue([row], fixtures)).toHaveLength(1);
    expect(() => buildCatalogue([row, row], fixtures)).toThrow();
    expect(() => buildCatalogue([row], {})).toThrow();
    expect(() => buildCatalogue([row], { ...fixtures, extra: 'unregistered' })).toThrow();
    expect(() => buildCatalogue([{ ...row, entry: '../main.srp' }], fixtures)).toThrow();
    expect(() => buildCatalogue([{ ...row, cases: [] }], fixtures)).toThrow();
  });
});
