/**
 * The browser has one concurrent Scarp WASM compiler slot for Run, Check,
 * and Go to Definition. Superseding requests synchronously terminate the
 * previous Worker; this limits concurrent allocation, not physical memory.
 *
 * A stale caller must never release a slot that a newer caller owns.
 */
type CompilerSlot = { cancel: () => void };
let active: CompilerSlot | null = null;

export function claimCompilerWorker(cancel: () => void): () => void {
  const previous = active;
  const slot: CompilerSlot = { cancel };
  active = slot;
  previous?.cancel();
  return () => {
    if (active === slot) active = null;
  };
}
