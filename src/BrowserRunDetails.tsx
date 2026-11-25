import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './workspace';
import { MAX_PROGRAM_INPUT_BYTES, RUN_TIMEOUT_MS } from './runner/limits';
import { MAX_OUTPUT_BYTES } from './runner/protocol';
import { formatBrowserElapsed, type BrowserRunStats } from './runner/browser-stats';

const limits = [
  ['Workspace files', String(MAX_FILES)],
  ['Source per file', MAX_FILE_BYTES / 1024 + ' KiB'],
  ['Total source', MAX_TOTAL_BYTES / 1024 + ' KiB'],
  ['Buffered input', MAX_PROGRAM_INPUT_BYTES / 1024 + ' KiB'],
  ['Combined captured output', MAX_OUTPUT_BYTES / 1024 + ' KiB'],
  ['Worker deadline', RUN_TIMEOUT_MS / 1000 + ' seconds'],
  ['Interpreter steps', '200,000'],
  ['Print statements', '1,000'],
  ['BigInt decimal digits', '2,048'],
  ['BigInt limb reservations', '256 KiB'],
] as const;

export function BrowserRunDetails({ stats }: { stats: BrowserRunStats | null }) {
  return (
    <div className="browser-run-details">
      {stats && (
        <dl className="browser-run-stats" aria-label="Browser operation statistics">
          <div><dt>Browser turnaround</dt><dd>{formatBrowserElapsed(stats.elapsedMs)}</dd></div>
          {stats.output && <>
            <div><dt>stdout (UTF-8)</dt><dd>{stats.output.stdoutBytes} bytes</dd></div>
            <div><dt>stderr (UTF-8)</dt><dd>{stats.output.stderrBytes} bytes</dd></div>
          </>}
        </dl>
      )}
      <details>
        <summary>Browser execution limits and measurement notes</summary>
        <dl className="browser-run-limits">
          {limits.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p>Turnaround includes worker startup, compiler loading and response delivery.
          It is not CPU time or a benchmark of native Scarp. Failed operations
          and silent Verify/Check do not report captured output sizes.</p>
        <p>Limits are logical quotas, not physical browser memory caps. BigInt
          computations may reach another quota before the digit ceiling. No host
          CLI or filesystem access is provided.</p>
      </details>
    </div>
  );
}
