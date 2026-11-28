import { parseLibrary, serializeLibrary, mutateLibrary, type LibraryMutation, type LibraryResult, type ProjectLibrary } from './model';

export const LIBRARY_DATABASE = 'scarp-playground-project-library';
const STORE = 'snapshots';
const KEY = 'source-library-v1';

export type LibrarySnapshot = { raw: string | null; library: ProjectLibrary };
type Result<T> = LibraryResult<T>;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** IndexedDB is used only after opening the local library. No source network. */
function openDatabase(factory: IDBFactory): Promise<Result<IDBDatabase>> {
  return new Promise(resolve => {
    let done = false;
    const finish = (value: Result<IDBDatabase>) => {
      if (done) {
        if (value.ok) value.value.close();
        return;
      }
      done = true;
      resolve(value);
    };
    let request: IDBOpenDBRequest;
    try { request = factory.open(LIBRARY_DATABASE, 1); }
    catch { finish(fail('Browser project storage is unavailable.')); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => finish(fail('Project storage is blocked by another browser tab. Close that tab and refresh.'));
    request.onerror = () => finish(fail('Unable to open browser project storage.'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      finish({ ok: true, value: database });
    };
  });
}

function decodeSnapshot(raw: unknown): Result<LibrarySnapshot> {
  const parsed = parseLibrary(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { raw: typeof raw === 'string' ? raw : null, library: parsed.value } };
}

/** A failed transaction never publishes a successful write. */
async function transact<T>(factory: IDBFactory, mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, set: (result: Result<T>) => void) => void): Promise<Result<T>> {
  const opened = await openDatabase(factory);
  if (!opened.ok) return opened;
  const db = opened.value;
  return new Promise(resolve => {
    let outcome: Result<T> = fail('Browser project storage did not complete the operation.');
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, mode); }
    catch { db.close(); resolve(fail('Unable to access browser project storage.')); return; }
    tx.oncomplete = () => { db.close(); resolve(outcome); };
    tx.onabort = () => {
      db.close();
      resolve(fail(tx.error?.name === 'QuotaExceededError'
        ? 'Browser storage quota exceeded. No saved projects were changed.'
        : 'Browser storage transaction failed. No saved projects were changed.'));
    };
    // The default transaction error behavior aborts pending writes.
    try { operation(tx.objectStore(STORE), result => { outcome = result; }); }
    catch { tx.abort(); }
  });
}

export function readProjectLibrary(factory: IDBFactory): Promise<Result<LibrarySnapshot>> {
  return transact(factory, 'readonly', (store, set) => {
    const request = store.get(KEY);
    request.onsuccess = () => set(decodeSnapshot(request.result));
  });
}

/**
 * Read, compare, validate and write in one readwrite transaction. An old
 * rendered library must never overwrite a newer tab's update. No automatic
 * retries of destructive actions and no partial records.
 */
export function changeProjectLibrary(factory: IDBFactory, expected: LibrarySnapshot,
  mutation: LibraryMutation): Promise<Result<LibrarySnapshot>> {
  return transact(factory, 'readwrite', (store, set) => {
    const request = store.get(KEY);
    request.onsuccess = () => {
      const latest = decodeSnapshot(request.result);
      if (!latest.ok) { set(latest); return; }
      if (latest.value.raw !== expected.raw) {
        set(fail('Saved projects changed in another tab. Refresh the library before trying again.'));
        return;
      }
      const next = mutateLibrary(latest.value.library, mutation);
      if (!next.ok) { set(next); return; }
      const serialized = serializeLibrary(next.value);
      if (!serialized.ok) { set(serialized); return; }
      // The transaction's completion, rather than put's success, commits.
      const write = store.put(serialized.value, KEY);
      write.onsuccess = () => set({ ok: true, value: { raw: serialized.value, library: next.value } });
    };
  });
}

/** Explicit deletion only; never invoked by ordinary reads. */
export function clearProjectLibrary(factory: IDBFactory, expected: LibrarySnapshot): Promise<Result<LibrarySnapshot>> {
  return transact(factory, 'readwrite', (store, set) => {
    const request = store.get(KEY);
    request.onsuccess = () => {
      const latest = decodeSnapshot(request.result);
      if (!latest.ok) { set(latest); return; }
      if (latest.value.raw !== expected.raw) {
        set(fail('Saved projects changed in another tab. Refresh before clearing.'));
        return;
      }
      const removal = store.delete(KEY);
      removal.onsuccess = () => set(decodeSnapshot(null));
    };
  });
}
