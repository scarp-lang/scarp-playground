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

  it('rejects structurally invalid project JSON without coercion or crashes', () => {
    for (const value of [
      null, undefined, {}, [], 'not a workspace',
      { entry: 'main.srp', files: null },
      { entry: 'main.srp', files: [] },
      { entry: 'main.srp', files: { 'main.srp': null } },
      { entry: 'main.srp', files: { 'main.srp': 17 } },
      { entry: 'main.srp', files: { 'main.srp': ['print(1);'] } },
      { entry: {}, files: { 'main.srp': 'print(1);' } },
      { entry: 'main.srp', files: { 'main.srp': true } },
    ]) {
      expect(() => validateWorkspace(value)).not.toThrow();
      expect(validateWorkspace(value)).toEqual(expect.any(String));
    }
    expect(validPath(Symbol('main.srp'))).toBe(false);
    expect(validPath('m'.repeat(200_000) + '.srp')).toBe(false);
    const longPath = 'm'.repeat(200_000) + '.srp';
    const bad = validateWorkspace({
      entry: 'main.srp',
      files: { 'main.srp': 'print(1);', [longPath]: '' },
    });
    expect(bad).toMatch(/Invalid .srp path/);
    expect(bad!.length).toBeLessThan(160);
  });

  it('accepts null-prototype source maps but refuses inherited entry files', () => {
    const files = Object.assign(Object.create(null) as Record<string, string>, {
      'main.srp': 'print("hello");',
    });
    expect(validateWorkspace({ entry: 'main.srp', files })).toBeNull();
    const inherited = Object.create({ 'main.srp': 'print("inherited");' }) as Record<string, string>;
    expect(validateWorkspace({ entry: 'main.srp', files: inherited })).toMatch(/entry/);
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
