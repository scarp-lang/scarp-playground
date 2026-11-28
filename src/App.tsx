import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

// Keep the large Monaco code out of the initial React shell bundle.
// The actual editor loads on demand while the rest of the UI stays interactive.
const ScarpEditor = lazy(() =>
  import('./ScarpEditor').then(({ ScarpEditor }) => ({ default: ScarpEditor })),
);
import type { Example } from './examples';
import { defaultExample } from './default-example';
const ExampleBrowser = lazy(() => import('./ExampleBrowser').then(module => ({ default: module.ExampleBrowser })));
const SourceExplorer = lazy(() => import('./SourceExplorer').then(module => ({ default: module.SourceExplorer })));
const SourceCheckpointPanel = lazy(() => import('./SourceCheckpointPanel').then(module => ({ default: module.SourceCheckpointPanel })));
const SourceTimelinePanel = lazy(() => import('./SourceTimelinePanel').then(module => ({ default: module.SourceTimelinePanel })));
import { captureSourceCheckpoint, previewCheckpointRestore, type SourceCheckpoint } from './source-checkpoint';
import { emptySourceTimeline, previewTimelineRestore, type SourceTimeline } from './source-timeline';
import { previewNewSource } from './workspace-tree';
import type { LibraryProject } from './library/model';
const ProjectLibraryPanel = lazy(() => import('./ProjectLibraryPanel').then(module => ({ default: module.ProjectLibraryPanel })));
const ModuleGraphPanel = lazy(() => import('./ModuleGraphPanel').then(module => ({ default: module.ModuleGraphPanel })));
const SourceOutlinePanel = lazy(() => import('./SourceOutlinePanel').then(module => ({ default: module.SourceOutlinePanel })));
import { inspectSourceOutline } from './navigation/outline-client';
import type { LocatedOutline } from './navigation/outline-protocol';
import type { LocatedInspection } from './navigation/inspection-protocol';
const ModuleInspectionPanel = lazy(() => import('./ModuleInspectionPanel').then(module => ({ default: module.ModuleInspectionPanel })));

