import { useState } from 'react';
import { inventorySite, type InspectionSymbol, type InspectionSite, type LocatedInspection, type LocatedInventory } from './navigation/inspection-protocol';

type Props = {
  result: LocatedInspection | null;
  running: boolean;
  busy: boolean;
  onRefresh: () => void;
  onNavigate: (site: InspectionSite) => void;
  onClose: () => void;
};

export function symbolSignature(symbol: InspectionSymbol): string {
  const visibility = symbol.public ? 'pub ' : '';
  switch (symbol.kind) {
    case 'constant': return visibility + 'bind ' + symbol.name + ': ' + symbol.type;
    case 'record': return visibility + 'record ' + symbol.name;
    case 'variant': return visibility + 'variant ' + symbol.name;
    case 'function': {
      const generics = symbol.type_parameters.length ?
        '<' + symbol.type_parameters.map(parameter => parameter.name + (parameter.constraint ? ': ' + parameter.constraint : '')).join(', ') + '>' : '';
      return visibility + (symbol.pure ? 'pure ' : '') + 'funcra ' + symbol.name + generics + '(' +
        symbol.parameters.map(parameter => parameter.name + ': ' + parameter.type +
          (parameter.has_default ? ' = …' : '')).join(', ') + ') -> ' + symbol.result;
    }
  }
}

