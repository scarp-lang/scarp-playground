import { describe, expect, it } from 'vitest';
import { decodeInspectionReply, locateInventory, validateInventory, validatedInspectionResult, inventorySite } from '../src/navigation/inspection-protocol';
import { validatedCompilerWorkerRequest, rejectedCompilerWorkerRequest } from '../src/runner/request';

const main = '// नमस्ते 😀\r\nimport "lib.srp" as lib;\nprint(lib.twice(21));';
const lib = 'pub pure funcra twice(value: integer) -> integer { return value * 2; }\n';
const encoder = new TextEncoder();
function span(source: string, token: string): [number, number] {
  const start = source.indexOf(token);
  return [encoder.encode(source.slice(0, start)).length, encoder.encode(source.slice(0, start + token.length)).length];
}
const workspace = { entry: 'main.srp', files: { 'main.srp': main, 'lib.srp': lib, 'scratch.srp': 'not compiled' } };
function fixture() {
  return {
    schema_version: 1, entry: 0, modules: [
      { id: 0, path: 'main.srp', imports: [{ path: 'lib.srp', alias: 'lib', target: 1,
        span: span(main, 'import "lib.srp" as lib;'), path_span: span(main, '"lib.srp"'),
        alias_span: span(main, 'lib;').map((at, index) => index === 1 ? at - 1 : at) }],
        dependencies: [1], dependents: [], symbols: [] },
      { id: 1, path: 'lib.srp', imports: [], dependencies: [], dependents: [0],
        symbols: [{ name: 'twice', public: true, span: span(lib, 'twice'), kind: 'function', pure: true,
          result: 'integer', parameters: [{ name: 'value', type: 'integer', has_default: false, span: span(lib, 'value') }] }] },
    ], constant_dependencies: [],
  };
}

describe('compiler inspection protocol', () => {
  it('validates graph consistency and resolves exact UTF-8 sites in the current source', () => {
    const raw = fixture();
    const result = decodeInspectionReply(JSON.stringify({ ok: true, inspection: raw }));
    expect(result.ok).toBe(true);
    const located = locateInventory(result, workspace);
    if (!located.ok) throw Error(located.error);
    expect(located.data.uncompiled).toEqual(['scratch.srp']);
    expect(inventorySite(located.data, 0, raw.modules[0].imports[0].alias_span as [number, number]))
      .toEqual({ path: 'main.srp', line: 2, column: 21 });
    expect(inventorySite(located.data, 1, span(lib, 'twice'))).toEqual({ path: 'lib.srp', line: 1, column: 17 });
    expect(locateInventory(result, { ...workspace, files: { ...workspace.files, 'lib.srp': lib.replace('twice', 'other') } }).ok).toBe(false);
  });

  it('rejects invalid schemas, missing graph edges, duplicate modules and malformed declarations', () => {
    const value = fixture();
    for (const raw of [
      { ...value, schema_version: 6 }, { ...value, entry: 1 }, { ...value, modules: [] },
      { ...value, modules: [value.modules[0], { ...value.modules[1], path: 'main.srp' }] },
      { ...value, modules: [{ ...value.modules[0], dependencies: [] }, value.modules[1]] },
      { ...value, modules: [value.modules[0], { ...value.modules[1], dependents: [] }] },
      { ...value, modules: [value.modules[0], { ...value.modules[1], symbols: [{ ...value.modules[1].symbols[0], span: [-1, 5] }] }] },
      { ...value, constant_dependencies: [{ source: 9, target: 1, span: [0, 1], declaration: [0, 1], target_declaration: [0, 1] }] },
      { ...value, modules: [value.modules[0], { ...value.modules[1], symbols: Array(513).fill(value.modules[1].symbols[0]) }] },
    ]) expect(validateInventory(raw)).toBeNull();
    expect(decodeInspectionReply('x'.repeat(513 * 1024)).ok).toBe(false);
  });

  it('projects only recognized fields and revalidates structured-cloned replies', () => {
    const raw = fixture();
    const result = decodeInspectionReply(JSON.stringify({ ok: true, inspection: { ...raw, unrelated: 'discarded' } }));
    if (!result.ok) throw Error(result.error);
    expect(Object.hasOwn(result.inventory, 'unrelated')).toBe(false);
    expect(validatedInspectionResult(result)).toEqual(result);
    expect(validatedInspectionResult({ ok: false, error: 'cannot compile' })).toMatchObject({ ok: false, error: 'cannot compile' });
  });

  it('accepts supported record and variant schema fields and rejects invalid member payloads', () => {
    const raw = { schema_version: 5, entry: 0, modules: [{ id: 0, path: 'main.srp', imports: [],
      dependencies: [], dependents: [], symbols: [
        { kind: 'record', name: 'Task', public: true, span: [0, 4], fields: [{ name: 'done', type: 'boolean' }] },
        { kind: 'variant', name: 'Status', public: false, span: [5, 11], cases: [
          { name: 'Ready', payload: null }, { name: 'Failed', payload: 'string' },
        ] },
      ] }], constant_dependencies: [] };
    expect(validateInventory(raw)?.modules[0].symbols).toEqual(raw.modules[0].symbols);
    expect(validateInventory({ ...raw, modules: [{ ...raw.modules[0], symbols: [{ ...raw.modules[0].symbols[1], cases: [{ name: 'Failed', payload: 1 }] }] }] })).toBeNull();
  });

  it('admits only the input-free inspection request shape', () => {
    const request = { id: 1, mode: 'inspect', workspace };
    expect(validatedCompilerWorkerRequest(request)).toEqual(request);
    for (const extra of [{ stdin: '' }, { allowPrompts: false }, { path: 'main.srp' }, { offset: 0 }, { new_name: 'other' }])
      expect(validatedCompilerWorkerRequest({ ...request, ...extra })).toBeNull();
    expect(rejectedCompilerWorkerRequest(request)).toMatchObject({ id: 1, inspection: { ok: false } });
  });
});
