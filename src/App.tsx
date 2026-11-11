import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

// Keep the large Monaco code out of the initial React shell bundle.
// The actual editor loads on demand while the rest of the UI stays interactive.
const ScarpEditor = lazy(() =>
  import('./ScarpEditor').then(({ ScarpEditor }) => ({ default: ScarpEditor })),
);
import { examples } from './examples';
import { checkWorkspace, runWorkspace, MAX_PROGRAM_INPUT_BYTES } from './runner/client';
import { editorPositionToByteOffset } from './navigation/coordinates';
import { findDefinition } from './navigation/client';
import { findReferences, type SourceRange } from './navigation/references';
import { previewSymbolRename, validRenameName, type RenameResult } from './navigation/rename';
import { buildRenameDiff } from './navigation/rename-diff';
import { initialReferenceIndex, stepReferenceIndex } from './navigation/reference-view';
import { sourceLocationToEditorRange } from './diagnostics';
import { ExecutionScope } from './runner/execution-scope';
import type { RunResult } from './runner/types';
import { MAX_FILES, validPath, type Workspace } from './workspace';
import { makeWorkspaceShareUrl, readSharedWorkspace } from './share-workspace';
import { MAX_SEARCH_QUERY, searchProjectFiles, type ProjectSearchHit } from './project-search';
import { forgetLocalWorkspace, restoreLocalWorkspace, saveLocalWorkspace } from './persistence';
import { MAX_PORTABLE_WORKSPACE_BYTES, parsePortableWorkspace, serializePortableWorkspace } from './portable-workspace';

type InitialSession = { workspace: Workspace; activeFile: string; savingLocally: boolean };

