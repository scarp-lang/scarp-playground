import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { decodeTestCaseFile, MAX_TEST_CASE_FILE_BYTES, serializeTestCaseFile } from './runner/test-case-file';
import type { TestCase } from './runner/test-cases';

type Props = {
  cases: TestCase[];
  busy: boolean;
  onReplace: (cases: TestCase[]) => void;
};

type Review = { baseline: TestCase[]; cases: TestCase[] };

/**
 * Explicit local import/export. The currently edited case list is protected
 * against a delayed file read, a newer edit or an unmounted panel.
 */
export function TestCaseFileControls({ cases, busy, onReplace }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef({ cases, busy });
  latest.current = { cases, busy };
  const generation = useRef(0);
  const readingRef = useRef(false);
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stale = review !== null && review.baseline !== cases;
  useEffect(() => () => { generation.current++; readingRef.current = false; }, []);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || readingRef.current || latest.current.busy) return;
    setReview(null);
    setNotice(null);
    if (file.size > MAX_TEST_CASE_FILE_BYTES) {
      setNotice('The selected test case file exceeds its serialized size limit.');
      return;
    }
    const baseline = latest.current.cases;
    const request = ++generation.current;
    readingRef.current = true;
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== generation.current) return;
      if (latest.current.busy || latest.current.cases !== baseline) {
        setNotice('The test case editor changed while reading. Select the file again.');
        return;
      }
      const decoded = decodeTestCaseFile(bytes);
      if (!decoded.ok) { setNotice(decoded.error); return; }
      setReview({ baseline, cases: decoded.cases });
      setNotice('Review imported case names and replace only if you want to use this suite.');
    } catch {
      if (request === generation.current) setNotice('Unable to read the selected test case file.');
    } finally {
      if (request === generation.current) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  function exportFile() {
    if (busy) return;
    const serialized = serializeTestCaseFile(cases);
    if (!serialized.ok) { setNotice(serialized.error); return; }
    if (!window.confirm('Download the test definitions, including case input and expected output? This is an unencrypted local JSON file. Do not share it if it contains sensitive text.')) return;
    const address = URL.createObjectURL(new Blob([serialized.text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = address;
    link.download = 'scarp-test-cases.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(address), 1000);
    setNotice('Downloaded test definitions only. No source files or execution reports were included.');
  }

  function apply() {
    if (!review || review.baseline !== latest.current.cases || latest.current.busy) {
      setReview(null);
      setNotice('The test case preview is stale. Select the file again.');
      return;
    }
    onReplace(review.cases);
    setReview(null);
    setNotice('Replaced the temporary test definitions. Source and ordinary program input are unchanged.');
  }

  return (
    <section className="test-case-files" aria-label="Test case files">
      <div className="test-case-actions">
        <input ref={picker} type="file" accept=".json,application/json" hidden
          aria-label="Choose test case JSON" onChange={event => void importFile(event)} />
        <button type="button" disabled={busy || reading} onClick={() => picker.current?.click()}>
          {reading ? 'Reading test cases…' : 'Import test cases'}
        </button>
        <button type="button" disabled={busy || reading} onClick={exportFile}>Export test cases</button>
      </div>
      <p className="project-replace-help">Case files contain their input and expected output in readable JSON. Import never runs code. Source, ordinary stdin and captured results are not included.</p>
      {notice && <p role="status" className="project-search-status">{notice}</p>}
      {review && <div className="test-case-file-review" aria-label="Imported test case preview">
        {stale ? <p role="status">The case list changed. Select the file again.</p> : (
          <>
            <p>Replace {cases.length} current test case(s) with {review.cases.length} imported case(s)?</p>
            <ul>
              {review.cases.map(item => <li key={item.name}>
                <strong>{item.name}</strong> · {item.expected.kind === 'output' ? 'exact output' : item.expected.code}
                {' · '}{new TextEncoder().encode(item.stdin).byteLength} input bytes
              </li>)}
            </ul>
            <button type="button" className="button-primary" disabled={busy || reading} onClick={apply}>Replace test cases</button>
          </>
        )}
        <button type="button" onClick={() => { setReview(null); setNotice(null); }}>Cancel case import</button>
      </div>}
    </section>
  );
}
