import type { RunResult } from './types';
import { browserDiagnosticHelp } from './browser-diagnostic-help';

export type ConsoleMode = 'run' | 'check' | 'verify' | 'definition' | 'references' | 'rename';

// Compiler-backed editor services are not source execution.
const operationMetadata: Record<ConsoleMode, { subtitle: string; failure: string }> = {
  run: { subtitle: 'Real compiler execution', failure: 'Execution' },
  check: { subtitle: 'Runtime validation', failure: 'Check' },
  verify: { subtitle: 'Static compiler verification', failure: 'Verification' },
  definition: { subtitle: 'Go to Definition', failure: 'Go to Definition' },
  references: { subtitle: 'Find References', failure: 'Find References' },
  rename: { subtitle: 'Rename preview', failure: 'Rename preview' },
};

export function consoleOperationSubtitle(mode: ConsoleMode): string {
  return operationMetadata[mode].subtitle;
}

/** Export only the visible result, never a workspace, source file, or stdin.
 * When both output streams exist, label them; their temporal order is unknown.
 */
export function consoleTranscript(result: RunResult | null, mode: ConsoleMode): string | null {
  if (!result) return null;
  if (result.ok) {
    if (mode !== 'run') return null;
    if (!result.stdout) return result.stderr || null;
    if (!result.stderr) return result.stdout;
    return 'stdout:\n' + result.stdout +
      (result.stdout.endsWith('\n') ? '' : '\n') + 'stderr:\n' + result.stderr;
  }
  const action = operationMetadata[mode].failure;
  const lines = [action + ' failed'];
  const diagnostic = result.diagnostic;
  if (diagnostic?.code) lines.push('Code: ' + diagnostic.code);
  if (diagnostic?.primary) {
    const at = diagnostic.primary;
    lines.push('Location: ' + at.path + ':' + at.start.line + ':' + at.start.column);
  }
  lines.push(diagnostic?.message || result.error || 'Unknown compiler error.');
  const browserHelp = browserDiagnosticHelp(diagnostic?.code, mode);
  if (browserHelp) lines.push('Playground guidance: ' + browserHelp);
  if (diagnostic?.help) lines.push((browserHelp ? 'Original compiler hint: ' : 'Hint: ') + diagnostic.help);
  for (const note of diagnostic?.related ?? []) {
    const location = note.location;
    lines.push('Related: ' + note.message + (location ?
      ' (' + location.path + ':' + location.start.line + ':' + location.start.column + ')' : ''));
  }
  return lines.join('\n') + '\n';
}

