import { validPath } from './workspace';

export type ScarpFileStats = {
  downloadName: string;
  lines: number;
  bytes: number;
};

/** Describe an editor buffer without trimming, normalizing or compiling it. */
export function scarpFileStats(path: string, source: string): ScarpFileStats | null {
  if (!validPath(path) || typeof source !== 'string') return null;
  return {
    // Browser downloads are flat files; preserve the real .srp basename.
    downloadName: path.slice(path.lastIndexOf('/') + 1),
    // The trailing empty line is a real Monaco line and must be counted.
    lines: source.split(/\r\n|\r|\n/).length,
    bytes: new TextEncoder().encode(source).byteLength,
  };
}