import compilerCompatibility from '../compiler-compatibility.json';
import { checkWorkspace, runWorkspace, verifyWorkspace, MAX_PROGRAM_INPUT_BYTES } from './runner/client';
import { previewProgramInputEdit, programInputBytes } from './program-input';
import { editorPositionToByteOffset } from './navigation/coordinates';
import { findDefinition } from './navigation/client';
import { findReferences, type SourceRange } from './navigation/references';
import { previewSymbolRename, validRenameName, type RenameResult } from './navigation/rename';
import { buildRenameDiff } from './navigation/rename-diff';
import { initialReferenceIndex, stepReferenceIndex } from './navigation/reference-view';
import { diagnosticNavigationPosition, sourceLocationToEditorRange } from './diagnostics';
import { ExecutionScope, type ActiveExecution } from './runner/execution-scope';
import type { DiagnosticLocation, RunResult } from './runner/types';
import { describeBrowserRun, type BrowserRunStats } from './runner/browser-stats';
import { BrowserRunDetails } from './BrowserRunDetails';
const TestCasePanel = lazy(() => import('./TestCasePanel').then(module => ({ default: module.TestCasePanel })));
import type { Challenge } from './challenges/model';
const ChallengePanel = lazy(() => import('./ChallengePanel').then(module => ({ default: module.ChallengePanel })));
import { newTestCase, runTestCases, type TestCase, type SuiteReport } from './runner/test-cases';
import { consoleTranscript, consoleOperationSubtitle, type ConsoleMode } from './runner/transcript';
import { browserDiagnosticHelp } from './runner/browser-diagnostic-help';
import { MAX_FILES, MAX_FILE_BYTES, validPath, type Workspace } from './workspace';
import { makeWorkspaceShareUrl, readSharedWorkspace } from './share-workspace';
import { MAX_SEARCH_QUERY, searchProjectFiles, type ProjectSearchHit } from './project-search';
import { previewProjectReplace, MAX_REPLACEMENT_LENGTH, type ReplacePlan } from './project-replace';
import { scarpFileStats } from './source-file';
import { createSourceArchive, sourceArchiveProblem, parseSourceArchive, MAX_SOURCE_ARCHIVE_BYTES } from './source-archive';
import { previewSourceImport } from './source-import';
import { decodeSourceFolder, MAX_FOLDER_SELECTION_ENTRIES, planFolderSelection } from './source-folder';
const SourceFolderPreview = lazy(() => import('./SourceFolderPreview').then(module => ({ default: module.SourceFolderPreview })));
import { QuickOpenFiles } from './QuickOpenFiles';
import type { WorkspaceCommand } from './command-palette';
const CommandPalette = lazy(() => import('./CommandPalette').then(module => ({ default: module.CommandPalette })));
import { quickOpenPosition } from './quick-open';
import { previewModuleMove, type ModuleMovePlan } from './module-move';
const FolderMovePanel = lazy(() => import('./FolderMovePanel').then(module => ({ default: module.FolderMovePanel })));
import type { FolderMovePlan } from './folder-move';
import { previewModuleRemoval, type ModuleRemovalPlan } from './module-remove';
import { previewModuleDuplicate, suggestDuplicatePath, type ModuleDuplicatePlan } from './module-duplicate';
import { createBulkEditUndo, undoBulkEdit, type BulkEditUndo } from './bulk-undo';
import { forgetLocalWorkspace, restoreLocalWorkspace, saveLocalWorkspace } from './persistence';
import { hasUnprotectedSessionWork, sameWorkspaceContents, type SessionCheckpoint } from './session-safety';
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
  const initial = defaultExample;
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
  const [savedWorkspace, setSavedWorkspace] = useState<Workspace | null>(
    initial.savingLocally ? initial.workspace : null,
  );
  const [checkpoint, setCheckpoint] = useState<SessionCheckpoint>({
    workspace: initial.workspace,
    stdin: '',
    recoverable: true,
  });
  const acceptedHash = useRef(window.location.hash);
  const [dark, setDark] = useState(startingTheme() === 'dark');
  const [running, setRunning] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [suiteKind, setSuiteKind] = useState<'manual' | 'challenge'>('manual');
  const [testCasesOpen, setTestCasesOpen] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>(() => [newTestCase()]);
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState(0);
  const [suiteReport, setSuiteReport] = useState<SuiteReport | null>(null);
  const [operation, setOperation] = useState<ConsoleMode>('run');
  const [result, setResult] = useState<(RunResult & { browserStats?: BrowserRunStats | null }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Runtime input is intentionally ephemeral: never saved or placed in shared links.
  const [programInput, setProgramInput] = useState('');
  // Session-only opt-in; pre-supplied input never creates a live host terminal.
  const [allowPrompts, setAllowPrompts] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moduleGraphOpen, setModuleGraphOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineResult, setOutlineResult] = useState<{ workspace: Workspace; path: string; result: LocatedOutline } | null>(null);
  const outlineTask = useRef<ActiveExecution | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<{ workspace: Workspace; result: LocatedInspection } | null>(null);
  const inspectionTask = useRef<ActiveExecution | null>(null);
  const [folderMoveOpen, setFolderMoveOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [sourceCheckpointOpen, setSourceCheckpointOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [sourceTimeline, setSourceTimeline] = useState<SourceTimeline>(emptySourceTimeline);
  const [sourceCheckpoint, setSourceCheckpoint] = useState<SourceCheckpoint | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpenPrefill, setQuickOpenPrefill] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceMatchCase, setReplaceMatchCase] = useState(false);
  const [replacePreview, setReplacePreview] = useState<{
    snapshot: Workspace; plan: Extract<ReplacePlan, { ok: true }>;
  } | null>(null);
  const [lastBulkEdit, setLastBulkEdit] = useState<BulkEditUndo | null>(null);
  const [fileMove, setFileMove] = useState<{
    snapshot: Workspace; from: string; to: string;
  } | null>(null);
  const [fileMovePlan, setFileMovePlan] =
    useState<Extract<ModuleMovePlan, { ok: true }> | null>(null);
  const [fileDuplicate, setFileDuplicate] = useState<{
    snapshot: Workspace; from: string; to: string;
  } | null>(null);
  const [fileDuplicatePlan, setFileDuplicatePlan] =
    useState<Extract<ModuleDuplicatePlan, { ok: true }> | null>(null);
  const [fileRemoval, setFileRemoval] = useState<{
    snapshot: Workspace; from: string; plan: ModuleRemovalPlan;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const sourceFilesRef = useRef<HTMLInputElement>(null);
  const sourceFolderRef = useRef<HTMLInputElement>(null);
  const sourceArchiveRef = useRef<HTMLInputElement>(null);
  const [folderPreview, setFolderPreview] = useState<{ snapshot: Workspace; workspace: Workspace; ignored: number; key: number; kind: 'folder' | 'archive' } | null>(null);
  const folderPreviewSequence = useRef(0);
  const sourceImportActive = useRef(false);
  const [importingSources, setImportingSources] = useState(false);
  const [folderPickerSupported, setFolderPickerSupported] = useState(false);
  useEffect(() => {
    const picker = sourceFolderRef.current;
    if (picker && 'webkitdirectory' in picker) {
      picker.setAttribute('webkitdirectory', '');
      setFolderPickerSupported(true);
    }
  }, []);
  const executionScope = useRef(new ExecutionScope());
  const definitionScope = useRef(new ExecutionScope());
  const [navigationTrigger, setNavigationTrigger] = useState(0);
  const [referenceTrigger, setReferenceTrigger] = useState(0);
  const [renameTrigger, setRenameTrigger] = useState(0);
  const [commentTrigger, setCommentTrigger] = useState(0);
  const [wordWrap, setWordWrap] = useState(false);
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
  const latestSession = useRef({
    workspace, activeFile, programInput, savingLocally, savedWorkspace, checkpoint,
  });
  latestSession.current = {
    workspace, activeFile, programInput, savingLocally, savedWorkspace, checkpoint,
  };
  const unprotectedWork = hasUnprotectedSessionWork(
    workspace, programInput, savingLocally, savedWorkspace, checkpoint,
  );
  const files = Object.keys(workspace.files);
  const activeStats = useMemo(() => scarpFileStats(activeFile, workspace.files[activeFile] ?? ''),
    [activeFile, workspace.files]);
  const searchResult = useMemo(() =>
    searchProjectFiles(workspace.files, searchQuery), [workspace.files, searchQuery]);

  // A normal editor change or project switch makes the previous undo token stale.
  // Only the exact post-edit workspace remains eligible for atomic restoration.
  useEffect(() => {
    if (lastBulkEdit && workspace !== lastBulkEdit.after) setLastBulkEdit(null);
  }, [workspace, lastBulkEdit]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (renameTarget) renameInputRef.current?.focus();
  }, [renameTarget]);

  async function refreshInspection() {
    if (executionScope.current.running || inspectionTask.current) return;
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
    const lookup = definitionScope.current.start();
    if (!lookup) return;
    inspectionTask.current = lookup;
    setInspectionBusy(true);
    setInspectionResult(null);
    const snapshot = workspace;
    try {
      const { inspectWorkspace } = await import('./navigation/inspection-client');
      if (!definitionScope.current.isCurrent(lookup)) return;
      const result = await inspectWorkspace(snapshot, lookup.controller.signal);
      if (definitionScope.current.isCurrent(lookup) && latestSession.current.workspace === snapshot) {
        setInspectionResult({ workspace: snapshot, result });
      }
    } catch {
      if (definitionScope.current.isCurrent(lookup)) setInspectionResult({
        workspace: snapshot, result: { ok: false, error: 'Unable to load module inspection.' },
      });
    } finally {
      definitionScope.current.finish(lookup);
      if (inspectionTask.current === lookup) {
        inspectionTask.current = null;
        setInspectionBusy(false);
      }
    }
  }

  function closeInspection() {
    if (inspectionTask.current && definitionScope.current.isCurrent(inspectionTask.current)) definitionScope.current.invalidate();
    setInspectionOpen(false);
    setInspectionResult(null);
  }

  async function refreshOutline() {
    if (executionScope.current.running || outlineTask.current) return;
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
    const lookup = definitionScope.current.start();
    if (!lookup) return;
    outlineTask.current = lookup;
    setOutlineBusy(true);
    setOutlineResult(null);
    const path = activeFile;
    const snapshot = workspace;
    try {
      const result = await inspectSourceOutline(snapshot, path, lookup.controller.signal);
      const latest = latestSession.current;
      if (definitionScope.current.isCurrent(lookup) && latest.workspace === snapshot && latest.activeFile === path) {
        setOutlineResult({ workspace: snapshot, path, result });
      }
    } finally {
      definitionScope.current.finish(lookup);
      if (outlineTask.current === lookup) {
        outlineTask.current = null;
        setOutlineBusy(false);
      }
    }
  }

  function closeOutline() {
    if (outlineTask.current && definitionScope.current.isCurrent(outlineTask.current)) {
      definitionScope.current.invalidate();
    }
    setOutlineOpen(false);
    setOutlineResult(null);
  }

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

  function planProjectReplacement() {
    const plan = previewProjectReplace(workspace, searchQuery, replaceText, replaceMatchCase);
    if (!plan.ok) {
      setReplacePreview(null);
      setNotice(plan.error);
      return;
    }
    setReplacePreview({ snapshot: workspace, plan });
    setNotice('Preview only: no project files have been changed or executed.');
  }

  function applyProjectReplacement() {
    if (!replacePreview || workspace !== replacePreview.snapshot) {
      setReplacePreview(null);
      setNotice('The replacement preview is stale. Preview the current source again.');
      return;
    }
    // Apply the entire validated replacement atomically; remount Monaco models
    // so stale editor buffers cannot overwrite an updated secondary file.
    const { plan } = replacePreview;
    const undoToken = createBulkEditUndo(workspace, plan.workspace, 'project-wide replacement');
    if (!undoToken) {
      setReplacePreview(null);
      setNotice('Unable to prepare an atomic workspace replacement. No edits were made.');
      return;
    }
    invalidateExecution();
    setWorkspace(plan.workspace);
    setLastBulkEdit(undoToken);
    setEditorSession(previous => previous + 1);
    setNotice('Replaced ' + plan.changes + ' literal text occurrence(s) in ' +
      plan.changedFiles.length + ' .srp file(s). Check the program before running.');
  }

  function restoreTimelineItem(snapshot: Workspace, id: number) {
    if (workspace !== snapshot) {
      setNotice('The source timeline restore became stale. Review the current snapshot again.');
      return;
    }
    const plan = previewTimelineRestore(sourceTimeline, id, workspace, activeFile);
    if (!plan) {
      setNotice('The selected timeline snapshot could not be safely restored.');
      return;
    }
    invalidateExecution();
    setWorkspace(plan.workspace);
    setActiveFile(plan.activeFile);
    setLastBulkEdit(plan.undo);
    setEditorSession(previous => previous + 1);
    setTimelineOpen(false);
    setNotice('Restored a named source timeline snapshot. Undo bulk change can reverse it.');
  }

  function captureCheckpoint() {
    const snapshot = captureSourceCheckpoint(workspace, activeFile);
    if (!snapshot) {
      setNotice('Fix the source workspace before capturing a checkpoint.');
      return;
    }
    if (sourceCheckpoint && !window.confirm('Replace the previous temporary source checkpoint?')) return;
    setSourceCheckpoint(snapshot);
    setNotice('Captured a source-only checkpoint in memory. No input or results were included.');
  }

  function restoreCheckpoint() {
    if (!sourceCheckpoint) return;
    const plan = previewCheckpointRestore(workspace, activeFile, sourceCheckpoint);
    if (!plan) {
      setNotice('No valid source changes to restore.');
      return;
    }
    if (!window.confirm('Restore the captured source files and entrypoint? The current sources will be replaced. Program input is unchanged.' +
      (savingLocally ? ' Your opted-in saved browser copy will also update.' : '') +
      ' Undo bulk change can reverse this until the next edit.')) return;
    invalidateExecution();
    setWorkspace(plan.workspace);
    setActiveFile(plan.activeFile);
    setLastBulkEdit(plan.undo);
    setEditorSession(previous => previous + 1);
    setNotice('Restored the source checkpoint. Undo bulk change can restore the previous workspace.');
  }

  function undoLastBulkChange() {
    const original = undoBulkEdit(workspace, lastBulkEdit);
    if (!original || !lastBulkEdit) {
      setLastBulkEdit(null);
      setNotice('The previous bulk change is no longer safe to undo.');
      return;
    }
    const label = lastBulkEdit.label;
    invalidateExecution();
    setWorkspace(original);
    setActiveFile(current => (lastBulkEdit.label === 'file removal' || lastBulkEdit.label === 'checkpoint restore') &&
      lastBulkEdit.restoreActiveFile
      ? lastBulkEdit.restoreActiveFile
      : Object.hasOwn(original.files, current)
        ? current : lastBulkEdit.restoreActiveFile ?? original.entry);
    setLastBulkEdit(null);
    setEditorSession(previous => previous + 1);
    setNotice('Undid the last ' + label + ' across all affected files.');
  }

  function invalidateExecution() {
    setOutlineResult(null);
    setInspectionResult(null);
    setFolderPreview(null);
    setFolderMoveOpen(false);
    setQuickOpen(false);
    setFileDuplicate(null);
    setFileDuplicatePlan(null);
    setFileRemoval(null);
    setFileMove(null);
    setFileMovePlan(null);
    setReplacePreview(null);
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
    setSuiteRunning(false);
    setSuiteProgress(0);
    setSuiteReport(null);
    setResult(null);
  }

  // Component teardown must also stop an in-flight browser worker.
  useEffect(() => () => {
    executionScope.current.invalidate();
    definitionScope.current.invalidate();
  }, []);


  const run = useCallback(async (mode: 'run' | 'check' | 'verify' = 'run') => {
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
    // A new compiler result must not inherit a previous cursor target.
    setNavigationTarget(null);
    setNotice(null);
    setReferenceResult(null);
    setSelectedReferenceIndex(-1);
    const started = performance.now();
    try {
      const response = mode === 'verify'
        ? await verifyWorkspace(workspace, execution.controller.signal)
        : mode === 'check'
          ? await checkWorkspace(workspace, execution.controller.signal)
          : await runWorkspace(workspace, execution.controller.signal, programInput, allowPrompts);
      if (!executionScope.current.isCurrent(execution)) return;
      setResult({ ...response, browserStats: describeBrowserRun(mode, response, started, performance.now()) });
      // Navigate only to a valid source span from this exact execution snapshot.
      const target = !response.ok
        ? diagnosticNavigationPosition(workspace.files, response.diagnostic, response.diagnostic?.primary)
        : null;
      if (target) {
        setActiveFile(target.path);
        setNavigationTarget(previous => ({
          ...target, sequence: (previous?.sequence ?? 0) + 1,
        }));
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
  }, [workspace, programInput, allowPrompts]);

  async function runSuite(kind: 'manual' | 'challenge' = 'manual') {
    const cases = kind === 'challenge' ? activeChallenge?.cases : testCases;
    if (!cases) return;
    const execution = executionScope.current.start();
    if (!execution) return;
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setRenameBusy(false);
    setNavigationTarget(null);
    setReferenceResult(null);
    setSelectedReferenceIndex(-1);
    setResult(null);
    setNotice(null);
    setRunning(true);
    setSuiteKind(kind);
    setSuiteRunning(true);
    setSuiteProgress(0);
    setSuiteReport(null);
    setOperation('run');
    try {
      const report = await runTestCases(workspace, cases, execution.controller.signal,
        (source, signal, stdin, prompts) => runWorkspace(source, signal, stdin, prompts),
        completed => {
          if (executionScope.current.isCurrent(execution)) setSuiteProgress(completed.length);
        });
      if (executionScope.current.isCurrent(execution)) setSuiteReport(report);
    } catch {
      if (executionScope.current.isCurrent(execution)) setNotice('Test cases could not be completed.');
    } finally {
      if (executionScope.current.finish(execution)) {
        setRunning(false);
        setSuiteRunning(false);
      }
    }
  }

  function changeTestCases(next: TestCase[]) {
    if (executionScope.current.running) return;
    setTestCases(next);
    if (suiteKind === 'manual') {
      setSuiteReport(null);
      setSuiteProgress(0);
    }
  }

  function jumpToCompilerDiagnostic(location: DiagnosticLocation | null | undefined) {
    const target = diagnosticNavigationPosition(workspace.files, result?.diagnostic, location);
    if (!target) {
      setNotice('This diagnostic location is unavailable in the current source.');
      return;
    }
    // Repeated clicks on the same link must still move the cursor after editing
    // or manual navigation. Incrementing sequence retriggers the Monaco effect.
    setActiveFile(target.path);
    setNavigationTarget(previous => ({
      ...target, sequence: (previous?.sequence ?? 0) + 1,
    }));
    setNotice('Opened compiler location ' + target.path + ':' +
      location!.start.line + ':' + location!.start.column + '.');
  }

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
    setSuiteRunning(false);
    setSuiteProgress(0);
    setSuiteReport(null);
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
          setOperation('references');
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
          setOperation('rename');
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
    const nextWorkspace = { entry: workspace.entry, files: { ...renamedFiles } };
    const undoToken = createBulkEditUndo(workspace, nextWorkspace, 'symbol rename');
    if (!undoToken) {
      setNotice('Unable to prepare an atomic symbol rename. No edits were made.');
      return;
    }
    setWorkspace(nextWorkspace);
    setLastBulkEdit(undoToken);
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
    setSuiteRunning(false);
    setSuiteProgress(0);
    setSuiteReport(null);
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
          setOperation('definition');
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
    const onQuickOpen = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.shiftKey && key === 'p') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) { setQuickOpen(false); setPaletteOpen(open => !open); }
        return;
      }
      if (event.shiftKey || (key !== 'p' && key !== 'g')) return;
      // Capture before Monaco and the browser's native Print/Find Next actions.
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        setPaletteOpen(false);
        setQuickOpenPrefill(key === 'g' ? ':' : '');
        setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', onQuickOpen, true);
    return () => window.removeEventListener('keydown', onQuickOpen, true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (paletteOpen || event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey &&
          event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey &&
          !event.altKey && event.key.toLowerCase() === 's') {
        // Keep Ctrl+S/Cmd+S in the editor, not the browser's Save Page dialog.
        event.preventDefault();
        if (!event.repeat) enableLocalSaving();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run, workspace, activeFile, savingLocally, paletteOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      window.localStorage.setItem('scarp-playground-theme', dark ? 'dark' : 'light');
    } catch {
      // Private browsing may disable persistence; theme still works this session.
    }
  }, [dark]);

  // A browser warning is a last resort. Try a synchronous snapshot first,
  // but only after the user opted into saving. No stdin is ever persisted.
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      let persisted = savedWorkspace;
      if (savingLocally && (!persisted || !sameWorkspaceContents(workspace, persisted))) {
        try {
          if (!saveLocalWorkspace(window.localStorage, workspace, activeFile)) {
            persisted = workspace;
          }
        } catch {
          // Storage may be denied; fall through to the browser warning.
        }
      }
      if (hasUnprotectedSessionWork(
        workspace, programInput, savingLocally, persisted, checkpoint,
      )) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [workspace, activeFile, programInput, savingLocally, savedWorkspace, checkpoint]);

  // Both legacy #code= and versioned #project= links can navigate in this
  // document. Guard this path too: beforeunload does not fire on hash changes.
  useEffect(() => {
    const onHashChange = () => {
      const newHash = window.location.hash;
      const shared = readSharedWorkspace(newHash);
      if (shared === null && newHash !== '') {
        acceptedHash.current = newHash;
        return;
      }
      const session = latestSession.current;
      let persisted = session.savedWorkspace;
      if (session.savingLocally &&
          (!persisted || !sameWorkspaceContents(session.workspace, persisted))) {
        try {
          if (!saveLocalWorkspace(
            window.localStorage, session.workspace, session.activeFile,
          )) {
            persisted = session.workspace;
            setSavedWorkspace(session.workspace);
          }
        } catch {
          // Preserve the warning if browser storage failed.
        }
      }
      if (hasUnprotectedSessionWork(
        session.workspace, session.programInput, session.savingLocally,
        persisted, session.checkpoint,
      ) && !window.confirm(
        'Open a different Scarp workspace? Unsaved code or program input ' +
        'may be lost. Export the project or save locally to keep your source.',
      )) {
        // replaceState does not trigger another hashchange, avoiding a loop.
        window.history.replaceState(
          null, '', window.location.pathname + window.location.search + acceptedHash.current,
        );
        return;
      }
      acceptedHash.current = newHash;
      if (shared !== null) {
        invalidateExecution();
        setSavingLocally(false);
        setActiveChallenge(null);
        setWorkspace(shared.workspace);
        setCheckpoint({ workspace: shared.workspace, stdin: '', recoverable: true });
        setProgramInput('');
        setAllowPrompts(false);
        setEditorSession((number) => number + 1);
        setActiveFile(shared.activeFile);
        setResult(null);
        setNotice('Opened shared project. Your locally saved workspace remains unchanged.');
        return;
      }
      try {
        const saved = restoreLocalWorkspace(window.localStorage);
        if (saved) {
          invalidateExecution();
          setActiveChallenge(null);
          setWorkspace(saved.workspace);
          setSavedWorkspace(saved.workspace);
          setCheckpoint({ workspace: saved.workspace, stdin: '', recoverable: true });
          setProgramInput('');
          setAllowPrompts(false);
          setEditorSession((number) => number + 1);
          setActiveFile(saved.activeFile);
          setSavingLocally(true);
          setResult(null);
          setNotice('Restored your locally saved workspace.');
          return;
        }
      } catch {
        // No persistent access: retain the current editor.
      }
      // Clearing an existing share fragment without a local snapshot removes
      // the URL's recovery path, even though the code stays open for now.
      setCheckpoint({
        workspace: session.workspace, stdin: session.programInput, recoverable: false,
      });
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
      } else {
        setSavedWorkspace(workspace);
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
    setSavedWorkspace(workspace);
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
      setSavedWorkspace(null);
      setCheckpoint({ workspace, stdin: programInput, recoverable: false });
      setNotice('Saved browser copy removed. The open workspace is still available until you leave.');
    } else {
      setNotice('Unable to remove the saved workspace from browser storage.');
    }
  }

  // Preserve the latest opted-in source even if a 350-ms autosave debounce
  // has not fired. If storage fails, refuse to destroy the live editor.
  function preserveSavedSourceBeforeSwitch(): boolean {
    if (!savingLocally) return true;
    let problem: string | null;
    try {
      problem = saveLocalWorkspace(window.localStorage, workspace, activeFile);
    } catch {
      problem = 'Browser storage is unavailable.';
    }
    if (problem) {
      setNotice(problem + ' The current workspace was not replaced.');
      return false;
    }
    setSavedWorkspace(workspace);
    return true;
  }

  function openLibraryProject(project: LibraryProject): boolean {
    if (!window.confirm('Open named source snapshot "' + project.name +
      '"? Current source edits and program input will be replaced. The separate saved browser copy will be preserved.')) return false;
    if (!preserveSavedSourceBeforeSwitch()) return false;
    const next = { entry: project.workspace.entry, files: { ...project.workspace.files } };
    invalidateExecution();
    setSavingLocally(false);
    setWorkspace(next);
    setCheckpoint({ workspace: next, stdin: '', recoverable: false });
    setProgramInput('');
    setAllowPrompts(false);
    setEditorSession(number => number + 1);
    setActiveFile(project.activeFile);
    setLastBulkEdit(null);
    setNotice('Opened a copy of the named snapshot. Editing will not change the library until you explicitly replace it.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    acceptedHash.current = '';
    return true;
  }

  function loadChallenge(challenge: Challenge) {
    if (running || !window.confirm(
      'Load the starter for "' + challenge.title + '"? Current source and program input will be replaced. Your saved browser copy will be preserved.',
    )) return;
    if (!preserveSavedSourceBeforeSwitch()) return;
    invalidateExecution();
    const next = { entry: challenge.starter.entry, files: { ...challenge.starter.files } };
    setSavingLocally(false);
    setWorkspace(next);
    setCheckpoint({ workspace: next, stdin: '', recoverable: false });
    setProgramInput('');
    setAllowPrompts(false);
    setEditorSession(number => number + 1);
    setActiveFile(next.entry);
    setLastBulkEdit(null);
    setActiveChallenge(challenge);
    setNotice('Loaded challenge: ' + challenge.title + '. Edit the starter and run its public cases.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    acceptedHash.current = '';
  }

  function selectExample(example: Example, untouched: boolean) {
    // Do not discard user-authored source or input without consent.
    // An untouched built-in sample can switch immediately; external,
    // edited, or imported sessions require an explicit decision first.
    // A cancelled switch must not stop an ongoing compiler Worker.
    if (!untouched &&
        !window.confirm(
          'Replace the open workspace with the built-in example "' + example.title +
          '"? Current source edits and program input will be lost. ' +
          'Your locally saved browser copy will not be overwritten.',
        )) return;
    if (!preserveSavedSourceBeforeSwitch()) return;
    invalidateExecution();
    // Loading a sample replaces the editor session, not the user's saved
    // project. Stop autosaving before switching workspaces; explicit Save
    // locally is required to replace the browser's previous snapshot.
    setSavingLocally(false);
    setActiveChallenge(null);
    const nextWorkspace = { entry: example.entry, files: { ...example.files } };
    setWorkspace(nextWorkspace);
    setCheckpoint({
      workspace: nextWorkspace, stdin: example.stdin ?? '', recoverable: true,
    });
    setProgramInput(example.stdin ?? '');
    setAllowPrompts(example.allowPrompts === true);
    setEditorSession((number) => number + 1);
    setActiveFile(example.entry);
    setResult(null);
    setNotice('Loaded ' + example.title +
      (savingLocally
        ? ' — your locally saved workspace is preserved. Choose Save locally to replace it.'
        : ' — ready to execute with the real compiler.'));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    acceptedHash.current = '';
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

  function createSource(path: string): string | null {
    const plan = previewNewSource(workspace, path);
    if (!plan.ok) { setNotice(plan.error); return plan.error; }
    const undo = createBulkEditUndo(workspace, plan.workspace, 'source import');
    if (!undo) {
      const error = 'Could not safely add the source. No files were changed.';
      setNotice(error);
      return error;
    }
    invalidateExecution();
    setWorkspace(plan.workspace);
    setActiveFile(path);
    setLastBulkEdit(undo);
    setNotice('Added ' + path + '. Imports can refer to this file by relative path.');
    return null;
  }

  function openExplorerSource(path: string) {
    if (!Object.hasOwn(workspace.files, path)) return;
    definitionScope.current.invalidate();
    setRenameTarget(null);
    setRenamePreview(null);
    setActiveFile(path);
  }

  function addFile() {
    if (files.length >= MAX_FILES) {
      setNotice('This preview supports up to ' + MAX_FILES + ' files.');
      return;
    }
    const name = window.prompt('New relative .srp path (for example lib/math.srp)');
    if (name !== null) createSource(name);
  }

  function beginFileDuplicate() {
    const destination = suggestDuplicatePath(workspace, activeFile);
    if (!destination) {
      setNotice('No unused duplicate path is available, or the 12-file project limit was reached.');
      return;
    }
    invalidateExecution();
    setFileDuplicate({ snapshot: workspace, from: activeFile, to: destination });
    setNotice('Preview the duplicated module and any rebased import paths before applying.');
  }

  function planFileDuplicate() {
    if (!fileDuplicate || workspace !== fileDuplicate.snapshot) {
      setFileDuplicate(null);
      setFileDuplicatePlan(null);
      setNotice('The project changed. Start duplication from the current source.');
      return;
    }
    const plan = previewModuleDuplicate(workspace, fileDuplicate.from, fileDuplicate.to);
    if (!plan.ok) {
      setFileDuplicatePlan(null);
      setNotice(plan.error);
      return;
    }
    setFileDuplicatePlan(plan);
    setNotice('Preview only: no source files were added, modified or executed.');
  }

  function applyFileDuplicate() {
    if (!fileDuplicate || !fileDuplicatePlan ||
        workspace !== fileDuplicate.snapshot ||
        fileDuplicate.from !== fileDuplicatePlan.from ||
        fileDuplicate.to !== fileDuplicatePlan.to) {
      setFileDuplicate(null);
      setFileDuplicatePlan(null);
      setNotice('The file duplication preview became stale. Start again.');
      return;
    }
    const { from, to, workspace: next, rewrittenImports } = fileDuplicatePlan;
    const undo = createBulkEditUndo(
      workspace, next, 'file duplication', undefined, undefined, { from, to },
    );
    if (!undo) {
      setFileDuplicatePlan(null);
      setNotice('Cannot safely record the duplicated file. No sources were changed.');
      return;
    }
    invalidateExecution();
    setWorkspace(next);
    setActiveFile(to);
    setLastBulkEdit(undo);
    setEditorSession(previous => previous + 1);
    setNotice('Duplicated ' + from + ' into ' + to + ', rebasing ' +
      rewrittenImports + ' import path(s). Use Check code to validate the copy.');
  }

  function applyFolderMove(snapshot: Workspace, plan: Extract<FolderMovePlan, { ok: true }>) {
    if (snapshot !== workspace) {
      setFolderMoveOpen(false);
      setNotice('Folder move preview became stale. Preview the current source again.');
      return;
    }
    const token = createBulkEditUndo(workspace, plan.workspace, 'folder move', undefined, undefined, undefined,
      { from: plan.from, to: plan.to, activeFile });
    if (!token) {
      setNotice('Cannot safely apply this folder move. No source files were changed.');
      return;
    }
    const nextActive = plan.paths.find(path => path.from === activeFile)?.to ?? activeFile;
    invalidateExecution();
    setWorkspace(plan.workspace);
    setActiveFile(nextActive);
    setLastBulkEdit(token);
    setEditorSession(previous => previous + 1);
    setNotice('Moved ' + plan.paths.length + ' source files and rewrote ' +
      plan.rewrittenImports + ' import path(s). Undo bulk change can restore the project.');
  }

  function beginFileMove() {
    invalidateExecution();
    setFileMove({ snapshot: workspace, from: activeFile, to: activeFile });
    setNotice('Choose a new unused .srp path, preview all import updates, then apply.');
  }

  function planFileMove() {
    if (!fileMove || workspace !== fileMove.snapshot) {
      setFileMove(null);
      setFileMovePlan(null);
      setNotice('The source workspace changed. Start file rename again.');
      return;
    }
    const plan = previewModuleMove(workspace, fileMove.from, fileMove.to);
    if (!plan.ok) {
      setFileMovePlan(null);
      setNotice(plan.error);
      return;
    }
    setFileMovePlan(plan);
    setNotice('Preview only: source files have not been renamed or executed.');
  }

  function applyFileMove() {
    if (!fileMove || !fileMovePlan || workspace !== fileMove.snapshot ||
        fileMovePlan.from !== fileMove.from || fileMovePlan.to !== fileMove.to) {
      setFileMovePlan(null);
      setNotice('File rename preview became stale. Preview the current source again.');
      return;
    }
    const { from, to, rewrittenImports, workspace: next } = fileMovePlan;
    const token = createBulkEditUndo(workspace, next, 'file move', { from, to });
    if (!token) {
      setFileMovePlan(null);
      setNotice('Cannot safely apply this file rename. No edits were made.');
      return;
    }
    invalidateExecution();
    setWorkspace(next);
    setActiveFile(to);
    setLastBulkEdit(token);
    setEditorSession(previous => previous + 1);
    setNotice('Renamed ' + from + ' to ' + to + ' and updated ' + rewrittenImports +
      ' import path(s). Run Check code to validate the project.');
  }

  function reviewFileRemoval() {
    invalidateExecution();
    const plan = previewModuleRemoval(workspace, activeFile);
    setFileRemoval({ snapshot: workspace, from: activeFile, plan });
    setNotice(plan.ok
      ? 'Review the file deletion and new entrypoint before applying.'
      : plan.error);
  }

  function applyFileRemoval() {
    if (!fileRemoval || workspace !== fileRemoval.snapshot ||
        !fileRemoval.plan.ok || fileRemoval.from !== fileRemoval.plan.path) {
      setFileRemoval(null);
      setNotice('File removal preview is stale. Review the current workspace again.');
      return;
    }
    const { path, workspace: next, nextActive } = fileRemoval.plan;
    const undo = createBulkEditUndo(workspace, next, 'file removal', undefined, path);
    if (!undo) {
      setNotice('The removal cannot be safely reversed, so no files were deleted.');
      return;
    }
    invalidateExecution();
    setWorkspace(next);
    setActiveFile(nextActive);
    setLastBulkEdit(undo);
    setEditorSession(previous => previous + 1);
    setNotice('Removed unused module ' + path +
      '. Undo bulk change restores it until the next project edit.');
  }

  async function copyActiveSource() {
    const source = workspace.files[activeFile];
    if (source === undefined || !activeStats) {
      setNotice('No active Scarp source file is available to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(source);
      setNotice('Copied ' + activeFile + ' to the clipboard. No source was uploaded.');
    } catch {
      setNotice('Clipboard access is unavailable. Use Download .srp instead.');
    }
  }

  function downloadActiveSource() {
    const source = workspace.files[activeFile];
    if (source === undefined || !activeStats) {
      setNotice('No valid Unicode Scarp source file is available to download.');
      return;
    }
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = activeStats.downloadName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Downloaded ' + activeFile + ' as an exact UTF-8 source file. No source was uploaded.');
  }

  async function addLocalSourceFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    // Re-selecting the same files must retry even after a failed import.
    event.currentTarget.value = '';
    if (!selected.length || sourceImportActive.current) return;
    sourceImportActive.current = true;
    setImportingSources(true);
    const snapshot = workspace;

    try {
      if (selected.length + Object.keys(snapshot.files).length > MAX_FILES) {
        setNotice('Import would exceed the ' + MAX_FILES + '-file workspace limit.');
        return;
      }
      for (const file of selected) {
        if (!validPath(file.name)) {
          setNotice('Choose a .srp filename with letters, numbers, hyphens or underscores.');
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          setNotice(file.name + ' exceeds the 64 KiB source limit.');
          return;
        }
      }
      const uploads = await Promise.all(selected.map(async file => ({
        path: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
      })));
      if (latestSession.current.workspace !== snapshot) {
        setNotice('The workspace changed during file reading. Select the files again.');
        return;
      }
      const plan = previewSourceImport(snapshot, uploads);
      if (!plan.ok) {
        setNotice(plan.error);
        return;
      }
      const undo = createBulkEditUndo(snapshot, plan.workspace, 'source import');
      if (!undo) {
        setNotice('Could not safely prepare the import. No source files were changed.');
        return;
      }
      invalidateExecution();
      setWorkspace(plan.workspace);
      setActiveFile(plan.addedPaths[0]);
      setLastBulkEdit(undo);
      setEditorSession(previous => previous + 1);
      setNotice('Added ' + plan.addedPaths.length +
        ' .srp file(s); existing source files unchanged. Undo bulk change can restore the project.');
    } catch {
      setNotice('Unable to read the selected local files. No source files were changed.');
    } finally {
      sourceImportActive.current = false;
      setImportingSources(false);
    }
  }

  async function previewLocalSourceFolder(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files;
    // Copy file handles before clearing the picker, but bound the enumeration.
    const count = selected?.length ?? 0;
    if (!count || sourceImportActive.current) {
      event.currentTarget.value = '';
      return;
    }
    if (count > MAX_FOLDER_SELECTION_ENTRIES) {
      event.currentTarget.value = '';
      setNotice('Choose a smaller source folder (at most 2,048 selected file entries).');
      return;
    }
    const files = Array.from(selected!);
    event.currentTarget.value = '';
    setFolderPreview(null);
    const selection = planFolderSelection(files);
    if (!selection.ok) { setNotice(selection.error); return; }
    sourceImportActive.current = true;
    setImportingSources(true);
    const snapshot = workspace;
    try {
      const uploads = await Promise.all(selection.candidates.map(async candidate => ({
        path: candidate.path, bytes: new Uint8Array(await files[candidate.index].arrayBuffer()),
      })));
      if (latestSession.current.workspace !== snapshot) {
        setNotice('The workspace changed while reading the folder. Select it again.');
        return;
      }
      const plan = decodeSourceFolder(selection, uploads);
      if (!plan.ok) { setNotice(plan.error); return; }
      setFolderPreview({ snapshot, workspace: plan.workspace, ignored: selection.ignored, kind: 'folder',
        key: ++folderPreviewSequence.current });
      setNotice('Review the source folder and choose its entrypoint before replacing the workspace.');
    } catch {
      setNotice('Unable to read the selected source folder. No source files were changed.');
    } finally {
      sourceImportActive.current = false;
      setImportingSources(false);
    }
  }

  async function previewLocalSourceArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || sourceImportActive.current) return;
    setFolderPreview(null);
    if (file.size > MAX_SOURCE_ARCHIVE_BYTES) {
      setNotice('The ZIP exceeds the source archive size limit.');
      return;
    }
    sourceImportActive.current = true;
    setImportingSources(true);
    const snapshot = latestSession.current;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const current = latestSession.current;
      if (current.workspace !== snapshot.workspace || current.programInput !== snapshot.programInput ||
          current.savingLocally !== snapshot.savingLocally || current.activeFile !== snapshot.activeFile) {
        setNotice('The editor session changed while reading the ZIP. Select it again.');
        return;
      }
      const plan = parseSourceArchive(bytes);
      if (!plan.ok) { setNotice(plan.error); return; }
      setFolderPreview({ snapshot: snapshot.workspace, workspace: plan.workspace, ignored: 0,
        kind: 'archive', key: ++folderPreviewSequence.current });
      setNotice('Review the ZIP sources and choose an entrypoint before replacement.');
    } catch {
      setNotice('Unable to read the selected source ZIP. No source files were changed.');
    } finally {
      sourceImportActive.current = false;
      setImportingSources(false);
    }
  }

  function applySourceFolder(entry: string) {
    if (!folderPreview || folderPreview.snapshot !== workspace || !Object.hasOwn(folderPreview.workspace.files, entry)) {
      setFolderPreview(null);
      setNotice('The source import preview is stale. Select the sources again.');
      return;
    }
    if (!window.confirm(
      'Replace the open workspace with the selected ' + (folderPreview.kind === 'archive' ? 'source ZIP' : 'source folder') + '? Current source edits and program input will be lost. Your locally saved browser copy will not be overwritten.',
    )) return;
    if (!preserveSavedSourceBeforeSwitch()) return;
    setActiveChallenge(null);
    const next = { ...folderPreview.workspace, entry };
    invalidateExecution();
    setSavingLocally(false);
    setWorkspace(next);
    setCheckpoint({ workspace: next, stdin: '', recoverable: false });
    setProgramInput('');
    setAllowPrompts(false);
    setEditorSession(number => number + 1);
    setActiveFile(entry);
    setLastBulkEdit(null);
    setNotice('Imported ' + Object.keys(next.files).length +
      ' nested Scarp source files. Save locally if you want this project to persist after reload.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    acceptedHash.current = '';
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

  function exportSourceArchive() {
    const problem = sourceArchiveProblem(workspace);
    if (problem) {
      setNotice('Cannot export a portable ZIP: ' + problem + ' Use Export project for JSON instead.');
      return;
    }
    const bytes = createSourceArchive(workspace);
    if (!bytes) {
      setNotice('The source archive requires valid workspace paths and source sizes.');
      return;
    }
    const address = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = address;
    link.download = 'scarp-sources.zip';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(address), 1000);
    setNotice('Downloaded all .srp files with their relative paths. No source or program input was uploaded.');
  }

  async function importWorkspaceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Allow the same file to be selected again after a rejected import.
    event.currentTarget.value = '';
    if (!file || sourceImportActive.current) return;
    if (file.size > MAX_PORTABLE_WORKSPACE_BYTES) {
      setNotice('The selected project exceeds the bounded portable JSON size limit.');
      return;
    }
    // Keep whole-project and add-only local imports mutually exclusive.
    // An asynchronous read must not replace a different session or flush a
    // captured, older editor snapshot into the user's saved browser copy.
    const snapshot = latestSession.current;
    sourceImportActive.current = true;
    setImportingSources(true);
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const current = latestSession.current;
      if (current.workspace !== snapshot.workspace ||
          current.activeFile !== snapshot.activeFile ||
          current.programInput !== snapshot.programInput ||
          current.savingLocally !== snapshot.savingLocally) {
        setNotice('The editor session changed during project reading. Select the project again.');
        return;
      }
      const imported = parsePortableWorkspace(raw);
      if (!imported) {
        setNotice('Invalid Scarp workspace JSON. Check the format, version, source files and size limits.');
        return;
      }
      if (!window.confirm(
        'Replace the open workspace with this project? Unsaved changes to the open editor will be lost. Your locally saved browser copy will not be overwritten.',
      )) return;
      // A portable import is session-only until the user explicitly opts in.
      // Flush pending opted-in writes before stopping autosave.
      if (!preserveSavedSourceBeforeSwitch()) return;
      invalidateExecution();
      setSavingLocally(false);
      setActiveChallenge(null);
      setWorkspace(imported.workspace);
      setCheckpoint({ workspace: imported.workspace, stdin: '', recoverable: false });
      setProgramInput('');
      setAllowPrompts(false);
      setEditorSession((number) => number + 1);
      setActiveFile(imported.activeFile);
      setResult(null);
      setNotice('Imported ' + Object.keys(imported.workspace.files).length +
        ' Scarp source files. Save locally if you want this project to persist after reload.');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      acceptedHash.current = '';
    } catch {
      setNotice('The selected project could not be read.');
    } finally {
      sourceImportActive.current = false;
      setImportingSources(false);
    }
  }

  async function copyConsoleResult() {
    const transcript = consoleTranscript(result, operation);
    if (transcript === null) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setNotice('Copied the displayed compiler result. No source files or stdin were attached.');
    } catch {
      setNotice('Clipboard access is unavailable. Use Download result instead.');
    }
  }

  function downloadConsoleResult() {
    const transcript = consoleTranscript(result, operation);
    if (transcript === null) return;
    const url = URL.createObjectURL(new Blob([transcript], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-result.txt';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Downloaded the displayed compiler result. No source files or stdin were attached.');
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
  const browserHelp = result && !result.ok ? browserDiagnosticHelp(diagnostic?.code, operation) : null;
  const location = diagnostic?.primary;
  const errorText = diagnostic?.message || result?.error;
  const transcriptAvailable = !running && consoleTranscript(result, operation) !== null;

  const commands: WorkspaceCommand[] = paletteOpen ? [
    { id: 'run', label: 'Run code', group: 'Execution', description: 'Execute with buffered program input', shortcut: 'Ctrl+Enter', disabled: running, invoke: () => void run() },
    { id: 'verify', label: 'Verify code', group: 'Execution', description: 'Parse, resolve and type-check without runtime execution', disabled: running, invoke: () => void run('verify') },
    { id: 'check', label: 'Check code', group: 'Execution', description: 'Validate runtime paths without returning output', disabled: running, invoke: () => void run('check') },
    { id: 'stop', label: 'Stop execution', group: 'Execution', description: 'Cancel the active compiler operation', disabled: !running, invoke: invalidateExecution },
    { id: 'challenges', label: 'Learning challenges', group: 'Execution', description: 'Practice with public cases and reference solutions', invoke: () => setChallengeOpen(true) },
    { id: 'checkpoint', label: 'Source checkpoint', group: 'Project', description: 'Review temporary source changes and restore a checkpoint', invoke: () => setSourceCheckpointOpen(true) },
    { id: 'timeline', label: 'Source snapshot timeline', group: 'Project', description: 'Compare named source-only snapshots and restore a reviewed version', invoke: () => setTimelineOpen(true) },
    { id: 'library', label: 'Project library', group: 'Project', description: 'Open named local source snapshots', invoke: () => setLibraryOpen(true) },
    { id: 'outline', label: 'Source outline', group: 'Navigation', description: 'Inspect declarations with the Scarp parser', invoke: () => setOutlineOpen(true) },
    { id: 'inspection', label: 'Compiler module inspection', group: 'Navigation', description: 'Inspect resolved modules and signatures', invoke: () => setInspectionOpen(true) },
    { id: 'tests', label: 'Open test cases', group: 'Execution', description: 'Configure and run independent input/output cases', invoke: () => setTestCasesOpen(true) },
    { id: 'quick-open', label: 'Quick open file', group: 'Navigation', description: 'Search workspace source paths', shortcut: 'Ctrl+P', invoke: () => { setQuickOpenPrefill(''); setQuickOpen(true); } },
    { id: 'go-line', label: 'Go to line', group: 'Navigation', description: 'Jump to a line and column in the active file', shortcut: 'Ctrl+G', invoke: () => { setQuickOpenPrefill(':'); setQuickOpen(true); } },
    { id: 'search', label: 'Find in project', group: 'Navigation', description: 'Search or replace text across all source files', shortcut: 'Ctrl+Shift+F', invoke: () => { setReplacePreview(null); setSearchOpen(true); } },
    { id: 'explorer', label: 'Source explorer', group: 'Navigation', description: 'Browse the nested virtual folder tree', invoke: () => setExplorerOpen(true) },
    { id: 'modules', label: 'Module dependencies', group: 'Navigation', description: 'Inspect local import relationships', invoke: () => setModuleGraphOpen(true) },
    { id: 'save', label: 'Save locally', group: 'Project', description: 'Opt into source-only browser storage', shortcut: 'Ctrl+S', invoke: enableLocalSaving },
    { id: 'forget', label: 'Forget saved copy', group: 'Project', description: 'Remove the saved browser copy after confirmation', disabled: !savingLocally, invoke: forgetLocalSaving },
    { id: 'export', label: 'Export project JSON', group: 'Project', description: 'Download a portable source workspace', invoke: exportWorkspace },
    { id: 'zip', label: 'Download sources ZIP', group: 'Project', description: 'Download source files and relative paths', invoke: exportSourceArchive },
    { id: 'import', label: 'Import project JSON', group: 'Project', description: 'Review and open a local workspace file', disabled: importingSources, invoke: () => importFileRef.current?.click() },
    { id: 'source-import', label: 'Add source files', group: 'Project', description: 'Import local .srp files without overwriting sources', disabled: importingSources, invoke: () => sourceFilesRef.current?.click() },
    { id: 'folder-import', label: 'Import source folder', group: 'Project', description: 'Review nested source files from a folder', disabled: importingSources || !folderPickerSupported, invoke: () => sourceFolderRef.current?.click() },
    { id: 'zip-import', label: 'Import sources ZIP', group: 'Project', description: 'Review a canonical Playground source archive', disabled: importingSources, invoke: () => sourceArchiveRef.current?.click() },
    { id: 'share', label: 'Copy project share link', group: 'Project', description: 'Copy an unencrypted source-only URL', invoke: () => void share() },
    { id: 'undo', label: 'Undo bulk change', group: 'Project', description: 'Reverse the latest atomic workspace edit', disabled: !lastBulkEdit || workspace !== lastBulkEdit.after, invoke: undoLastBulkChange },
    { id: 'folder-move', label: 'Move source folder', group: 'Project', description: 'Preview an import-aware folder relocation', invoke: () => { invalidateExecution(); setFolderMoveOpen(true); } },
    { id: 'source-copy', label: 'Copy active source', group: 'Editor', description: 'Copy the active file to the clipboard', invoke: () => void copyActiveSource() },
    { id: 'source-download', label: 'Download active source', group: 'Editor', description: 'Download the current .srp file', invoke: downloadActiveSource },
    { id: 'wrap', label: wordWrap ? 'Disable word wrap' : 'Enable word wrap', group: 'Editor', description: 'Change visual wrapping without altering source', invoke: () => setWordWrap(value => !value) },
    { id: 'entry', label: 'Set active file as entrypoint', group: 'Editor', description: 'Change the execution entry file', disabled: workspace.entry === activeFile, invoke: () => { invalidateExecution(); setWorkspace(previous => ({ ...previous, entry: activeFile })); } },
    { id: 'duplicate', label: 'Duplicate active file', group: 'Editor', description: 'Review a copied module with rebased imports', disabled: files.length >= MAX_FILES, invoke: beginFileDuplicate },
    { id: 'rename', label: 'Rename active file', group: 'Editor', description: 'Preview moving a module and updating imports', invoke: beginFileMove },
    { id: 'remove', label: 'Remove active file', group: 'Editor', description: 'Review source removal and import impact', disabled: files.length < 2, invoke: reviewFileRemoval },
    { id: 'copy-result', label: 'Copy result', group: 'Output', description: 'Copy captured output or diagnostics', disabled: !transcriptAvailable, invoke: () => void copyConsoleResult() },
    { id: 'download-result', label: 'Download result', group: 'Output', description: 'Download a local output transcript', disabled: !transcriptAvailable, invoke: downloadConsoleResult },
    { id: 'clear-result', label: 'Clear output', group: 'Output', description: 'Clear result and cancel any active operation', invoke: invalidateExecution },
    { id: 'theme', label: dark ? 'Switch to light theme' : 'Switch to dark theme', group: 'View', description: 'Toggle the workspace appearance', invoke: () => setDark(value => !value) },
  ] : [];

  return (
    <div className="app-shell min-h-screen">
      {paletteOpen && <Suspense fallback={<p role="status">Loading command palette…</p>}>
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)}
          onInvoke={id => {
            const command = commands.find(item => item.id === id);
            if (!command || command.disabled) return;
            setPaletteOpen(false);
            command.invoke();
          }} />
      </Suspense>}
      {quickOpen && (
        <QuickOpenFiles key={quickOpenPrefill === ':' ? 'go-to-line' : 'quick-open'}
          paths={files} entry={workspace.entry} activeFile={activeFile}
          initialQuery={quickOpenPrefill}
          onClose={() => setQuickOpen(false)}
          onSelect={(path, line, column) => {
            if (!Object.hasOwn(workspace.files, path)) return;
            definitionScope.current.invalidate();
            setRenameTarget(null);
            setRenamePreview(null);
            setActiveFile(path);
            if (line !== null) {
              const position = quickOpenPosition(workspace.files[path], line, column);
              setNavigationTarget(previous => ({
                path, line: position.line, column: position.column,
                sequence: (previous?.sequence ?? 0) + 1,
              }));
              setNotice('Opened ' + path + ':' + position.line + ':' + position.column + '.');
            } else {
              setNavigationTarget(null);
            }
            setQuickOpen(false);
          }} />
      )}
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
          <button type="button" className="button-secondary command-launch" aria-keyshortcuts="Control+Shift+P Meta+Shift+P"
            onClick={() => { setQuickOpen(false); setPaletteOpen(true); }}>Commands</button>
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
          <Suspense fallback={<p className="sidebar-copy" role="status">Loading example catalogue…</p>}>
            <ExampleBrowser workspace={workspace} stdin={programInput} onSelect={selectExample} />
          </Suspense>
          <div className="sidebar-bottom">
            <div className="section-label">COMPATIBILITY</div>
            <strong>Scarp v{compilerCompatibility.version}</strong>
            <p>Compiler source pinned to release commit {compilerCompatibility.commit.slice(0, 7)}. Code runs locally inside a disposable Web Worker.</p>
            <a href={compilerCompatibility.releaseUrl} target="_blank" rel="noreferrer">Compiler release notes ↗</a>
          </div>
        </aside>

        <section className="workspace-area" aria-label="Code workspace">
          <div className="workspace-toolbar">
            <div>
              <div className="workspace-heading">Workspace <span className="workspace-count">{files.length} .srp {files.length === 1 ? 'file' : 'files'}</span></div>
              <p>Write Scarp and press Ctrl + Enter to execute.</p>
              <p className={'workspace-save-status' + (unprotectedWork ? ' unsaved' : '')}
                data-testid="session-save-status" role="status">
                {unprotectedWork
                  ? 'Unsaved work · Ctrl+S / Cmd+S to save source'
                  : savingLocally ? 'Saved locally' : 'Temporary, recoverable example or link'}
              </p>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="button-secondary"
                aria-keyshortcuts="Control+S Meta+S"
                title="Ctrl+S / Cmd+S saves all Scarp files in this browser; never saves stdin"
                onClick={() => savingLocally ? forgetLocalSaving() : enableLocalSaving()}>
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
              <button type="button" className="button-secondary" disabled={importingSources}
                onClick={() => importFileRef.current?.click()}>Import project</button>
              <input
                ref={sourceFilesRef}
                type="file"
                accept=".srp"
                multiple
                aria-label="Choose .srp files to add"
                hidden
                onChange={(event) => void addLocalSourceFiles(event)}
              />
              <button type="button" className="button-secondary" disabled={importingSources}
                title="Add selected local UTF-8 .srp files; never overwrite existing project sources"
                onClick={() => sourceFilesRef.current?.click()}>
                {importingSources ? 'Reading .srp files…' : 'Add .srp files'}
              </button>
              <input ref={sourceFolderRef} type="file" multiple hidden
                aria-label="Choose Scarp source folder"
                onChange={event => void previewLocalSourceFolder(event)} />
              <button type="button" className="button-secondary"
                disabled={importingSources || !folderPickerSupported}
                title={folderPickerSupported ? 'Review nested .srp files from a local folder' : 'Folder picker unavailable; use Add .srp files or project JSON'}
                onClick={() => sourceFolderRef.current?.click()}>Import source folder</button>
              <button type="button" className="button-secondary"
                title="Undo the latest atomic project change, including imported source files"
                onClick={undoLastBulkChange}
                disabled={!lastBulkEdit || workspace !== lastBulkEdit.after}>
                Undo bulk change
              </button>
              <button type="button" className="button-secondary" onClick={exportWorkspace}>Export project</button>
              <input ref={sourceArchiveRef} type="file" accept=".zip,application/zip" hidden
                aria-label="Choose source ZIP to import" onChange={event => void previewLocalSourceArchive(event)} />
              <button type="button" className="button-secondary" disabled={importingSources}
                onClick={() => sourceArchiveRef.current?.click()} title="Import a source ZIP previously exported by Playground">Import sources ZIP</button>
              <button type="button" className="button-secondary" onClick={exportSourceArchive}
                title="Download all .srp sources as a ZIP with relative paths, without program input">Download sources ZIP</button>
              <button type="button" className="button-secondary"
                aria-keyshortcuts="Control+P Meta+P"
                title="Quickly switch between Scarp source files (Ctrl+P / Cmd+P)"
                onClick={() => { setQuickOpenPrefill(''); setQuickOpen(true); }}>
                Quick open
              </button>
              <button type="button" className="button-secondary"
                aria-keyshortcuts="Control+G Meta+G"
                title="Go to a line in the active Scarp file (Ctrl+G / Cmd+G)"
                onClick={() => { setQuickOpenPrefill(':'); setQuickOpen(true); }}>
                Go to line
              </button>
              <button type="button" className="button-secondary"
                aria-expanded={searchOpen} aria-controls="project-search-panel"
                onClick={() => { setReplacePreview(null); setSearchOpen(open => !open); }}>
                Find in project
              </button>
              <button type="button" className="button-secondary" aria-expanded={timelineOpen}
                aria-controls="source-timeline-panel" onClick={() => setTimelineOpen(open => !open)}>
                Source timeline
              </button>
              <button type="button" className="button-secondary" aria-expanded={sourceCheckpointOpen}
                aria-controls="source-checkpoint-panel" onClick={() => setSourceCheckpointOpen(open => !open)}>
                Source checkpoint
              </button>
              <button type="button" className="button-secondary" aria-expanded={libraryOpen}
                aria-controls="project-library-panel" onClick={() => setLibraryOpen(open => !open)}>
                Project library
              </button>
              <button type="button" className="button-secondary" aria-expanded={explorerOpen}
                aria-controls="source-explorer-panel" onClick={() => setExplorerOpen(open => !open)}>
                Source explorer
              </button>
              <button type="button" className="button-secondary" aria-expanded={folderMoveOpen}
                aria-controls="folder-move-panel" onClick={() => {
                  if (folderMoveOpen) { setFolderMoveOpen(false); return; }
                  invalidateExecution();
                  setFolderMoveOpen(true);
                }}>Move folder</button>
              <button type="button" className="button-secondary" aria-expanded={outlineOpen}
                aria-controls="source-outline-panel" onClick={() => {
                  if (outlineOpen) closeOutline();
                  else setOutlineOpen(true);
                }}>Source outline</button>
              <button type="button" className="button-secondary" aria-expanded={inspectionOpen}
                aria-controls="module-inspection-panel" onClick={() => {
                  if (inspectionOpen) closeInspection();
                  else setInspectionOpen(true);
                }}>Compiler inspection</button>
              <button type="button" className="button-secondary" aria-expanded={moduleGraphOpen}
                aria-controls="module-graph-panel" onClick={() => setModuleGraphOpen(open => !open)}>
                Module dependencies
              </button>
              <button type="button" className="button-secondary" onClick={() => void share()} title="Copy a link to the complete project when it fits the URL limit">Share ↗</button>
              <button type="button" className="button-secondary" onClick={() => void run('verify')}
                title="Parse, resolve, and type-check the project without running its statements" disabled={running}>
                Verify code
              </button>
              <button type="button" className="button-secondary" onClick={() => void run('check')}
                title="Evaluate the program to validate selected runtime paths without returning output" disabled={running}>
                Check code
              </button>
              {running ? (
                <button type="button" className="button-secondary" onClick={invalidateExecution}>
                  Stop {suiteRunning ? 'tests' : operation === 'verify' ? 'verification' : operation === 'check' ? 'check' : 'run'}
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={() => void run()}>
                  <span aria-hidden="true">▶</span> Run code
                </button>
              )}
            </div>
          </div>

          {timelineOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading source timeline…</p>}>
            <SourceTimelinePanel workspace={workspace} activeFile={activeFile}
              timeline={sourceTimeline} onChange={setSourceTimeline}
              onRestore={restoreTimelineItem} onClose={() => setTimelineOpen(false)} />
          </Suspense>}

          {sourceCheckpointOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <SourceCheckpointPanel workspace={workspace} snapshot={sourceCheckpoint}
            onCapture={captureCheckpoint} onRestore={restoreCheckpoint}
            onDiscard={() => { setSourceCheckpoint(null); setNotice('Discarded the temporary source checkpoint.'); }}
            onClose={() => setSourceCheckpointOpen(false)} />
          </Suspense>}

          {libraryOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading project library…</p>}>
            <ProjectLibraryPanel workspace={workspace} activeFile={activeFile}
              onOpen={openLibraryProject} onClose={() => setLibraryOpen(false)} />
          </Suspense>}

          {explorerOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <SourceExplorer workspace={workspace} activeFile={activeFile}
            onOpen={openExplorerSource} onCreate={createSource} onClose={() => setExplorerOpen(false)} />
          </Suspense>}

          {folderMoveOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <FolderMovePanel workspace={workspace} onApply={applyFolderMove}
            onClose={() => setFolderMoveOpen(false)} />
          </Suspense>}

          {outlineOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <SourceOutlinePanel path={activeFile}
            result={outlineResult?.workspace === workspace && outlineResult.path === activeFile ? outlineResult.result : null}
            busy={outlineBusy} running={running} onRefresh={() => void refreshOutline()}
            onClose={closeOutline} onSelect={entry => {
              if (outlineResult?.workspace === workspace && outlineResult.path === activeFile) {
                jumpToSearchHit({ path: activeFile, line: entry.line, column: entry.column,
                  preview: entry.name });
              }
            }} />
          </Suspense>}

          {inspectionOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading module inspection…</p>}>
            <ModuleInspectionPanel result={inspectionResult?.workspace === workspace ? inspectionResult.result : null}
              running={running} busy={inspectionBusy} onRefresh={() => void refreshInspection()}
              onClose={closeInspection} onNavigate={site => {
                if (inspectionResult?.workspace === workspace) jumpToSearchHit({ ...site, preview: '' });
              }} />
          </Suspense>}

          {moduleGraphOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <ModuleGraphPanel workspace={workspace} activeFile={activeFile}
            onNavigate={jumpToSearchHit} onClose={() => setModuleGraphOpen(false)} />
          </Suspense>}

          {folderPreview && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <SourceFolderPreview key={folderPreview.key}
            workspace={folderPreview.workspace} ignored={folderPreview.ignored} kind={folderPreview.kind}
            onApply={applySourceFolder} onCancel={() => setFolderPreview(null)} />
          </Suspense>}

          {searchOpen && (
            <section id="project-search-panel" className="project-search" aria-label="Search Scarp project">
              <div className="project-search-bar">
                <label htmlFor="project-search-input">Find in all .srp files</label>
                <input id="project-search-input" ref={searchInputRef} type="search"
                  value={searchQuery} maxLength={MAX_SEARCH_QUERY}
                  onChange={event => { setReplacePreview(null); setSearchQuery(event.target.value); }}
                  placeholder="Search source text…"
                  aria-label="Search text in project" />
                <button type="button" onClick={() => { setReplacePreview(null); setSearchQuery(''); }}
                  disabled={!searchQuery}>Clear</button>
                <button type="button" onClick={() => { setReplacePreview(null); setSearchOpen(false); }}
                  aria-label="Close project search">Close</button>
              </div>
              <div className="project-search-bar project-replace-bar">
                <label htmlFor="project-replace-input">Replace with</label>
                <input id="project-replace-input" type="text" spellCheck={false}
                  aria-label="Replacement text (literal)" value={replaceText}
                  maxLength={MAX_REPLACEMENT_LENGTH}
                  onChange={event => {
                    setReplacePreview(null);
                    setReplaceText(event.target.value);
                  }} />
                <label className="project-replace-match-case">
                  <input type="checkbox" checked={replaceMatchCase}
                    onChange={event => {
                      setReplacePreview(null);
                      setReplaceMatchCase(event.target.checked);
                    }} />
                  Match case when replacing
                </label>
                <button type="button" disabled={searchQuery.length < 2}
                  onClick={planProjectReplacement}>Preview replacements</button>
              </div>
              <p className="project-replace-help">
                Plain-text replacement, not compiler-aware symbol rename. Review before applying.
                Empty replacement deletes matched text. No code is executed or uploaded.
              </p>
              {replacePreview && (
                <div className="project-replace-preview"
                  aria-label="Project-wide replacement preview" data-testid="replace-preview">
                  <p role="status">
                    {replacePreview.plan.changes} replacement(s) across{' '}
                    {replacePreview.plan.changedFiles.length} file(s) on{' '}
                    {replacePreview.plan.lines.length} changed line(s).
                  </p>
                  <div className="project-replace-preview-actions">
                    <button type="button" className="button-primary"
                      onClick={applyProjectReplacement}>Apply all replacements</button>
                    <button type="button" className="button-secondary"
                      onClick={() => setReplacePreview(null)}>Cancel preview</button>
                  </div>
                  <div className="project-replace-lines">
                    {replacePreview.plan.lines.map(line => (
                      <div className="project-replace-line" key={line.path + ':' + line.line}>
                        <strong>{line.path}:{line.line} · {line.changes} change(s)</strong>
                        <div className="project-replace-pair">
                          <div><span>Before</span><pre>{line.before || ' '}</pre></div>
                          <div><span>After</span><pre>{line.after || ' '}</pre></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <div className="rename-preview-results">
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
            {fileDuplicate && (
              <section className="file-duplicate-panel" aria-label="Duplicate Scarp module">
                <form className="file-move-form" onSubmit={event => {
                  event.preventDefault();
                  planFileDuplicate();
                }}>
                  <span>Duplicate <strong>{fileDuplicate.from}</strong> as:</span>
                  <label htmlFor="file-duplicate-path">New copy .srp path</label>
                  <input id="file-duplicate-path" type="text" value={fileDuplicate.to}
                    maxLength={128} autoComplete="off" spellCheck={false}
                    onChange={event => {
                      setFileDuplicate({ ...fileDuplicate, to: event.target.value });
                      setFileDuplicatePlan(null);
                    }} />
                  <button type="submit" className="button-primary">Preview duplication</button>
                  <button type="button" onClick={() => {
                    setFileDuplicate(null);
                    setFileDuplicatePlan(null);
                  }}>Cancel duplication</button>
                </form>
                {fileDuplicatePlan && (
                  <div className="file-duplicate-preview" data-testid="file-duplicate-preview">
                    <p role="status">Create <strong>{fileDuplicatePlan.to}</strong> from{' '}
                      <strong>{fileDuplicatePlan.from}</strong>, rebasing{' '}
                      {fileDuplicatePlan.rewrittenImports} import path(s).
                      The original module and entrypoint remain unchanged.</p>
                    {fileDuplicatePlan.lines.length > 0 && (
                      <div className="rename-diff-list" role="region"
                        aria-label="Copied import path changes">
                        {fileDuplicatePlan.lines.map((line, index) => (
                          <section className="rename-diff-file" key={line.line + ':' + index}>
                            <h3>{fileDuplicatePlan.to}:{line.line} · {line.imports} import(s)</h3>
                            <div className="rename-diff-source">
                              <span className="rename-diff-indicator" aria-hidden="true">−</span>
                              <pre>{line.before}</pre>
                            </div>
                            <div className="rename-diff-source rename-diff-after">
                              <span className="rename-diff-indicator" aria-hidden="true">+</span>
                              <pre>{line.after}</pre>
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                    <button type="button" className="button-primary" onClick={applyFileDuplicate}>
                      Apply duplication
                    </button>
                  </div>
                )}
              </section>
            )}
            {fileMove && (
              <section className="file-move-panel" aria-label="Rename or move Scarp module">
                <form className="file-move-form" onSubmit={event => {
                  event.preventDefault();
                  planFileMove();
                }}>
                  <span>Rename <strong>{fileMove.from}</strong> to:</span>
                  <label htmlFor="file-move-path">New relative .srp path</label>
                  <input id="file-move-path" type="text" value={fileMove.to}
                    maxLength={128} autoComplete="off" spellCheck={false}
                    onChange={event => {
                      setFileMove({ ...fileMove, to: event.target.value });
                      setFileMovePlan(null);
                    }} />
                  <button type="submit" className="button-primary">
                    Preview file rename
                  </button>
                  <button type="button" onClick={() => {
                    setFileMove(null);
                    setFileMovePlan(null);
                  }}>Cancel file rename</button>
                </form>
                {fileMovePlan && (
                  <div className="file-move-preview" data-testid="file-move-preview">
                    <p role="status">
                      Rename <strong>{fileMovePlan.from}</strong> to{' '}
                      <strong>{fileMovePlan.to}</strong>; rewrite{' '}
                      {fileMovePlan.rewrittenImports} import path(s) in{' '}
                      {fileMovePlan.changedFiles.length} file(s).
                      {workspace.entry === fileMovePlan.from
                        ? ' The project entry point will be updated.' : ''}
                    </p>
                    {fileMovePlan.lines.length > 0 && (
                      <div className="rename-diff-list" role="region"
                        aria-label="Proposed import path changes">
                        {fileMovePlan.lines.map((line, index) => (
                          <section className="rename-diff-file" key={line.path + ':' + line.line + ':' + index}>
                            <h3>{line.path}:{line.line} · {line.imports} import(s)</h3>
                            <div className="rename-diff-source">
                              <span className="rename-diff-indicator" aria-hidden="true">−</span>
                              <pre>{line.before}</pre>
                            </div>
                            <div className="rename-diff-source rename-diff-after">
                              <span className="rename-diff-indicator" aria-hidden="true">+</span>
                              <pre>{line.after}</pre>
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                    <button type="button" className="button-primary" onClick={applyFileMove}>
                      Apply file rename
                    </button>
                  </div>
                )}
              </section>
            )}
            {fileRemoval && (
              <section className="file-remove-panel" role="region"
                aria-label="Review Scarp module removal">
                <h3>Remove {fileRemoval.from}?</h3>
                {fileRemoval.plan.ok ? (
                  <>
                    <p>No other source file imports this module.
                      {fileRemoval.plan.changedEntry
                        ? ' The entrypoint will change to ' + fileRemoval.plan.workspace.entry + '.'
                        : ' The project entrypoint will be preserved.'}
                    </p>
                    <p>Confirming deletes this virtual file only. One-step undo will be available.</p>
                    <button type="button" className="button-primary"
                      onClick={applyFileRemoval}>Confirm remove file</button>
                  </>
                ) : (
                  <>
                    <p role="alert">{fileRemoval.plan.error}</p>
                    {fileRemoval.plan.dependents.length > 0 && (
                      <ul className="file-remove-dependents" aria-label="Blocking module imports">
                        {fileRemoval.plan.dependents.map((ref, index) => (
                          <li key={ref.importer + ':' + ref.line + ':' + index}>
                            {ref.importer}:{ref.line} imports "{ref.specifier}"
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <button type="button" onClick={() => setFileRemoval(null)}>
                  Cancel file removal
                </button>
              </section>
            )}
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
                  commentTrigger={commentTrigger} wordWrap={wordWrap}
                  referenceSites={referenceResult?.sites ?? null}
                  selectedReferenceIndex={selectedReferenceIndex} />
              </Suspense>
            </div>
            <div className="editor-footer">
              <span><span className="online-dot" />Scarp syntax · Ctrl+/: Comment · Ctrl+Space: Completion · F12: Definition · Shift+F12: References · F2: Rename</span>
              <span>UTF-8 · {activeFile} · {activeStats?.lines ?? 0} lines · {activeStats?.bytes ?? 0} bytes</span>
              <div className="footer-controls">
                <button type="button" onClick={() => void copyActiveSource()}
                  title="Copy the entire active .srp file to the clipboard without uploading it">
                  Copy source
                </button>
                <button type="button" onClick={downloadActiveSource}
                  title="Download the active .srp module as a plain UTF-8 source file">
                  Download .srp
                </button>
                <button type="button"
                  onClick={() => setCommentTrigger(previous => previous + 1)}
                  aria-keyshortcuts="Control+/"
                  title="Toggle // comments on the current line or every selected line (Ctrl+/; Cmd+/ on macOS)">
                  Comment / uncomment
                </button>
                <button type="button" aria-pressed={wordWrap}
                  onClick={() => setWordWrap(previous => !previous)}
                  title="Wrap long source lines visually without changing the code">
                  {wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                </button>
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
                <button type="button" onClick={beginFileDuplicate}
                  disabled={files.length >= MAX_FILES}
                  title="Copy the current Scarp module with a preview of rebased import paths">
                  Duplicate file
                </button>
                <button type="button" onClick={beginFileMove}
                  title="Rename or move the active .srp file and preview required import updates">
                  Rename file
                </button>
                <button type="button" onClick={reviewFileRemoval} disabled={files.length < 2}>Remove file</button>
              </div>
            </div>
          </div>

          <section className="stdin-panel" aria-label="Buffered program input">
            <div className="stdin-heading">
              <label htmlFor="scarp-program-input">Program input (stdin)</label>
              <span>{programInputBytes(programInput)} / {MAX_PROGRAM_INPUT_BYTES} UTF-8 bytes</span>
            </div>
            <textarea id="scarp-program-input" rows={3} spellCheck={false}
              aria-label="Program input (stdin)"
              value={programInput}
              placeholder={'Text consumed by read_line(), one line per call…'}
              onChange={event => {
                const edit = previewProgramInputEdit(programInput, event.currentTarget.value);
                if (!edit.accepted) {
                  // Rejected edits must not replace the buffer or invalidate a valid result.
                  event.currentTarget.value = programInput;
                  setNotice('Program input must be valid Unicode within 16 KiB of UTF-8. Previous input was kept.');
                  return;
                }
                invalidateExecution();
                setProgramInput(edit.value);
              }} />
            <label htmlFor="scarp-allow-prompts" className="stdin-prompt-toggle">
              <input id="scarp-allow-prompts" type="checkbox"
                checked={allowPrompts}
                onChange={event => {
                  invalidateExecution();
                  setAllowPrompts(event.target.checked);
                }} />
              Enable prompt functions with supplied input
            </label>
            <p>Run always supplies text above to read_line(). With this option,
              input(), input_boolean(), input_integer(), and other typed prompts
              consume those pre-entered lines and capture prompt text. There is
              no live terminal or dialog. Input is limited by UTF-8 bytes, not
              characters; edits beyond 16 KiB are rejected without changing the buffer.
              Input and prompt mode are never saved or shared. Verify and Check do not
              read program input.</p>
          </section>

          <div className="test-case-launch">
            <button type="button" className="button-secondary" aria-expanded={challengeOpen}
              aria-controls="challenge-panel" onClick={() => {
                if (challengeOpen && suiteRunning && suiteKind === 'challenge') invalidateExecution();
                setChallengeOpen(open => !open);
              }}>Learning challenges</button>
            <button type="button" className="button-secondary" aria-expanded={testCasesOpen}
              aria-controls="test-case-panel" onClick={() => {
                if (testCasesOpen && suiteRunning && suiteKind === 'manual') invalidateExecution();
                setTestCasesOpen(open => !open);
              }}>Test cases</button>
          </div>
          {challengeOpen && <Suspense fallback={<p role="status">Loading learning challenges…</p>}>
            <ChallengePanel active={activeChallenge} busy={running} running={suiteRunning && suiteKind === 'challenge'}
              report={suiteKind === 'challenge' ? suiteReport : null} progress={suiteProgress}
              onLoad={loadChallenge} onRun={() => void runSuite('challenge')} onStop={invalidateExecution}
              onClose={() => { if (suiteRunning && suiteKind === 'challenge') invalidateExecution(); setChallengeOpen(false); }} />
          </Suspense>}
          {testCasesOpen && <Suspense fallback={<p className="project-search-status" role="status">Loading workspace tool…</p>}>
            <TestCasePanel cases={testCases} running={suiteRunning && suiteKind === 'manual'} busy={running}
            report={suiteKind === 'manual' ? suiteReport : null} progress={suiteProgress} stdin={programInput} allowPrompts={allowPrompts}
            onChange={changeTestCases} onRun={() => void runSuite()} onStop={invalidateExecution}
            onClose={() => { if (suiteRunning && suiteKind === 'manual') invalidateExecution(); setTestCasesOpen(false); }} />
          </Suspense>}

          <section className="console-card" aria-label="Program output">
            <div className="console-toolbar">
              <div><span className="terminal-glyph">›_</span><strong>Output</strong><span className="console-subtitle">{consoleOperationSubtitle(operation)}</span></div>
              <div className="console-right">
                {result && <span className={'result-status ' + (result.ok ? 'success' : 'failure')}>{result.ok ? '● Success' : '● Error'}</span>}
                <button type="button" onClick={() => void copyConsoleResult()}
                  disabled={!transcriptAvailable}
                  title="Copy the current output or diagnostic; no source files or stdin">Copy result</button>
                <button type="button" onClick={downloadConsoleResult}
                  disabled={!transcriptAvailable}
                  title="Download the current output or diagnostic as UTF-8; no source files or stdin">Download result</button>
                <button type="button" onClick={invalidateExecution}>Clear</button>
              </div>
            </div>
            <div className="terminal-output" aria-live="polite">
              {running && <p className="terminal-muted">{suiteRunning ? 'Running sequential program test cases…' : operation === 'verify' ? 'Verifying source without running program statements…' : operation === 'check' ? 'Checking Scarp with the real interpreter…' : 'Loading compiler and executing program…'}</p>}
              {!running && !result && <p className="terminal-muted">$ Select an example or write code, then click Run code.</p>}
              {result && (
                <>
                  {result.ok && operation === 'verify' && <p className="terminal-muted">Static verification passed. Program statements were not executed.</p>}
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
                              disabled={!diagnosticNavigationPosition(workspace.files, diagnostic, location)}
                              onClick={() => jumpToCompilerDiagnostic(location)}
                            >
                              {location.path + ':' + location.start.line + ':' + location.start.column}
                            </button>
                          </>
                        )}
                      </div>
                      <pre>{errorText || 'An unknown compiler error occurred.'}</pre>
                      {browserHelp && <p className="browser-diagnostic-help"><strong>Playground guidance:</strong> {browserHelp}</p>}
                      {diagnostic?.help && (browserHelp ? (
                        <details className="compiler-diagnostic-help">
                          <summary>Original compiler hint (may refer to native CLI options)</summary>
                          <p className="error-help">{diagnostic.help}</p>
                        </details>
                      ) : <p className="error-help">Hint: {diagnostic.help}</p>)}
                      {diagnostic?.related?.map((note, index) => note.location && (
                        <button
                          key={index}
                          type="button"
                          className="diagnostic-related"
                          disabled={!diagnosticNavigationPosition(workspace.files, diagnostic, note.location)}
                          onClick={() => jumpToCompilerDiagnostic(note.location)}
                        >
                          {note.message + ' · ' + note.location.path + ':' +
                            note.location.start.line + ':' + note.location.start.column}
                        </button>
                      ))}
                    </div>
                  )}
                  {result.ok && operation === 'run' && !result.stdout && !result.stderr && <p className="terminal-muted">Program completed without producing output.</p>}
                </>
              )}
            </div>
            <BrowserRunDetails stats={result?.browserStats ?? null} />
          </section>
          {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
          <p className="disclaimer">Experimental preview · Browser execution has work and output limits. Do not use for untrusted high-risk code or sensitive secrets. {savingLocally && 'Opt-in local autosave is active: code is stored unencrypted in this browser profile.'}</p>
        </section>
      </main>
    </div>
  );
}
