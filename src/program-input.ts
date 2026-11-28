import { MAX_PROGRAM_INPUT_BYTES } from './runner/limits';
import { measureUtf8 } from './utf8';

export type ProgramInputEdit = {
  accepted: boolean;
  value: string;
  bytes: number;
};

/** Use the UTF-8 byte unit enforced at the Rust/Worker stdin boundary. */
export function programInputBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Reject over-budget edits atomically, without truncating UTF-16 surrogates or
 * discarding text after an insertion at the start of the buffer.
 */
export function previewProgramInputEdit(previous: string, candidate: string): ProgramInputEdit {
  const measured = measureUtf8(candidate, MAX_PROGRAM_INPUT_BYTES);
  if (!measured.ok) return { accepted: false, value: previous, bytes: programInputBytes(previous) };
  return { accepted: true, value: candidate, bytes: measured.bytes };
}
