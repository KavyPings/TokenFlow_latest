import { useCallback, useEffect, useState } from 'react';
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

export default function WorkflowScorePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [overview, testResults] = await Promise.all([
        api('/api/dashboard/overview'),
        api('/api/testbench/results?limit=100').catch(() => ({ results: [] })),
      ]);
      setData({ overview, testResults });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const workflows = data?.overview?.workflows || [];
    if (workflows.length === 0) {
      setSelectedWorkflowId('');
      return;
    }
    setSelectedWorkflowId((current) => {
      if (current && workflows.some((workflow) => workflow.id === current)) return current;
      return workflows[0].id;
    });
  }, [data]);

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
        <button className="btn-primary" style={{ marginTop: 16 }} onClick={loadData}>Retry</button>
      </div>
    );
  }

  const workflows = data?.overview?.workflows || [];
  const reviewQueue = data?.overview?.reviewQueue || [];
  const testRuns = data?.testResults?.results || [];
  const selectedWorkflow =
    workflows.find((workflow) => workflow.id === selectedWorkflowId) || workflows[0] || null;
  const selectedInReview = selectedWorkflow
    ? reviewQueue.some((item) => item.workflowId === selectedWorkflow.id)
    : false;
  const tokenSummary = selectedWorkflow?.token_summary || {};
  const totalWorkflowTokens = Object.values(tokenSummary).reduce((sum, value) => sum + value, 0);
  const burnedWorkflowTokens = tokenSummary.burned || 0;

  const auditScore = selectedWorkflow
    ? ((selectedWorkflow.audit_event_count || 0) > 0 ? 100 : 0)
    : 0;
  const interceptScore = !selectedWorkflow
    ? 0
    : selectedInReview
      ? 35
      : selectedWorkflow.status === 'completed'
        ? 100
        : selectedWorkflow.status === 'running'
          ? 70
          : selectedWorkflow.status === 'paused'
            ? 45
            : selectedWorkflow.status === 'aborted' || selectedWorkflow.status === 'killed'
              ? 55
              : 50;
  const tokenCompletionScore = !selectedWorkflow
    ? 0
    : totalWorkflowTokens > 0
      ? Math.round((burnedWorkflowTokens / totalWorkflowTokens) * 100)
      : (selectedWorkflow.status === 'completed' ? 100 : 0);

  const passedRuns = testRuns.filter((r) => r.status === 'passed').length;
  const testPassRate = testRuns.length > 0 ? Math.round((passedRuns / testRuns.length) * 100) : 0;
  const testScore = testRuns.length > 0 ? testPassRate : 50;

  const weights = { audit: 0.35, intercept: 0.3, completion: 0.2, tests: 0.15 };
  const compositeScore = Math.round(
    auditScore * weights.audit +
      interceptScore * weights.intercept +
      tokenCompletionScore * weights.completion +
      testScore * weights.tests
  );

  const checklist = [
    {
      label: 'Audit trail completeness',
      passed: auditScore >= 80,
      detail: selectedWorkflow
        ? `${selectedWorkflow.audit_event_count || 0} audit event(s) recorded for selected workflow`
        : 'Select or run a workflow to evaluate audit trail completeness',
    },
    {
      label: 'Security intercept quality',
      passed: interceptScore >= 70,
      detail: selectedWorkflow
        ? (selectedInReview
          ? 'Selected workflow is currently flagged in review queue'
          : 'Selected workflow is not flagged in review queue')
        : 'No workflow selected',
    },
    {
      label: 'Workflow execution evidence',
      passed: tokenCompletionScore >= 60,
      detail: selectedWorkflow
        ? `${burnedWorkflowTokens}/${totalWorkflowTokens || 0} tokens burned for selected workflow`
        : 'Run a workflow to capture token evidence',
    },
    {
      label: 'Testbench invariant health',
      passed: testScore >= 70,
      detail: testRuns.length > 0 ? `${passedRuns}/${testRuns.length} test runs passed` : 'No testbench runs yet',
    },
    {
      label: 'Vault credential isolation',
      passed: (data?.overview?.credentials || []).length > 0,
      detail: `${(data?.overview?.credentials || []).length} credential metadata record(s) available`,
    },
    {
      label: 'Intervention outcomes captured',
      passed: Boolean(selectedWorkflow),
      detail: selectedWorkflow
        ? `Selected workflow status: ${selectedWorkflow.status || 'unknown'}`
        : 'No workflow selected',
    },
  ];

  const passedCount = checklist.filter((item) => item.passed).length;

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
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-headline)' }}>Workflow Tokenchain Scorecard</h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Operational score based only on workflow tokenchains, intercept quality, and invariant test outcomes.</p>
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
            <button onClick={loadData} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>
              <M icon="refresh" style={{ fontSize: 14 }} /> Recalculate
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>Score Breakdown</h3>
            <ScoreRow
              label="Audit Evidence Coverage"
              value={auditScore}
              max={100}
              unit="%"
              color={auditScore >= 80 ? 'success' : 'warning'}
              msym="receipt_long"
              detail={selectedWorkflow
                ? `${selectedWorkflow.audit_event_count || 0} audit events on selected workflow (weight: 35%)`
                : 'Select a workflow to compute audit evidence (weight: 35%)'}
            />
            <ScoreRow
              label="Security Intercept Quality"
              value={interceptScore}
              max={100}
              unit="%"
              color={interceptScore >= 70 ? 'success' : interceptScore >= 40 ? 'warning' : 'error'}
              msym="shield"
              detail={selectedWorkflow
                ? `${selectedInReview ? 'Flagged in queue' : 'No active flag'} (weight: 30%)`
                : 'Select a workflow to compute intercept quality (weight: 30%)'}
            />
            <ScoreRow
              label="Token Completion"
              value={tokenCompletionScore}
              max={100}
              unit="%"
              color={tokenCompletionScore >= 70 ? 'success' : tokenCompletionScore >= 40 ? 'warning' : 'error'}
              msym="token"
              detail={selectedWorkflow
                ? `${burnedWorkflowTokens}/${totalWorkflowTokens || 0} tokens burned (weight: 20%)`
                : 'Select a workflow to compute token completion (weight: 20%)'}
            />
            <ScoreRow
              label="Testbench Pass Rate"
              value={testRuns.length > 0 ? passedRuns : 0}
              max={testRuns.length || 0}
              unit=""
              color={testScore >= 70 ? 'success' : testScore >= 40 ? 'warning' : 'error'}
              msym="science"
              detail={testRuns.length > 0 ? `${passedRuns}/${testRuns.length} scenarios passed (weight: 15%)` : 'No testbench runs yet — run scenarios to validate (weight: 15%)'}
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
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Selected Status</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-headline)' }}>{selectedWorkflow?.status || 'idle'}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Testbench Runs</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--secondary)', fontFamily: 'var(--font-headline)' }}>{testRuns.length}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Selected Queue Flag</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: selectedInReview ? 'var(--warning)' : 'var(--success)', fontFamily: 'var(--font-headline)' }}>{selectedInReview ? 1 : 0}</p>
        </div>
      </div>

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Workflow Score"
        subtitle="This score is only for workflow tokenchains and execution evidence."
        sections={[
          {
            title: 'How to generate score data',
            steps: [
              'Run one or more workflows from Workflow Management > Mock Workflows or Uploaded Workflows.',
              'Open Token Chain and confirm events are present for those runs.',
              'Run Testbench scenarios to populate invariant pass/fail evidence.',
            ],
          },
          {
            title: 'How to read the score',
            steps: [
              'Audit Evidence Coverage checks if workflows have audit trails.',
              'Security Intercept Quality penalizes high flagged ratios.',
              'Testbench Pass Rate reflects invariant health.',
              'Use Recalculate after each change to refresh values.',
            ],
          },
        ]}
      />
    </motion.div>
  );
}
