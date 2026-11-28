import { useState } from 'react';
import compilerCompatibility from '../compiler-compatibility.json';
import type { SuiteReport } from './runner/test-cases';
import { serializeJUnitReport, serializeTestReport } from './runner/test-report';

export function TestReportControls({ report, suiteName }: { report: SuiteReport; suiteName: string }) {
  const [includeOutput, setIncludeOutput] = useState(false);
  const [notice, setNotice] = useState('');
  function download(kind: 'json' | 'xml') {
    const metadata = { compilerVersion: compilerCompatibility.version,
      compilerCommit: compilerCompatibility.commit, suiteName };
    if (!window.confirm(includeOutput
      ? 'Download a test report with bounded output previews and potentially private diagnostic text? The file is unencrypted.'
      : 'Download a summary-only test report? It includes case names, statuses and compiler identity, not source or input fields.')) return;
    const text = kind === 'json' ? serializeTestReport(report, metadata, { includeOutput }) :
      serializeJUnitReport(report, metadata, { includeOutput });
    if (text === null) { setNotice('The test report is invalid. Run the suite again.'); return; }
    const url = URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'application/xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-test-report.' + kind;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Downloaded ' + (includeOutput ? 'a detailed' : 'a summary-only') + ' test report.');
  }
  return <div className="test-report-controls" aria-label="Test report downloads">
    <label><input type="checkbox" checked={includeOutput} onChange={event => setIncludeOutput(event.target.checked)} />
      Include bounded output previews and diagnostic messages</label>
    <p>Case names can also contain private text. No source or test-input fields are exported.</p>
    <div className="test-case-actions">
      <button type="button" onClick={() => download('json')}>Download JSON report</button>
      <button type="button" onClick={() => download('xml')}>Download JUnit XML</button>
    </div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
