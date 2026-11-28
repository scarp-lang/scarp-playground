import { validPath } from './workspace';
import { measureUtf8 } from './utf8';

export type ScarpFileStats = {
  downloadName: string;
  lines: number;
  bytes: number;
};

/** Describe an editor buffer without trimming, normalizing or compiling it. */
export function scarpFileStats(path: string, source: string): ScarpFileStats | null {
  if (!validPath(path) || typeof source !== 'string') return null;
  const size = measureUtf8(source, Number.MAX_SAFE_INTEGER);
  if (!size.ok) return null;
  return {
    // Browser downloads are flat files; preserve the real .srp basename.
    downloadName: path.slice(path.lastIndexOf('/') + 1),
    // The trailing empty line is a real Monaco line and must be counted.
    lines: source.split(/\r\n|\r|\n/).length,
    bytes: size.bytes,
  };
}
