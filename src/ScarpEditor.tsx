import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

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

interface Props {
  path: string;
  value: string;
  dark: boolean;
  onChange: (source: string) => void;
}

export function ScarpEditor({ path, value, dark, onChange }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current) return;
    const instance = monaco.editor.create(container.current, {
      value,
      language: 'scarp',
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
      onChangeRef.current(instance.getValue());
    });
    return () => {
      listener.dispose();
      instance.dispose();
      editor.current = null;
    };
    // The editor instance must survive value and theme changes.
  }, []);

  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value) {
      editor.current.setValue(value);
    }
  }, [path, value]);

  useEffect(() => {
    monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
  }, [dark]);

  return <div ref={container} className="h-full min-h-[300px] w-full" aria-label={'Code editor: ' + path} />;
}