function InventoryView({ data, onNavigate }: { data: LocatedInventory; onNavigate: Props['onNavigate'] }) {
  const { inventory, uncompiled } = data;
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState('');
  const [publicOnly, setPublicOnly] = useState(false);
  const [kind, setKind] = useState('');
  const module = inventory.modules[selected] ?? inventory.modules[0];
  const search = filter.trim().toLowerCase();
  const symbols = module.symbols.filter(symbol => (!publicOnly || symbol.public) &&
    (!kind || symbol.kind === kind) && (!search || symbol.name.toLowerCase().includes(search)));
  const edges = inventory.constant_dependencies.filter(edge => edge.source === module.id);
  function navigate(id: number, span: [number, number]) {
    const site = inventorySite(data, id, span);
    if (site) onNavigate(site);
  }
  return <>
    <p className="project-search-status" role="status">{inventory.modules.length} resolved modules · schema {inventory.schema_version} · {inventory.constant_dependencies.length} constant dependency sites</p>
    <div className="inspection-select">
      <label>Resolved module
        <select value={module.id} onChange={event => setSelected(Number(event.target.value))}>
          {inventory.modules.map(item => <option key={item.id} value={item.id}>{item.path}{item.id === inventory.entry ? ' (entry)' : ''}</option>)}
        </select>
      </label>
      <label>Filter declaration names
        <input type="search" value={filter} maxLength={128} onChange={event => setFilter(event.target.value)} />
      </label>
      <label>Symbol kind
        <select value={kind} onChange={event => setKind(event.target.value)}>
          <option value="">All symbols</option>
          <option value="function">Functions</option>
          <option value="constant">Constants</option>
          <option value="record">Records</option>
          <option value="variant">Variants</option>
        </select>
      </label>
      <label className="inspection-checkbox"><input type="checkbox" checked={publicOnly}
        onChange={event => setPublicOnly(event.target.checked)} /> Public only</label>
    </div>
    {uncompiled.length > 0 && <section className="inspection-section" aria-label="Uncompiled workspace files">
      <h3>Not reached by this entrypoint</h3>
      <p className="project-search-status">These files were not compiled by this inspection. No validity claim is made.</p>
      <ul>{uncompiled.map(path => <li key={path}>{path}</li>)}</ul>
    </section>}
    <section className="inspection-section" aria-label="Resolved imports">
      <h3>Resolved imports ({module.imports.length})</h3>
      {module.imports.length ? <ul className="inspection-links">
        {module.imports.map(imported => <li key={imported.alias}>
          <button type="button" onClick={() => navigate(module.id, imported.alias_span)}>{imported.alias} → {inventory.modules[imported.target].path}</button>
          <button type="button" onClick={() => setSelected(imported.target)}>Inspect target {imported.alias}</button>
        </li>)}
      </ul> : <p>No imports in this module.</p>}
      <p>Direct importers: {module.dependents.length ? module.dependents.map(id => inventory.modules[id].path).join(', ') : 'none'}</p>
    </section>
    <section className="inspection-section" aria-label="Resolved declarations">
      <h3>{symbols.length} of {module.symbols.length} module declarations</h3>
      <p className="project-search-status">Compiler inventory includes module declarations, not every local variable.</p>
      <div className="inspection-scroll">
        {symbols.map(symbol => <article key={symbol.name} className="inspection-symbol">
          <button type="button" className="inspection-signature" aria-label={'Navigate to ' + symbol.name}
            onClick={() => navigate(module.id, symbol.span)}>{symbolSignature(symbol)}</button>
          {symbol.kind === 'record' && <ul>{symbol.fields.map(field => <li key={field.name}>{field.name}: {field.type}</li>)}</ul>}
          {symbol.kind === 'variant' && <ul>{symbol.cases.map(item => <li key={item.name}>{item.name}{item.payload ? '(' + item.payload + ')' : ''}</li>)}</ul>}
          {symbol.kind === 'function' && (symbol.parameters.length > 0 || symbol.type_parameters.length > 0) && <details>
            <summary>Parameter locations</summary>
            <ul className="inspection-links">
              {symbol.type_parameters.map(parameter => <li key={'type:' + parameter.name}>
                <button type="button" onClick={() => navigate(module.id, parameter.span)}>Type parameter {parameter.name}</button>
              </li>)}
              {symbol.parameters.map(parameter => <li key={'value:' + parameter.name}>
                <button type="button" onClick={() => navigate(module.id, parameter.span)}>Parameter {parameter.name}</button>
              </li>)}
            </ul>
          </details>}
        </article>)}
        {!symbols.length && <p>No matching module declarations.</p>}
      </div>
    </section>
    <section className="inspection-section" aria-label="Constant dependency sites">
      <h3>Constant dependency sites ({edges.length})</h3>
      {edges.length ? <ul className="inspection-links inspection-scroll">
        {edges.map((edge, index) => <li key={index}>
          <button type="button" onClick={() => navigate(edge.source, edge.span)}>Use at line {inventorySite(data, edge.source, edge.span)?.line}</button>
          <button type="button" onClick={() => navigate(edge.target, edge.target_declaration)}>Declaration in {inventory.modules[edge.target].path}</button>
        </li>)}
      </ul> : <p>No constant dependencies reported for this module.</p>}
    </section>
  </>;
}

export function ModuleInspectionPanel({ result, running, busy, onRefresh, onNavigate, onClose }: Props) {
  return <section id="module-inspection-panel" className="project-search module-inspection" aria-label="Compiler module inspection">
    <div className="project-search-bar inspection-heading">
      <h2>Compiler module inspection</h2>
      <button type="button" className="button-primary" disabled={busy || running} onClick={onRefresh}>
        {busy ? 'Compiling inventory…' : 'Inspect modules'}
      </button>
      <button type="button" onClick={onClose}>Close inspection</button>
    </div>
    <p className="project-replace-help">Resolve the current entrypoint and imports with the real Scarp compiler.
      See module declarations, signatures and dependency sites. No runtime statements execute and no input is consumed.</p>
    {!result && !busy && <p role="status" className="project-search-status">Inspect the current workspace to see resolved metadata.</p>}
    {busy && <p role="status">Compiling static module metadata…</p>}
    {!busy && result && !result.ok && <p className="inspection-error" role="status">{result.error}</p>}
    {!busy && result?.ok && <InventoryView data={result.data} onNavigate={onNavigate} />}
  </section>;
}
