import { describe, expect, it } from 'vitest';
import { makeShareUrl, sourceFromHash, validPath, validateWorkspace } from '../src/workspace';

describe('virtual .srp workspace', () => {
  it('accepts safe relative paths', () => {
    expect(validPath('main.srp')).toBe(true);
    expect(validPath('lib/math.srp')).toBe(true);
    expect(validPath('../hidden.srp')).toBe(false);
    expect(validPath('/etc/passwd.srp')).toBe(false);
    expect(validPath('C:/code.srp')).toBe(false);
  });

  it('enforces an existing entry file', () => {
    expect(validateWorkspace({ entry: 'main.srp', files: { 'lib.srp': 'print(1);' } })).toMatch(/entry/);
    expect(validateWorkspace({ entry: 'main.srp', files: { 'main.srp': 'print(1);' } })).toBeNull();
  });

  it('round trips Unicode snippets without using a server', () => {
    const code = 'print("नमस्ते");';
    const url = makeShareUrl('https://example.org', '/playground/', code);
    expect(url).not.toBeNull();
    expect(sourceFromHash(new URL(url!).hash)).toBe(code);
  });

  it('rejects malformed and oversized URL snippets', () => {
    expect(sourceFromHash('#code=%ZZ')).toBeNull();
    expect(makeShareUrl('https://x.test', '/', 'x'.repeat(3000))).toBeNull();
  });
});
