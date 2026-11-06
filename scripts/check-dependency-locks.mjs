import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Independent guard for every transitive dependency admitted into the build.
// An advisory scan is still needed: checksums and pins do not prove safety.
export const REVIEWED_SCARP_COMMIT = 'aa329a22cf2bf92d2c9814a26ff9c8b67a72e6e8';
export const REVIEWED_SCARP_VERSION = '0.0.6-alpha.1';
const NPM_REGISTRY = 'https://registry.npmjs.org/';
const CARGO_REGISTRY = 'registry+https://github.com/rust-lang/crates.io-index';

function sameEntries(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

export function validateNpmLock(manifest, lock) {
  const errors = [];
  const root = lock?.packages?.[''];
  if (lock?.lockfileVersion !== 3) errors.push('Require npm lockfile v3.');
  if (!root || typeof root !== 'object') errors.push('Missing npm root lock entry.');
  if (lock?.name !== manifest?.name || lock?.version !== manifest?.version ||
      root?.name !== manifest?.name || root?.version !== manifest?.version) {
    errors.push('npm lock root name/version differs from package.json.');
  }
  for (const type of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (!sameEntries(manifest?.[type], root?.[type])) {
      errors.push('npm root ' + type + ' differs from package.json.');
    }
  }
  const packages = Object.entries(lock?.packages || {}).filter(([path]) => path !== '');
  if (packages.length === 0) errors.push('npm dependency graph is empty.');
  let bundled = 0;
  for (const [path, item] of packages) {
    if (!path.startsWith('node_modules/') || !item || typeof item !== 'object') {
      errors.push('Invalid npm dependency entry: ' + path);
      continue;
    }
    if (item.link === true) errors.push('Unreviewed npm symlink dependency: ' + path);
    if (typeof item.version !== 'string' || !item.version) {
      errors.push('Missing locked npm version: ' + path);
    }
    if (item.inBundle === true) {
      // Bundled subdependencies have no standalone npm tarball or SRI.
      bundled += 1;
      continue;
    }
    if (typeof item.resolved !== 'string' ||
        !item.resolved.startsWith(NPM_REGISTRY) ||
        !item.resolved.endsWith('.tgz')) {
      errors.push('Dependency must resolve to a registry.npmjs.org tarball: ' + path);
    }
    if (typeof item.integrity !== 'string' ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity)) {
      errors.push('Missing SHA-512 npm integrity: ' + path);
    }
  }
  return { errors, packages: packages.length, bundled };
}

function field(block, name) {
  return block.match(new RegExp('^' + name + ' = "([^"]+)"$', 'm'))?.[1];
}

export function validateCargoLock(manifestText, lockText) {
  const errors = [];
  const pin = REVIEWED_SCARP_COMMIT;
  const manifestMatch = manifestText.match(
    /scarp\s*=\s*\{\s*git\s*=\s*"https:\/\/github\.com\/scarp-lang\/scarp"\s*,\s*rev\s*=\s*"([0-9a-f]{40})"\s*\}/,
  );
  if (!manifestMatch || manifestMatch[1] !== pin) {
    errors.push('Scarp compiler manifest revision differs from the reviewed alpha pin.');
  }
  if (!/^version = 4$/m.test(lockText)) {
    errors.push('Require Cargo.lock v4.');
  }
  const entries = lockText.split(/^\[\[package\]\]\s*$/m).slice(1);
  if (!entries.length) errors.push('Cargo.lock has no package entries.');
  let compilerCount = 0;
  let registryCount = 0;
  let localCount = 0;
  for (const entry of entries) {
    const name = field(entry, 'name');
    const version = field(entry, 'version');
    const source = field(entry, 'source');
    const checksum = field(entry, 'checksum');
    if (!name || !version) {
      errors.push('Cargo package missing name or version.');
      continue;
    }
    if (name === 'scarp') {
      compilerCount += 1;
      const reviewedSource =
        'git+https://github.com/scarp-lang/scarp?rev=' + pin + '#' + pin;
      if (version !== REVIEWED_SCARP_VERSION || source !== reviewedSource) {
        errors.push('Scarp compiler lock provenance or version changed.');
      }
      continue;
    }
    if (!source) {
      localCount += 1;
      if (name !== 'scarp-playground-wasm' || checksum) {
        errors.push('Unexpected local Cargo package: ' + name);
      }
      continue;
    }
    if (source !== CARGO_REGISTRY || !checksum ||
        !/^[0-9a-f]{64}$/.test(checksum)) {
      errors.push('Unexpected Cargo registry or missing checksum: ' + name + '@' + version);
    } else {
      registryCount += 1;
    }
  }
  if (compilerCount !== 1) errors.push('Expected exactly one pinned Scarp compiler.');
  if (localCount !== 1) errors.push('Expected exactly one local bridge crate.');
  if (!registryCount) errors.push('Expected checksummed Cargo registry dependencies.');
  return { errors, packages: entries.length, registryCount };
}

export function validateProjectFiles(rootDir) {
  const read = (path) => readFileSync(resolve(rootDir, path), 'utf8');
  return {
    npm: validateNpmLock(JSON.parse(read('package.json')), JSON.parse(read('package-lock.json'))),
    cargo: validateCargoLock(read('bridge/Cargo.toml'), read('bridge/Cargo.lock')),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { npm, cargo } = validateProjectFiles(resolve('.'));
  const errors = [...npm.errors, ...cargo.errors];
  if (errors.length) {
    process.stderr.write(errors.map((message) => 'Dependency lock violation: ' + message).join('\n') + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(
      'Verified ' + npm.packages + ' locked npm entries (' + npm.bundled +
      ' bundled) and ' + cargo.packages + ' locked Cargo crates; ' +
      'Scarp compiler pin: ' + REVIEWED_SCARP_COMMIT + '\n',
    );
  }
}
