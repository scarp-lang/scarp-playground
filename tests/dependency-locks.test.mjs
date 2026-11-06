import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCargoLock, validateNpmLock, validateProjectFiles,
  REVIEWED_SCARP_COMMIT,
} from '../scripts/check-dependency-locks.mjs';

const manifest = {
  name: '@scarplang/playground', version: '0.0.2',
  dependencies: { react: '^19.1.1' },
};
const lock = {
  lockfileVersion: 3,
  name: manifest.name,
  version: manifest.version,
  packages: {
    '': { ...manifest },
    'node_modules/react': {
      version: '19.1.1',
      resolved: 'https://registry.npmjs.org/react/-/react-19.1.1.tgz',
      integrity: 'sha512-' + Buffer.from('test integrity').toString('base64'),
    },
    'node_modules/runtime-bundled': {
      version: '1.0.0',
      inBundle: true,
    },
  },
};
const cargo = '[package]\nname = "scarp-playground-wasm"\nversion = "0.0.2"\n' +
  'scarp = { git = "https://github.com/scarp-lang/scarp", rev = "' +
  REVIEWED_SCARP_COMMIT + '" }\n';
const cargoLock = 'version = 4\n[[package]]\nname = "scarp"\n' +
  'version = "0.0.6-alpha.1"\nsource = "git+https://github.com/scarp-lang/scarp?rev=' +
  REVIEWED_SCARP_COMMIT + '#' + REVIEWED_SCARP_COMMIT +
  '"\n\n[[package]]\nname = "scarp-playground-wasm"\nversion = "0.0.2"\n' +
  '\n[[package]]\nname = "serde"\nversion = "1.0.229"\n' +
  'source = "registry+https://github.com/rust-lang/crates.io-index"\n' +
  'checksum = "' + 'a'.repeat(64) + '"\n';

test('actual repository lockfiles satisfy pinned provenance', () => {
  const result = validateProjectFiles('.');
  assert.deepEqual(result.npm.errors, []);
  assert.deepEqual(result.cargo.errors, []);
  assert.ok(result.npm.packages > 100);
  assert.ok(result.cargo.packages > 10);
});

test('accepts verified npm packages and explicitly bundled subdependencies', () => {
  assert.deepEqual(validateNpmLock(manifest, lock).errors, []);
  assert.equal(validateNpmLock(manifest, lock).bundled, 1);
});

test('refuses changed root dependency ranges', () => {
  const changed = structuredClone(lock);
  changed.packages[''].dependencies.react = '^99.0.0';
  assert.match(validateNpmLock(manifest, changed).errors.join(' '), /root dependencies/);
});

test('refuses registry substitution, insecure tarballs, or stripped SRI', () => {
  for (const change of [
    { resolved: 'http://registry.npmjs.org/react/-/react-19.1.1.tgz' },
    { resolved: 'https://untrusted.example/react.tgz' },
    { integrity: undefined },
    { integrity: 'sha1-unreviewed' },
    { link: true },
  ]) {
    const changed = structuredClone(lock);
    Object.assign(changed.packages['node_modules/react'], change);
    assert.ok(validateNpmLock(manifest, changed).errors.length > 0);
  }
});

test('accepts the exact reviewed Rust compiler pin with checksummed crates', () => {
  assert.deepEqual(validateCargoLock(cargo, cargoLock).errors, []);
});

test('refuses moving compiler refs, foreign git repos and unchecked crates', () => {
  for (const [modifiedManifest, modifiedLock] of [
    [cargo.replace(REVIEWED_SCARP_COMMIT, 'f'.repeat(40)), cargoLock],
    [cargo, cargoLock.replace('github.com/scarp-lang/scarp', 'github.com/other/scarp')],
    [cargo, cargoLock.replace('checksum = "' + 'a'.repeat(64) + '"', '')],
    [cargo, cargoLock.replace('registry+https://github.com/rust-lang/crates.io-index', 'git+https://example.org/evil')],
  ]) {
    assert.ok(validateCargoLock(modifiedManifest, modifiedLock).errors.length > 0);
  }
});
