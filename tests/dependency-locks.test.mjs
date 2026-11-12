import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCargoLock, validateNpmLock, validateCompilerMetadata, validateProjectFiles,
  REVIEWED_SCARP_COMMIT, REVIEWED_SCARP_VERSION,
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
      integrity: 'sha512-' + 'dGVzdCBpbnRlZ3JpdHk=',
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
  'version = "' + REVIEWED_SCARP_VERSION + '"\nsource = "git+https://github.com/scarp-lang/scarp?rev=' +
  REVIEWED_SCARP_COMMIT + '#' + REVIEWED_SCARP_COMMIT +
  '"\n\n[[package]]\nname = "scarp-playground-wasm"\nversion = "0.0.2"\n' +
  '\n[[package]]\nname = "serde"\nversion = "1.0.229"\n' +
  'source = "registry+https://github.com/rust-lang/crates.io-index"\n' +
  'checksum = "' + 'a'.repeat(64) + '"\n';

test('actual repository lockfiles satisfy pinned provenance', () => {
  const result = validateProjectFiles('.');
  assert.deepEqual(result.npm.errors, []);
  assert.deepEqual(result.cargo.errors, []);
  assert.deepEqual(result.compatibility.errors, []);
  assert.ok(result.npm.packages > 100);
  assert.ok(result.cargo.packages > 10);
});

test('accepts verified npm packages and explicitly bundled subdependencies', () => {
  assert.deepEqual(validateNpmLock(manifest, lock).errors, []);
  assert.equal(validateNpmLock(manifest, lock).bundled, 1);
});

test('refuses changed root dependency ranges', () => {
  const changed = JSON.parse(JSON.stringify(lock));
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
    const changed = JSON.parse(JSON.stringify(lock));
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

test('rejects stale, deceptive, or unreviewed browser compiler metadata', () => {
  const reviewed = {
    version: REVIEWED_SCARP_VERSION,
    commit: REVIEWED_SCARP_COMMIT,
    releaseUrl: 'https://github.com/scarp-lang/scarp/releases/tag/v' + REVIEWED_SCARP_VERSION,
  };
  assert.deepEqual(validateCompilerMetadata(reviewed).errors, []);
  for (const bad of [
    null,
    [],
    { ...reviewed, version: '0.0.6-alpha.7' },
    { ...reviewed, commit: 'f'.repeat(40) },
    { ...reviewed, releaseUrl: 'https://untrusted.example/scarp' },
    { ...reviewed, reviewBypass: true },
  ]) {
    assert.ok(validateCompilerMetadata(bad).errors.length > 0);
  }
});
