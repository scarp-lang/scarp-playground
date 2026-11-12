import { importPaths, resolveVirtualImport } from './module-move';
import { validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_REMOVAL_REFERENCES = 120;
export type ModuleDependent = { importer: string; line: number; specifier: string };

export type ModuleRemovalPlan =
  | { ok: true; path: string; workspace: Workspace; nextActive: string;
      changedEntry: boolean }
  | { ok: false; error: string; dependents: ModuleDependent[] };

/**
 * Prevent deletion of imported modules. Inspect exact, normalized virtual
 * import references without executing the source or guessing from regex.
 * Refuse ambiguous syntax and unsafe import paths rather than deleting data.
 */
export function previewModuleRemoval(workspace: Workspace, path: string): ModuleRemovalPlan {
  const fail = (error: string, dependents: ModuleDependent[] = []): ModuleRemovalPlan =>
    ({ ok: false, error, dependents });
  const originalError = validateWorkspace(workspace);
  if (originalError) return fail(originalError);
  if (!validPath(path) || !Object.hasOwn(workspace.files, path)) {
    return fail('Select an existing .srp file to remove.');
  }
  const existing = Object.keys(workspace.files).sort();
  if (existing.length < 2) return fail('The workspace must retain at least one .srp source file.');

  const dependents: ModuleDependent[] = [];
  for (const importer of existing) {
    if (importer === path) continue;
    const source = workspace.files[importer];
    const sites = importPaths(source);
    if (!sites) return fail('Cannot inspect the imports in ' + importer +
      '. Correct ambiguous source syntax before removing another file.');
    for (const site of sites) {
      const resolved = resolveVirtualImport(importer, site.specifier);
      if (!resolved) return fail('Cannot resolve an import in ' + importer +
        '. Correct this path before deleting a module.');
      if (resolved !== path) continue;
      if (dependents.length === MAX_REMOVAL_REFERENCES) {
        return fail('More than 120 imports reference this module. Removal is blocked.', dependents);
      }
      const line = source.slice(0, site.start).split(/\r\n|\r|\n/).length;
      dependents.push({ importer, line, specifier: site.specifier });
    }
  }
  if (dependents.length) return fail(
    'Module is imported by ' + dependents.length + ' statement(s). Update or remove the imports first.',
    dependents,
  );

  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const sourcePath of existing) {
    if (sourcePath !== path) files[sourcePath] = workspace.files[sourcePath];
  }
  const nextActive = existing.find(candidate => candidate !== path)!;
  const nextWorkspace = {
    entry: workspace.entry === path ? nextActive : workspace.entry,
    files,
  };
  const nextError = validateWorkspace(nextWorkspace);
  if (nextError) return fail('The remaining workspace cannot be validated: ' + nextError);
  return { ok: true, path, workspace: nextWorkspace, nextActive,
    changedEntry: workspace.entry === path };
}
