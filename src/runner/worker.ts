/// <reference lib="webworker" />
import type { RunRequest, RunResponse } from './types';
import { decodeCompilerReply } from './protocol';

type CompilerBridge = {
  default: () => Promise<unknown>;
  execute: (payload: string) => string;
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

self.addEventListener('message', async (event: MessageEvent<RunRequest>) => {
  const { id, workspace } = event.data;
  try {
    const compiler = await loadCompiler();
    const result = decodeCompilerReply(compiler.execute(JSON.stringify(workspace)));
    self.postMessage({ id, result } satisfies RunResponse);
  } catch (problem) {
    self.postMessage({
      id,
      result: {
        ok: false,
        stdout: '',
        stderr: '',
        error: 'Unable to load or execute the Scarp WebAssembly compiler: ' +
          (problem instanceof Error ? problem.message : String(problem)),
      },
    } satisfies RunResponse);
  }
});
