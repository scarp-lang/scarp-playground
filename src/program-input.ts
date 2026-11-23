import { MAX_PROGRAM_INPUT_BYTES } from './runner/limits';

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
  // Every UTF-16 code unit needs at least one UTF-8 byte; reject giant pastes
  // without encoding unnecessarily large strings.
  if (candidate.length > MAX_PROGRAM_INPUT_BYTES) {
    return { accepted: false, value: previous, bytes: programInputBytes(previous) };
  }
  const bytes = programInputBytes(candidate);
  if (bytes > MAX_PROGRAM_INPUT_BYTES) {
    return { accepted: false, value: previous, bytes: programInputBytes(previous) };
  }
  return { accepted: true, value: candidate, bytes };
}
