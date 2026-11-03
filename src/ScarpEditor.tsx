import { useEffect, useRef } from 'react';
// Editor-only Monaco: do not register unrelated language packs.
import 'monaco-editor/esm/vs/editor/editor.all.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { diagnosticLocations, sourceLocationToEditorRange } from './diagnostics';
import type { CompilerDiagnostic } from './runner/types';

const environment = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: () => Worker };
};
environment.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.languages.register({ id: 'scarp' });
monaco.languages.setMonarchTokensProvider('scarp', {
  keywords: [
    'bind', 'var', 'funcra', 'pure', 'pub', 'return', 'if', 'elif', 'else', 'while',
    'repeat', 'as', 'break', 'continue', 'import', 'and', 'or', 'not', 'true',
    'false', 'integer', 'float', 'boolean', 'string', 'unit',
  ],
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/\b(?:0x[0-9a-fA-F]+|0b[01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/, 'number'],
      [/[a-zA-Z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/[{}()[\]]/, '@brackets'],
      [new RegExp('[+*/%=<>!&|:-]+'), 'operator'],
    ],
  },
});

const MARKER_OWNER = 'scarp-compiler';

function modelUri(path: string): monaco.Uri {
  // Validated relative .srp paths have no traversal. These are virtual files.
  return monaco.Uri.from({ scheme: 'inmemory', authority: 'scarp', path: '/' + path });
}

interface Props {
  path: string;
  files: Record<string, string>;
  dark: boolean;
  diagnostic: CompilerDiagnostic | null | undefined;
  onChange: (path: string, source: string) => void;
}

export function ScarpEditor({ path, files, dark, diagnostic, onChange }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const models = useRef(new Map<string, monaco.editor.ITextModel>());
  const views = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const activePath = useRef(path);
  const suppressChange = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current) return;
    const initial = monaco.editor.createModel(files[path] ?? '', 'scarp', modelUri(path));
    models.current.set(path, initial);
    activePath.current = path;
    const instance = monaco.editor.create(container.current, {
      model: initial,
      theme: dark ? 'vs-dark' : 'vs',
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      padding: { top: 18 },
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    });
    editor.current = instance;
    const listener = instance.onDidChangeModelContent(() => {
      if (suppressChange.current) return;
      const currentFile = activePath.current;
      onChangeRef.current(currentFile, instance.getValue());
    });
    return () => {
      listener.dispose();
      instance.dispose();
      for (const model of models.current.values()) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
        model.dispose();
      }
      models.current.clear();
      views.current.clear();
      editor.current = null;
    };
    // Models and editor are intentionally owned for the entire mounted workspace.
  }, []);

  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;

    // New tabs become independent Monaco text models (and independent undo stacks).
    for (const [file, source] of Object.entries(files)) {
      if (!models.current.has(file)) {
        models.current.set(file, monaco.editor.createModel(source, 'scarp', modelUri(file)));
      }
    }

    // Sync external workspace changes without resetting models on tab switches.
    // The active model already contains the current keystroke when React updates.
    suppressChange.current = true;
    try {
      for (const [file, source] of Object.entries(files)) {
        const model = models.current.get(file);
        if (model && model.getValue() !== source) model.setValue(source);
      }
    } finally {
      suppressChange.current = false;
    }

    const next = models.current.get(path);
    if (next && instance.getModel() !== next) {
      views.current.set(activePath.current, instance.saveViewState());
      instance.setModel(next);
      const saved = views.current.get(path);
      if (saved) instance.restoreViewState(saved);
    }
    activePath.current = path;

    // Removed workspaces/modules must not leave Monaco models or decorations alive.
    for (const [file, model] of models.current) {
      if (Object.hasOwn(files, file)) continue;
      if (instance.getModel() === model) instance.setModel(null);
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      model.dispose();
      models.current.delete(file);
      views.current.delete(file);
    }
  }, [files, path]);

  useEffect(() => {
    const locations = diagnosticLocations(diagnostic);
    for (const [file, model] of models.current) {
      const source = files[file];
      const markers: monaco.editor.IMarkerData[] = [];
      if (source !== undefined) {
        for (const item of locations) {
          if (item.location.path !== file) continue;
          const range = sourceLocationToEditorRange(source, item.location);
          if (!range) continue;
          markers.push({
            ...range,
            message: item.message,
            severity: item.isPrimary ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Info,
            source: 'Scarp compiler',
            code: item.isPrimary ? diagnostic?.code ?? undefined : undefined,
          });
        }
      }
      monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    }

    const primary = diagnostic?.primary;
    const instance = editor.current;
    if (primary && primary.path === path && instance) {
      const range = sourceLocationToEditorRange(files[path] ?? '', primary);
      if (range) instance.revealRangeInCenter(new monaco.Range(
        range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn,
      ));
    }
  }, [diagnostic, files, path]);

  useEffect(() => {
    monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
  }, [dark]);

  return <div ref={container} className="h-full min-h-[300px] w-full" aria-label={'Code editor: ' + path} />;
}
