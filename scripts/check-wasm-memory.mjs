#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  inspectWasmMemoryLimits,
  MAX_WASM_LINEAR_MEMORY_BYTES,
} from './wasm-memory-limit.mjs';

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error('Usage: node scripts/check-wasm-memory.mjs <compiled-wasm-file>');
  process.exitCode = 2;
} else {
  try {
    const binary = await readFile(path);
    const memory = inspectWasmMemoryLimits(binary);
    console.log(
      'Verified Wasm32 linear-memory maximum: ' +
      memory.maximumPages + ' pages / ' + memory.maximumBytes +
      ' bytes, with initial ' + memory.initialPages + ' pages.',
    );
    if (memory.maximumBytes > MAX_WASM_LINEAR_MEMORY_BYTES) {
      throw new Error('Memory maximum exceeds the verified 512 MiB ceiling.');
    }
  } catch (problem) {
    console.error(
      'WASM linear-memory safety gate failed: ' +
      (problem instanceof Error ? problem.message : String(problem)),
    );
    process.exitCode = 1;
  }
}
