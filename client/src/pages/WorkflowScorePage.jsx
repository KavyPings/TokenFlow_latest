import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import InstructionsDialog from '../components/InstructionsDialog.jsx';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

function ArcGauge({ score, size = 200, strokeWidth = 14 }) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const offset = arc - (arc * Math.max(0, Math.min(100, score))) / 100;

  const color = score >= 80 ? 'var(--success)' : score >= 55 ? 'var(--warning)' : 'var(--error)';
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';

  return (
    <div style={{ position: 'relative', width: size, height: size + 20 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeLinecap="round"
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`drop-shadow(0 0 8px ${color})`}
          initial={{ strokeDashoffset: arc }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 16,
        }}
      >
        <span style={{ fontSize: 42, fontWeight: 800, color, fontFamily: 'var(--font-headline)', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4, fontWeight: 600 }}>WORKFLOW SCORE</span>
        <span style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2, fontFamily: 'var(--font-headline)' }}>Grade {grade}</span>
      </div>
    </div>
  );
}

function ScoreRow({ label, value, max, unit = '', color, msym, detail }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor = color === 'success' ? 'var(--success)' : color === 'warning' ? 'var(--warning)' : 'var(--error)';
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <M icon={msym} style={{ fontSize: 16, color: barColor }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontFamily: 'var(--font-mono)' }}>
          {value}{unit} {max > 0 ? `/ ${max}${unit}` : ''}
        </span>
      </div>
      {max > 0 && (
        <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <motion.div
            style={{ height: '100%', borderRadius: 99, background: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
        </div>
      )}
      {detail && <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 4 }}>{detail}</p>}
    </div>
  );
}

