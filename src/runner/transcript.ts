import type { RunResult } from './types';

export type ConsoleMode = 'run' | 'check' | 'verify';

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
  const action = mode === 'verify' ? 'Verification' : mode === 'check' ? 'Check' : 'Execution';
  const lines = [action + ' failed'];
  const diagnostic = result.diagnostic;
  if (diagnostic?.code) lines.push('Code: ' + diagnostic.code);
  if (diagnostic?.primary) {
    const at = diagnostic.primary;
    lines.push('Location: ' + at.path + ':' + at.start.line + ':' + at.start.column);
  }
  lines.push(diagnostic?.message || result.error || 'Unknown compiler error.');
  if (diagnostic?.help) lines.push('Hint: ' + diagnostic.help);
  for (const note of diagnostic?.related ?? []) {
    const location = note.location;
    lines.push('Related: ' + note.message + (location ?
      ' (' + location.path + ':' + location.start.line + ':' + location.start.column + ')' : ''));
  }
  return lines.join('\n') + '\n';
}

