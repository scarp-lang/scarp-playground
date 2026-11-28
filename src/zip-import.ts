import { sourceArchiveProblem, parseSourceArchive, sourceCrc32 } from './source-archive';
import { readZipDirectory, type ZipSource } from './zip-directory';
import { validateWorkspace, type Workspace } from './workspace';

export type ImportedZip = { ok: true; workspace: Workspace; ignored: number } |
  { ok: false; error: string };
type Inflate = (data: Uint8Array, size: number) => Promise<Uint8Array>;

/** Allocate at most the declared, already bounded source size. Cancel as soon
 * as decompression produces too much. A checksum is still required. */
export async function inflateZipSource(data: Uint8Array, size: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed ZIP sources. Use a stored ZIP or import a folder.');
  let stream: DecompressionStream;
  try { stream = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('This browser cannot read raw DEFLATE ZIP sources. Use a stored ZIP or import a folder.'); }
  const reader = new Blob([Uint8Array.from(data)]).stream().pipeThrough(stream).getReader();
  const output = new Uint8Array(size);
  let written = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.length > size - written) {
        await reader.cancel();
        throw new Error('ZIP source expands beyond its declared size.');
      }
      output.set(next.value, written);
      written += next.value.length;
    }
    if (written !== size) throw new Error('ZIP source decompressed size does not match its declaration.');
    return output;
  } finally {
    reader.releaseLock();
  }
}

async function decodeSource(item: ZipSource, inflate: Inflate): Promise<string> {
  const bytes = item.method === 0 ? item.data : await inflate(item.data, item.size);
  if (bytes.length !== item.size || sourceCrc32(bytes) !== item.crc) throw new Error('ZIP source size or checksum mismatch in ' + item.path + '.');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('ZIP contains invalid UTF-8 source in ' + item.path + '.'); }
}

/** All-or-nothing: never expose partial source or decompress non-source files. */
export async function importSourceZip(bytes: Uint8Array, inflate: Inflate = inflateZipSource): Promise<ImportedZip> {
  const canonical = parseSourceArchive(bytes);
  if (canonical.ok) return { ...canonical, ignored: 0 };
  const directory = readZipDirectory(bytes);
  if (!directory.ok) return directory;
  const files: Record<string, string> = Object.create(null);
  try {
    for (const item of directory.sources) files[item.path] = await decodeSource(item, inflate);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to decode ZIP source.' };
  }
  const paths = Object.keys(files).sort();
  const entry = Object.hasOwn(files, 'main.srp') ? 'main.srp' :
    Object.hasOwn(files, 'src/main.srp') ? 'src/main.srp' : paths[0];
  const workspace = { entry, files };
  const problem = validateWorkspace(workspace) ?? sourceArchiveProblem(workspace);
  return problem ? { ok: false, error: problem } : { ok: true, workspace, ignored: directory.ignored };
}
