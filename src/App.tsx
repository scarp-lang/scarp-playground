import { useCallback, useEffect, useState } from 'react';
import { ScarpEditor } from './ScarpEditor';
import { examples } from './examples';
import { runWorkspace } from './runner/client';
import type { RunResult } from './runner/types';
import { makeShareUrl, MAX_FILES, sourceFromHash, validPath, type Workspace } from './workspace';

function startingWorkspace(): Workspace {
  const shared = sourceFromHash(window.location.hash);
  return shared === null
    ? { entry: examples[0].entry, files: { ...examples[0].files } }
    : { entry: 'main.srp', files: { 'main.srp': shared } };
}

function startingTheme(): 'dark' | 'light' {
  try {
    return window.localStorage.getItem('scarp-playground-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(startingWorkspace);
  const [activeFile, setActiveFile] = useState('main.srp');
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
      setResult(await runWorkspace(workspace));
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

  function selectExample(index: number) {
    const example = examples[index];
    setWorkspace({ entry: example.entry, files: { ...example.files } });
    setActiveFile(example.entry);
    setResult(null);
    setNotice('Loaded ' + example.title + ' — ready to execute with the real compiler.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function changeSource(source: string) {
    setWorkspace((previous) => ({
      ...previous,
      files: { ...previous.files, [activeFile]: source },
    }));
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
          <span className="alpha-badge">v0.0.1 alpha</span>
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
              <ScarpEditor path={activeFile} value={workspace.files[activeFile]} dark={dark} onChange={changeSource} />
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
                      <div className="error-title">{diagnostic?.code || 'Execution error'}{location ? ' · ' + location.path + ':' + location.start.line + ':' + location.start.column : ''}</div>
                      <pre>{errorText || 'An unknown compiler error occurred.'}</pre>
                      {diagnostic?.help && <p className="error-help">Hint: {diagnostic.help}</p>}
                    </div>
                  )}
                  {result.ok && !result.stdout && !result.stderr && <p className="terminal-muted">Program completed without producing output.</p>}
                </>
              )}
            </div>
          </section>
          {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
          <p className="disclaimer">Experimental preview · Browser execution has work and output limits. Do not use for untrusted high-risk code or sensitive secrets.</p>
        </section>
      </main>
    </div>
  );
}
