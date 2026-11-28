import { scalarLabel, visibleOutput, type OutputContext, type OutputDifference } from './runner/output-difference';

function Window({ label, context }: { label: string; context: OutputContext }) {
  return <div className="output-difference-window">
    <strong>{label}: {scalarLabel(context.scalar)}</strong>
    <pre>{context.omittedBefore ? '…' : ''}{visibleOutput(context.before)}
      <mark>{context.scalar === null ? '[EOF]' : visibleOutput(context.scalar)}</mark>
      {visibleOutput(context.after)}{context.omittedAfter ? '…' : ''}</pre>
  </div>;
}

export function OutputDifferenceView({ differences }: { differences: readonly OutputDifference[] }) {
  return <details className="output-difference">
    <summary>Inspect exact output differences ({differences.length})</summary>
    <p>Spaces are shown as ␠. Tabs, line endings and invisible controls are escaped. Highlighted characters are the first difference in each stream.</p>
    {differences.map(diff => <section key={diff.stream} aria-label={diff.stream + ' difference'}>
      <h4>{diff.stream} · line {diff.line}, scalar column {diff.column}</h4>
      <p>UTF-16 offset {diff.offset} · expected {diff.expectedBytes} B · actual {diff.actualBytes} B</p>
      <Window label="Expected" context={diff.expected} />
      <Window label="Actual" context={diff.actual} />
    </section>)}
  </details>;
}
