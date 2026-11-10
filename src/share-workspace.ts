import { makeShareUrl, sourceFromHash, validateWorkspace, type Workspace } from './workspace';
import { parsePortableWorkspace, serializePortableWorkspace, type PortableWorkspace } from './portable-workspace';

// Keep complete share links small enough for common browsers, messengers and
// QR/link handling. Larger projects must use Export project instead.
export const MAX_SHARE_URL_CHARS = 8_192;
const PROJECT_PREFIX = '#project=';

/** Read legacy snippet links and complete projects without running any code. */
export function readSharedWorkspace(hash: string): PortableWorkspace | null {
  if (hash.startsWith('#code=')) {
    const source = sourceFromHash(hash);
    if (source === null) return null;
    return { workspace: { entry: 'main.srp', files: { 'main.srp': source } }, activeFile: 'main.srp' };
  }
  if (!hash.startsWith(PROJECT_PREFIX) || hash.length > MAX_SHARE_URL_CHARS) return null;
  try {
    // The portable decoder validates the version, entry, filenames, type and
    // byte budgets before the decoded sources can enter the editor.
    return parsePortableWorkspace(decodeURIComponent(hash.slice(PROJECT_PREFIX.length)));
  } catch {
    return null;
  }
}

/** Create a private-to-the-link, source-only URL; never upload the project. */
export function makeWorkspaceShareUrl(
  origin: string,
  pathname: string,
  workspace: Workspace,
  activeFile: string,
): string | null {
  if (validateWorkspace(workspace)) return null;

  // Existing #code= links are still generated for short default one-file
  // snippets, preserving the established link format.
  if (
    workspace.entry === 'main.srp' &&
    activeFile === 'main.srp' &&
    Object.keys(workspace.files).length === 1
  ) {
    const legacyUrl = makeShareUrl(origin, pathname, workspace.files['main.srp']);
    if (legacyUrl && legacyUrl.length <= MAX_SHARE_URL_CHARS) return legacyUrl;
  }

  // Reuse exactly the audited portable project schema rather than inventing a
  // second JSON format. Export ends in one newline, which URLs do not need.
  const json = serializePortableWorkspace(workspace, activeFile);
  if (json === null) return null;
  const url = origin + pathname + PROJECT_PREFIX + encodeURIComponent(json.slice(0, -1));
  return url.length <= MAX_SHARE_URL_CHARS ? url : null;
}
