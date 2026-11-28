import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectWasmMemoryLimits, WASM_PAGE_BYTES,
  MAX_WASM_LINEAR_MEMORY_BYTES, MAX_WASM_LINEAR_MEMORY_PAGES,
} from '../scripts/wasm-memory-limit.mjs';

const MAGIC = [0, 97, 115, 109, 1, 0, 0, 0];
function varuint(number) {
  const bytes = [];
  let value = number;
  do {
    let current = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) current |= 0x80;
    bytes.push(current);
  } while (value > 0);
  return bytes;
}
function section(id, body) {
  return [id, ...varuint(body.length), ...body];
}
function memory(initial = 1, maximum = MAX_WASM_LINEAR_MEMORY_PAGES, flags = 1) {
  return [
    flags, ...varuint(initial),
    ...(flags & 1 ? varuint(maximum) : []),
  ];
}
function localMemory(initial = 1, maximum = MAX_WASM_LINEAR_MEMORY_PAGES, flags = 1) {
  return section(5, [1, ...memory(initial, maximum, flags)]);
}
function importMemory(initial = 1, maximum = MAX_WASM_LINEAR_MEMORY_PAGES, flags = 1) {
  const name = (value) => [...varuint(value.length), ...new TextEncoder().encode(value)];
  return section(2, [
    1, ...name('env'), ...name('memory'), 2,
    ...memory(initial, maximum, flags),
  ]);
}
function wasm(...sections) {
  return Uint8Array.from([...MAGIC, ...sections.flat()]);
}

test('declared Wasm32 memory has exactly the reviewed 512 MiB maximum', () => {
  const bytes = wasm(localMemory(4, MAX_WASM_LINEAR_MEMORY_PAGES));
  assert.equal(WebAssembly.validate(bytes), true);
  assert.deepEqual(inspectWasmMemoryLimits(bytes), {
    initialPages: 4,
    maximumPages: MAX_WASM_LINEAR_MEMORY_PAGES,
    initialBytes: 4 * WASM_PAGE_BYTES,
    maximumBytes: MAX_WASM_LINEAR_MEMORY_BYTES,
  });
});

test('smaller explicit maximum is accepted', () => {
  const output = inspectWasmMemoryLimits(wasm(localMemory(2, 128)));
  assert.equal(output.maximumPages, 128);
  assert.equal(output.maximumBytes, 8 * 1024 * 1024);
});

test('imported memory must declare a bounded maximum too', () => {
  const bytes = wasm(importMemory(1, 128));
  assert.equal(WebAssembly.validate(bytes), true);
  assert.equal(inspectWasmMemoryLimits(bytes).maximumPages, 128);
});

test('a valid module can contain unrelated custom sections', () => {
  const custom = section(0, [4, 110, 111, 116, 101, 1, 2, 3]);
  const bytes = wasm(custom, localMemory(1, 512));
  assert.equal(WebAssembly.validate(bytes), true);
  assert.equal(inspectWasmMemoryLimits(bytes).maximumPages, 512);
});

test('rejects any linear memory with no explicit maximum', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(localMemory(1, 0, 0))),
    /no hard maximum/,
  );
});

test('rejects uncapped imported memory', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(importMemory(1, 0, 0))),
    /no hard maximum/,
  );
});

test('rejects a declared maximum above the project budget', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(localMemory(1, MAX_WASM_LINEAR_MEMORY_PAGES + 1))),
    /exceeds the reviewed/,
  );
});

test('rejects an initial allocation larger than the declared maximum', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(localMemory(10, 5))),
    /initial memory exceeds/,
  );
});

test('rejects memory64 and shared-memory flags', () => {
  for (const flags of [2, 3, 4, 5, 8, 255]) {
    assert.throws(
      () => inspectWasmMemoryLimits(wasm(localMemory(1, 100, flags))),
      /Unsupported WebAssembly memory/,
    );
  }
});

test('rejects a module without any memory declaration or import', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm()),
    /exactly one bounded/,
  );
});

test('rejects modules with several separately declared memories', () => {
  const body = [2, ...memory(1, 5), ...memory(1, 5)];
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(section(5, body))),
    /multiple declared memories/,
  );
});

test('rejects modules with imported plus locally declared memory', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(importMemory(1, 5), localMemory(1, 5))),
    /exactly one bounded/,
  );
});

test('rejects duplicate memory sections even if both are otherwise bounded', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(localMemory(1, 5), localMemory(1, 5))),
    /Duplicate WebAssembly memory section/,
  );
});

test('rejects duplicate import sections independently of their contents', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(importMemory(1, 5), importMemory(1, 5))),
    /Duplicate WebAssembly import section/,
  );
});

test('rejects unknown imported kinds instead of skipping unvalidated bytes', () => {
  const name = [1, 97];
  assert.throws(
    () => inspectWasmMemoryLimits(wasm(section(2, [1, ...name, ...name, 255]))),
    /Unsupported WebAssembly import kind/,
  );
});

test('rejects corrupted magic and unsupported binary versions', () => {
  const good = wasm(localMemory(1, 5));
  const wrongMagic = Uint8Array.from(good);
  wrongMagic[0] = 2;
  const wrongVersion = Uint8Array.from(good);
  wrongVersion[4] = 2;
  for (const bytes of [wrongMagic, wrongVersion]) {
    assert.throws(() => inspectWasmMemoryLimits(bytes), /magic or binary version/);
  }
});

test('rejects truncated section byte lengths before reading memory', () => {
  const broken = wasm([5, 100, 1, 1, 1, 5]);
  assert.throws(() => inspectWasmMemoryLimits(broken), /Truncated WebAssembly section/);
});

test('rejects invalid five-byte overflowing LEB integers', () => {
  const broken = wasm([5, 0xff, 0xff, 0xff, 0xff, 0xff]);
  assert.throws(
    () => inspectWasmMemoryLimits(broken),
    /overflowing Wasm32 LEB128 integer/,
  );
});

test('rejects malformed in-section LEB inputs without reading beyond section', () => {
  const bytes = wasm(section(5, [1, 0x80]));
  assert.throws(
    () => inspectWasmMemoryLimits(bytes),
    /Truncated WebAssembly binary/,
  );
});

test('rejects a memory limit smaller than the reviewed compiled maximum', () => {
  const bytes = wasm(localMemory(1, 128));
  assert.throws(
    () => inspectWasmMemoryLimits(bytes, 64 * WASM_PAGE_BYTES),
    /exceeds the reviewed byte limit/,
  );
});

test('rejects invalid runtime policy limits and malformed inputs', () => {
  const good = wasm(localMemory(1, 5));
  for (const limit of [-1, 0, 123, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => inspectWasmMemoryLimits(good, limit), /Invalid or oversized/);
  }
  for (const value of [null, {}, [], 'fake', new Uint8Array(0)]) {
    assert.throws(() => inspectWasmMemoryLimits(value), /Invalid or oversized/);
  }
});

test('does not accept a valid header with an incomplete memory section', () => {
  assert.throws(
    () => inspectWasmMemoryLimits(wasm([5, 1, 1])),
    /Truncated WebAssembly binary/,
  );
});

test('a memory maximum is not mistaken for a CPU or total browser heap limit', () => {
  const bytes = wasm(localMemory(2, 50));
  const observed = inspectWasmMemoryLimits(bytes);
  assert.equal(observed.maximumBytes, 50 * WASM_PAGE_BYTES);
  assert.equal(typeof observed.initialBytes, 'number');
});
