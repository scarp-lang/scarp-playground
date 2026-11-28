/// <reference lib="webworker" />
import type { RunResponse, DefinitionResponse, ReferencesResponse, RenameResponse, OutlineResponse, InspectionResponse } from './types';
import { decodeCompilerReply, decodeSilentResult } from './protocol';
import { validatedCompilerWorkerRequest, rejectedCompilerWorkerRequest } from './request';
import { decodeDefinitionReply } from '../navigation/protocol';
import { decodeReferencesReply } from '../navigation/references';
import { decodeRenameReply } from '../navigation/rename';
import { decodeOutlineReply } from '../navigation/outline-protocol';
import { decodeInspectionReply } from '../navigation/inspection-protocol';

type CompilerBridge = {
  default: () => Promise<unknown>;
  execute: (payload: string) => string;
  check: (payload: string) => string;
  verify: (payload: string) => string;
  definition: (payload: string) => string;
  references: (payload: string) => string;
  rename: (payload: string) => string;
  source_outline: (payload: string) => string;
  inspect_modules: (payload: string) => string;
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

let requestClaimed = false;
self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  // Each disposable Worker handles at most one request. Never run a second
  // program or allocate a second compiler task through a reused Worker.
  if (requestClaimed) return;
  requestClaimed = true;
  const request = validatedCompilerWorkerRequest(event.data);
  if (!request) {
    const rejected = rejectedCompilerWorkerRequest(event.data);
    if (rejected) self.postMessage(rejected);
    return;
  }
  const { id, workspace, mode } = request;
  try {
    const compiler = await loadCompiler();
    if (mode === 'inspect') {
      const inspection = decodeInspectionReply(compiler.inspect_modules(JSON.stringify(workspace)));
      self.postMessage({ id, inspection } satisfies InspectionResponse);
    } else if (mode === 'outline') {
      const outline = decodeOutlineReply(compiler.source_outline(JSON.stringify({
        path: request.path, source: workspace.files[request.path],
      })));
      self.postMessage({ id, outline } satisfies OutlineResponse);
    } else if (mode === 'definition') {
      const definition = decodeDefinitionReply(compiler.definition(JSON.stringify({
        ...workspace, path: request.path, offset: request.offset,
      })));
      self.postMessage({ id, definition } satisfies DefinitionResponse);
    } else if (mode === 'references') {
      const references = decodeReferencesReply(compiler.references(JSON.stringify({
        ...workspace, path: request.path, offset: request.offset,
      })));
      self.postMessage({ id, references } satisfies ReferencesResponse);
    } else if (mode === 'rename') {
      const rename = decodeRenameReply(compiler.rename(JSON.stringify({
        ...workspace, path: request.path, offset: request.offset,
        new_name: request.new_name,
      })));
      self.postMessage({ id, rename } satisfies RenameResponse);
    } else {
      const result = decodeCompilerReply(
        mode === 'verify' ? compiler.verify(JSON.stringify(workspace)) :
          mode === 'check' ? compiler.check(JSON.stringify(workspace)) :
            compiler.execute(JSON.stringify({
              ...workspace, stdin: request.stdin ?? '',
              allowPrompts: request.allowPrompts === true,
            })),
      );
      self.postMessage({ id, result: mode === 'run' ? result : decodeSilentResult(result) } satisfies RunResponse);
    }
  } catch {
    const error = 'Unable to load or execute the Scarp WebAssembly compiler.';
    if (mode === 'inspect') {
      self.postMessage({ id, inspection: { ok: false, error } } satisfies InspectionResponse);
    } else if (mode === 'outline') {
      self.postMessage({ id, outline: { ok: false, error } } satisfies OutlineResponse);
    } else if (mode === 'definition') {
      self.postMessage({ id, definition: { ok: false, error } } satisfies DefinitionResponse);
    } else if (mode === 'references') {
      self.postMessage({ id, references: { ok: false, error } } satisfies ReferencesResponse);
    } else if (mode === 'rename') {
      self.postMessage({ id, rename: { ok: false, error } } satisfies RenameResponse);
    } else {
      self.postMessage({
        id, result: { ok: false, stdout: '', stderr: '', error },
      } satisfies RunResponse);
    }
  }
});