function startingSession(): InitialSession {
  // Shared snippets or projects never overwrite an existing local saved copy.
  const shared = readSharedWorkspace(window.location.hash);
  if (shared !== null) {
    return { ...shared, savingLocally: false };
  }
  try {
    const stored = restoreLocalWorkspace(window.localStorage);
    if (stored) {
      return { ...stored, savingLocally: true };
    }
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
  const initial = examples[0];
  return {
    workspace: { entry: initial.entry, files: { ...initial.files } },
    activeFile: initial.entry,
    savingLocally: false,
  };
}

function startingTheme(): 'dark' | 'light' {
  try {
    return window.localStorage.getItem('scarp-playground-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function App() {
  const [initial] = useState(startingSession);
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const [activeFile, setActiveFile] = useState(initial.activeFile);
  const [editorSession, setEditorSession] = useState(0);
  const [savingLocally, setSavingLocally] = useState(initial.savingLocally);
  const [dark, setDark] = useState(startingTheme() === 'dark');
  const [running, setRunning] = useState(false);
  const [operation, setOperation] = useState<'run' | 'check'>('run');
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Runtime input is intentionally ephemeral: never saved or placed in shared links.
  const [programInput, setProgramInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const executionScope = useRef(new ExecutionScope());
  const definitionScope = useRef(new ExecutionScope());
  const [navigationTrigger, setNavigationTrigger] = useState(0);
  const [referenceTrigger, setReferenceTrigger] = useState(0);
  const [renameTrigger, setRenameTrigger] = useState(0);
  const [renameTarget, setRenameTarget] = useState<{
    snapshot: Workspace; path: string; offset: number;
  } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renamePreview, setRenamePreview] =
    useState<Extract<RenameResult, { ok: true }> | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameDiff = useMemo(() =>
    renameTarget && renamePreview
      ? buildRenameDiff(renameTarget.snapshot, renamePreview) : null,
    [renameTarget, renamePreview]);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = useState(-1);
  const [referenceResult, setReferenceResult] = useState<{
    name: string; kind: string; sites: Array<SourceRange & { kind: string }>; truncated: boolean;
  } | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{
    path: string; line: number; column: number; sequence: number;
  } | null>(null);
  const files = Object.keys(workspace.files);
  const searchResult = useMemo(() =>
    searchProjectFiles(workspace.files, searchQuery), [workspace.files, searchQuery]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (renameTarget) renameInputRef.current?.focus();
  }, [renameTarget]);

  function jumpToSearchHit(hit: ProjectSearchHit) {
    if (!Object.hasOwn(workspace.files, hit.path)) return;
    // Any delayed definition result must not replace explicit text navigation.
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setActiveFile(hit.path);
    setNavigationTarget(previous => ({
      path: hit.path, line: hit.line, column: hit.column,
      sequence: (previous?.sequence ?? 0) + 1,
    }));
  }

  function invalidateExecution() {
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
    setReferenceResult(null);
    setSelectedReferenceIndex(-1);
    definitionScope.current.invalidate();
    setNavigationTarget(null);
    setNavigationTrigger(0);
    executionScope.current.invalidate();
    setRunning(false);
    setResult(null);
  }

  // Component teardown must also stop an in-flight browser worker.
  useEffect(() => () => {
    executionScope.current.invalidate();
    definitionScope.current.invalidate();
  }, []);


  const run = useCallback(async (mode: 'run' | 'check' = 'run') => {
    // A synchronous guard also protects Ctrl+Enter from starting two Workers
    // before React has committed the next disabled-button render.
    const execution = executionScope.current.start();
    if (!execution) return;
    // The new execution owns the single WASM slot; retire any pending lookup.
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
    setRunning(true);
    setOperation(mode);
    setResult(null);
    setNotice(null);
    setReferenceResult(null);
    setSelectedReferenceIndex(-1);
    try {
      const response = mode === 'check'
        ? await checkWorkspace(workspace, execution.controller.signal)
        : await runWorkspace(workspace, execution.controller.signal, programInput);
      if (!executionScope.current.isCurrent(execution)) return;
      setResult(response);
      // Open the originating virtual file only for the snapshot that ran.
      const sourcePath = response.diagnostic?.primary?.path;
      if (!response.ok && sourcePath && Object.hasOwn(workspace.files, sourcePath)) {
        setActiveFile(sourcePath);
      }
    } catch (problem) {
      if (!executionScope.current.isCurrent(execution)) return;
      setResult({
        ok: false,
        stdout: '',
        stderr: '',
        error: problem instanceof Error ? problem.message : String(problem),
      });
    } finally {
      if (executionScope.current.finish(execution)) setRunning(false);
    }
  }, [workspace, programInput]);

  const locateReferences = useCallback(async (
    path: string, line: number, column: number, source: string,
  ) => {
    if (workspace.files[path] !== source) {
      setNotice('Source is still changing. Retry Find References.');
      return;
    }
    const offset = editorPositionToByteOffset(source, line, column);
    if (offset === null) {
      setNotice('Place the cursor on a valid Scarp symbol.');
      return;
    }
    executionScope.current.invalidate();
    setRunning(false);
    setResult(null);
    setReferenceResult(null);
    setSelectedReferenceIndex(-1);
    setRenameTarget(null);
    setRenamePreview(null);
    definitionScope.current.invalidate();
    const lookup = definitionScope.current.start();
    if (!lookup) return;
    setNotice('Finding symbol references through the Scarp compiler…');
    try {
      const answer = await findReferences(workspace, path, offset, lookup.controller.signal);
      if (!definitionScope.current.isCurrent(lookup)) return;
      if (!answer.ok) {
        if (answer.diagnostic) {
          setResult({ ok: false, stdout: '', stderr: '',
            error: answer.error, diagnostic: answer.diagnostic });
        }
        setNotice(answer.error || 'Find References failed.');
        return;
      }
      if (!answer.symbol) {
        setNotice('No compiler-indexed symbol at the cursor.');
        return;
      }
      const sites: Array<SourceRange & { kind: string }> =
        answer.declaration ? [{ ...answer.declaration, kind: 'declaration' }] : [];
      sites.push(...answer.references);
      for (const site of sites) {
        if (!Object.hasOwn(workspace.files, site.path) ||
            !sourceLocationToEditorRange(workspace.files[site.path], site)) {
          setNotice('Compiler returned an invalid reference location.');
          return;
        }
      }
      setReferenceResult({
        name: answer.symbol.name, kind: answer.symbol.kind, sites, truncated: answer.truncated,
      });
      setSelectedReferenceIndex(initialReferenceIndex(sites, path, source, line, column));
      setNotice('Found ' + answer.references.length + (answer.truncated ? '+' : '') +
        ' references for ' + answer.symbol.name + '.');
    } finally {
      definitionScope.current.finish(lookup);
    }
  }, [workspace]);

  function beginRename(path: string, line: number, column: number, source: string) {
    if (workspace.files[path] !== source) {
      setNotice('Source is still changing. Retry Rename symbol.');
      return;
    }
    const offset = editorPositionToByteOffset(source, line, column);
    if (offset === null || offset >= new TextEncoder().encode(source).byteLength) {
      setNotice('Place the cursor on a Scarp identifier to rename it.');
      return;
    }
    invalidateExecution();
    setRenameTarget({ snapshot: workspace, path, offset });
    setRenameName('');
    setNotice('Enter a new identifier, preview compiler-checked edits, then apply.');
  }

  async function previewRename() {
    if (!renameTarget || renameBusy || !validRenameName(renameName)) return;
    if (workspace !== renameTarget.snapshot) {
      setRenameTarget(null);
      setNotice('Workspace changed; select the symbol again.');
      return;
    }
    definitionScope.current.invalidate();
    const lookup = definitionScope.current.start();
    if (!lookup) return;
    setRenameBusy(true);
    setRenamePreview(null);
    setNotice('Checking symbol identity and recompiling the proposed rename…');
    try {
      const answer = await previewSymbolRename(
        renameTarget.snapshot, renameTarget.path, renameTarget.offset,
        renameName, lookup.controller.signal,
      );
      if (!definitionScope.current.isCurrent(lookup)) return;
      if (!answer.ok) {
        if (answer.diagnostic) {
          setResult({ ok: false, stdout: '', stderr: '',
            error: answer.error, diagnostic: answer.diagnostic });
        }
        setNotice(answer.error);
        return;
      }
      const diff = buildRenameDiff(renameTarget.snapshot, answer);
      if (!diff) {
        setNotice('The compiler rename could not be independently verified. No edits were made.');
        return;
      }
      setRenamePreview(answer);
      setNotice('Rename preview verified without executing source code.');
    } finally {
      if (definitionScope.current.isCurrent(lookup)) setRenameBusy(false);
      definitionScope.current.finish(lookup);
    }
  }

  function applyRename() {
    if (!renameTarget || !renamePreview || !renameDiff || workspace !== renameTarget.snapshot) {
      setNotice('Rename preview became stale. Retry from the current source.');
      setRenameTarget(null);
      setRenamePreview(null);
      return;
    }
    const { old_name, new_name, changes, changed_files, files: renamedFiles } = renamePreview;
    invalidateExecution();
    // Monaco models intentionally remount for this atomic multi-file change.
    setWorkspace({ entry: workspace.entry, files: { ...renamedFiles } });
    setEditorSession(previous => previous + 1);
    setNotice('Renamed ' + old_name + ' to ' + new_name + ' at ' + changes +
      ' compiler-resolved sites in ' + changed_files.length + ' file(s).');
  }

  function cancelRename() {
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
  }

  function jumpToReference(site: SourceRange, index: number) {
    const source = workspace.files[site.path];
    if (source === undefined) return;
    const range = sourceLocationToEditorRange(source, site);
    if (!range) return;
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setSelectedReferenceIndex(index);
    setActiveFile(site.path);
    setNavigationTarget(previous => ({
      path: site.path, line: range.startLineNumber, column: range.startColumn,
      sequence: (previous?.sequence ?? 0) + 1,
    }));
  }

  function moveReference(direction: -1 | 1) {
    if (!referenceResult || referenceResult.sites.length === 0) return;
    const next = stepReferenceIndex(
      selectedReferenceIndex, referenceResult.sites.length, direction,
    );
    const site = referenceResult.sites[next];
    if (site) jumpToReference(site, next);
  }

  const navigateToDefinition = useCallback(async (
    path: string, line: number, column: number, source: string,
  ) => {
    // Do not navigate a snapshot that has not yet reached the authoritative
    // React workspace; the editor never guesses source/byte coordinates.
    if (workspace.files[path] !== source) {
      setNotice('Source is still changing. Retry Go to Definition.');
      return;
    }
    const offset = editorPositionToByteOffset(source, line, column);
    if (offset === null) {
      setNotice('Place the cursor on a valid Scarp symbol.');
      return;
    }
    // A source navigation request supersedes Run/Check rather than keeping
    // two memory-intensive WASM workers alive simultaneously.
    executionScope.current.invalidate();
    setRunning(false);
    setResult(null);
    setRenameTarget(null);
    setRenamePreview(null);
    definitionScope.current.invalidate();
    const lookup = definitionScope.current.start();
    if (!lookup) return;
    setNotice('Looking up definition using the Scarp compiler…');
    try {
      const response = await findDefinition(workspace, path, offset, lookup.controller.signal);
      if (!definitionScope.current.isCurrent(lookup)) return;
      if (!response.ok) {
        if (response.diagnostic) {
          setResult({ ok: false, stdout: '', stderr: '',
            error: response.error, diagnostic: response.diagnostic });
        }
        setNotice(response.error || 'Definition lookup failed.');
        return;
      }
      if (!response.target) {
        setNotice('No source definition at the cursor (builtins have no source declaration).');
        return;
      }
      const target = response.target;
      if (!Object.hasOwn(workspace.files, target.path)) {
        setNotice('Compiler returned a definition outside the virtual workspace.');
        return;
      }
      const range = sourceLocationToEditorRange(workspace.files[target.path], target);
      if (!range) {
        setNotice('Compiler returned an invalid source position.');
        return;
      }
      setActiveFile(target.path);
      setNavigationTarget(previous => ({
        path: target.path, line: range.startLineNumber, column: range.startColumn,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
      setNotice('Navigated to definition in ' + target.path + '.');
    } finally {
      definitionScope.current.finish(lookup);
    }
  }, [workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey &&
          event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      window.localStorage.setItem('scarp-playground-theme', dark ? 'dark' : 'light');
    } catch {
      // Private browsing may disable persistence; theme still works this session.
    }
  }, [dark]);

  // Both legacy #code= and versioned #project= links can navigate within the
  // same document. Opening one never replaces the opt-in local saved copy.
  useEffect(() => {
    const onHashChange = () => {
      const shared = readSharedWorkspace(window.location.hash);
      if (shared !== null) {
        invalidateExecution();
        setSavingLocally(false);
        setWorkspace(shared.workspace);
        setProgramInput('');
        setEditorSession((number) => number + 1);
        setActiveFile(shared.activeFile);
        setResult(null);
        setNotice('Opened shared project. Your locally saved workspace remains unchanged.');
        return;
      }
      if (window.location.hash !== '') return;
      try {
        const saved = restoreLocalWorkspace(window.localStorage);
        if (saved) {
          invalidateExecution();
          setWorkspace(saved.workspace);
          setProgramInput('');
          setEditorSession((number) => number + 1);
          setActiveFile(saved.activeFile);
          setSavingLocally(true);
          setResult(null);
          setNotice('Restored your locally saved workspace.');
        }
      } catch {
        // No persistent access: leave the current editor intact.
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Opt-in only: store source after explicit Save locally. Do not upload it.
  useEffect(() => {
    if (!savingLocally) return;
    const timer = window.setTimeout(() => {
      let error: string | null;
      try {
        error = saveLocalWorkspace(window.localStorage, workspace, activeFile);
      } catch {
        error = 'Browser storage is unavailable.';
      }
      if (error) {
        setSavingLocally(false);
        setNotice(error + ' Local autosave was disabled.');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workspace, activeFile, savingLocally]);

  function enableLocalSaving() {
    let error: string | null;
    try {
      error = saveLocalWorkspace(window.localStorage, workspace, activeFile);
    } catch {
      error = 'Browser storage is unavailable.';
    }
    if (error) {
      setNotice(error);
      return;
    }
    setSavingLocally(true);
    setNotice('Workspace saved on this browser. Future edits will autosave locally; storage is not encrypted.');
  }

  function forgetLocalSaving() {
    if (!window.confirm('Remove the saved Scarp workspace from this browser? The open editor will stay unchanged.')) return;
    let success = false;
    try {
      success = forgetLocalWorkspace(window.localStorage);
    } catch {
      // Security settings can prevent storage access.
    }
    if (success) {
      setSavingLocally(false);
      setNotice('Saved browser copy removed. The open workspace is still available until you leave.');
    } else {
      setNotice('Unable to remove the saved workspace from browser storage.');
    }
  }

  function selectExample(index: number) {
    invalidateExecution();
    const example = examples[index];
    // Loading a sample replaces the editor session, not the user's saved
    // project. Stop autosaving before switching workspaces; explicit Save
    // locally is required to replace the browser's previous snapshot.
    setSavingLocally(false);
    setWorkspace({ entry: example.entry, files: { ...example.files } });
    setProgramInput(example.stdin ?? '');
    setEditorSession((number) => number + 1);
    setActiveFile(example.entry);
    setResult(null);
    setNotice('Loaded ' + example.title +
      (savingLocally
        ? ' — your locally saved workspace is preserved. Choose Save locally to replace it.'
        : ' — ready to execute with the real compiler.'));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function changeSource(path: string, source: string) {
    invalidateExecution();
    setWorkspace((previous) => {
      if (!Object.hasOwn(previous.files, path) || previous.files[path] === source) return previous;
      return { ...previous, files: { ...previous.files, [path]: source } };
    });
    // Once the user edits source, the previous run's errors are no longer valid.
    setResult(null);
  }

  function addFile() {
    if (files.length >= MAX_FILES) {
      setNotice('This preview supports up to ' + MAX_FILES + ' files.');
      return;
    }
    const name = window.prompt('New relative .srp path (for example lib/math.srp)');
    if (name === null) return;
    if (!validPath(name) || Object.hasOwn(workspace.files, name)) {
      setNotice('Choose a unique relative .srp path with letters, numbers, hyphens or underscores.');
      return;
    }
    invalidateExecution();
    setWorkspace((previous) => ({
      ...previous,
      files: { ...previous.files, [name]: '// New Scarp module\n' },
    }));
    setActiveFile(name);
    setNotice('Added ' + name + '. Imports can refer to this file by relative path.');
  }

  function removeFile() {
    if (files.length <= 1) {
      setNotice('The workspace needs at least one source file.');
      return;
    }
    const replacement = files.find((file) => file !== activeFile)!;
    invalidateExecution();
    setWorkspace((previous) => {
      const nextFiles = { ...previous.files };
      delete nextFiles[activeFile];
      return {
        entry: previous.entry === activeFile ? replacement : previous.entry,
        files: nextFiles,
      };
    });
    setActiveFile(replacement);
    setResult(null);
  }

  function exportWorkspace() {
    const json = serializePortableWorkspace(workspace, activeFile);
    if (!json) {
      setNotice('The workspace cannot be exported until its paths and source sizes are valid.');
      return;
    }
    const address = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = address;
    link.download = 'scarp-workspace.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(address), 0);
    setNotice('Downloaded a portable copy of all .srp files. No source was uploaded.');
  }

  async function importWorkspaceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Allow the same file to be selected again after a rejected import.
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_PORTABLE_WORKSPACE_BYTES) {
      setNotice('The selected project exceeds the 160 KiB portable workspace limit.');
      return;
    }
    try {
      const imported = parsePortableWorkspace(await file.text());
      if (!imported) {
        setNotice('Invalid Scarp workspace JSON. Check the format, version, source files and size limits.');
        return;
      }
      if (!window.confirm(
        'Replace the open workspace with this project? Unsaved changes to the open editor will be lost. Your locally saved browser copy will not be overwritten.',
      )) return;
      // A portable import is session-only until the user explicitly opts in.
      // Stop any previously enabled autosave; keep the old saved snapshot.
      invalidateExecution();
      setSavingLocally(false);
      setWorkspace(imported.workspace);
      setProgramInput('');
      setEditorSession((number) => number + 1);
      setActiveFile(imported.activeFile);
      setResult(null);
      setNotice('Imported ' + Object.keys(imported.workspace.files).length +
        ' Scarp source files. Save locally if you want this project to persist after reload.');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      setNotice('The selected project could not be read.');
    }
  }

  async function share() {
    const url = makeWorkspaceShareUrl(window.location.origin, window.location.pathname, workspace, activeFile);
    if (!url) {
      setNotice('This project exceeds the 8 KiB share-link limit or has invalid sources. Use Export project instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Copied a shareable project link with all source files. The link contains unencrypted code.');
    } catch {
      setNotice('Clipboard access was blocked. Use Export project to share your code instead.');
    }
  }

  const diagnostic = result?.diagnostic;
  const location = diagnostic?.primary;
  const errorText = diagnostic?.message || result?.error;

  return (
    <div className="app-shell min-h-screen">
      <header className="topbar">
        <div className="brand" aria-label="Scarp Playground">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div>
            <div className="brand-title">Scarp <span>Playground</span></div>
            <div className="brand-subtitle">The official interactive workspace</div>
          </div>
          <span className="alpha-badge">Development preview</span>
        </div>
        <nav className="header-actions" aria-label="Project links">
          <a href="https://scarp-lang.github.io/scarp-docs/" target="_blank" rel="noreferrer">Docs ↗</a>
          <a href="https://github.com/scarp-lang/scarp-by-example" target="_blank" rel="noreferrer">Examples ↗</a>
          <a href="https://github.com/scarp-lang/scarp-playground" target="_blank" rel="noreferrer">GitHub ↗</a>
          <button className="icon-button" type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Toggle theme">
            {dark ? '☀' : '☾'}
          </button>
        </nav>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="section-label">GET STARTED</div>
          <h1 className="sidebar-heading">Code. Run. Learn.</h1>
          <p className="sidebar-copy">Experiment with Scarp using its real Rust interpreter, compiled for your browser.</p>
          <div className="section-label mt-8">EXAMPLE PROGRAMS</div>
          <div className="example-list">
            {examples.map((example, index) => (
              <button key={example.title} className="example-button" type="button" onClick={() => selectExample(index)}>
                <span className="example-symbol">{index === 0 ? '✦' : index === 1 ? '∑' : '⌘'}</span>
                <span className="example-details">
                  <strong>{example.title}</strong>
                  <small>{example.description}</small>
                </span>
                <span className="example-arrow">›</span>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="section-label">COMPATIBILITY</div>
            <strong>Scarp v0.0.6-alpha.7</strong>
            <p>Compiler source pinned to release commit b1c1fd2. Code runs locally inside a disposable Web Worker.</p>
            <a href="https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.7" target="_blank" rel="noreferrer">Compiler release notes ↗</a>
          </div>
        </aside>

        <section className="workspace-area" aria-label="Code workspace">
          <div className="workspace-toolbar">
            <div>
              <div className="workspace-heading">Workspace <span className="workspace-count">{files.length} .srp {files.length === 1 ? 'file' : 'files'}</span></div>
              <p>Write Scarp and press Ctrl + Enter to execute.</p>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="button-secondary" onClick={() => savingLocally ? forgetLocalSaving() : enableLocalSaving()}>
                {savingLocally ? 'Forget saved copy' : 'Save locally'}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                aria-label="Import project JSON"
                hidden
                onChange={(event) => void importWorkspaceFile(event)}
              />
              <button type="button" className="button-secondary" onClick={() => importFileRef.current?.click()}>Import project</button>
              <button type="button" className="button-secondary" onClick={exportWorkspace}>Export project</button>
              <button type="button" className="button-secondary"
                aria-expanded={searchOpen} aria-controls="project-search-panel"
                onClick={() => setSearchOpen(open => !open)}>
                Find in project
              </button>
              <button type="button" className="button-secondary" onClick={() => void share()} title="Copy a link to the complete project when it fits the URL limit">Share ↗</button>
              <button type="button" className="button-secondary" onClick={() => void run('check')} disabled={running}>
                Check code
              </button>
              {running ? (
                <button type="button" className="button-secondary" onClick={invalidateExecution}>
                  Stop {operation === 'check' ? 'check' : 'run'}
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={() => void run()}>
                  <span aria-hidden="true">▶</span> Run code
                </button>
              )}
            </div>
          </div>

          {searchOpen && (
            <section id="project-search-panel" className="project-search" aria-label="Search Scarp project">
              <div className="project-search-bar">
                <label htmlFor="project-search-input">Find in all .srp files</label>
                <input id="project-search-input" ref={searchInputRef} type="search"
                  value={searchQuery} maxLength={MAX_SEARCH_QUERY}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search source text…"
                  aria-label="Search text in project" />
                <button type="button" onClick={() => setSearchQuery('')}
                  disabled={!searchQuery}>Clear</button>
                <button type="button" onClick={() => setSearchOpen(false)}
                  aria-label="Close project search">Close</button>
              </div>
              <p className="project-search-status" role="status">
                {searchQuery.length < 2
                  ? 'Enter at least two characters. Searches are local and case-insensitive.'
                  : searchResult.matches.length + (searchResult.truncated ? '+' : '') +
                    ' matching locations' + (searchResult.truncated ? ' (limit reached)' : '')}
              </p>
              {searchQuery.length >= 2 && searchResult.matches.length > 0 && (
                <div className="project-search-results" aria-label="Project search matches">
                  {searchResult.matches.map((hit, index) => (
                    <button key={hit.path + ':' + hit.line + ':' + hit.column + ':' + index}
                      type="button" className="project-search-hit"
                      aria-label={'Open ' + hit.path + ' line ' + hit.line + ' column ' + hit.column}
                      onClick={() => jumpToSearchHit(hit)}>
                      <strong>{hit.path}:{hit.line}:{hit.column}</strong>
                      <span>{hit.preview}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {referenceResult && (
            <section className="project-search" aria-label="Compiler references" data-testid="references-panel">
              <div className="project-search-bar">
                <strong>References: {referenceResult.name}</strong>
                <span>{referenceResult.kind} · {referenceResult.sites.length} location(s)
                  {referenceResult.truncated ? ' (additional references omitted)' : ''}</span>
                <span role="status" className="reference-position">
                  {referenceResult.sites.length
                    ? 'Selected ' + (selectedReferenceIndex + 1) + ' of ' + referenceResult.sites.length
                    : 'No source locations'}
                </span>
                <button type="button" aria-label="Previous reference"
                  disabled={referenceResult.sites.length < 2}
                  onClick={() => moveReference(-1)}>Previous</button>
                <button type="button" aria-label="Next reference"
                  disabled={referenceResult.sites.length < 2}
                  onClick={() => moveReference(1)}>Next</button>
                <button type="button" aria-label="Close references" onClick={() => {
                  setReferenceResult(null);
                  setSelectedReferenceIndex(-1);
                }}>Close</button>
              </div>
              <div className="project-search-results" aria-label="Resolved reference locations">
                {referenceResult.sites.map((site, index) => {
                  const location = sourceLocationToEditorRange(workspace.files[site.path], site);
                  return (
                    <button type="button"
                      className={'project-search-hit ' + (selectedReferenceIndex === index ? 'reference-selected' : '')}
                      aria-current={selectedReferenceIndex === index ? 'location' : undefined}
                      key={site.path + ':' + site.start.line + ':' + site.start.column + ':' + index}
                      aria-label={'Go to ' + site.kind + ' at ' + site.path + ' line ' +
                        site.start.line + ' column ' + site.start.column}
                      onClick={() => jumpToReference(site, index)}>
                      <strong>{site.path}:{site.start.line}:{location?.startColumn ?? site.start.column}
                        {' · '}{site.kind}</strong>
                      <span>{workspace.files[site.path].split(/\r\n|\n|\r/)[site.start.line - 1]?.trim().slice(0, 170) ?? ''}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {renameTarget && (
            <section className="project-search" aria-label="Rename Scarp symbol" data-testid="rename-panel">
              <form className="project-search-bar" onSubmit={event => {
                event.preventDefault();
                void previewRename();
              }}>
                <label htmlFor="rename-new-name">Rename symbol at {renameTarget.path}</label>
                <input id="rename-new-name" ref={renameInputRef} type="text"
                  aria-label="New Scarp identifier" autoComplete="off"
                  spellCheck={false} maxLength={64} required
                  value={renameName} disabled={renameBusy}
                  onChange={event => {
                    definitionScope.current.invalidate();
                    setRenamePreview(null);
                    setRenameName(event.target.value);
                  }} />
                <button type="submit"
                  disabled={renameBusy || !validRenameName(renameName) || !!renamePreview}>
                  {renameBusy ? 'Validating…' : 'Preview rename'}
                </button>
                <button type="button" onClick={cancelRename}>Cancel rename</button>
              </form>
              {renamePreview && (
                <div className="project-search-results">
                  <p role="status">Compiler verified {renamePreview.changes} site(s) in{' '}
                    {renamePreview.changed_files.length} file(s):{' '}
                    <strong>{renamePreview.old_name}</strong> → <strong>{renamePreview.new_name}</strong>
                  </p>
                  {renameDiff && (
                    <>
                      <p className="rename-diff-summary">
                        Review {renameDiff.changedLines} changed line(s) before applying.
                        Only the listed compiler-indexed identifiers will change.
                      </p>
                      <div className="rename-diff-list" data-testid="rename-diff"
                        role="region" aria-label="Proposed rename changes">
                        {renameDiff.files.map(file => (
                          <section className="rename-diff-file" key={file.path}>
                            <h3>{file.path} · {file.lines.length} changed line(s)</h3>
                            {file.lines.map(line => (
                              <div className="rename-diff-line" key={line.line}>
                                <button type="button" className="rename-diff-jump"
                                  aria-label={'Open ' + file.path + ' line ' + line.line}
                                  onClick={() => {
                                    setActiveFile(file.path);
                                    setNavigationTarget(previous => ({
                                      path: file.path, line: line.line, column: 1,
                                      sequence: (previous?.sequence ?? 0) + 1,
                                    }));
                                  }}>
                                  Line {line.line} · {line.sites} replacement(s)
                                </button>
                                <div className="rename-diff-source">
                                  <span className="rename-diff-indicator" aria-hidden="true">−</span>
                                  <pre aria-label={'Before rename, ' + file.path + ' line ' + line.line}>
                                    {line.before}
                                  </pre>
                                </div>
                                <div className="rename-diff-source rename-diff-after">
                                  <span className="rename-diff-indicator" aria-hidden="true">+</span>
                                  <pre aria-label={'After rename, ' + file.path + ' line ' + line.line}>
                                    {line.after}
                                  </pre>
                                </div>
                              </div>
                            ))}
                          </section>
                        ))}
                      </div>
                    </>
                  )}
                  <button type="button" className="button-primary"
                    disabled={!renameDiff}
                    onClick={applyRename}>Apply rename to workspace</button>
                </div>
              )}
            </section>
          )}

          <div className="editor-card">
            <div className="file-tabs" role="tablist" aria-label="Scarp source files">
              {files.map((file) => (
                <button
                  key={file}
                  role="tab"
                  type="button"
                  aria-selected={file === activeFile}
                  className={'file-tab ' + (file === activeFile ? 'active' : '')}
                  onClick={() => setActiveFile(file)}
                >
                  <span className="srp-icon">S</span>{file}
                  {file === workspace.entry && <span className="entry-pill">entry</span>}
                </button>
              ))}
              <button type="button" className="file-add" onClick={addFile} title="Add .srp file" aria-label="Add file">+</button>
            </div>
            <div className="editor-body">
              <Suspense
                fallback={
                  <div className="editor-loading" role="status">
                    Loading Scarp editor…
                  </div>
                }
              >
                <ScarpEditor key={editorSession} path={activeFile} files={workspace.files} dark={dark} diagnostic={diagnostic} onChange={changeSource} onNavigate={navigateToDefinition} onFindReferences={locateReferences} onRename={beginRename} navigationTarget={navigationTarget}
                  navigationTrigger={navigationTrigger} referenceTrigger={referenceTrigger} renameTrigger={renameTrigger}
                  referenceSites={referenceResult?.sites ?? null}
                  selectedReferenceIndex={selectedReferenceIndex} />
              </Suspense>
            </div>
            <div className="editor-footer">
              <span><span className="online-dot" />Scarp syntax · Ctrl+Space: Completion · F12: Definition · Shift+F12: References · F2: Rename</span>
              <span>UTF-8 · {activeFile}</span>
              <div className="footer-controls">
                <button type="button" onClick={() => setNavigationTrigger(previous => previous + 1)}
                  title="Navigate to the source declaration under the editor cursor (F12)">
                  Go to definition
                </button>
                <button type="button" onClick={() => setReferenceTrigger(previous => previous + 1)}
                  title="Find actual compiler-indexed references to the symbol under the cursor (Shift+F12)">
                  Find references
                </button>
                <button type="button" onClick={() => setRenameTrigger(previous => previous + 1)}
                  title="Preview compiler-checked symbol rename (F2)">
                  Rename symbol
                </button>
                <button type="button" onClick={() => {
                  invalidateExecution();
                  setWorkspace((previous) => ({ ...previous, entry: activeFile }));
                }} disabled={workspace.entry === activeFile}>Set as entry</button>
                <button type="button" onClick={removeFile} disabled={files.length < 2}>Remove file</button>
              </div>
            </div>
          </div>

          <section className="stdin-panel" aria-label="Buffered program input">
            <div className="stdin-heading">
              <label htmlFor="scarp-program-input">Program input (stdin)</label>
              <span>{new TextEncoder().encode(programInput).byteLength} / {MAX_PROGRAM_INPUT_BYTES} UTF-8 bytes</span>
            </div>
            <textarea id="scarp-program-input" rows={3} spellCheck={false}
              aria-label="Program input (stdin)"
              value={programInput} maxLength={MAX_PROGRAM_INPUT_BYTES}
              placeholder={'Text consumed by read_line(), one line per call…'}
              onChange={event => {
                invalidateExecution();
                setProgramInput(event.target.value);
              }} />
            <p>Buffered input is supplied only when you run the program. It is not
              interactive, is not saved or shared, and cannot be read in Check code mode.</p>
          </section>

          <section className="console-card" aria-label="Program output">
            <div className="console-toolbar">
              <div><span className="terminal-glyph">›_</span><strong>Output</strong><span className="console-subtitle">{operation === 'check' ? 'Compiler validation' : 'Real compiler execution'}</span></div>
              <div className="console-right">
                {result && <span className={'result-status ' + (result.ok ? 'success' : 'failure')}>{result.ok ? '● Success' : '● Error'}</span>}
                <button type="button" onClick={invalidateExecution}>Clear</button>
              </div>
            </div>
            <div className="terminal-output" aria-live="polite">
              {running && <p className="terminal-muted">{operation === 'check' ? 'Checking Scarp with the real compiler…' : 'Loading compiler and executing program…'}</p>}
              {!running && !result && <p className="terminal-muted">$ Select an example or write code, then click Run code.</p>}
              {result && (
                <>
                  {result.ok && operation === 'check' && <p className="terminal-muted">Checks passed. No program output was emitted.</p>}
                  {result.stdout && <pre className="stdout">{result.stdout}</pre>}
                  {result.stderr && <pre className="stderr">{result.stderr}</pre>}
                  {!result.ok && (
                    <div className="error-panel" role="alert">
                      <div className="error-title">
                        {diagnostic?.code || 'Execution error'}
                        {location && (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="diagnostic-jump"
                              aria-label={'Go to error in ' + location.path}
                              title="Jump to the compiler error location"
                              disabled={!Object.hasOwn(workspace.files, location.path)}
                              onClick={() => setActiveFile(location.path)}
                            >
                              {location.path + ':' + location.start.line + ':' + location.start.column}
                            </button>
                          </>
                        )}
                      </div>
                      <pre>{errorText || 'An unknown compiler error occurred.'}</pre>
                      {diagnostic?.help && <p className="error-help">Hint: {diagnostic.help}</p>}
                      {diagnostic?.related?.map((note, index) => note.location && (
                        <button
                          key={index}
                          type="button"
                          className="diagnostic-related"
                          disabled={!Object.hasOwn(workspace.files, note.location.path)}
                          onClick={() => { if (note.location) setActiveFile(note.location.path); }}
                        >
                          {note.message + ' · ' + note.location.path + ':' +
                            note.location.start.line + ':' + note.location.start.column}
                        </button>
                      ))}
                    </div>
                  )}
                  {result.ok && !result.stdout && !result.stderr && <p className="terminal-muted">Program completed without producing output.</p>}
                </>
              )}
            </div>
          </section>
          {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
          <p className="disclaimer">Experimental preview · Browser execution has work and output limits. Do not use for untrusted high-risk code or sensitive secrets. {savingLocally && 'Opt-in local autosave is active: code is stored unencrypted in this browser profile.'}</p>
        </section>
      </main>
    </div>
  );
}