function CheckItem({ label, passed, detail }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        marginBottom: 6,
        background: passed ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
        border: `1px solid ${passed ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
      }}
    >
      <M icon={passed ? 'check_circle' : 'cancel'} style={{ fontSize: 16, color: passed ? 'var(--success)' : 'var(--error)', flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{label}</p>
        {detail && <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{detail}</p>}
      </div>
    </div>
  );
}

function statusScore(status) {
  if (status === 'completed') return 100;
  if (status === 'paused') return 75;
  if (status === 'aborted' || status === 'killed') return 65;
  if (status === 'running') return 55;
  return 40;
}

function policyResponseScore({ flagged, revoked, status }) {
  if (flagged === 0) return 100;
  if (revoked > 0 || status === 'paused' || status === 'aborted' || status === 'killed') return 90;
  if (status === 'completed') return 70;
  return 50;
}

export default function WorkflowScorePage() {
  const [overview, setOverview] = useState(null);
  const [chain, setChain] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflowData, setLoadingWorkflowData] = useState(false);
  const [error, setError] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api('/api/dashboard/overview');
      setOverview(data || null);
      const workflows = data?.workflows || [];
      setSelectedWorkflowId((current) => {
        if (current && workflows.some((workflow) => workflow.id === current)) return current;
        return workflows[0]?.id || '';
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedWorkflowData = useCallback(async (workflowId) => {
    if (!workflowId) {
      setChain([]);
      setAudit([]);
      return;
    }
    setLoadingWorkflowData(true);
    try {
      const [chainResult, auditResult] = await Promise.all([
        api(`/api/tokens/chain/${workflowId}`).catch(() => ({ chain: [] })),
        api(`/api/tokens/audit?workflowId=${workflowId}`).catch(() => ({ audit_log: [] })),
      ]);
      setChain(chainResult?.chain || []);
      setAudit(auditResult?.audit_log || []);
    } finally {
      setLoadingWorkflowData(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadSelectedWorkflowData(selectedWorkflowId);
  }, [selectedWorkflowId, loadSelectedWorkflowData]);

  const workflows = overview?.workflows || [];
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) || null;

  const tokenSummary = selectedWorkflow?.token_summary || {};
  const totalTokensFromSummary = Object.values(tokenSummary).reduce((sum, value) => sum + value, 0);
  const totalTokens = chain.length || totalTokensFromSummary;
  const burnedTokens = chain.filter((token) => token.status === 'burned').length || (tokenSummary.burned || 0);
  const flaggedTokens = chain.filter((token) => token.status === 'flagged').length || (tokenSummary.flagged || 0);
  const revokedTokens = chain.filter((token) => token.status === 'revoked').length || (tokenSummary.revoked || 0);

  const tokenIntegrityScore = !selectedWorkflow
    ? 0
    : totalTokens > 0
      ? Math.round((burnedTokens / totalTokens) * 100)
      : (selectedWorkflow.status === 'completed' ? 100 : 0);

  const responseScore = selectedWorkflow
    ? policyResponseScore({
      flagged: flaggedTokens,
      revoked: revokedTokens,
      status: selectedWorkflow.status,
    })
    : 0;

  const auditCoverageScore = audit.length > 0
    ? Math.min(100, 40 + (audit.length * 8))
    : 0;

  const executionOutcomeScore = selectedWorkflow
    ? statusScore(selectedWorkflow.status)
    : 0;

  const weights = { token: 0.35, response: 0.25, audit: 0.25, outcome: 0.15 };
  const compositeScore = Math.round(
    tokenIntegrityScore * weights.token +
    responseScore * weights.response +
    auditCoverageScore * weights.audit +
    executionOutcomeScore * weights.outcome
  );

  const checklist = useMemo(() => [
    {
      label: 'Workflow selected',
      passed: Boolean(selectedWorkflow),
      detail: selectedWorkflow ? `${selectedWorkflow.name || 'Unnamed workflow'} (${selectedWorkflow.id.slice(0, 10)})` : 'Select a workflow to compute score',
    },
    {
      label: 'Token lifecycle evidence',
      passed: tokenIntegrityScore >= 60,
      detail: `${burnedTokens}/${totalTokens || 0} tokens burned cleanly`,
    },
    {
      label: 'Policy response quality',
      passed: responseScore >= 70,
      detail: `${flaggedTokens} flagged, ${revokedTokens} revoked`,
    },
    {
      label: 'Audit trail depth',
      passed: auditCoverageScore >= 60,
      detail: `${audit.length} audit event(s) captured for selected workflow`,
    },
    {
      label: 'Execution outcome recorded',
      passed: executionOutcomeScore >= 55,
      detail: `Status: ${selectedWorkflow?.status || 'not started'}`,
    },
  ], [
    selectedWorkflow,
    tokenIntegrityScore,
    burnedTokens,
    totalTokens,
    responseScore,
    flaggedTokens,
    revokedTokens,
    auditCoverageScore,
    audit.length,
    executionOutcomeScore,
  ]);

  const passedCount = checklist.filter((item) => item.passed).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '3px solid rgba(127,165,190,0.2)',
            borderTopColor: 'var(--primary)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>Computing workflow score...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <M icon="error" style={{ fontSize: 48, color: 'var(--error)' }} />
        <p style={{ color: 'var(--error)', marginTop: 12 }}>Failed to load workflow score data: {error}</p>
        <button className="btn-primary" style={{ marginTop: 16 }} onClick={loadOverview}>Retry</button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}
    >
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--secondary)', margin: '0 0 6px' }}>Workflow Score</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-headline)' }}>Workflow Execution Scorecard</h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Score for the selected workflow based on token lifecycle, policy response, audit evidence, and execution outcome.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={selectedWorkflowId}
            onChange={(event) => setSelectedWorkflowId(event.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.2)', color: 'var(--on-surface)', minWidth: 240 }}
          >
            {workflows.length === 0 && <option value="">No workflows available</option>}
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name || 'Unnamed Workflow'} ({workflow.id.slice(0, 10)})
              </option>
            ))}
          </select>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowInstructions(true)}>
            <M icon="help" style={{ fontSize: 14 }} /> How to use
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <ArcGauge score={compositeScore} />
            <div style={{ width: '100%', marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', fontWeight: 600 }}>CRITERIA PASSED</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'var(--font-mono)' }}>{passedCount}/{checklist.length}</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', borderRadius: 99, background: 'var(--primary)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((passedCount / checklist.length) * 100)}%` }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
            <button onClick={loadOverview} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>
              <M icon="refresh" style={{ fontSize: 14 }} /> Recalculate
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>Score Breakdown</h3>
            <ScoreRow
              label="Token Lifecycle Integrity"
              value={tokenIntegrityScore}
              max={100}
              unit="%"
              color={tokenIntegrityScore >= 70 ? 'success' : tokenIntegrityScore >= 45 ? 'warning' : 'error'}
              msym="token"
              detail={`${burnedTokens}/${totalTokens || 0} tokens burned cleanly (weight: 35%)`}
            />
            <ScoreRow
              label="Policy Response Quality"
              value={responseScore}
              max={100}
              unit="%"
              color={responseScore >= 70 ? 'success' : responseScore >= 45 ? 'warning' : 'error'}
              msym="shield"
              detail={`${flaggedTokens} flagged, ${revokedTokens} revoked (weight: 25%)`}
            />
            <ScoreRow
              label="Audit Trail Coverage"
              value={auditCoverageScore}
              max={100}
              unit="%"
              color={auditCoverageScore >= 70 ? 'success' : auditCoverageScore >= 45 ? 'warning' : 'error'}
              msym="receipt_long"
              detail={`${audit.length} events on selected workflow (weight: 25%)`}
            />
            <ScoreRow
              label="Execution Outcome Stability"
              value={executionOutcomeScore}
              max={100}
              unit="%"
              color={executionOutcomeScore >= 70 ? 'success' : executionOutcomeScore >= 45 ? 'warning' : 'error'}
              msym="play_circle"
              detail={`Current status: ${selectedWorkflow?.status || 'idle'} (weight: 15%)`}
            />
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>Workflow Checklist</h3>
            {checklist.map((item, index) => (
              <CheckItem key={index} label={item.label} passed={item.passed} detail={item.detail} />
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Selected Workflow</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-headline)' }}>{selectedWorkflow ? selectedWorkflow.id.slice(0, 10) : '—'}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Status</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-headline)' }}>{selectedWorkflow?.status || 'idle'}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Flagged Tokens</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: flaggedTokens > 0 ? 'var(--warning)' : 'var(--success)', fontFamily: 'var(--font-headline)' }}>{flaggedTokens}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Audit Events</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--secondary)', fontFamily: 'var(--font-headline)' }}>{loadingWorkflowData ? '...' : audit.length}</p>
        </div>
      </div>

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Workflow Score"
        subtitle="This score is computed for the workflow you selected in the dropdown."
        sections={[
          {
            title: 'How to generate score data',
            steps: [
              'Run one or more workflows from Workflow Management > Mock Workflows or Uploaded Workflows.',
              'Open Token Chain to confirm tokens and audit events were recorded.',
              'Open Workflow Score and select the workflow you want to evaluate.',
            ],
          },
          {
            title: 'How to read the score',
            steps: [
              'Token Lifecycle Integrity checks how cleanly tokens were consumed (burned vs non-burned states).',
              'Policy Response Quality checks whether flagged behavior led to policy action (pause/revoke/abort) when needed.',
              'Audit Trail Coverage checks whether enough workflow events were captured for traceability.',
              'Execution Outcome Stability reflects the final/active workflow state so unfinished runs score lower.',
            ],
          },
        ]}
      />
    </motion.div>
  );
}
