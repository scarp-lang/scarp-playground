import { validatedRunResult } from '../runner/protocol';
import type { CompilerDiagnostic } from '../runner/types';
import { MAX_FILES, MAX_FILE_BYTES, validPath, validateWorkspace, type Workspace } from '../workspace';

const MAX_JSON_CHARS = 512 * 1024 + 128;
const MAX_SYMBOLS = 512;
const MAX_MEMBERS = 2048;
const MAX_IMPORTS = 64;
const MAX_CONSTANT_EDGES = 512;
const MAX_TYPE_TEXT = 2048;
const MAX_NAME = 128;

type Span = [number, number];
export type InspectionImport = { path: string; alias: string; target: number; span: Span; path_span: Span; alias_span: Span };
type Parameter = { name: string; type: string; has_default: boolean; span: Span };
type TypeParameter = { name: string; constraint: string | null; span: Span };
type Field = { name: string; type: string };
type VariantCase = { name: string; payload: string | null };
type SymbolBase = { name: string; public: boolean; span: Span };
export type InspectionSymbol = SymbolBase & (
  | { kind: 'function'; pure: boolean; result: string; parameters: Parameter[]; type_parameters: TypeParameter[] }
  | { kind: 'constant'; type: string }
  | { kind: 'record'; fields: Field[] }
  | { kind: 'variant'; cases: VariantCase[] }
);
export type InspectionModule = {
  id: number; path: string; imports: InspectionImport[]; dependencies: number[];
  dependents: number[]; symbols: InspectionSymbol[];
};
export type ConstantEdge = { source: number; declaration: Span; target: number; target_declaration: Span; span: Span };
export type ModuleInventory = { schema_version: number; entry: number; modules: InspectionModule[]; constant_dependencies: ConstantEdge[] };
export type InspectionFailure = { ok: false; error: string; diagnostic?: CompilerDiagnostic | null };
export type InspectionResult = { ok: true; inventory: ModuleInventory } | InspectionFailure;

const bad = (): InspectionFailure => ({ ok: false, error: 'Invalid or oversized compiler module inspection metadata.' });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_NAME && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && new TextEncoder().encode(value).byteLength <= max;

