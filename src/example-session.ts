import { examples } from './examples';
import type { Workspace } from './workspace';

/**
 * Recognize only a byte-for-byte published sample workspace and its default
 * transient input. Do not depend on file insertion order or the active tab.
 * Any user edits, added/deleted files, replaced entry, or changed stdin
 * need confirmation before switching to another built-in example.
 *
 * Locally saved and imported projects are not trusted as "untouched" merely
 * because they have a familiar filename; all sources must match a fixture.
 */
export function isUntouchedExampleSession(workspace: Workspace, stdin: string): boolean {
  const paths = Object.keys(workspace.files);
  return examples.some(example => {
    const expected = Object.keys(example.files);
    return workspace.entry === example.entry &&
      stdin === (example.stdin ?? '') &&
      paths.length === expected.length &&
      expected.every(path =>
        Object.hasOwn(workspace.files, path) && workspace.files[path] === example.files[path],
      );
  });
}
