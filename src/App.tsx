import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

// Keep the large Monaco code out of the initial React shell bundle.
// The actual editor loads on demand while the rest of the UI stays interactive.
const ScarpEditor = lazy(() =>
  import('./ScarpEditor').then(({ ScarpEditor }) => ({ default: ScarpEditor })),
);
import { examples } from './examples';
import { runWorkspace } from './runner/client';
import type { RunResult } from './runner/types';
import { makeShareUrl, MAX_FILES, sourceFromHash, validPath, type Workspace } from './workspace';
import { forgetLocalWorkspace, restoreLocalWorkspace, saveLocalWorkspace } from './persistence';

type InitialSession = { workspace: Workspace; activeFile: string; savingLocally: boolean };

function startingSession(): InitialSession {
  // A shared source never overwrites an existing locally saved project.
  const shared = sourceFromHash(window.location.hash);
  if (shared !== null) {
    return { workspace: { entry: 'main.srp', files: { 'main.srp': shared } }, activeFile: 'main.srp', savingLocally: false };
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
  const [savingLocally, setSavingLocally] = useState(initial.savingLocally);
  const [dark, setDark] = useState(startingTheme() === 'dark');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const files = Object.keys(workspace.files);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    setNotice(null);
    try {
      const response = await runWorkspace(workspace);
      setResult(response);
      // Compiler diagnostics carry the real source path, including imports.
      // Open that virtual file so the Monaco marker is visible immediately.
      const sourcePath = response.diagnostic?.primary?.path;
      if (!response.ok && sourcePath && Object.hasOwn(workspace.files, sourcePath)) {
        setActiveFile(sourcePath);
      }
    } catch (problem) {
      setResult({
        ok: false,
        stdout: '',
        stderr: '',
        error: problem instanceof Error ? problem.message : String(problem),
      });
    } finally {
      setRunning(false);
    }
  }, [running, workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
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

  // Navigating between #code= snippets and normal URLs can be a same-document
  // navigation (no React remount). Apply shared code without overwriting saved
  // projects, and restore the saved project when the fragment is cleared.
  useEffect(() => {
    const onHashChange = () => {
      const shared = sourceFromHash(window.location.hash);
      if (shared !== null) {
        setSavingLocally(false);
        setWorkspace({ entry: 'main.srp', files: { 'main.srp': shared } });
        setActiveFile('main.srp');
        setResult(null);
        setNotice('Opened shared code. Your locally saved workspace remains unchanged.');
        return;
      }
      if (window.location.hash !== '') return;
      try {
        const saved = restoreLocalWorkspace(window.localStorage);
        if (saved) {
          setWorkspace(saved.workspace);
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
    const example = examples[index];
    setWorkspace({ entry: example.entry, files: { ...example.files } });
    setActiveFile(example.entry);
    setResult(null);
    setNotice('Loaded ' + example.title + ' — ready to execute with the real compiler.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function changeSource(path: string, source: string) {
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

  async function share() {
    if (files.length > 1) {
      setNotice('Snippet sharing currently supports one file. Multi-file sharing is planned.');
      return;
    }
    const url = makeShareUrl(window.location.origin, window.location.pathname, workspace.files[activeFile]);
    if (!url) {
      setNotice('This snippet is too large for safe URL sharing (2 KiB maximum).');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('A shareable URL for this source file was copied to your clipboard.');
    } catch {
      setNotice('Clipboard access was blocked by the browser. You can copy the URL from the address bar after sharing is enabled.');
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
            <strong>Scarp v0.0.5-alpha.3</strong>
            <p>Compiler source pinned to release commit 7715c28. Code runs locally inside a disposable Web Worker.</p>
            <a href="https://github.com/scarp-lang/scarp/releases/tag/v0.0.5-alpha.3" target="_blank" rel="noreferrer">Compiler release notes ↗</a>
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
              <button type="button" className="button-secondary" onClick={() => void share()}>Share ↗</button>
              <button type="button" className="button-primary" onClick={() => void run()} disabled={running}>
                <span aria-hidden="true">{running ? '◌' : '▶'}</span> {running ? 'Running…' : 'Run code'}
              </button>
            </div>
          </div>

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
                <ScarpEditor path={activeFile} files={workspace.files} dark={dark} diagnostic={diagnostic} onChange={changeSource} />
              </Suspense>
            </div>
            <div className="editor-footer">
              <span><span className="online-dot" />Scarp syntax</span>
              <span>UTF-8 · {activeFile}</span>
              <div className="footer-controls">
                <button type="button" onClick={() => setWorkspace((previous) => ({ ...previous, entry: activeFile }))} disabled={workspace.entry === activeFile}>Set as entry</button>
                <button type="button" onClick={removeFile} disabled={files.length < 2}>Remove file</button>
              </div>
            </div>
          </div>

          <section className="console-card" aria-label="Program output">
            <div className="console-toolbar">
              <div><span className="terminal-glyph">›_</span><strong>Output</strong><span className="console-subtitle">Real compiler execution</span></div>
              <div className="console-right">
                {result && <span className={'result-status ' + (result.ok ? 'success' : 'failure')}>{result.ok ? '● Success' : '● Error'}</span>}
                <button type="button" onClick={() => setResult(null)}>Clear</button>
              </div>
            </div>
            <div className="terminal-output" aria-live="polite">
              {running && <p className="terminal-muted">Loading compiler and executing program…</p>}
              {!running && !result && <p className="terminal-muted">$ Select an example or write code, then click Run code.</p>}
              {result && (
                <>
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
                          onClick={() => setActiveFile(note.location!.path)}
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