function span(value: unknown): Span | null {
  if (!Array.isArray(value) || value.length !== 2 ||
      !integer(value[0], MAX_FILE_BYTES) || !integer(value[1], MAX_FILE_BYTES) || value[0] >= value[1]) return null;
  return [value[0], value[1]];
}
function idList(value: unknown, count: number): number[] | null {
  if (!Array.isArray(value) || value.length > count) return null;
  const ids: number[] = [];
  for (const id of value) {
    if (!integer(id, count - 1) || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids;
}
function parseImport(value: unknown, count: number): InspectionImport | null {
  if (!record(value) || !text(value.path, 128) || !identifier(value.alias) || !integer(value.target, count - 1)) return null;
  const whole = span(value.span);
  const path = span(value.path_span);
  const alias = span(value.alias_span);
  if (!whole || !path || !alias || whole[0] > path[0] || path[1] > alias[0] || alias[1] > whole[1]) return null;
  return { path: value.path, alias: value.alias, target: value.target, span: whole, path_span: path, alias_span: alias };
}
type Budget = { symbols: number; members: number; imports: number };
function memberArray(value: unknown, budget: Budget): unknown[] | null {
  if (!Array.isArray(value) || value.length > MAX_MEMBERS - budget.members) return null;
  budget.members += value.length;
  return value;
}
function parseSymbol(value: unknown, budget: Budget): InspectionSymbol | null {
  if (++budget.symbols > MAX_SYMBOLS || !record(value) || !identifier(value.name) || typeof value.public !== 'boolean') return null;
  const location = span(value.span);
  if (!location) return null;
  const base = { name: value.name, public: value.public, span: location };
  if (value.kind === 'constant') {
    return text(value.type, MAX_TYPE_TEXT) ? { ...base, kind: 'constant', type: value.type } : null;
  }
  if (value.kind === 'record') {
    const input = memberArray(value.fields, budget);
    if (!input) return null;
    const fields: Field[] = [];
    for (const field of input) {
      if (!record(field) || !identifier(field.name) || !text(field.type, MAX_TYPE_TEXT)) return null;
      fields.push({ name: field.name, type: field.type });
    }
    return { ...base, kind: 'record', fields };
  }
  if (value.kind === 'variant') {
    const input = memberArray(value.cases, budget);
    if (!input) return null;
    const cases: VariantCase[] = [];
    for (const item of input) {
      if (!record(item) || !identifier(item.name) || (item.payload !== null && !text(item.payload, MAX_TYPE_TEXT))) return null;
      cases.push({ name: item.name, payload: item.payload });
    }
    return { ...base, kind: 'variant', cases };
  }
  if (value.kind !== 'function' || typeof value.pure !== 'boolean' || !text(value.result, MAX_TYPE_TEXT)) return null;
  const input = memberArray(value.parameters, budget);
  const generics = memberArray(value.type_parameters ?? [], budget);
  if (!input || !generics) return null;
  const parameters: Parameter[] = [];
  const type_parameters: TypeParameter[] = [];
  for (const item of input) {
    if (!record(item) || !identifier(item.name) || !text(item.type, MAX_TYPE_TEXT) || typeof item.has_default !== 'boolean') return null;
    const location = span(item.span);
    if (!location) return null;
    parameters.push({ name: item.name, type: item.type, has_default: item.has_default, span: location });
  }
  for (const item of generics) {
    if (!record(item) || !identifier(item.name) || (item.constraint !== null && !text(item.constraint, MAX_TYPE_TEXT))) return null;
    const location = span(item.span);
    if (!location) return null;
    type_parameters.push({ name: item.name, constraint: item.constraint, span: location });
  }
  return { ...base, kind: 'function', pure: value.pure, result: value.result, parameters, type_parameters };
}
function parseEdge(value: unknown, count: number): ConstantEdge | null {
  if (!record(value) || !integer(value.source, count - 1) || !integer(value.target, count - 1)) return null;
  const declaration = span(value.declaration);
  const target = span(value.target_declaration);
  const location = span(value.span);
  return declaration && target && location ? { source: value.source, declaration, target: value.target,
    target_declaration: target, span: location } : null;
}

/** Validate the exact supported upstream schema family and detach all fields.
 * Worker and main thread both apply this projection. */
export function validateInventory(value: unknown): ModuleInventory | null {
  if (!record(value) || !integer(value.schema_version, 5) || value.schema_version < 1 || value.entry !== 0 ||
      !Array.isArray(value.modules) || value.modules.length < 1 || value.modules.length > MAX_FILES ||
      !Array.isArray(value.constant_dependencies) || value.constant_dependencies.length > MAX_CONSTANT_EDGES) return null;
  const count = value.modules.length;
  const budget: Budget = { symbols: 0, members: 0, imports: 0 };
  const paths = new Set<string>();
  const modules: InspectionModule[] = [];
  for (const [id, item] of value.modules.entries()) {
    if (!record(item) || item.id !== id || !validPath(item.path) || paths.has(item.path) ||
        !Array.isArray(item.imports) || item.imports.length > MAX_IMPORTS - budget.imports ||
        !Array.isArray(item.symbols) || item.symbols.length > MAX_SYMBOLS - budget.symbols) return null;
    const dependencies = idList(item.dependencies, count);
    const dependents = idList(item.dependents, count);
    if (!dependencies || !dependents) return null;
    const imports: InspectionImport[] = [];
    const symbols: InspectionSymbol[] = [];
    budget.imports += item.imports.length;
    paths.add(item.path);
    for (const input of item.imports) {
      const imported = parseImport(input, count);
      if (!imported) return null;
      imports.push(imported);
    }
    for (const input of item.symbols) {
      const symbol = parseSymbol(input, budget);
      if (!symbol) return null;
      symbols.push(symbol);
    }
    if (new Set(symbols.map(symbol => symbol.name)).size !== symbols.length ||
        new Set(imports.map(imported => imported.alias)).size !== imports.length) return null;
    const expected = [...new Set(imports.map(imported => imported.target))];
    if (expected.length !== dependencies.length || expected.some((target, index) => target !== dependencies[index])) return null;
    modules.push({ id, path: item.path, imports, dependencies, dependents, symbols });
  }
  // Cross-check the reverse graph and reachability instead of trusting
  // contradictory worker metadata. The compiler loads only reachable modules.
  for (const module of modules) {
    const reverse = modules.filter(item => item.dependencies.includes(module.id)).map(item => item.id);
    if (reverse.length !== module.dependents.length || reverse.some((id, index) => id !== module.dependents[index])) return null;
  }
  const visited = new Set<number>();
  const active = new Set<number>();
  function visit(id: number): boolean {
    if (active.has(id)) return false;
    if (visited.has(id)) return true;
    active.add(id);
    for (const next of modules[id].dependencies) if (!visit(next)) return false;
    active.delete(id);
    visited.add(id);
    return true;
  }
  if (!visit(0) || visited.size !== count) return null;
  const constant_dependencies: ConstantEdge[] = [];
  for (const item of value.constant_dependencies) {
    const edge = parseEdge(item, count);
    if (!edge) return null;
    constant_dependencies.push(edge);
  }
  return { schema_version: value.schema_version, entry: 0, modules, constant_dependencies };
}

export function validatedInspectionResult(value: unknown): InspectionResult {
  if (!record(value) || typeof value.ok !== 'boolean') return bad();
  if (!value.ok) {
    const result = validatedRunResult({ ok: false, stdout: '', stderr: '', error: value.error, diagnostic: value.diagnostic });
    return result?.error ? { ok: false, error: result.error, diagnostic: result.diagnostic } : bad();
  }
  const inventory = validateInventory(value.inventory);
  return inventory ? { ok: true, inventory } : bad();
}

export function decodeInspectionReply(raw: unknown): InspectionResult {
  if (typeof raw !== 'string' || raw.length > MAX_JSON_CHARS) return bad();
  try {
    const value: unknown = JSON.parse(raw);
    if (record(value) && value.ok === true) return validatedInspectionResult({ ok: true, inventory: value.inspection });
    return validatedInspectionResult(value);
  } catch { return bad(); }
}

export type SourcePosition = { line: number; column: number };
export type InspectionSite = SourcePosition & { path: string };
type FileIndex = { bytes: Uint8Array; positions: Map<number, SourcePosition> };

/** Map every valid scalar boundary once per source; byte offsets are not JS
 * offsets, and CRLF counts as one Monaco line break. */
function indexSource(source: string): FileIndex {
  const bytes = new TextEncoder().encode(source);
  const positions = new Map<number, SourcePosition>();
  let offset = 0;
  let line = 1;
  let column = 1;
  let previousCR = false;
  for (const scalar of source) {
    positions.set(offset, { line, column });
    const cp = scalar.codePointAt(0)!;
    offset += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (scalar === '\r') { line++; column = 1; }
    else if (scalar === '\n') { if (!previousCR) line++; column = 1; }
    else column += scalar.length;
    previousCR = scalar === '\r';
  }
  positions.set(offset, { line, column });
  return { bytes, positions };
}

export type LocatedInventory = {
  inventory: ModuleInventory;
  sites: Record<string, SourcePosition>;
  uncompiled: string[];
};
export type LocatedInspection = { ok: true; data: LocatedInventory } | InspectionFailure;
export const siteKey = (id: number, span: Span): string => id + ':' + span[0] + ':' + span[1];

/** Validate metadata against the exact request source before navigation.
 * Only real compiler-owned ranges can become cursor targets. */
export function locateInventory(result: InspectionResult, workspace: Workspace): LocatedInspection {
  if (!result.ok) return result;
  if (validateWorkspace(workspace) || result.inventory.modules[0]?.path !== workspace.entry) return bad();
  const inventory = result.inventory;
  const indexes: FileIndex[] = [];
  for (const module of inventory.modules) {
    if (!Object.hasOwn(workspace.files, module.path)) return bad();
    indexes.push(indexSource(workspace.files[module.path]));
  }
  const sites: Record<string, SourcePosition> = Object.create(null);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  function site(id: number, range: Span, expected?: string): boolean {
    const file = indexes[id];
    const start = file?.positions.get(range[0]);
    if (!file || !start || !file.positions.has(range[1])) return false;
    if (expected !== undefined) {
      try { if (decoder.decode(file.bytes.subarray(range[0], range[1])) !== expected) return false; }
      catch { return false; }
    }
    sites[siteKey(id, range)] = start;
    return true;
  }
  for (const module of inventory.modules) {
    for (const imported of module.imports) {
      if (!site(module.id, imported.span) || !site(module.id, imported.path_span) ||
          !site(module.id, imported.alias_span, imported.alias)) return bad();
    }
    for (const symbol of module.symbols) {
      if (!site(module.id, symbol.span, symbol.name)) return bad();
      if (symbol.kind === 'function') {
        for (const param of [...symbol.parameters, ...symbol.type_parameters]) {
          if (!site(module.id, param.span, param.name)) return bad();
        }
      }
    }
  }
  for (const edge of inventory.constant_dependencies) {
    if (!site(edge.source, edge.declaration) || !site(edge.target, edge.target_declaration) || !site(edge.source, edge.span)) return bad();
  }
  const seen = new Set(inventory.modules.map(module => module.path));
  const uncompiled = Object.keys(workspace.files).filter(path => !seen.has(path)).sort();
  return { ok: true, data: { inventory, sites, uncompiled } };
}

export function inventorySite(data: LocatedInventory, id: number, range: Span): InspectionSite | null {
  const module = data.inventory.modules[id];
  const position = data.sites[siteKey(id, range)];
  return module && position ? { path: module.path, ...position } : null;
}
