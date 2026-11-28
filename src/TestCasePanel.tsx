import { useEffect, useState } from 'react';
import {
  MAX_CASE_NAME_LENGTH, MAX_TEST_CASES, MAX_EXPECTED_OUTPUT_BYTES,
  newTestCase, validateTestCases, type TestCase, type SuiteReport,
} from './runner/test-cases';
import { MAX_PROGRAM_INPUT_BYTES } from './runner/limits';
import { TestCaseFileControls } from './TestCaseFileControls';
import {
  previewRunAsTestCase, type CapturedRun, type RunCapturePlan,
} from './run-to-test-case';
import type { Workspace } from './workspace';
import './test-case-capture.css';

type Props = {
  cases: TestCase[];
  running: boolean;
  busy: boolean;
  report: SuiteReport | null;
  progress: number;
  stdin: string;
  allowPrompts: boolean;
  workspace: Workspace;
  capturedRun: CapturedRun | null;
  onChange: (cases: TestCase[]) => void;
  onRun: () => void;
  onStop: () => void;
  onClose: () => void;
};

export function TestCasePanel({
  cases, running, busy, report, progress, stdin, allowPrompts,
  workspace, capturedRun, onChange, onRun, onStop, onClose,
}: Props) {
  const validation = validateTestCases(cases);
  const [capture, setCapture] = useState<RunCapturePlan | null>(null);
  useEffect(() => { setCapture(null); }, [workspace, cases, capturedRun]);

  function change(index: number, next: TestCase) {
    onChange(cases.map((item, at) => at === index ? next : item));
  }
  function add() {
    const used = new Set(cases.map(item => item.name));
    let number = 1;
    while (used.has('Case ' + number)) number++;
    onChange([...cases, newTestCase('Case ' + number, stdin, allowPrompts)]);
  }

  function previewCapture() {
    if (busy) return;
    setCapture(previewRunAsTestCase(workspace, cases, capturedRun));
  }

  function applyCapture() {
    if (busy || !capture?.ok) return;
    const current = previewRunAsTestCase(workspace, cases, capturedRun);
    if (!current.ok || JSON.stringify(current.cases) !== JSON.stringify(capture.cases)) {
      setCapture({ ok: false,
        error: 'The Run result or test definitions changed during review. Preview again.' });
      return;
    }
    if (!window.confirm('Add a test case containing the exact captured input and expected ' +
      'compiler output or error code? A case may contain sensitive input. ' +
      'It stays only in this tab unless you explicitly export test cases.')) return;
    onChange(current.cases);
    setCapture(null);
  }

  return (
    <section id="test-case-panel" className="project-search test-case-panel" aria-label="Program test cases">
      <div className="project-search-bar test-case-heading">
        <h2>Program test cases</h2>
        <button type="button" onClick={onClose}>Close test cases</button>
      </div>
      <p className="project-replace-help">
        Run the current entrypoint separately for each case with its own buffered input.
        Compare exact stdout and stderr (including final line breaks), or require a compiler error code.
        Cases are temporary unless you explicitly export them. Each uses the existing browser execution limits.
      </p>
      <TestCaseFileControls cases={cases} busy={busy} onReplace={onChange} />
      <div className="test-case-capture" aria-label="Capture last program run">
        <div className="test-case-capture-heading">
          <h3>Capture a regression from Run</h3>
          <p>Turn the last successful Run or compiler-coded error into an exact test
            expectation. Source files and input must still match the captured execution.</p>
        </div>
        <button type="button" disabled={busy || !capturedRun ||
            cases.length >= MAX_TEST_CASES}
          onClick={previewCapture}>Preview last Run as test case</button>
        {capture && !capture.ok && <p role="alert">{capture.error}</p>}
        {capture?.ok && <section className="test-case-capture-review"
          aria-label="Captured Run preview">
          <p><strong>{capture.preview.name}</strong> · {capture.preview.kind} ·
            {' '}{capture.preview.sourceFiles} source files ·
            {' '}{capture.preview.inputBytes} input bytes ·
            {' '}{capture.preview.expectedBytes} expected bytes</p>
          {capture.preview.promptsAllowed &&
            <p>Prompt functions were enabled for this captured run.</p>}
          <details>
            <summary>Inspect captured input excerpt (may be sensitive)</summary>
            <pre>{capture.preview.inputExcerpt || '(empty input)'}</pre>
          </details>
          <details>
            <summary>Inspect expected output / diagnostic excerpt</summary>
            <pre>{capture.preview.expectedExcerpt || '(empty output)'}</pre>
          </details>
          <div className="test-case-actions">
            <button type="button" className="button-primary" disabled={busy}
              onClick={applyCapture}>Add reviewed captured test</button>
            <button type="button" onClick={() => setCapture(null)}>Cancel capture</button>
          </div>
          <p>Only test definitions are updated. Nothing is automatically persisted,
            shared, executed, or inserted into Scarp source.</p>
        </section>}
      </div>
      <div className="test-case-list">
        {cases.map((item, index) => (
          <fieldset key={index} className="test-case-item" disabled={busy}>
            <legend>Case {index + 1}</legend>
            <div className="test-case-actions">
              <label>Case name
                <input value={item.name} maxLength={MAX_CASE_NAME_LENGTH}
                  onChange={event => change(index, { ...item, name: event.target.value })} />
              </label>
              <button type="button" onClick={() => change(index, { ...item, stdin, allowPrompts })}>Copy current input</button>
              <button type="button" disabled={cases.length === 1}
                onClick={() => onChange(cases.filter((_, at) => at !== index))}>Remove case</button>
            </div>
            <label>Test stdin
              <textarea rows={3} maxLength={MAX_PROGRAM_INPUT_BYTES} value={item.stdin} spellCheck={false}
                onChange={event => change(index, { ...item, stdin: event.target.value })} />
            </label>
            <label className="test-case-prompts">
              <input type="checkbox" checked={item.allowPrompts}
                onChange={event => change(index, { ...item, allowPrompts: event.target.checked })} />
              Enable prompt functions for this case
            </label>
            <label>Expected result
              <select value={item.expected.kind} onChange={event => change(index, {
                ...item, expected: event.target.value === 'diagnostic'
                  ? { kind: 'diagnostic', code: '' } : { kind: 'output', stdout: '', stderr: '' },
              })}>
                <option value="output">Successful output</option>
                <option value="diagnostic">Compiler diagnostic code</option>
              </select>
            </label>
            {item.expected.kind === 'output' ? (
              <div className="test-case-outputs">
                <label>Expected stdout
                  <textarea rows={3} maxLength={MAX_EXPECTED_OUTPUT_BYTES} spellCheck={false} value={item.expected.stdout}
                    onChange={event => change(index, { ...item, expected: { kind: 'output',
                      stdout: event.target.value, stderr: item.expected.kind === 'output' ? item.expected.stderr : '' } })} />
                </label>
                <label>Expected stderr
                  <textarea rows={3} maxLength={MAX_EXPECTED_OUTPUT_BYTES} spellCheck={false} value={item.expected.stderr}
                    onChange={event => change(index, { ...item, expected: { kind: 'output',
                      stdout: item.expected.kind === 'output' ? item.expected.stdout : '', stderr: event.target.value } })} />
                </label>
              </div>
            ) : <label>Expected diagnostic code
              <input value={item.expected.code} placeholder="E0085" maxLength={5}
                spellCheck={false} onChange={event => change(index, { ...item, expected: {
                  kind: 'diagnostic', code: event.target.value,
                } })} />
            </label>}
          </fieldset>
        ))}
      </div>
      {!validation.ok && <p role="status" className="test-case-error">{validation.error}</p>}
      <div className="test-case-actions">
        <button type="button" disabled={busy || cases.length >= MAX_TEST_CASES} onClick={add}>Add test case</button>
        {running ? <button type="button" onClick={onStop}>Stop test cases</button> :
          <button type="button" className="button-primary" disabled={busy || !validation.ok} onClick={onRun}>Run test cases</button>}
        <span>{cases.length} / {MAX_TEST_CASES} cases</span>
      </div>
      {running && <p role="status">Completed {progress} of {cases.length} test cases…</p>}
      {report && <section className="test-case-report" aria-label="Test case results">
        <h3>{report.results.filter(item => item.status === 'passed').length} passed · {report.results.filter(item => item.status === 'failed').length} failed · {report.results.filter(item => item.status === 'execution-error').length} execution errors · {report.total - report.results.length} not run</h3>
        {report.error && <p role="status" className="test-case-error">{report.error}</p>}
        {report.results.map((item, index) => <article key={index} className="test-case-result">
          <strong>{item.name} — {item.status}</strong>
          <p>{item.message}</p>
          {(item.stdout || item.stderr) && <details>
            <summary>Captured output (bounded preview)</summary>
            {item.stdout && <pre aria-label={'Actual stdout for ' + item.name}>{item.stdout}</pre>}
            {item.stderr && <pre aria-label={'Actual stderr for ' + item.name}>{item.stderr}</pre>}
          </details>}
        </article>)}
      </section>}
    </section>
  );
}
