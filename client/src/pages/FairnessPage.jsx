import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// In local dev, VITE_API_BASE_URL should be empty so the Vite proxy handles /api routes.
// In production (Vercel), it should point to the Render backend URL.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ── tiny helpers ── */
function pct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%`; }
function fmt(v, d = 4) { return v == null ? '—' : Number(v).toFixed(d); }

const RISK_COLORS = {
  low:    { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', text: 'var(--success)', icon: 'verified' },
  medium: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: 'var(--warning)', icon: 'warning' },
  high:   { bg: 'rgba(255,180,171,0.14)', border: 'rgba(255,180,171,0.3)', text: 'var(--error)', icon: 'gpp_bad' },
};

const SEVERITY_COLORS = {
  high:   { bg: 'rgba(255,180,171,0.12)', text: 'var(--error)' },
  medium: { bg: 'rgba(251,191,36,0.10)', text: 'var(--warning)' },
  low:    { bg: 'rgba(52,211,153,0.10)', text: 'var(--success)' },
};

/* ═══════════════════════════════════════════════════════════
   API helpers (need raw fetch for multipart upload)
   ═══════════════════════════════════════════════════════════ */
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatApiError(data, res.status));
  }
  return data;
}

async function apiGet(path) {
  return apiFetch(path);
}

async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiPatch(path, body) {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiUpload(path, formData) {
  return apiFetch(path, { method: 'POST', body: formData });
}

function formatApiError(data, status) {
  if (!data || typeof data !== 'object') {
    return `Request failed: ${status}`;
  }

  const parts = [];
  const primary = typeof data.message === 'string' && data.message
    ? data.message
    : (typeof data.error === 'string' ? data.error : '');
  if (primary) parts.push(primary);

  if (Array.isArray(data.details) && data.details.length > 0) {
    const details = data.details
      .filter((d) => typeof d === 'string' && d.trim().length > 0)
      .join(' | ');
    if (details) parts.push(details);
  } else if (typeof data.details === 'string' && data.details.trim()) {
    parts.push(data.details.trim());
  }

  return parts.length > 0 ? parts.join(': ') : `Request failed: ${status}`;
}

function extractRowsFromJsonPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const preferredKeys = ['data', 'rows', 'records', 'items', 'results'];
  for (const key of preferredKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  const firstArrayValue = Object.values(payload).find((value) => Array.isArray(value));
  return firstArrayValue || [];
}

// Parse one CSV row while respecting quoted fields and escaped quotes.
function parseCSVRow(line, delimiter = ',') {
  const values = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      values.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }

  values.push(cur);
  return values.map((v) => v.trim().replace(/^"|"$/g, ''));
}

// Build a lightweight preview from CSV/JSON so mapping fields can be suggested.
function buildFilePreview(fileName, text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '');
  if (!normalized.trim()) return { headers: [], rows: [] };

  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.json')) {
    const parsed = JSON.parse(normalized);
    const rows = extractRowsFromJsonPayload(parsed);
    if (!Array.isArray(rows) || rows.length === 0) return { headers: [], rows: [] };
    const firstRow = rows[0];
    if (!firstRow || typeof firstRow !== 'object' || Array.isArray(firstRow)) {
      return { headers: [], rows: [] };
    }
    const headers = Object.keys(firstRow);
    return { headers, rows: rows.slice(0, 5) };
  }

  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headerLine = lines[0];
  // Support common delimiters. Pick the one with highest count on header line.
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters
    .map((d) => ({ d, count: (headerLine.match(new RegExp(`\\${d}`, 'g')) || []).length }))
    .sort((a, b) => b.count - a.count)[0].d;

  const headers = parseCSVRow(headerLine, delimiter);
  const rows = lines.slice(1, 6).map((line) => {
    const vals = parseCSVRow(line, delimiter);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });

  return { headers, rows };
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function FairnessPage() {
  const [tab, setTab] = useState('upload');
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [report, setReport] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [reviewQueue, setReviewQueue] = useState({ items: [], total: 0 });
  const [mitigationReport, setMitigationReport] = useState(null);
  const [gateStatus, setGateStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  const loadDatasets = useCallback(async () => {
    try {
      const data = await apiGet('/api/fairness/datasets');
      setDatasets(data.datasets || []);
    } catch (e) { setError(e.message); }
  }, []);

  const loadGateStatus = useCallback(async () => {
    try {
      const data = await apiGet('/api/fairness/execution-gate');
      setGateStatus(data.gate || null);
    } catch { setGateStatus(null); }
  }, []);

  useEffect(() => { loadDatasets(); loadGateStatus(); }, [loadDatasets, loadGateStatus]);

  useEffect(() => {
    if (!activeDatasetId) return;
    apiGet(`/api/fairness/datasets/${activeDatasetId}/report`).then(setReport).catch(() => setReport(null));
    apiGet(`/api/fairness/datasets/${activeDatasetId}/audit-trail`).then(d => setAuditTrail(d.audit_trail || [])).catch(() => setAuditTrail([]));
    apiGet(`/api/fairness/review-queue?dataset_id=${activeDatasetId}`).then(setReviewQueue).catch(() => setReviewQueue({ items: [], total: 0 }));
    apiGet(`/api/fairness/datasets/${activeDatasetId}/mitigation-report`).then(setMitigationReport).catch(() => setMitigationReport(null));
  }, [activeDatasetId]);

  async function handleUploadComplete(datasetId) {
    await loadDatasets();
    setActiveDatasetId(datasetId);
    setTab('results');
    setSuccess('Dataset uploaded and profiled successfully! Click "Run Analysis" to compute fairness metrics.');
    setTimeout(() => setSuccess(''), 5000);
  }

  async function handleAnalyze() {
    if (!activeDatasetId) return;
    clearMessages();
    setBusy('analyze');
    try {
      const data = await apiPost(`/api/fairness/datasets/${activeDatasetId}/analyze`);
      setReport({ report: data.report });
      if (data.gate) setGateStatus(data.gate);
      setSuccess(`Analysis complete — Risk level: ${data.report.risk_level.toUpperCase()}`);
      apiGet(`/api/fairness/datasets/${activeDatasetId}/audit-trail`).then(d => setAuditTrail(d.audit_trail || [])).catch(() => {});
      apiGet(`/api/fairness/review-queue?dataset_id=${activeDatasetId}`).then(setReviewQueue).catch(() => {});
      setTimeout(() => setSuccess(''), 6000);
    } catch (e) { setError(e.message); }
    setBusy('');
  }

  async function handleMitigate() {
    if (!activeDatasetId) return;
    clearMessages();
    setBusy('mitigate');
    try {
      const data = await apiPost(`/api/fairness/datasets/${activeDatasetId}/mitigate`);
      setMitigationReport(data.mitigation);
      setTab('mitigation');
      setSuccess(`Mitigation complete — ${data.mitigation.impacted_count} cases adjusted.`);
      apiGet(`/api/fairness/datasets/${activeDatasetId}/audit-trail`).then(d => setAuditTrail(d.audit_trail || [])).catch(() => {});
      loadGateStatus();
      setTimeout(() => setSuccess(''), 6000);
    } catch (e) { setError(e.message); }
    setBusy('');
  }

  async function handleReviewAction(itemId, status) {
    clearMessages();
    try {
      const data = await apiPatch(`/api/fairness/review-queue/${itemId}`, { status, reviewer: 'ui-user' });
      if (data.gate) setGateStatus(data.gate);
      apiGet(`/api/fairness/review-queue?dataset_id=${activeDatasetId}`).then(setReviewQueue).catch(() => {});
      apiGet(`/api/fairness/datasets/${activeDatasetId}/audit-trail`).then(d => setAuditTrail(d.audit_trail || [])).catch(() => {});
      setSuccess(`Review item ${status}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
  }

  const activeDataset = datasets.find(d => d.id === activeDatasetId);

  const TABS = [
    { id: 'upload', label: 'Upload & Configure', icon: 'cloud_upload' },
    { id: 'results', label: 'Analysis Results', icon: 'analytics' },
    { id: 'mitigation', label: 'Mitigation', icon: 'healing' },
    { id: 'review', label: 'Review Queue', icon: 'checklist', badge: reviewQueue.total },
    { id: 'audit', label: 'Audit Trail', icon: 'history' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="text-center mb-8">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)', boxShadow: '0 0 30px rgba(99,102,241,0.25)' }}
        >
          <M icon="balance" style={{ fontSize: 32, color: '#fff' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline tracking-tight">Fairness Audit</h2>
        <p className="text-sm mt-2 max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
          Upload datasets, compute fairness metrics, detect bias, and generate audit reports — all deterministic, no AI.
        </p>
        {/* Execution Gate Indicator */}
        {gateStatus && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
            style={{
              background: gateStatus.decision === 'ALLOW' ? 'rgba(52,211,153,0.1)' : 'rgba(255,180,171,0.12)',
              border: `1px solid ${gateStatus.decision === 'ALLOW' ? 'rgba(52,211,153,0.3)' : 'rgba(255,180,171,0.3)'}`,
              color: gateStatus.decision === 'ALLOW' ? 'var(--success)' : 'var(--error)',
            }}>
            <span style={{ fontSize: 10 }}>{gateStatus.decision === 'ALLOW' ? '🟢' : '🔴'}</span>
            Gate: {gateStatus.decision}
            <span className="font-mono text-[8px]" style={{ color: 'var(--outline)' }}>({gateStatus.mode})</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 p-3 rounded-xl flex items-center gap-2 text-xs"
            style={{ background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: 'var(--error)' }}>
            <M icon="error" style={{ fontSize: 16 }} /> {error}
            <button onClick={() => setError('')} className="ml-auto" style={{ color: 'var(--error)' }}><M icon="close" style={{ fontSize: 14 }} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 p-3 rounded-xl flex items-center gap-2 text-xs"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: 'var(--success)' }}>
            <M icon="check_circle" style={{ fontSize: 16 }} /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0"
            style={{
              background: tab === t.id ? 'rgba(196,192,255,0.14)' : 'transparent',
              border: tab === t.id ? '1px solid rgba(196,192,255,0.3)' : '1px solid transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--on-surface-variant)',
            }}>
            <M icon={t.icon} style={{ fontSize: 16 }} /> {t.label}
            {t.badge > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'var(--error)', color: '#fff' }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Datasets sidebar + tab content */}
      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        {/* Dataset list sidebar */}
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--outline)' }}>Datasets</h3>
            {datasets.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--on-surface-variant)' }}>No datasets yet. Upload one to start.</p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-auto">
                {datasets.map(ds => (
                  <button key={ds.id} onClick={() => { setActiveDatasetId(ds.id); setTab('results'); }}
                    className="w-full text-left p-2.5 rounded-xl transition-all"
                    style={{
                      background: ds.id === activeDatasetId ? 'rgba(196,192,255,0.12)' : 'var(--surface-container-high)',
                      border: ds.id === activeDatasetId ? '1px solid rgba(196,192,255,0.3)' : '1px solid rgba(70,69,85,0.1)',
                    }}>
                    <p className="text-xs font-bold truncate">{ds.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-mono" style={{ color: 'var(--outline)' }}>{ds.row_count.toLocaleString()} rows</span>
                      <StatusChip status={ds.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeDataset && (
            <div className="card p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Selected Dataset</h3>
              <p className="text-xs font-bold mb-1">{activeDataset.name}</p>
              <p className="text-[10px] font-mono mb-2" style={{ color: 'var(--outline)' }}>{activeDataset.id.slice(0, 16)}…</p>
              <div className="space-y-1 text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>
                <p>📄 {activeDataset.file_name} ({activeDataset.file_type})</p>
                <p>📊 {activeDataset.row_count.toLocaleString()} rows</p>
                <p>📅 {new Date(activeDataset.created_at).toLocaleString()}</p>
              </div>
              <button onClick={handleAnalyze} disabled={busy === 'analyze' || busy === 'mitigate'}
                className="btn-primary w-full mt-3 py-2 text-xs">
                <M icon="analytics" style={{ fontSize: 16 }} />
                {busy === 'analyze' ? 'Analyzing…' : activeDataset.status === 'analyzed' ? 'Re-run Analysis' : 'Run Analysis'}
              </button>
              {activeDataset.status === 'analyzed' && (
                <button onClick={handleMitigate} disabled={busy === 'mitigate' || busy === 'analyze'}
                  className="btn-ghost w-full mt-2 py-2 text-xs" style={{ borderColor: 'rgba(196,192,255,0.2)' }}>
                  <M icon="healing" style={{ fontSize: 16 }} />
                  {busy === 'mitigate' ? 'Mitigating…' : 'Run Mitigation'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab content */}
        <div>
          <AnimatePresence mode="wait">
            {tab === 'upload' && <UploadTab key="upload" onComplete={handleUploadComplete} setError={setError} />}
            {tab === 'results' && <ResultsTab key="results" report={report} activeDataset={activeDataset} />}
            {tab === 'mitigation' && <MitigationTab key="mitigation" mitigationReport={mitigationReport} activeDataset={activeDataset} />}
            {tab === 'review' && <ReviewTab key="review" queue={reviewQueue} onAction={handleReviewAction} />}
            {tab === 'audit' && <AuditTab key="audit" trail={auditTrail} />}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: Upload & Configure
   ═══════════════════════════════════════════════════════════ */
function UploadTab({ onComplete, setError }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [datasetName, setDatasetName] = useState('');

  // Column mapping fields
  const [recordId, setRecordId] = useState('');
  const [targetOutcome, setTargetOutcome] = useState('');
  const [predictedOutcome, setPredictedOutcome] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [modelVersion, setModelVersion] = useState('');
  const [predictedScore, setPredictedScore] = useState('');

  // Protected attributes
  const [protectedAttrs, setProtectedAttrs] = useState([{ column: '', reference_group: '' }]);

  // Preview
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);

  function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result || '');
      try {
        const { headers, rows } = buildFilePreview(f.name, text);
        setPreviewHeaders(headers);
        setPreviewRows(rows);

        // Auto-fill common column names
        const lower = headers.map(h => h.toLowerCase());
        if (!recordId) {
          const match = headers.find((_, i) => ['id', 'record_id', 'recordid', 'row_id'].includes(lower[i]));
          if (match) setRecordId(match);
        }
        if (!targetOutcome) {
          const match = headers.find((_, i) => ['target', 'target_outcome', 'actual', 'label', 'outcome', 'qualified', 'ground_truth'].includes(lower[i]));
          if (match) setTargetOutcome(match);
        }
        if (!predictedOutcome) {
          const match = headers.find((_, i) => ['predicted', 'predicted_outcome', 'prediction', 'pred', 'model_decision'].includes(lower[i]));
          if (match) setPredictedOutcome(match);
        }
        if (!timestamp) {
          const match = headers.find((_, i) => ['timestamp', 'ts', 'date', 'created_at', 'applied_at'].includes(lower[i]));
          if (match) setTimestamp(match);
        }
        if (!modelVersion) {
          const match = headers.find((_, i) => ['model_version', 'model_ver', 'version', 'ver'].includes(lower[i]));
          if (match) setModelVersion(match);
        }
        if (!predictedScore) {
          const match = headers.find((_, i) => ['score', 'predicted_score', 'confidence', 'probability', 'prob'].includes(lower[i]));
          if (match) setPredictedScore(match);
        }
      } catch (err) {
        setPreviewHeaders([]);
        setPreviewRows([]);
        setError(`Could not parse preview for "${f.name}". You can still type column names manually.`);
      }
    };
    reader.readAsText(f);
  }

  function addProtectedAttr() {
    setProtectedAttrs(prev => [...prev, { column: '', reference_group: '' }]);
  }

  function removeProtectedAttr(index) {
    setProtectedAttrs(prev => prev.filter((_, i) => i !== index));
  }

  function updateProtectedAttr(index, field, value) {
    setProtectedAttrs(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  }

  async function handleUpload() {
    if (!file) return setError('Please select a file first');
    if (!datasetName.trim()) return setError('Please enter a dataset name');
    if (!recordId || !targetOutcome || !predictedOutcome || !timestamp || !modelVersion) {
      return setError('Please fill all required column mappings');
    }
    const validAttrs = protectedAttrs.filter(a => a.column && a.reference_group !== '');
    if (validAttrs.length === 0) return setError('Please add at least one protected attribute');

    setBusy(true);
    setError('');

    const config = {
      dataset_name: datasetName.trim(),
      column_mappings: {
        record_id: recordId,
        target_outcome: targetOutcome,
        predicted_outcome: predictedOutcome,
        timestamp: timestamp,
        model_version: modelVersion,
        ...(predictedScore ? { predicted_score: predictedScore } : {}),
      },
      protected_attributes: validAttrs,
    };

    const formData = new FormData();
    formData.append('file', file);
    formData.append('config', JSON.stringify(config));

    try {
      const result = await apiUpload('/api/fairness/upload', formData);
      onComplete(result.dataset_id);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="space-y-4">
        {/* Step 1: File */}
        <div className="card p-5">
          <StepHeader step="1" title="Select Dataset File" icon="attach_file" />
          <div className="upload-dropzone mt-3" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFileSelect} style={{ display: 'none' }} />
            <M icon="cloud_upload" style={{ fontSize: 28, color: 'var(--primary)' }} />
            {file ? (
              <div className="mt-2">
                <p className="text-sm font-bold">{file.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--outline)' }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold mt-2">Drop a CSV or JSON file, or click to browse</p>
                <p className="text-[10px]" style={{ color: 'var(--outline)' }}>Supports .csv and .json (max 50MB)</p>
              </>
            )}
          </div>

          {previewHeaders.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Preview (first 5 rows)</p>
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: 'var(--surface-container-high)' }}>
                      {previewHeaders.map(h => <th key={h} className="px-2 py-1.5 text-left font-bold" style={{ color: 'var(--primary)' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                        {previewHeaders.map(h => <td key={h} className="px-2 py-1" style={{ color: 'var(--on-surface-variant)' }}>{String(row[h] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Name + Column Mappings */}
        <div className="card p-5">
          <StepHeader step="2" title="Configure Schema" icon="settings" />
          <div className="mt-3 space-y-3">
            <FieldInput label="Dataset Name *" value={datasetName} onChange={setDatasetName} placeholder="e.g. Q1 2024 Hiring Decisions" />
            {previewHeaders.length === 0 && (
              <p className="text-[10px]" style={{ color: 'var(--warning)' }}>
                Column preview is empty. Enter column names manually in the fields below.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FieldSelect label="Record ID *" value={recordId} onChange={setRecordId} options={previewHeaders} placeholder="Select column…" />
              <FieldSelect label="Target Outcome *" value={targetOutcome} onChange={setTargetOutcome} options={previewHeaders} placeholder="Actual label (0/1)" />
              <FieldSelect label="Predicted Outcome *" value={predictedOutcome} onChange={setPredictedOutcome} options={previewHeaders} placeholder="Model prediction (0/1)" />
              <FieldSelect label="Timestamp *" value={timestamp} onChange={setTimestamp} options={previewHeaders} placeholder="When predicted" />
              <FieldSelect label="Model Version *" value={modelVersion} onChange={setModelVersion} options={previewHeaders} placeholder="Which model" />
              <FieldSelect label="Predicted Score (optional)" value={predictedScore} onChange={setPredictedScore} options={previewHeaders} placeholder="Probability 0-1" />
            </div>
          </div>
        </div>

        {/* Step 3: Protected Attributes */}
        <div className="card p-5">
          <StepHeader step="3" title="Protected Attributes" icon="groups" />
          <p className="text-[10px] mt-1 mb-3" style={{ color: 'var(--on-surface-variant)' }}>
            Define which columns represent sensitive demographics (e.g. gender, race, age_group) and which value is the reference/majority group.
          </p>
          <div className="space-y-2">
            {protectedAttrs.map((attr, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <FieldSelect label={`Attribute ${i + 1} Column`} value={attr.column} onChange={v => updateProtectedAttr(i, 'column', v)} options={previewHeaders} placeholder="e.g. gender" />
                </div>
                <div className="flex-1">
                  <FieldInput label="Reference Group" value={attr.reference_group} onChange={v => updateProtectedAttr(i, 'reference_group', v)} placeholder="e.g. male" />
                </div>
                {protectedAttrs.length > 1 && (
                  <button onClick={() => removeProtectedAttr(i)} className="p-2 rounded-lg mb-0.5" style={{ color: 'var(--error)', background: 'rgba(255,180,171,0.08)' }}>
                    <M icon="remove_circle" style={{ fontSize: 16 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addProtectedAttr} className="btn-ghost mt-3 text-[10px] py-1.5 px-3">
            <M icon="add" style={{ fontSize: 14 }} /> Add Attribute
          </button>
        </div>

        {/* Upload Button */}
        <button onClick={handleUpload} disabled={busy || !file}
          className="btn-primary w-full py-3 text-sm font-bold">
          <M icon="rocket_launch" style={{ fontSize: 18 }} />
          {busy ? 'Uploading & Profiling…' : 'Upload & Profile Dataset'}
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: Analysis Results
   ═══════════════════════════════════════════════════════════ */
function ResultsTab({ report, activeDataset }) {
  if (!activeDataset) {
    return <EmptyState icon="analytics" text="Select a dataset from the sidebar, then click 'Run Analysis' to see results." />;
  }

  const rpt = report?.report;
  if (!rpt) {
    return <EmptyState icon="pending" text="No analysis results yet. Click 'Run Analysis' in the sidebar to compute fairness metrics." />;
  }

  const riskStyle = RISK_COLORS[rpt.risk_level] || RISK_COLORS.low;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Risk banner */}
      <div className="card p-5" style={{ background: riskStyle.bg, borderColor: riskStyle.border }}>
        <div className="flex items-center gap-3">
          <M icon={riskStyle.icon} style={{ fontSize: 28, color: riskStyle.text }} />
          <div>
            <p className="text-lg font-bold font-headline" style={{ color: riskStyle.text }}>
              {rpt.risk_level.toUpperCase()} RISK
            </p>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{rpt.summary}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold font-headline" style={{ color: riskStyle.text }}>{rpt.violation_count}</p>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--outline)' }}>violations</p>
          </div>
        </div>
      </div>

      {/* Dataset summary */}
      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">Dataset Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Records" value={rpt.dataset_summary?.total_records?.toLocaleString()} icon="table_rows" />
          <MiniStat label="Columns" value={rpt.dataset_summary?.total_columns} icon="view_column" />
          <MiniStat label="Target" value={rpt.dataset_summary?.target_column} icon="flag" />
          <MiniStat label="Protected" value={rpt.dataset_summary?.protected_attributes?.join(', ')} icon="shield" />
        </div>
      </div>

      {/* Per-attribute metrics */}
      {Object.entries(rpt.per_group_metrics || {}).map(([attr, data]) => (
        <div key={attr} className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-1">
            <M icon="groups" style={{ fontSize: 16, color: 'var(--primary)', verticalAlign: 'middle', marginRight: 6 }} />
            Attribute: <span style={{ color: 'var(--primary)' }}>{attr}</span>
          </h3>
          <p className="text-[10px] mb-4" style={{ color: 'var(--outline)' }}>Reference group: {data.reference_group}</p>

          {/* Group-level metrics table */}
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Group Metrics</p>
          <div className="overflow-x-auto rounded-xl mb-4" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface-container-high)' }}>
                  <th className="px-3 py-2 text-left font-bold">Group</th>
                  <th className="px-3 py-2 text-left font-bold">Count</th>
                  <th className="px-3 py-2 text-left font-bold">Selection Rate</th>
                  <th className="px-3 py-2 text-left font-bold">TPR</th>
                  <th className="px-3 py-2 text-left font-bold">FPR</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.groups || {}).map(([grp, m]) => (
                  <tr key={grp} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                    <td className="px-3 py-2 font-bold" style={{ color: grp === data.reference_group ? 'var(--primary)' : 'var(--on-surface)' }}>
                      {grp} {grp === data.reference_group && <span className="text-[8px]" style={{ color: 'var(--outline)' }}>(ref)</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--on-surface-variant)' }}>{m.count}</td>
                    <td className="px-3 py-2 font-mono">{pct(m.selection_rate)}</td>
                    <td className="px-3 py-2 font-mono">{pct(m.true_positive_rate)}</td>
                    <td className="px-3 py-2 font-mono">{pct(m.false_positive_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fairness metrics table */}
          {data.fairness_metrics && !data.fairness_metrics.error && Object.keys(data.fairness_metrics).length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Fairness Metrics vs Reference</p>
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-container-high)' }}>
                      <th className="px-3 py-2 text-left font-bold">Group</th>
                      <th className="px-3 py-2 text-left font-bold">Stat. Parity Diff</th>
                      <th className="px-3 py-2 text-left font-bold">Disparate Impact</th>
                      <th className="px-3 py-2 text-left font-bold">Equal Opp. Diff</th>
                      <th className="px-3 py-2 text-left font-bold">Avg Odds Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.fairness_metrics).map(([grp, fm]) => (
                      <tr key={grp} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                        <td className="px-3 py-2 font-bold">{grp}</td>
                        <td className="px-3 py-2 font-mono"><MetricCell value={fm.statistical_parity_difference} threshold={0.1} /></td>
                        <td className="px-3 py-2 font-mono"><MetricCell value={fm.disparate_impact_ratio} min={0.8} max={1.25} /></td>
                        <td className="px-3 py-2 font-mono"><MetricCell value={fm.equal_opportunity_difference} threshold={0.1} /></td>
                        <td className="px-3 py-2 font-mono"><MetricCell value={fm.average_odds_difference} threshold={0.1} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Disadvantaged Groups */}
      {rpt.disadvantaged_groups?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">
            <M icon="trending_down" style={{ fontSize: 16, color: 'var(--warning)', verticalAlign: 'middle', marginRight: 6 }} />
            Disadvantaged Groups
          </h3>
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface-container-high)' }}>
                  <th className="px-3 py-2 text-left font-bold">Attribute</th>
                  <th className="px-3 py-2 text-left font-bold">Metric</th>
                  <th className="px-3 py-2 text-left font-bold">Worst Group</th>
                  <th className="px-3 py-2 text-left font-bold">Value</th>
                  <th className="px-3 py-2 text-left font-bold">Distance from Ref</th>
                </tr>
              </thead>
              <tbody>
                {rpt.disadvantaged_groups.map((dg, i) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                    <td className="px-3 py-2 font-bold">{dg.attribute}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{dg.metric}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--warning)' }}>{dg.worst_group}</td>
                    <td className="px-3 py-2 font-mono">{fmt(dg.worst_value)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--error)' }}>{fmt(dg.distance_from_ref)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Violations list */}
      {rpt.violations?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">
            <M icon="warning" style={{ fontSize: 16, color: 'var(--error)', verticalAlign: 'middle', marginRight: 6 }} />
            Flagged Violations ({rpt.violations.length})
          </h3>
          <div className="space-y-2">
            {rpt.violations.map((v, i) => {
              const sc = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.low;
              return (
                <div key={i} className="p-3 rounded-xl" style={{ background: sc.bg, border: `1px solid ${sc.text}22` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${sc.text}18`, color: sc.text }}>{v.severity}</span>
                    {v.policy_level && (
                      <span className="text-[7px] font-bold uppercase tracking-widest px-1 py-0.5 rounded" style={{
                        background: v.policy_level === 'block' ? 'rgba(255,180,171,0.15)' : 'rgba(251,191,36,0.1)',
                        color: v.policy_level === 'block' ? 'var(--error)' : 'var(--warning)',
                        border: `1px solid ${v.policy_level === 'block' ? 'rgba(255,180,171,0.3)' : 'rgba(251,191,36,0.2)'}`,
                      }}>{v.policy_level}</span>
                    )}
                    <span className="text-xs font-bold" style={{ color: sc.text }}>{v.metric}</span>
                    <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--outline)' }}>{v.attribute} → {v.group}</span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>{v.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Report generation */}
      <AiReportCard datasetId={activeDataset?.id} />
    </motion.div>
  );
}

/* ── AI Report Card (inline component for ResultsTab) ── */
function AiReportCard({ datasetId }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function handleGenerate() {
    if (!datasetId) return;
    setLoading(true);
    setErr('');
    setResult(null);
    try {
      const data = await apiPost(`/api/fairness/datasets/${datasetId}/ai-report`, {});
      setResult(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5" style={{ borderColor: 'rgba(196,192,255,0.18)', background: 'rgba(196,192,255,0.04)' }}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <M icon="auto_awesome" style={{ fontSize: 16, color: 'var(--primary)' }} />
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">AI Fairness Report</h3>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
            Generate a human-readable executive summary of this fairness audit using Gemini Flash.
            {' '}<span style={{ color: 'var(--outline)' }}>Add GEMINI_API_KEY to .env for AI-powered output.</span>
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !datasetId}
          className="btn-primary flex-shrink-0"
          style={{ padding: '0.45rem 1rem', fontSize: '0.7rem' }}
        >
          {loading ? (
            <><span className="inline-block w-3 h-3 rounded-full animate-pulse-subtle mr-1.5" style={{ background: 'rgba(255,255,255,0.5)' }} />Generating…</>
          ) : (
            <><M icon="auto_awesome" style={{ fontSize: 14 }} />Generate Report</>
          )}
        </button>
      </div>

      {err && (
        <div className="p-3 rounded-xl mb-3 text-xs" style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: 'var(--error)' }}>
          <M icon="error" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />{err}
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest" style={{
              background: result.ai_powered ? 'rgba(196,192,255,0.15)' : 'rgba(70,69,85,0.2)',
              color: result.ai_powered ? 'var(--primary)' : 'var(--outline)',
            }}>
              {result.ai_powered ? `✦ Gemini Flash` : 'Deterministic Template'}
            </span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>
              {new Date(result.generated_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="p-4 rounded-xl whitespace-pre-wrap text-xs leading-relaxed"
            style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)', color: 'var(--on-surface-variant)' }}>
            {result.narrative}
          </div>
          {result.note && (
            <p className="text-[10px] mt-2 flex items-center gap-1.5" style={{ color: 'var(--outline)' }}>
              <M icon="info" style={{ fontSize: 13 }} />{result.note}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   TAB: Mitigation Results
   ═══════════════════════════════════════════════════════════ */
function MitigationTab({ mitigationReport, activeDataset }) {
  if (!activeDataset) {
    return <EmptyState icon="healing" text="Select a dataset from the sidebar to see mitigation results." />;
  }

  if (!mitigationReport) {
    return <EmptyState icon="healing" text="No mitigation results yet. Run analysis first, then click 'Run Mitigation' in the sidebar." />;
  }

  const mr = mitigationReport;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Summary banner */}
      <div className="card p-5" style={{ background: 'rgba(196,192,255,0.08)', borderColor: 'rgba(196,192,255,0.2)' }}>
        <div className="flex items-center gap-3">
          <M icon="healing" style={{ fontSize: 28, color: 'var(--primary)' }} />
          <div>
            <p className="text-lg font-bold font-headline" style={{ color: 'var(--primary)' }}>
              Threshold Adjustment Mitigation
            </p>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
              Method: {mr.method || 'threshold_adjustment'} • {mr.impacted_count} case{mr.impacted_count !== 1 ? 's' : ''} adjusted
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold font-headline" style={{ color: 'var(--primary)' }}>{mr.impacted_count}</p>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--outline)' }}>impacted</p>
          </div>
        </div>
      </div>

      {/* Per-attribute deltas */}
      {mr.deltas && Object.entries(mr.deltas.per_attribute || {}).map(([attr, attrDeltas]) => (
        <div key={attr} className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">
            <M icon="compare_arrows" style={{ fontSize: 16, color: 'var(--primary)', verticalAlign: 'middle', marginRight: 6 }} />
            Deltas: <span style={{ color: 'var(--primary)' }}>{attr}</span>
          </h3>

          {/* Group accuracy deltas */}
          {attrDeltas.groups && Object.keys(attrDeltas.groups).length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Group Accuracy Changes</p>
              <div className="overflow-x-auto rounded-xl mb-4" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-container-high)' }}>
                      <th className="px-3 py-2 text-left font-bold">Group</th>
                      <th className="px-3 py-2 text-left font-bold">Selection Rate Δ</th>
                      <th className="px-3 py-2 text-left font-bold">Accuracy Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(attrDeltas.groups).map(([grp, d]) => (
                      <tr key={grp} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                        <td className="px-3 py-2 font-bold">{grp}</td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.selection_rate_delta} /></td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.accuracy_delta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Fairness metric deltas */}
          {attrDeltas.fairness && Object.keys(attrDeltas.fairness).length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--outline)' }}>Fairness Metric Changes</p>
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(70,69,85,0.15)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-container-high)' }}>
                      <th className="px-3 py-2 text-left font-bold">Group</th>
                      <th className="px-3 py-2 text-left font-bold">SPD Δ</th>
                      <th className="px-3 py-2 text-left font-bold">DIR Δ</th>
                      <th className="px-3 py-2 text-left font-bold">EOD Δ</th>
                      <th className="px-3 py-2 text-left font-bold">AOD Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(attrDeltas.fairness).map(([grp, d]) => (
                      <tr key={grp} style={{ borderTop: '1px solid rgba(70,69,85,0.08)' }}>
                        <td className="px-3 py-2 font-bold">{grp}</td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.spd_delta} /></td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.dir_delta} /></td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.eod_delta} /></td>
                        <td className="px-3 py-2 font-mono"><DeltaCell value={d.aod_delta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Threshold config */}
      {mr.config?.group_thresholds && (
        <div className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">
            <M icon="tune" style={{ fontSize: 16, color: 'var(--primary)', verticalAlign: 'middle', marginRight: 6 }} />
            Computed Thresholds
          </h3>
          <pre className="text-[10px] p-3 rounded-xl overflow-auto max-h-48" style={{ background: 'var(--surface-container)', color: 'var(--on-surface-variant)' }}>
            {JSON.stringify(mr.config.group_thresholds, null, 2)}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

function DeltaCell({ value }) {
  if (value == null) return <span style={{ color: 'var(--outline)' }}>—</span>;
  const positive = value > 0;
  const near = Math.abs(value) < 0.001;
  return (
    <span style={{ color: near ? 'var(--outline)' : positive ? 'var(--success)' : 'var(--error)', fontWeight: near ? 400 : 600 }}>
      {positive ? '+' : ''}{Number(value).toFixed(4)}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: Review Queue
   ═══════════════════════════════════════════════════════════ */
function ReviewTab({ queue, onAction }) {
  if (!queue.items || queue.items.length === 0) {
    return <EmptyState icon="checklist" text="No items in the review queue. Run an analysis to detect violations." />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--outline)' }}>
        {queue.total} violation{queue.total !== 1 ? 's' : ''} flagged for review
      </p>
      {queue.items.map(item => {
        const sc = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.low;
        return (
          <div key={item.id} className="card p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: sc.bg, color: sc.text }}>{item.severity}</span>
              {item.policy_level && (
                <span className="text-[7px] font-bold uppercase tracking-widest px-1 py-0.5 rounded" style={{
                  background: item.policy_level === 'block' ? 'rgba(255,180,171,0.15)' : 'rgba(251,191,36,0.1)',
                  color: item.policy_level === 'block' ? 'var(--error)' : 'var(--warning)',
                  border: `1px solid ${item.policy_level === 'block' ? 'rgba(255,180,171,0.3)' : 'rgba(251,191,36,0.2)'}`,
                }}>{item.policy_level}</span>
              )}
              <span className="text-xs font-bold">{item.metric_name}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{item.attribute}: {item.group_name}</span>
              <StatusChip status={item.status} />
              <span className="ml-auto text-xs font-mono font-bold" style={{ color: sc.text }}>{fmt(item.actual_value)}</span>
            </div>
            <p className="text-[10px] mb-3" style={{ color: 'var(--on-surface-variant)' }}>
              Expected range: {item.expected_range} • Actual: {fmt(item.actual_value)}
            </p>
            {item.status === 'open' && (
              <div className="flex gap-2">
                <button onClick={() => onAction(item.id, 'acknowledged')} className="btn-ghost text-[10px] py-1 px-2.5">
                  <M icon="visibility" style={{ fontSize: 13 }} /> Acknowledge
                </button>
                <button onClick={() => onAction(item.id, 'resolved')} className="btn-ghost text-[10px] py-1 px-2.5" style={{ color: 'var(--success)', borderColor: 'rgba(52,211,153,0.2)' }}>
                  <M icon="check_circle" style={{ fontSize: 13 }} /> Resolve
                </button>
                <button onClick={() => onAction(item.id, 'dismissed')} className="btn-ghost text-[10px] py-1 px-2.5" style={{ color: 'var(--on-surface-variant)' }}>
                  <M icon="close" style={{ fontSize: 13 }} /> Dismiss
                </button>
              </div>
            )}
            {item.reviewer && (
              <p className="text-[9px] mt-2" style={{ color: 'var(--outline)' }}>Reviewed by {item.reviewer}</p>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: Audit Trail
   ═══════════════════════════════════════════════════════════ */
function AuditTab({ trail }) {
  if (!trail || trail.length === 0) {
    return <EmptyState icon="history" text="No audit history. Upload a dataset and run an analysis to see the trail." />;
  }

  const actionIcons = {
    upload: 'cloud_upload',
    profile: 'analytics',
    analyze: 'science',
    analyze_error: 'error',
    review_update: 'rate_review',
    execution_gate: 'security',
    mitigate: 'healing',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--outline)' }}>
        Immutable audit log — {trail.length} event{trail.length !== 1 ? 's' : ''}
      </p>
      <div className="timeline">
        {trail.map((entry, i) => (
          <div key={entry.id || i} className="timeline-node">
            <div className="timeline-dot" style={{ borderColor: entry.action.includes('error') ? 'var(--error)' : 'var(--primary)' }}>
              <div className="ping" style={{ background: entry.action.includes('error') ? 'var(--error)' : 'var(--primary)' }} />
            </div>
            <div className="card p-4" style={{ background: 'var(--surface-container-high)' }}>
              <div className="flex items-center gap-2 mb-1">
                <M icon={actionIcons[entry.action] || 'event'} style={{ fontSize: 14, color: 'var(--primary)' }} />
                <span className="text-xs font-bold uppercase tracking-wider">{entry.action.replace(/_/g, ' ')}</span>
                <span className="text-[9px] font-mono ml-auto" style={{ color: 'var(--outline)' }}>{entry.timestamp}</span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>by {entry.actor}</p>
              {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                <details className="mt-2">
                  <summary className="text-[9px] font-bold uppercase tracking-widest cursor-pointer" style={{ color: 'var(--outline)' }}>Details</summary>
                  <pre className="text-[9px] mt-1 p-2 rounded-lg overflow-auto max-h-32" style={{ background: 'var(--surface-container)', color: 'var(--on-surface-variant)' }}>
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function StepHeader({ step, title, icon }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold" style={{ background: 'rgba(196,192,255,0.12)', color: 'var(--primary)' }}>{step}</div>
      <div className="flex items-center gap-2">
        <M icon={icon} style={{ fontSize: 16, color: 'var(--primary)' }} />
        <h3 className="text-sm font-bold font-headline">{title}</h3>
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] block mb-1" style={{ color: 'var(--outline)' }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-xs"
        style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.2)', color: 'var(--on-surface)', outline: 'none' }} />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, placeholder }) {
  const listId = useId();
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] block mb-1" style={{ color: 'var(--outline)' }}>{label}</label>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Select…'}
        className="w-full px-3 py-2 rounded-xl text-xs"
        style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.2)', color: value ? 'var(--on-surface)' : 'var(--outline)', outline: 'none' }}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    uploaded: { bg: 'rgba(196,192,255,0.1)', color: 'var(--primary)' },
    profiled: { bg: 'rgba(166,230,255,0.1)', color: 'var(--secondary)' },
    analyzed: { bg: 'rgba(52,211,153,0.1)', color: 'var(--success)' },
    error: { bg: 'rgba(255,180,171,0.1)', color: 'var(--error)' },
    open: { bg: 'rgba(251,191,36,0.1)', color: 'var(--warning)' },
    acknowledged: { bg: 'rgba(196,192,255,0.1)', color: 'var(--primary)' },
    resolved: { bg: 'rgba(52,211,153,0.1)', color: 'var(--success)' },
    dismissed: { bg: 'rgba(70,69,85,0.1)', color: 'var(--outline)' },
  };
  const s = map[status] || map.uploaded;
  return (
    <span className="text-[8px] font-bold uppercase tracking-[0.16em] px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.color }}>{status}</span>
  );
}

function MetricCell({ value, threshold, min, max }) {
  if (value == null) return <span style={{ color: 'var(--outline)' }}>—</span>;
  let bad = false;
  if (threshold != null) bad = Math.abs(value) > threshold;
  if (min != null && max != null) bad = value < min || value > max;
  return <span style={{ color: bad ? 'var(--error)' : 'var(--success)', fontWeight: bad ? 700 : 400 }}>{fmt(value)}</span>;
}

function MiniStat({ label, value, icon }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <M icon={icon} style={{ fontSize: 13, color: 'var(--primary)' }} />
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--outline)' }}>{label}</span>
      </div>
      <p className="text-xs font-bold truncate">{value || '—'}</p>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-8 flex flex-col items-center justify-center py-16">
      <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)' }}>
        <M icon={icon} style={{ fontSize: 28, color: 'var(--outline)' }} />
      </div>
      <p className="text-sm text-center max-w-md" style={{ color: 'var(--on-surface-variant)' }}>{text}</p>
    </motion.div>
  );
}
