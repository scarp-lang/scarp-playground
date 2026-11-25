import type { ConsoleMode } from './transcript';

/**
 * Supplemental browser-only guidance for exact published compiler codes.
 * Do not infer a diagnostic kind from its free-form text, a CLI flag, or
 * user source. The compiler diagnostic remains the authoritative explanation.
 */
const browserHelp = new Map<string, string>([
  ['E0017', 'Reduce loop iterations, recursive work or repeated text scans. The Playground has a fixed 200,000-step logical work budget; native CLI flags cannot change it here.'],
  ['E0018', 'Reduce the number of selected print/write statements, including inside loops. The Playground permits at most 1,000 selected output statements per evaluation. Check also enforces this limit.'],
  ['E0027', 'Reduce recursion depth, function calls or frame size. The Playground limits call depth to 64, calls to 10,000 and live slots to 100,000; this code does not identify which allowance was exhausted.'],
  ['E0029', 'Print smaller summaries or fewer values. Both captured output streams share a 1 MiB browser allowance; failed evaluations do not return partial output.'],
  ['E0035', 'Try smaller numerical buffers. This is an allocation or reservation failure, not proof that a specific logical quota was exceeded.'],
  ['E0036', 'Reuse immutable vector windows or reduce newly materialized vectors and tiles. The browser has a cumulative 2 MiB numerical payload budget, not a physical memory cap.'],
  ['E0040', 'Reduce imports, module depth or constant-expression complexity. Browser compilation has independent module and constant limits; changing runtime work cannot resolve them.'],
  ['E0047', 'Simplify nested types and signatures. Browser compiler type limits are separate from runtime allocation and work quotas.'],
  ['E0048', 'Reduce text repetition or avoid repeatedly constructing large strings. A single materialized string is limited to 1 MiB and the browser has a cumulative 2 MiB text payload budget.'],
  ['E0050', 'Reduce the project or symbol/reference complexity and retry the editor operation. Navigation limits are independent of runtime execution.'],
  ['E0052', 'Try smaller BigInt inputs or exponents. The browser allows up to 2,048 decimal digits and 256 KiB of cumulative limb reservations; scratch space and work may reach another limit first. Native CLI flags cannot raise these browser quotas.'],
  ['E0053', 'Reduce BigInt operand sizes or intermediate results. This is a reservation or capacity failure, distinct from a configured BigInt quota error (E0052).'],
  ['E0055', 'Supply another line in Program input, or handle end of input with try_read_line() or read_line_or(). The browser does not open a live terminal.'],
  ['E0058', 'Reduce supplied input or the number of reads. The browser allows 16 KiB of buffered UTF-8 input and at most 128 reads; no host stdin is available.'],
  ['E0061', 'Reuse immutable tuples or reduce new tuple construction. The browser has a 1 MiB cumulative tuple payload budget; this diagnostic may also indicate failed allocation.'],
  ['E0064', 'Reuse immutable arrays or reduce new array construction. The browser has a 1 MiB cumulative array payload budget; this diagnostic may also indicate failed allocation.'],
]);

export function browserDiagnosticHelp(code: string | null | undefined, mode: ConsoleMode): string | null {
  if (code === 'E0054') {
    if (mode === 'check') return 'Check evaluates reachable statements but cannot consume program input. Use Verify for static validation, or supply Program input and select Run.';
    if (mode === 'run') return 'Use the Program input panel to supply lines before Run. For typed prompt functions, enable the buffered prompt option. The browser cannot open a live terminal.';
    return null;
  }
  return typeof code === 'string' ? browserHelp.get(code) ?? null : null;
}
