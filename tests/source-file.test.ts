import { describe, expect, it } from 'vitest';
import { scarpFileStats } from '../src/source-file';

describe('Scarp module export metadata', () => {
  it('reports exact Unicode UTF-8 bytes and Monaco-compatible line counts', () => {
    const source = 'print("😀");\r\nprint("नमस्ते");\n';
    expect(scarpFileStats('main.srp', source)).toEqual({
      downloadName: 'main.srp',
      lines: 3,
      bytes: new TextEncoder().encode(source).byteLength,
    });
  });

  it('keeps the basename of nested virtual modules', () => {
    expect(scarpFileStats('lib/math.srp', 'pub pure funcra twice() {}'))
      .toMatchObject({ downloadName: 'math.srp', lines: 1 });
    expect(scarpFileStats('a/b/c.srp', '')).toEqual({
      downloadName: 'c.srp', lines: 1, bytes: 0,
    });
  });

  it('handles CR-only line separators, exact trailing lines and empty sources', () => {
    expect(scarpFileStats('main.srp', 'a\rb\rc')?.lines).toBe(3);
    expect(scarpFileStats('main.srp', 'a\r\n')?.lines).toBe(2);
    expect(scarpFileStats('main.srp', '')?.lines).toBe(1);
  });

  it('rejects invalid source paths without producing a download name', () => {
    for (const path of ['../secrets.srp', '/main.srp', 'main.js', 'a/../main.srp', 'x\\\\y.srp']) {
      expect(scarpFileStats(path, 'safe')).toBeNull();
    }
  });

  it('reports source bytes even if an unsaved editor buffer exceeds runnable limits', () => {
    const source = 'α'.repeat(40_000);
    expect(scarpFileStats('main.srp', source)?.bytes).toBe(80_000);
  });
});
