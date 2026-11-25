import { describe, expect, it } from 'vitest';
import { browserDiagnosticHelp } from '../src/runner/browser-diagnostic-help';

describe('browser-specific compiler diagnostic guidance', () => {
  it('uses exact codes rather than matching compiler or source text', () => {
    for (const code of [null, undefined, '', 'e0052', 'E0052 extra', 'E9999', 'toString', '__proto__', 'E0010']) {
      expect(browserDiagnosticHelp(code, 'run')).toBeNull();
    }
  });

  it('explains the BigInt limits without claiming the failing quota is known', () => {
    const hint = browserDiagnosticHelp('E0052', 'run');
    expect(hint).toContain('2,048 decimal digits');
    expect(hint).toContain('256 KiB');
    expect(hint).toContain('another limit first');
    expect(browserDiagnosticHelp('E0053', 'run')).toContain('reservation or capacity failure');
  });

  it('distinguishes Check input from Run input and excludes irrelevant operations', () => {
    expect(browserDiagnosticHelp('E0054', 'check')).toContain('Use Verify');
    expect(browserDiagnosticHelp('E0054', 'run')).toContain('Program input panel');
    for (const mode of ['verify', 'definition', 'references', 'rename'] as const) {
      expect(browserDiagnosticHelp('E0054', mode)).toBeNull();
    }
  });

  it('does not claim allocation failures always mean quota exhaustion', () => {
    expect(browserDiagnosticHelp('E0035', 'run')).toContain('not proof');
    expect(browserDiagnosticHelp('E0061', 'run')).toContain('failed allocation');
    expect(browserDiagnosticHelp('E0064', 'run')).toContain('failed allocation');
  });

  it('uses fixed browser limits rather than suggesting native configuration changes', () => {
    for (const [code, expected] of [
      ['E0017', '200,000-step'], ['E0018', '1,000 selected'],
      ['E0027', '10,000'], ['E0029', '1 MiB'], ['E0036', '2 MiB'],
      ['E0048', '2 MiB'], ['E0058', '128 reads'],
    ]) {
      expect(browserDiagnosticHelp(code, 'run')).toContain(expected);
    }
  });
});
