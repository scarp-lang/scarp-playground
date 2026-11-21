import { describe, expect, it } from 'vitest';
import {
  hasUnprotectedSessionWork, sameWorkspaceContents, type SessionCheckpoint,
} from '../src/session-safety';
import type { Workspace } from '../src/workspace';

const example: Workspace = {
  entry: 'main.srp',
  files: { 'main.srp': 'print("Hi");', 'lib/helper.srp': 'pub bind n = 2;' },
};
const checkpoint: SessionCheckpoint = { workspace: example, stdin: '', recoverable: true };

describe('opt-in Scarp session loss protection', () => {
  it('compares exact source bytes and module paths, independent of map order', () => {
    const reordered = {
      entry: 'main.srp',
      files: { 'lib/helper.srp': 'pub bind n = 2;', 'main.srp': 'print("Hi");' },
    };
    expect(sameWorkspaceContents(example, reordered)).toBe(true);
    expect(sameWorkspaceContents(example, {
      ...reordered, entry: 'lib/helper.srp',
    })).toBe(false);
    expect(sameWorkspaceContents(example, {
      ...reordered, files: { ...reordered.files, 'main.srp': 'print("Changed");' },
    })).toBe(false);
    expect(sameWorkspaceContents(example, {
      entry: example.entry, files: { 'main.srp': example.files['main.srp'] },
    })).toBe(false);
  });

  it('does not warn for a pristine sample, restored local copy or share link', () => {
    const equivalent = { entry: example.entry, files: { ...example.files } };
    expect(hasUnprotectedSessionWork(example, '', false, null, checkpoint)).toBe(false);
    expect(hasUnprotectedSessionWork(equivalent, '', false, null, checkpoint)).toBe(false);
    expect(hasUnprotectedSessionWork(equivalent, '', true, example, checkpoint)).toBe(false);
  });

  it('warns for unpersisted edits and temporary imported or forgotten projects', () => {
    const changed = {
      ...example, files: { ...example.files, 'main.srp': 'print("Unsaved");' },
    };
    expect(hasUnprotectedSessionWork(changed, '', false, null, checkpoint)).toBe(true);
    expect(hasUnprotectedSessionWork(changed, '', true, example, checkpoint)).toBe(true);
    expect(hasUnprotectedSessionWork(changed, '', true, changed, checkpoint)).toBe(false);
    expect(hasUnprotectedSessionWork(example, '', false, null, {
      ...checkpoint, recoverable: false,
    })).toBe(true);
  });

  it('protects changed stdin even after source autosave, without persisting input', () => {
    expect(hasUnprotectedSessionWork(example, 'private stdin\n', true, example, checkpoint))
      .toBe(true);
    expect(hasUnprotectedSessionWork(example, 'first\n', false, null, {
      ...checkpoint, stdin: 'first\n',
    })).toBe(false);
    expect(hasUnprotectedSessionWork(example, 'changed\n', false, null, {
      ...checkpoint, stdin: 'first\n',
    })).toBe(true);
  });
});
