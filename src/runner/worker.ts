/// <reference lib="webworker" />
import type { RunRequest, RunResponse, DefinitionRequest, DefinitionResponse, ReferencesRequest, ReferencesResponse } from './types';
import { decodeCompilerReply } from './protocol';
import { decodeDefinitionReply } from '../navigation/protocol';
import { decodeReferencesReply } from '../navigation/references';

type CompilerBridge = {
  default: () => Promise<unknown>;
  execute: (payload: string) => string;
  check: (payload: string) => string;
  definition: (payload: string) => string;
  references: (payload: string) => string;
};

let loadPromise: Promise<CompilerBridge> | undefined;

async function loadCompiler(): Promise<CompilerBridge> {
  if (!loadPromise) {
    const url = import.meta.env.BASE_URL + 'compiler/scarp_playground_wasm.js';
    loadPromise = import(/* @vite-ignore */ url).then(async (module: CompilerBridge) => {
      await module.default();
      return module;
    });
  }
  return loadPromise;
}

self.addEventListener('message', async (event: MessageEvent<RunRequest | DefinitionRequest | ReferencesRequest>) => {
  const request = event.data;
  const { id, workspace, mode } = request;
  try {
    const compiler = await loadCompiler();
    if (mode === 'definition') {
      const definition = decodeDefinitionReply(compiler.definition(JSON.stringify({
        ...workspace, path: request.path, offset: request.offset,
      })));
      self.postMessage({ id, definition } satisfies DefinitionResponse);
    } else if (mode === 'references') {
      const references = decodeReferencesReply(compiler.references(JSON.stringify({
        ...workspace, path: request.path, offset: request.offset,
      })));
      self.postMessage({ id, references } satisfies ReferencesResponse);
    } else {
      const result = decodeCompilerReply(
        mode === 'check' ? compiler.check(JSON.stringify(workspace)) :
          compiler.execute(JSON.stringify({ ...workspace, stdin: request.stdin ?? '' })),
      );
      self.postMessage({ id, result } satisfies RunResponse);
    }
  } catch {
    const error = 'Unable to load or execute the Scarp WebAssembly compiler.';
    if (mode === 'definition') {
      self.postMessage({ id, definition: { ok: false, error } } satisfies DefinitionResponse);
    } else if (mode === 'references') {
      self.postMessage({ id, references: { ok: false, error } } satisfies ReferencesResponse);
    } else {
      self.postMessage({
        id, result: { ok: false, stdout: '', stderr: '', error },
      } satisfies RunResponse);
    }
  }
});
