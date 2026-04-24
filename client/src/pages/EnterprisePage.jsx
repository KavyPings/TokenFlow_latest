import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ── API helpers ── */
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, opts);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.text();
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  return data;
}
function apiGet(p) { return apiFetch(p); }
function apiPost(p, body) { return apiFetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
function apiUpload(p, fd) { return apiFetch(p, { method: 'POST', body: fd }); }

function pct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%`; }

/* ── Format Help Dialog ── */
function FormatHelpDialog({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onClick={e => e.stopPropagation()}
        className="card" style={{ maxWidth: 720, width: '95vw', maxHeight: '85vh', overflow: 'auto', padding: 28, borderColor: 'rgba(196,192,255,0.25)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em]">File Format Guide</h2>
          <button onClick={onClose} className="btn-ghost p-1"><M icon="close" style={{ fontSize: 18 }} /></button>
        </div>
        {/* Workflow format */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2"><M icon="code" style={{ fontSize: 14, color: 'var(--primary)' }} /><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>Workflow JSON Format</p></div>
          <pre className="p-4 rounded-xl text-[11px] overflow-x-auto leading-relaxed" style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.12)', color: 'var(--on-surface-variant)' }}>{`{
  "name": "Loan Processing Pipeline",
  "description": "Reads applicant data and scores credit risk",
  "agent": "agent-cloud-worker",
  "steps": [
    {
      "action": "READ_OBJECT",
      "service": "gcs",
      "resource": "applicant-records/batch.json",
      "actionVerb": "read"
    },
    {
      "action": "CALL_INTERNAL_API",
      "service": "internal-api",
      "resource": "credit-scoring-model/v3",
      "actionVerb": "invoke"
    },
    {
      "action": "WRITE_OBJECT",
      "service": "gcs",
      "resource": "decisions/results.json",
      "actionVerb": "write"
    }
  ]
}`}</pre>
          <p className="text-[10px] mt-2" style={{ color: 'var(--on-surface-variant)' }}>
            <strong>Actions:</strong> READ_OBJECT, CALL_INTERNAL_API, WRITE_OBJECT, SEND_NOTIFICATION, CHECK_COMPLIANCE
          </p>
        </div>
        {/* Dataset format */}
        <div>
          <div className="flex items-center gap-2 mb-2"><M icon="dataset" style={{ fontSize: 14, color: 'var(--secondary)' }} /><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--secondary)' }}>Dataset CSV Format</p></div>
          <pre className="p-4 rounded-xl text-[11px] overflow-x-auto leading-relaxed" style={{ background: 'var(--surface-container)', border: '1px solid rgba(20,209,255,0.12)', color: 'var(--on-surface-variant)' }}>{`id,gender,age,income,credit_score,loan_amount,approved,predicted
APP-001,Male,35,75000,720,25000,1,1
APP-002,Female,28,52000,680,15000,1,1
APP-003,Male,45,95000,750,40000,1,1
APP-004,Female,32,48000,620,20000,0,0
APP-005,NonBinary,29,55000,640,18000,1,0`}</pre>
          <div className="mt-2 text-[10px] space-y-1" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>Required columns:</strong> A record ID, a target outcome (binary 0/1), a predicted outcome (binary 0/1)</p>
            <p><strong>Protected attributes:</strong> Columns like gender, race, age — at least 2 distinct groups needed</p>
            <p><strong>Optional:</strong> predicted_score (float 0–1), timestamp, model_version</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Audit session storage ── */
const STORAGE_KEY = 'tokenflow_enterprise_audits';
function loadSavedAudits() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveAudit(audit) {
  const audits = loadSavedAudits();
  audits.unshift(audit);
  if (audits.length > 20) audits.length = 20;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(audits));
  return audits;
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */
export default function EnterprisePage() {
  const [subTab, setSubTab] = useState('upload');
  const [auditName, setAuditName] = useState('');
  const [savedAudits, setSavedAudits] = useState(() => loadSavedAudits());
  const [selectedAuditId, setSelectedAuditId] = useState('');

  // Shared state across sub-tabs
  const [workflowFile, setWorkflowFile] = useState(null);
  const [workflowJson, setWorkflowJson] = useState(null);
  const [datasetFile, setDatasetFile] = useState(null);
  const [datasetMeta, setDatasetMeta] = useState(null);

  const [contextReport, setContextReport] = useState(null);
  const [contextAccepted, setContextAccepted] = useState(false);

  // Workflow results
  const [wfRunning, setWfRunning] = useState(false);
  const [wfId, setWfId] = useState(null);
  const [wfChain, setWfChain] = useState([]);
  const [wfAudit, setWfAudit] = useState([]);
  const [wfStatus, setWfStatus] = useState(null);

  // Fairness results
  const [fairnessResult, setFairnessResult] = useState(null);
  const [mitigationResult, setMitigationResult] = useState(null);
  const [fairnessDatasetId, setFairnessDatasetId] = useState(null);

  // Fairness config state for dataset upload
  const [datasetConfig, setDatasetConfig] = useState({
    dataset_name: '',
    column_mappings: { record_id: '', target_outcome: '', predicted_outcome: '' },
    protected_attributes: [{ column: '', reference_group: '' }],
  });

  // Save audit when report tab has data
  function handleSaveAudit() {
    const name = auditName.trim() || `Audit ${new Date().toLocaleDateString()}`;
    const audit = {
      id: Date.now().toString(),
      name,
      created_at: new Date().toISOString(),
      contextReport,
      wfChain, wfStatus,
      fairnessResult, mitigationResult,
    };
    const updated = saveAudit(audit);
    setSavedAudits(updated);
    setSelectedAuditId(audit.id);
  }

  function loadAudit(id) {
    const audit = savedAudits.find(a => a.id === id);
    if (!audit) return;
    setSelectedAuditId(id);
    setContextReport(audit.contextReport);
    setWfChain(audit.wfChain || []);
    setWfStatus(audit.wfStatus);
    setFairnessResult(audit.fairnessResult);
    setMitigationResult(audit.mitigationResult);
    setContextAccepted(true);
  }

  const tabs = [
    { id: 'upload', label: 'Upload & Context', msym: 'upload_file' },
    { id: 'workflow', label: 'Workflow Security', msym: 'security', disabled: !contextAccepted },
    { id: 'fairness', label: 'Fairness Analysis', msym: 'balance', disabled: !contextAccepted },
    { id: 'report', label: 'Combined Report', msym: 'summarize', disabled: !contextAccepted },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Enterprise Audit</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Upload your own workflow and dataset for a full security + fairness audit, powered by Gemini analysis.
          </p>
        </div>
        {/* Audit name + history dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedAudits.length > 0 && (
            <select value={selectedAuditId} onChange={(e) => { if (e.target.value) loadAudit(e.target.value); }}
              className="rounded-lg px-3 py-1.5 text-[11px]"
              style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)', maxWidth: 200 }}>
              <option value="">Load saved audit…</option>
              {savedAudits.map(a => <option key={a.id} value={a.id}>{a.name} ({new Date(a.created_at).toLocaleDateString()})</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => !t.disabled && setSubTab(t.id)} disabled={t.disabled}
            className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 flex-shrink-0 ${subTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={t.disabled ? { opacity: 0.35, cursor: 'not-allowed' } : subTab !== t.id ? { padding: '0.5rem 1.25rem' } : {}}>
            <M icon={t.msym} style={{ fontSize: 14 }} />{t.label}
            {t.disabled && <M icon="lock" style={{ fontSize: 11, marginLeft: 2 }} />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {subTab === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <UploadContextTab
              workflowFile={workflowFile} setWorkflowFile={setWorkflowFile}
              workflowJson={workflowJson} setWorkflowJson={setWorkflowJson}
              datasetFile={datasetFile} setDatasetFile={setDatasetFile}
              datasetMeta={datasetMeta} setDatasetMeta={setDatasetMeta}
              datasetConfig={datasetConfig} setDatasetConfig={setDatasetConfig}
              contextReport={contextReport} setContextReport={setContextReport}
              contextAccepted={contextAccepted} setContextAccepted={setContextAccepted}
              auditName={auditName} setAuditName={setAuditName}
              onAccept={() => setSubTab('workflow')}
            />
          </motion.div>
        )}
        {subTab === 'workflow' && (
          <motion.div key="wf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <WorkflowSecurityTab
              workflowJson={workflowJson}
              wfRunning={wfRunning} setWfRunning={setWfRunning}
              wfId={wfId} setWfId={setWfId}
              wfChain={wfChain} setWfChain={setWfChain}
              wfAudit={wfAudit} setWfAudit={setWfAudit}
              wfStatus={wfStatus} setWfStatus={setWfStatus}
            />
          </motion.div>
        )}
        {subTab === 'fairness' && (
          <motion.div key="fair" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <FairnessAnalysisTab
              datasetFile={datasetFile}
              datasetConfig={datasetConfig}
              datasetMeta={datasetMeta}
              fairnessResult={fairnessResult} setFairnessResult={setFairnessResult}
              mitigationResult={mitigationResult} setMitigationResult={setMitigationResult}
              fairnessDatasetId={fairnessDatasetId} setFairnessDatasetId={setFairnessDatasetId}
            />
          </motion.div>
        )}
        {subTab === 'report' && (
          <motion.div key="report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <CombinedReportTab
              contextReport={contextReport}
              wfChain={wfChain} wfStatus={wfStatus}
              fairnessResult={fairnessResult}
              mitigationResult={mitigationResult}
              auditName={auditName}
              onSave={handleSaveAudit}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-tab 1: Upload & Context
   ═══════════════════════════════════════════════════════════ */
function UploadContextTab({
  workflowFile, setWorkflowFile, workflowJson, setWorkflowJson,
  datasetFile, setDatasetFile, datasetMeta, setDatasetMeta,
  datasetConfig, setDatasetConfig,
  contextReport, setContextReport,
  contextAccepted, setContextAccepted,
  auditName, setAuditName, onAccept,
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);
  const [manualContext, setManualContext] = useState('');
  const [showFormatHelp, setShowFormatHelp] = useState(false);

  function handleWorkflowUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setWorkflowFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const json = JSON.parse(ev.target.result); setWorkflowJson(json); setError(''); }
      catch { setError('Invalid JSON in workflow file.'); setWorkflowJson(null); }
    };
    reader.readAsText(file);
  }

  function handleDatasetUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setDatasetFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        let rows;
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          rows = Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || parsed.records || parsed.items || []);
        } else {
          const lines = text.split('\n').filter(Boolean);
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => { obj[h] = vals[i]; });
            return obj;
          });
        }
        setDatasetMeta({ columns: rows.length > 0 ? Object.keys(rows[0]) : [], rowCount: rows.length, sampleRows: rows.slice(0, 5) });
        setError('');
      } catch { setError('Failed to parse dataset file.'); setDatasetMeta(null); }
    };
    reader.readAsText(file);
  }

  async function handleAnalyze() {
    setAnalyzing(true); setError(''); setContextReport(null); setContextAccepted(false); setDeclined(false);
    try {
      const result = await apiPost('/api/enterprise/analyze-context', { workflow: workflowJson, datasetMeta });
      setContextReport(result);
    } catch (e) { setError(e.message); }
    finally { setAnalyzing(false); }
  }

  async function handleReanalyze() {
    if (!manualContext.trim()) return;
    setAnalyzing(true); setError('');
    try {
      const result = await apiPost('/api/enterprise/analyze-context-manual', { workflow: workflowJson, datasetMeta, userContext: manualContext });
      setContextReport(result); setDeclined(false);
    } catch (e) { setError(e.message); }
    finally { setAnalyzing(false); }
  }

  function handleAccept() { setContextAccepted(true); onAccept(); }

  // Protected attributes helpers
  function addProtectedAttribute() {
    setDatasetConfig(prev => ({ ...prev, protected_attributes: [...prev.protected_attributes, { column: '', reference_group: '' }] }));
  }
  function removeProtectedAttribute(idx) {
    setDatasetConfig(prev => ({ ...prev, protected_attributes: prev.protected_attributes.filter((_, i) => i !== idx) }));
  }
  function updateProtectedAttribute(idx, field, value) {
    setDatasetConfig(prev => ({
      ...prev,
      protected_attributes: prev.protected_attributes.map((attr, i) => i === idx ? { ...attr, [field]: value } : attr),
    }));
  }

  const canAnalyze = workflowJson || datasetMeta;

  return (
    <div>
      {/* Audit name + format help */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--on-surface-variant)' }}>Audit Name</label>
          <input type="text" placeholder="e.g., Q2 2026 Loan Pipeline Audit"
            value={auditName} onChange={e => setAuditName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)' }} />
        </div>
        <button onClick={() => setShowFormatHelp(true)} className="btn-ghost px-3 py-2 text-[11px] flex-shrink-0 mt-4" style={{ borderColor: 'rgba(196,192,255,0.2)' }}>
          <M icon="help" style={{ fontSize: 14 }} /> File Formats
        </button>
      </div>

      <FormatHelpDialog open={showFormatHelp} onClose={() => setShowFormatHelp(false)} />

      {/* Upload sections */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Workflow upload */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(196,192,255,0.12)' }}><M icon="code" style={{ fontSize: 16, color: 'var(--primary)' }} /></div>
            <h3 className="text-sm font-bold uppercase tracking-[0.1em]">Workflow JSON</h3>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--on-surface-variant)' }}>Upload your workflow definition (.json) for security analysis.</p>
          <label className="btn-ghost flex items-center justify-center gap-2 py-3 cursor-pointer w-full rounded-xl text-xs" style={{ border: '1px dashed rgba(196,192,255,0.25)' }}>
            <M icon="upload_file" style={{ fontSize: 16 }} />{workflowFile ? workflowFile.name : 'Choose JSON file'}
            <input type="file" accept=".json" onChange={handleWorkflowUpload} className="hidden" />
          </label>
          {workflowJson && (
            <div className="mt-3 p-3 rounded-xl text-[11px]" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-1"><M icon="check_circle" style={{ fontSize: 13, color: 'var(--success)' }} /><span className="font-bold" style={{ color: 'var(--success)' }}>Parsed</span></div>
              <p style={{ color: 'var(--on-surface-variant)' }}>Name: <strong style={{ color: 'var(--on-surface)' }}>{workflowJson.name || 'Unnamed'}</strong></p>
              <p style={{ color: 'var(--on-surface-variant)' }}>Steps: <strong style={{ color: 'var(--on-surface)' }}>{workflowJson.steps?.length || 0}</strong></p>
            </div>
          )}
        </div>

        {/* Dataset upload */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(20,209,255,0.12)' }}><M icon="dataset" style={{ fontSize: 16, color: 'var(--secondary)' }} /></div>
            <h3 className="text-sm font-bold uppercase tracking-[0.1em]">Fairness Dataset</h3>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--on-surface-variant)' }}>Upload your dataset (.csv or .json) for fairness analysis.</p>
          <label className="btn-ghost flex items-center justify-center gap-2 py-3 cursor-pointer w-full rounded-xl text-xs" style={{ border: '1px dashed rgba(20,209,255,0.25)' }}>
            <M icon="upload_file" style={{ fontSize: 16 }} />{datasetFile ? datasetFile.name : 'Choose CSV/JSON file'}
            <input type="file" accept=".csv,.json" onChange={handleDatasetUpload} className="hidden" />
          </label>
          {datasetMeta && (
            <div className="mt-3 p-3 rounded-xl text-[11px]" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-1"><M icon="check_circle" style={{ fontSize: 13, color: 'var(--success)' }} /><span className="font-bold" style={{ color: 'var(--success)' }}>Parsed</span></div>
              <p style={{ color: 'var(--on-surface-variant)' }}>Rows: <strong style={{ color: 'var(--on-surface)' }}>{datasetMeta.rowCount}</strong></p>
              <p style={{ color: 'var(--on-surface-variant)' }}>Columns: <strong style={{ color: 'var(--on-surface)' }}>{datasetMeta.columns.join(', ')}</strong></p>
            </div>
          )}
        </div>
      </div>

      {/* Schema mapping for dataset */}
      {datasetMeta && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] mb-3">Dataset Schema Mapping</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--on-surface-variant)' }}>Map your dataset columns so the fairness engine can run. Only record ID, target outcome, and predicted outcome are required.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { key: 'record_id', label: 'Record ID', required: true },
              { key: 'target_outcome', label: 'Target Outcome', required: true },
              { key: 'predicted_outcome', label: 'Predicted Outcome', required: true },
              { key: 'predicted_score', label: 'Predicted Score' },
              { key: 'timestamp', label: 'Timestamp' },
              { key: 'model_version', label: 'Model Version' },
            ].map(({ key, label, required }) => (
              <div key={key}>
                <label className="text-[10px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--on-surface-variant)' }}>
                  {label} {required && <span style={{ color: 'var(--error)' }}>*</span>}
                </label>
                <select
                  value={datasetConfig.column_mappings[key] || ''}
                  onChange={(e) => setDatasetConfig(prev => ({ ...prev, column_mappings: { ...prev.column_mappings, [key]: e.target.value } }))}
                  className="w-full rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)' }}>
                  <option value="">—</option>
                  {datasetMeta.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1 block" style={{ color: 'var(--on-surface-variant)' }}>Dataset name</label>
            <input type="text" placeholder="My Enterprise Dataset"
              value={datasetConfig.dataset_name}
              onChange={(e) => setDatasetConfig(prev => ({ ...prev, dataset_name: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)' }} />
          </div>
          {/* Protected attributes — multiple */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--on-surface-variant)' }}>Protected Attributes</label>
              <button onClick={addProtectedAttribute} className="btn-ghost text-[10px] px-2 py-1 flex items-center gap-1">
                <M icon="add" style={{ fontSize: 12 }} /> Add Attribute
              </button>
            </div>
            <div className="space-y-2">
              {datasetConfig.protected_attributes.map((attr, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={attr.column || ''}
                    onChange={(e) => updateProtectedAttribute(idx, 'column', e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)' }}>
                    <option value="">— select column —</option>
                    {datasetMeta.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="text" placeholder="Reference group (e.g. Male)"
                    value={attr.reference_group || ''}
                    onChange={(e) => updateProtectedAttribute(idx, 'reference_group', e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'var(--surface-container)', border: '1px solid rgba(196,192,255,0.15)', color: 'var(--on-surface)' }} />
                  {datasetConfig.protected_attributes.length > 1 && (
                    <button onClick={() => removeProtectedAttribute(idx)} className="btn-ghost p-1.5 flex-shrink-0" style={{ color: 'var(--error)' }}>
                      <M icon="close" style={{ fontSize: 14 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analyze button */}
      {canAnalyze && !contextReport && (
        <div className="flex justify-center mb-6">
          <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary px-8 py-3 text-sm">
            {analyzing ? (<><span className="inline-block w-3 h-3 rounded-full animate-pulse-subtle mr-2" style={{ background: 'rgba(255,255,255,0.5)' }} />Analyzing with Gemini...</>) : (<><M icon="auto_awesome" style={{ fontSize: 16 }} /> Analyze Context</>)}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: 'var(--error)' }}>
          <M icon="error" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />{error}
        </div>
      )}

      {/* Context report */}
      {contextReport && !contextAccepted && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6 mb-6" style={{ borderColor: 'rgba(196,192,255,0.25)' }}>
          <div className="flex items-center gap-2 mb-4">
            <M icon="auto_awesome" style={{ fontSize: 18, color: 'var(--primary)' }} />
            <h3 className="text-sm font-bold uppercase tracking-[0.1em]">AI Context Analysis</h3>
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ml-auto" style={{ background: 'rgba(196,192,255,0.15)', color: 'var(--primary)' }}>
              {contextReport.ai_powered ? '✦ Gemini' : 'Template'}
            </span>
          </div>
          {contextReport.summary && (
            <div className="p-4 rounded-xl mb-4 text-xs leading-relaxed" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)', color: 'var(--on-surface)' }}>
              {contextReport.summary}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {contextReport.workflow_analysis && (
              <div className="p-4 rounded-xl" style={{ background: 'rgba(196,192,255,0.04)', border: '1px solid rgba(196,192,255,0.12)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>Workflow Analysis</p>
                <p className="text-[11px] mb-2" style={{ color: 'var(--on-surface)' }}>{contextReport.workflow_analysis.purpose}</p>
                {contextReport.workflow_analysis.risk_areas?.length > 0 && (<div className="mt-2"><p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--error)' }}>Risk Areas</p><ul className="text-[10px] space-y-0.5" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.workflow_analysis.risk_areas.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>)}
                {contextReport.workflow_analysis.checks_planned?.length > 0 && (<div className="mt-2"><p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--success)' }}>Planned Checks</p><ul className="text-[10px] space-y-0.5" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.workflow_analysis.checks_planned.map((c, i) => <li key={i}>✓ {c}</li>)}</ul></div>)}
              </div>
            )}
            {contextReport.dataset_analysis && (
              <div className="p-4 rounded-xl" style={{ background: 'rgba(20,209,255,0.04)', border: '1px solid rgba(20,209,255,0.12)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--secondary)' }}>Dataset Analysis</p>
                <p className="text-[11px] mb-2" style={{ color: 'var(--on-surface)' }}>{contextReport.dataset_analysis.purpose}</p>
                {contextReport.dataset_analysis.likely_protected_attributes?.length > 0 && (<div className="mt-2"><p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--warning)' }}>Protected Attributes Found</p><ul className="text-[10px] space-y-0.5" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.dataset_analysis.likely_protected_attributes.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>)}
                {contextReport.dataset_analysis.checks_planned?.length > 0 && (<div className="mt-2"><p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--success)' }}>Planned Checks</p><ul className="text-[10px] space-y-0.5" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.dataset_analysis.checks_planned.map((c, i) => <li key={i}>✓ {c}</li>)}</ul></div>)}
              </div>
            )}
          </div>
          {contextReport.planned_actions?.length > 0 && (
            <div className="p-3 rounded-xl mb-4 text-[11px]" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--success)' }}>Planned Actions</p>
              <ol className="space-y-1 list-decimal list-inside" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.planned_actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
            </div>
          )}
          {!declined ? (
            <div className="flex gap-3 justify-center">
              <button onClick={handleAccept} className="btn-primary px-6 py-2.5 text-xs"><M icon="check" style={{ fontSize: 14 }} /> Accept & Proceed</button>
              <button onClick={() => setDeclined(true)} className="btn-ghost px-6 py-2.5 text-xs" style={{ color: 'var(--warning)', borderColor: 'rgba(251,191,36,0.2)' }}><M icon="edit" style={{ fontSize: 14 }} /> Provide My Own Context</button>
            </div>
          ) : (
            <div className="mt-4">
              <label className="text-[10px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--warning)' }}>Describe your data and what you're trying to accomplish</label>
              <textarea value={manualContext} onChange={(e) => setManualContext(e.target.value)} rows={4}
                placeholder="E.g., This is a loan processing workflow..."
                className="w-full rounded-xl px-4 py-3 text-xs mb-3"
                style={{ background: 'var(--surface-container)', border: '1px solid rgba(251,191,36,0.2)', color: 'var(--on-surface)', resize: 'vertical' }} />
              <button onClick={handleReanalyze} disabled={analyzing || !manualContext.trim()} className="btn-primary px-6 py-2.5 text-xs">
                {analyzing ? 'Re-analyzing...' : <><M icon="auto_awesome" style={{ fontSize: 14 }} /> Re-Analyze with Context</>}
              </button>
            </div>
          )}
        </motion.div>
      )}
      {contextAccepted && (
        <div className="p-3 rounded-xl text-xs flex items-center gap-2" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: 'var(--success)' }}>
          <M icon="check_circle" style={{ fontSize: 16 }} /> <span className="font-bold">Context accepted.</span>
          <span style={{ color: 'var(--on-surface-variant)' }}>Switch to the Workflow Security or Fairness Analysis tab to run checks.</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-tab 2: Workflow Security — with hero placeholder
   ═══════════════════════════════════════════════════════════ */
function WorkflowSecurityTab({ workflowJson, wfRunning, setWfRunning, wfId, setWfId, wfChain, setWfChain, wfAudit, setWfAudit, wfStatus, setWfStatus }) {
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function handleRun() {
    if (!workflowJson) { setError('No workflow uploaded. Go back to Upload & Context.'); return; }
    setWfRunning(true); setError(''); setWfChain([]); setWfAudit([]); setWfStatus(null);
    try {
      const result = await apiPost('/api/enterprise/run-workflow', { definition: workflowJson });
      setWfId(result.workflowId);
      startPolling(result.workflowId);
    } catch (e) { setError(e.message); setWfRunning(false); }
  }

  function startPolling(id) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const [chainRes, auditRes, wfRes] = await Promise.all([
          apiGet(`/api/tokens/chain/${id}`), apiGet(`/api/tokens/audit?workflowId=${id}`), apiGet(`/api/workflows/${id}`),
        ]);
        setWfChain(chainRes.chain || []); setWfAudit(auditRes.audit_log || []);
        const status = wfRes.workflow?.status; setWfStatus(status);
        if (status === 'completed' || status === 'aborted') { clearInterval(pollRef.current); setWfRunning(false); }
      } catch { /* keep polling */ }
    }, 1500);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const burned = wfChain.filter(t => t.status === 'burned').length;
  const flagged = wfChain.filter(t => t.status === 'flagged').length;
  const total = wfChain.length;
  const progress = total > 0 ? Math.round((burned / total) * 100) : 0;
  const secScore = Math.max(0, 100 - (flagged * 20) - (wfStatus === 'aborted' ? 10 : 0));

  // Hero state: show when no workflow has been started
  if (!wfId) {
    return (
      <div>
        {error && (<div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: 'var(--error)' }}><M icon="error" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />{error}</div>)}
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: 'rgba(196,192,255,0.08)' }}>
            <M icon="security" style={{ fontSize: 48, color: 'var(--primary)' }} />
          </div>
          <h2 className="text-lg font-bold font-headline mb-2">Workflow Security Check</h2>
          <p className="text-xs mb-2" style={{ color: 'var(--on-surface-variant)', maxWidth: 480, margin: '0 auto' }}>
            Run your uploaded workflow through TokenFlow's token engine. Each step gets a scoped token — if any step
            tries unauthorized actions, the token is <strong style={{ color: 'var(--error)' }}>flagged</strong> and the chain is broken.
          </p>
          {workflowJson && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] mb-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', color: 'var(--success)' }}>
              <M icon="check_circle" style={{ fontSize: 12 }} /> Workflow loaded: <strong>{workflowJson.name || 'Unnamed'}</strong> ({workflowJson.steps?.length || 0} steps)
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            <button onClick={handleRun} disabled={wfRunning || !workflowJson} className="btn-primary px-8 py-3 text-sm">
              <M icon="play_arrow" style={{ fontSize: 18 }} /> Run Security Check
            </button>
            <div className="text-[10px] space-y-1 mt-2" style={{ color: 'var(--outline)' }}>
              <p>✓ Token minting & scoping per step</p>
              <p>✓ Invariant validation (scope, resource, verb)</p>
              <p>✓ Automatic abort on security breach</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] mb-4">Workflow Security Check</h2>
      {/* Status bar */}
      <div className="card p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: wfStatus === 'running' ? 'var(--warning)' : wfStatus === 'completed' ? 'var(--success)' : wfStatus === 'aborted' ? 'var(--error)' : 'var(--outline)', boxShadow: wfStatus === 'running' ? '0 0 6px var(--warning)' : 'none' }} />
          <span className="text-xs font-bold uppercase tracking-widest">{wfStatus || 'starting'}</span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{wfId}</span>
        <span className="text-[10px] font-bold ml-auto" style={{ color: 'var(--primary)' }}>Tokens: {burned}/{total} burned</span>
      </div>
      {/* Progress */}
      <div className="card p-4 mb-4">
        <div className="flex justify-between text-xs mb-2"><span style={{ color: 'var(--on-surface-variant)' }}>Chain Progress</span><span className="font-bold font-mono" style={{ color: 'var(--on-surface)' }}>{progress}%</span></div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(70,69,85,0.2)' }}><motion.div className="h-full rounded-full" style={{ background: progress === 100 ? 'var(--success)' : 'var(--primary)' }} initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div>
      </div>
      {/* Token chain */}
      <div className="card p-5 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] mb-3">Token Chain</h3>
        {wfChain.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>Waiting for tokens…</p> : (
          <div className="space-y-2">{wfChain.map((token, i) => {
            const isFlagged = token.status === 'flagged'; const isBurned = token.status === 'burned';
            return (<motion.div key={token.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex items-center gap-3 p-3 rounded-xl" style={{ background: isFlagged ? 'rgba(255,100,100,0.06)' : isBurned ? 'rgba(52,211,153,0.04)' : 'rgba(196,192,255,0.04)', border: `1px solid ${isFlagged ? 'rgba(255,100,100,0.15)' : isBurned ? 'rgba(52,211,153,0.12)' : 'rgba(196,192,255,0.1)'}` }}>
              <M icon={isFlagged ? 'gpp_bad' : isBurned ? 'check_circle' : 'pending'} style={{ fontSize: 16, color: isFlagged ? 'var(--error)' : isBurned ? 'var(--success)' : 'var(--primary)' }} />
              <div className="flex-1 min-w-0"><p className="text-[11px] font-bold" style={{ color: 'var(--on-surface)' }}>{token.action || token.step_action || `Step ${i + 1}`}</p><p className="text-[10px] font-mono truncate" style={{ color: 'var(--outline)' }}>{token.id}</p></div>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: isFlagged ? 'rgba(255,100,100,0.12)' : isBurned ? 'rgba(52,211,153,0.12)' : 'rgba(196,192,255,0.1)', color: isFlagged ? 'var(--error)' : isBurned ? 'var(--success)' : 'var(--primary)' }}>{token.status}</span>
            </motion.div>);
          })}</div>
        )}
      </div>
      {/* Audit log */}
      {wfAudit.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] mb-3">Audit Log ({wfAudit.length} events)</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">{wfAudit.slice(-20).reverse().map((e, i) => (
            <div key={e.id || i} className="flex items-center gap-2 text-[10px] py-1">
              <span className="font-mono" style={{ color: 'var(--outline)', minWidth: 70 }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className="px-1.5 py-0.5 rounded font-bold uppercase" style={{ fontSize: 9, color: e.event_type === 'FLAGGED' ? 'var(--error)' : 'var(--success)', background: e.event_type === 'FLAGGED' ? 'rgba(255,100,100,0.1)' : 'rgba(52,211,153,0.06)' }}>{e.event_type}</span>
              <span className="truncate" style={{ color: 'var(--on-surface-variant)' }}>{e.action || e.details?.reason || ''}</span>
            </div>
          ))}</div>
        </div>
      )}
      {/* Security score */}
      {(wfStatus === 'completed' || wfStatus === 'aborted') && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--on-surface-variant)' }}>Security Score</p>
          <p className="text-5xl font-bold font-headline" style={{ color: secScore >= 80 ? 'var(--success)' : secScore >= 50 ? 'var(--warning)' : 'var(--error)' }}>{secScore}</p>
          <p className="text-[11px] mt-2" style={{ color: 'var(--on-surface-variant)' }}>{flagged > 0 ? `${flagged} token(s) flagged for security violations.` : 'No security violations detected.'}{wfStatus === 'aborted' ? ' Workflow was aborted.' : ''}</p>
        </motion.div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-tab 3: Fairness Analysis — with hero placeholder
   ═══════════════════════════════════════════════════════════ */
function FairnessAnalysisTab({ datasetFile, datasetConfig, datasetMeta, fairnessResult, setFairnessResult, mitigationResult, setMitigationResult, fairnessDatasetId, setFairnessDatasetId }) {
  const [running, setRunning] = useState(false);
  const [mitigating, setMitigating] = useState(false);
  const [error, setError] = useState('');

  async function handleRun() {
    if (!datasetFile) { setError('No dataset uploaded. Go back to Upload & Context.'); return; }

    // Build a proper config that the validation layer expects
    const cm = datasetConfig.column_mappings || {};
    const fixedConfig = {
      dataset_name: datasetConfig.dataset_name || 'Enterprise Dataset',
      column_mappings: {
        record_id: cm.record_id || '',
        target_outcome: cm.target_outcome || '',
        predicted_outcome: cm.predicted_outcome || '',
        // Only include optional fields if they have a value
        ...(cm.predicted_score ? { predicted_score: cm.predicted_score } : {}),
        // Provide dummy values for required-by-validation fields if not mapped
        timestamp: cm.timestamp || cm.record_id || '',
        model_version: cm.model_version || cm.record_id || '',
      },
      protected_attributes: (datasetConfig.protected_attributes || [])
        .filter(a => a.column && a.reference_group)
        .map(a => ({ column: a.column, reference_group: a.reference_group })),
    };

    if (!fixedConfig.column_mappings.record_id || !fixedConfig.column_mappings.target_outcome || !fixedConfig.column_mappings.predicted_outcome) {
      setError('Please map at least record_id, target_outcome, and predicted_outcome columns.');
      return;
    }
    if (fixedConfig.protected_attributes.length === 0) {
      setError('Please add at least one protected attribute with a column and reference group.');
      return;
    }

    setRunning(true); setError(''); setFairnessResult(null); setMitigationResult(null);
    try {
      const fd = new FormData();
      fd.append('file', datasetFile);
      fd.append('config', JSON.stringify(fixedConfig));
      const result = await apiUpload('/api/enterprise/run-fairness', fd);
      setFairnessResult(result);
      setFairnessDatasetId(result.dataset_id);
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  }

  async function handleMitigate() {
    if (!fairnessDatasetId) return;
    setMitigating(true); setError('');
    try {
      const result = await apiPost(`/api/enterprise/datasets/${fairnessDatasetId}/mitigate`, {});
      setMitigationResult(result);
    } catch (e) { setError(e.message); }
    finally { setMitigating(false); }
  }

  const report = fairnessResult?.report;
  const riskColors = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--error)' };
  const violations = report?.violations || [];
  const fairScore = report ? Math.max(0, (report.risk_level === 'low' ? 90 : report.risk_level === 'medium' ? 60 : 30) - (report.violation_count || 0) * 3) : null;

  // Hero state: show when no analysis has been run
  if (!fairnessResult) {
    return (
      <div>
        {error && (<div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: 'var(--error)' }}><M icon="error" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />{error}</div>)}
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: 'rgba(20,209,255,0.08)' }}>
            <M icon="balance" style={{ fontSize: 48, color: 'var(--secondary)' }} />
          </div>
          <h2 className="text-lg font-bold font-headline mb-2">Fairness Analysis</h2>
          <p className="text-xs mb-2" style={{ color: 'var(--on-surface-variant)', maxWidth: 480, margin: '0 auto' }}>
            Analyze your uploaded dataset for bias across protected attributes. TokenFlow computes statistical parity,
            disparate impact, equalized odds, and average odds metrics to detect unfair outcomes.
          </p>
          {datasetFile && datasetMeta && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] mb-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', color: 'var(--success)' }}>
              <M icon="check_circle" style={{ fontSize: 12 }} /> Dataset loaded: <strong>{datasetFile.name}</strong> ({datasetMeta.rowCount} rows)
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            <button onClick={handleRun} disabled={running || !datasetFile} className="btn-primary px-8 py-3 text-sm">
              {running ? (<><span className="inline-block w-3 h-3 rounded-full animate-pulse-subtle mr-2" style={{ background: 'rgba(255,255,255,0.5)' }} />Running Analysis...</>) : (<><M icon="play_arrow" style={{ fontSize: 18 }} /> Run Fairness Check</>)}
            </button>
            <div className="text-[10px] space-y-1 mt-2" style={{ color: 'var(--outline)' }}>
              <p>✓ Statistical parity & disparate impact</p>
              <p>✓ Equalized odds & average odds</p>
              <p>✓ Threshold-based bias mitigation</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] mb-4">Fairness Analysis</h2>
      {error && (<div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: 'var(--error)' }}><M icon="error" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />{error}</div>)}
      {report && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Risk banner */}
          <div className="card p-4 mb-4 flex items-center gap-3" style={{ borderColor: `${riskColors[report.risk_level]}33` }}>
            <M icon={report.risk_level === 'high' ? 'gpp_bad' : report.risk_level === 'medium' ? 'warning' : 'verified'} style={{ fontSize: 22, color: riskColors[report.risk_level] }} />
            <div><p className="text-xs font-bold uppercase" style={{ color: riskColors[report.risk_level] }}>{report.risk_level} Risk</p><p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>{report.violation_count || 0} violations across {fairnessResult.row_count || 0} records</p></div>
            <span className="ml-auto text-3xl font-bold font-headline" style={{ color: riskColors[report.risk_level] }}>{fairScore}</span>
          </div>
          {/* Violations */}
          {violations.length > 0 && (
            <div className="card p-5 mb-4"><h3 className="text-xs font-bold uppercase tracking-[0.12em] mb-3">Violations ({violations.length})</h3>
              <div className="space-y-2">{violations.map((v, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,100,100,0.04)', border: '1px solid rgba(255,100,100,0.1)' }}>
                  <M icon="warning" style={{ fontSize: 14, color: v.severity === 'high' ? 'var(--error)' : 'var(--warning)' }} />
                  <div className="flex-1"><p className="text-[11px] font-bold" style={{ color: 'var(--on-surface)' }}>{v.metric}</p><p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>Group: {v.group} — Disparity: {pct(v.value)} (threshold: {pct(v.threshold)})</p></div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: v.severity === 'high' ? 'rgba(255,100,100,0.12)' : 'rgba(251,191,36,0.12)', color: v.severity === 'high' ? 'var(--error)' : 'var(--warning)' }}>{v.severity}</span>
                </div>))}</div>
            </div>
          )}
          {/* Mitigation */}
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em]">Bias Mitigation</h3>
              {!mitigationResult && (<button onClick={handleMitigate} disabled={mitigating} className="btn-primary px-4 py-2 text-xs">{mitigating ? 'Mitigating...' : <><M icon="tune" style={{ fontSize: 14 }} /> Run Mitigation</>}</button>)}
            </div>
            {!mitigationResult ? (<p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>Run threshold-based mitigation to reduce bias.</p>) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="p-3 rounded-xl mb-3 text-xs" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', color: 'var(--success)' }}>
                  <M icon="check_circle" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} /> Mitigation complete. {mitigationResult.mitigation?.impacted_count || 0} records impacted.
                </div>
                <div className="flex gap-3">
                  <a href={`${API_BASE}${mitigationResult.download_urls?.csv}`} className="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5" download><M icon="download" style={{ fontSize: 14 }} /> CSV</a>
                  <a href={`${API_BASE}${mitigationResult.download_urls?.json}`} className="btn-ghost px-4 py-2 text-xs inline-flex items-center gap-1.5" download><M icon="download" style={{ fontSize: 14 }} /> JSON</a>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-tab 4: Combined Report — with download
   ═══════════════════════════════════════════════════════════ */
function CombinedReportTab({ contextReport, wfChain, wfStatus, fairnessResult, mitigationResult, auditName, onSave }) {
  const report = fairnessResult?.report;
  const burned = wfChain.filter(t => t.status === 'burned').length;
  const flagged = wfChain.filter(t => t.status === 'flagged').length;
  const total = wfChain.length;
  const secScore = total > 0 ? Math.max(0, 100 - (flagged * 20) - (wfStatus === 'aborted' ? 10 : 0)) : null;
  const fairScore = report ? Math.max(0, (report.risk_level === 'low' ? 90 : report.risk_level === 'medium' ? 60 : 30) - (report.violation_count || 0) * 3) : null;
  const parts = [secScore, fairScore].filter(s => s !== null);
  const combinedScore = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const scoreColor = (s) => s >= 80 ? 'var(--success)' : s >= 50 ? 'var(--warning)' : 'var(--error)';
  const hasData = secScore !== null || fairScore !== null;

  function downloadReport() {
    const name = auditName || 'Enterprise Audit Report';
    const lines = [`TOKENFLOW ENTERPRISE AUDIT REPORT`, `Name: ${name}`, `Generated: ${new Date().toLocaleString()}`, `${'═'.repeat(50)}`, ''];
    if (combinedScore !== null) lines.push(`COMBINED SCORE: ${combinedScore}/100`, '');
    if (secScore !== null) lines.push(`WORKFLOW SECURITY: ${secScore}/100`, `  Tokens: ${total} total, ${burned} burned, ${flagged} flagged`, `  Status: ${wfStatus}`, '');
    if (fairScore !== null) { lines.push(`FAIRNESS COMPLIANCE: ${fairScore}/100`, `  Risk Level: ${report?.risk_level}`, `  Violations: ${report?.violation_count || 0}`); if (mitigationResult) lines.push(`  Mitigation: Applied (${mitigationResult.mitigation?.impacted_count || 0} records)`); lines.push(''); }
    if (contextReport?.summary) lines.push(`AI CONTEXT SUMMARY:`, contextReport.summary, '');
    if (contextReport?.planned_actions?.length > 0) { lines.push('COMPLETED ACTIONS:'); contextReport.planned_actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`)); }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name.replace(/\s+/g, '_')}_report.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!hasData) {
    return (
      <div>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] mb-4">Combined Enterprise Report</h2>
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: 'rgba(196,192,255,0.08)' }}>
            <M icon="summarize" style={{ fontSize: 48, color: 'var(--outline)' }} />
          </div>
          <h2 className="text-lg font-bold font-headline mb-2">No Report Data Yet</h2>
          <p className="text-xs" style={{ color: 'var(--on-surface-variant)', maxWidth: 400, margin: '0 auto' }}>
            Run the Workflow Security or Fairness Analysis checks first. This tab will aggregate all scores into a combined enterprise report.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em]">{auditName || 'Combined Enterprise Report'}</h2>
        <div className="flex gap-2">
          <button onClick={onSave} className="btn-ghost px-4 py-2 text-xs"><M icon="save" style={{ fontSize: 14 }} /> Save Audit</button>
          <button onClick={downloadReport} className="btn-primary px-4 py-2 text-xs"><M icon="download" style={{ fontSize: 14 }} /> Download Report</button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {/* Combined score */}
        <div className="card p-8 text-center mb-6" style={{ borderColor: `${scoreColor(combinedScore)}33` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--on-surface-variant)' }}>Combined Enterprise Score</p>
          <p className="text-6xl font-bold font-headline" style={{ color: scoreColor(combinedScore) }}>{combinedScore}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--on-surface-variant)' }}>
            {combinedScore >= 80 ? 'Excellent posture — ready for production.' : combinedScore >= 50 ? 'Moderate risk — review flagged items.' : 'High risk — remediation required.'}
          </p>
        </div>
        {/* Score breakdown */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {secScore !== null && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3"><M icon="security" style={{ fontSize: 16, color: 'var(--primary)' }} /><p className="text-xs font-bold uppercase tracking-[0.12em]">Workflow Security</p></div>
              <p className="text-4xl font-bold font-headline mb-2" style={{ color: scoreColor(secScore) }}>{secScore}</p>
              <div className="space-y-1 text-[11px]" style={{ color: 'var(--on-surface-variant)' }}><p>Tokens: {total} ({burned} burned, {flagged} flagged)</p><p>Status: <span className="font-bold" style={{ color: wfStatus === 'completed' ? 'var(--success)' : 'var(--error)' }}>{wfStatus}</span></p></div>
            </div>
          )}
          {fairScore !== null && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3"><M icon="balance" style={{ fontSize: 16, color: 'var(--secondary)' }} /><p className="text-xs font-bold uppercase tracking-[0.12em]">Fairness Compliance</p></div>
              <p className="text-4xl font-bold font-headline mb-2" style={{ color: scoreColor(fairScore) }}>{fairScore}</p>
              <div className="space-y-1 text-[11px]" style={{ color: 'var(--on-surface-variant)' }}><p>Risk: <span className="font-bold uppercase" style={{ color: scoreColor(fairScore) }}>{report?.risk_level}</span></p><p>Violations: {report?.violation_count || 0}</p><p>Mitigation: {mitigationResult ? `Applied (${mitigationResult.mitigation?.impacted_count || 0} records)` : 'Not applied'}</p></div>
            </div>
          )}
        </div>
        {/* Context summary */}
        {contextReport?.summary && (<div className="card p-5 mb-6"><h3 className="text-xs font-bold uppercase tracking-[0.12em] mb-3">AI Context Summary</h3><p className="text-[11px] leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{contextReport.summary}</p></div>)}
        {contextReport?.planned_actions?.length > 0 && (
          <div className="card p-5"><h3 className="text-xs font-bold uppercase tracking-[0.12em] mb-3">Actions Completed</h3>
            <div className="space-y-1">{contextReport.planned_actions.map((a, i) => (<div key={i} className="flex items-center gap-2 text-[11px]"><M icon="check_circle" style={{ fontSize: 13, color: 'var(--success)' }} /><span style={{ color: 'var(--on-surface-variant)' }}>{a}</span></div>))}</div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
