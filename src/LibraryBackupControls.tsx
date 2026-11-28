import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { compareLibraryBackup, defaultRestoreChoices, MAX_LIBRARY_BACKUP_BYTES, parseLibraryBackup,
  planLibraryRestore, serializeLibraryBackup, type RestoreChoice } from './library/backup';
import { MAX_LIBRARY_NAME, projectBytes, type ProjectLibrary } from './library/model';
import { restoreProjectLibrary, type LibrarySnapshot } from './library/store';

type Props = {
  snapshot: LibrarySnapshot;
  busy: boolean;
  onRestore: (snapshot: LibrarySnapshot) => void;
  onBusy: (busy: boolean) => void;
};

type Review = { baseline: LibrarySnapshot; backup: ProjectLibrary; choices: RestoreChoice[] };

export function LibraryBackupControls({ snapshot, busy, onRestore, onBusy }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const lifecycle = useRef(0);
  const reading = useRef(false);
  const latest = useRef({ snapshot, busy });
  latest.current = { snapshot, busy };
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => () => { lifecycle.current++; reading.current = false; }, []);
  const stale = review !== null && review.baseline.raw !== snapshot.raw;
  const compared = useMemo(() => review ? compareLibraryBackup(review.baseline.library, review.backup) : null, [review]);
  const plan = useMemo(() => review && !stale ? planLibraryRestore(snapshot.library, review.backup, review.choices) : null, [review, stale, snapshot]);
  const actionCount = review?.choices.filter(choice => choice.action !== 'skip').length ?? 0;

  function download() {
    if (busy) return;
    const result = serializeLibraryBackup(snapshot.library);
    if (!result.ok) { setNotice(result.error); return; }
    if (!window.confirm('Download all named source snapshots in an unencrypted JSON backup? Review source for private text before sharing.')) return;
    const url = URL.createObjectURL(new Blob([result.value], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-project-library.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Downloaded named source snapshots only.');
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy || reading.current) return;
    setReview(null);
    setNotice('');
    if (file.size > MAX_LIBRARY_BACKUP_BYTES) { setNotice('Library backup exceeds its size limit.'); return; }
    const baseline = snapshot;
    const token = ++lifecycle.current;
    reading.current = true;
    onBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== lifecycle.current) return;
      if (latest.current.snapshot.raw !== baseline.raw) {
        setNotice('The library changed while reading. Select the backup again.');
        return;
      }
      const parsed = parseLibraryBackup(bytes);
      if (!parsed.ok) { setNotice(parsed.error); return; }
      const compared = compareLibraryBackup(baseline.library, parsed.value);
      if (!compared.ok) { setNotice(compared.error); return; }
      setReview({ baseline, backup: parsed.value, choices: defaultRestoreChoices(compared.value) });
      setNotice('Review incoming snapshots before restoring anything.');
    } catch {
      if (token === lifecycle.current) setNotice('Unable to read the selected library backup.');
    } finally {
      if (token === lifecycle.current) { reading.current = false; onBusy(false); }
    }
  }

  function update(name: string, change: Partial<RestoreChoice>) {
    setReview(current => current && ({ ...current, choices: current.choices.map(choice => choice.name === name
      ? { ...choice, ...change, name } : choice) }));
  }

  async function apply() {
    if (!review || stale || !plan?.ok || busy || reading.current || !actionCount) return;
    const replacements = review.choices.filter(choice => choice.action === 'replace').length;
    if (!window.confirm('Restore ' + actionCount + ' named source snapshot(s)? ' +
      (replacements ? replacements + ' existing snapshot(s) will be replaced. ' : '') +
      'The open editor and ordinary autosave will remain unchanged.')) return;
    const token = ++lifecycle.current;
    reading.current = true;
    onBusy(true);
    try {
      const result = await restoreProjectLibrary(window.indexedDB, review.baseline, review.backup, review.choices);
      if (token !== lifecycle.current) return;
      if (result.ok) { onRestore(result.value); setReview(null); setNotice('Restored the selected named source snapshots.'); }
      else setNotice(result.error);
    } catch {
      if (token === lifecycle.current) setNotice('Unable to restore the library backup.');
    } finally {
      if (token === lifecycle.current) { reading.current = false; onBusy(false); }
    }
  }

  return <section className="library-backup" aria-label="Library backup">
    <h3>Library backup</h3>
    <p className="project-search-status">Transfer named source snapshots using a separate, unencrypted JSON file. No ordinary stdin, results or editor preferences are included.</p>
    <div className="library-actions">
      <button type="button" disabled={busy || snapshot.library.projects.length === 0} onClick={download}>Download library backup</button>
      <input type="file" hidden ref={picker} accept=".json,application/json" aria-label="Choose library backup JSON"
        onChange={event => void selectFile(event)} />
      <button type="button" disabled={busy} onClick={() => picker.current?.click()}>Restore library backup</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {review && <section aria-label="Library restore preview" className="library-restore-preview">
      <h4>Review backup snapshots</h4>
      {stale ? <p role="status">The library changed. Select the backup again.</p> : compared?.ok && <>
        {compared.value.map(row => {
          const choice = review.choices.find(item => item.name === row.incoming.name)!;
          return <fieldset key={row.incoming.name} disabled={busy}>
            <legend>{row.incoming.name}</legend>
            <p>{Object.keys(row.incoming.workspace.files).length} sources · {projectBytes(row.incoming.workspace)} B · entry {row.incoming.workspace.entry}</p>
            <p>{row.status === 'new' ? 'New name' : row.status === 'identical' ? 'Identical source snapshot exists' : 'Conflicting saved name: ' + row.existing?.name}</p>
            <label>Action for {row.incoming.name}
              <select value={choice.action} onChange={event => update(choice.name, { action: event.target.value as RestoreChoice['action'] })}>
                <option value="skip">Skip</option>
                {row.status === 'new' && <option value="import">Import</option>}
                {row.status === 'different' && <option value="replace">Replace existing snapshot</option>}
                <option value="rename">Import under a new name</option>
              </select>
            </label>
            {choice.action === 'rename' && <label>New name for {row.incoming.name}
              <input value={choice.nextName ?? ''} maxLength={MAX_LIBRARY_NAME} onChange={event => update(choice.name, { nextName: event.target.value })} />
            </label>}
          </fieldset>;
        })}
        {plan && !plan.ok && <p role="status" className="test-case-error">{plan.error}</p>}
        {plan?.ok && <p role="status">{actionCount} selected · {plan.value.projects.length} total snapshots after restore</p>}
        <button type="button" className="button-primary" disabled={busy || !plan?.ok || !actionCount}
          onClick={() => void apply()}>Apply library restore</button>
      </>}
      <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel library restore</button>
    </section>}
  </section>;
}
