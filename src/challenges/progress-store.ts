import { applyPracticeAttempt, emptyProgress, validateProgress, type PracticeAttempt,
  type PracticeProgress, type ProgressResult } from './progress';

export const PROGRESS_DATABASE = 'scarp-playground-learning-progress';
const STORE = 'practice';
const KEY = 'progress-v1';
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Separate database, opened only by an explicit progress action. */
function open(factory: IDBFactory): Promise<ProgressResult<IDBDatabase>> {
  return new Promise(resolve => {
    let done = false;
    const finish = (result: ProgressResult<IDBDatabase>) => {
      if (done) { if (result.ok) result.value.close(); return; }
      done = true; resolve(result);
    };
    let request: IDBOpenDBRequest;
    try { request = factory.open(PROGRESS_DATABASE, 1); }
    catch { finish(fail('Learning progress storage is unavailable.')); return; }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onblocked = () => finish(fail('Learning progress storage is blocked by another tab.'));
    request.onerror = () => finish(fail('Unable to open learning progress.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      finish({ ok: true, value: db });
    };
  });
}

function readValue(value: unknown): ProgressResult<PracticeProgress> {
  return value === undefined ? { ok: true, value: emptyProgress() } : validateProgress(value);
}

async function transact(factory: IDBFactory, mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, set: (result: ProgressResult<PracticeProgress>) => void) => void): Promise<ProgressResult<PracticeProgress>> {
  const opened = await open(factory);
  if (!opened.ok) return opened;
  const db = opened.value;
  return new Promise(resolve => {
    let outcome: ProgressResult<PracticeProgress> = fail('Learning progress operation did not complete.');
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, mode); }
    catch { db.close(); resolve(fail('Learning progress storage is unavailable.')); return; }
    tx.oncomplete = () => { db.close(); resolve(outcome); };
    tx.onabort = () => { db.close(); resolve(fail('Learning progress transaction failed; nothing was saved.')); };
    try { operation(tx.objectStore(STORE), value => { outcome = value; }); }
    catch { tx.abort(); }
  });
}

export function readPracticeProgress(factory: IDBFactory): Promise<ProgressResult<PracticeProgress>> {
  return transact(factory, 'readonly', (store, set) => {
    const req = store.get(KEY);
    req.onsuccess = () => set(readValue(req.result));
  });
}

/** Serialized read-modify-write transactions prevent two tabs from losing
 * each other's recorded attempts. Only an explicit user click writes. */
export function savePracticeAttempt(factory: IDBFactory, attempt: PracticeAttempt): Promise<ProgressResult<PracticeProgress>> {
  return transact(factory, 'readwrite', (store, set) => {
    const req = store.get(KEY);
    req.onsuccess = () => {
      const current = readValue(req.result);
      if (!current.ok) { set(current); return; }
      const next = applyPracticeAttempt(current.value, attempt);
      if (!next.ok) { set(next); return; }
      const write = store.put(next.value, KEY);
      write.onsuccess = () => set(next);
    };
  });
}

export function clearPracticeProgress(factory: IDBFactory): Promise<ProgressResult<PracticeProgress>> {
  return transact(factory, 'readwrite', (store, set) => {
    const req = store.delete(KEY);
    req.onsuccess = () => set({ ok: true, value: emptyProgress() });
  });
}
