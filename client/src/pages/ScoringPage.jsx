import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';
import InstructionsDialog from '../components/InstructionsDialog.jsx';

/* ─── Material Symbol shortcut ─── */
const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ─── Animated Arc Gauge ─── */
function ArcGauge({ score, size = 200, strokeWidth = 14 }) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75; // 270° sweep
  const offset = arc - (arc * Math.max(0, Math.min(100, score))) / 100;

  const color =
    score >= 80 ? 'var(--success)' :
    score >= 55 ? 'var(--warning)' : 'var(--error)';

  const grade =
    score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';

  return (
    <div style={{ position: 'relative', width: size, height: size + 20 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeLinecap="round"
        />
        {/* Value */}
        <motion.circle
          cx={cx} cy={cy} r={r}
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
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 16,
      }}>
        <span style={{ fontSize: 42, fontWeight: 800, color, fontFamily: 'var(--font-headline)', lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4, fontWeight: 600 }}>
          COMPLIANCE SCORE
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2, fontFamily: 'var(--font-headline)' }}>
          Grade {grade}
        </span>
      </div>
    </div>
  );
}

/* ─── Metric Pill ─── */
function ScoreRow({ label, value, max, unit = '', color, msym, detail }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor = color === 'success' ? 'var(--success)' : color === 'warning' ? 'var(--warning)' : 'var(--error)';
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      marginBottom: 8,
    }}>
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
      {detail && (
        <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 4 }}>{detail}</p>
      )}
    </div>
  );
}

/* ─── Checklist Item ─── */
function CheckItem({ label, passed, detail }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 10,
      marginBottom: 6,
      background: passed ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
      border: `1px solid ${passed ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
    }}>
      <M icon={passed ? 'check_circle' : 'cancel'} style={{ 
        fontSize: 16, 
        color: passed ? 'var(--success)' : 'var(--error)', 
        flexShrink: 0, 
        marginTop: 1 
      }} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{label}</p>
        {detail && <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{detail}</p>}
      </div>
    </div>
  );
}

export default function ScoringPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [datasetsResult, reviewQueue, gateStatus] = await Promise.all([
        api('/api/fairness/datasets').catch(() => ({ datasets: [] })),
        api('/api/fairness/review-queue?limit=200').catch(() => ({ items: [], total: 0 })),
        api('/api/fairness/execution-gate').catch(() => ({
          gate: { allowed: true, decision: 'ALLOW', mode: 'shadow' },
          metrics: { total_evaluations: 0, blocked_count: 0, allowed_count: 0 },
        })),
      ]);
      setData({ datasetsResult, reviewQueue, gateStatus });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: 16 }}>
        <div style={{ 
          width: 40, height: 40, borderRadius: '50%', 
          border: '3px solid rgba(196,192,255,0.2)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.8s linear infinite' 
        }} />
        <p style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>Computing dataset score...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <M icon="error" style={{ fontSize: 48, color: 'var(--error)' }} />
        <p style={{ color: 'var(--error)', marginTop: 12 }}>Failed to load dataset score data: {error}</p>
        <button className="btn-primary" style={{ marginTop: 16 }} onClick={loadData}>Retry</button>
      </div>
    );
  }

  // ── Compute dataset score components ──────────────────────
  const datasets = data?.datasetsResult?.datasets || [];
  const reviewItems = data?.reviewQueue?.items || [];
  const gate = data?.gateStatus?.gate || {};
  const gateMetrics = data?.gateStatus?.metrics || {};

  const totalDatasets = datasets.length;
  const analyzedDatasets = datasets.filter((d) => d.status === 'analyzed' || d.status === 'mitigated').length;
  const mitigatedDatasets = datasets.filter((d) => d.status === 'mitigated').length;

  const openStatuses = ['open', 'acknowledged'];
  const openItems = reviewItems.filter((item) => openStatuses.includes(item.status));
  const highOpenItems = openItems.filter((item) => item.severity === 'high');

  const analysisScore = totalDatasets > 0 ? Math.round((analyzedDatasets / totalDatasets) * 100) : 100;
  const mitigationScore = analyzedDatasets > 0
    ? Math.round((mitigatedDatasets / analyzedDatasets) * 100)
    : (totalDatasets > 0 ? 0 : 100);
  const queueScore = Math.round(Math.max(0, 100 - (highOpenItems.length * 20) - (openItems.length * 5)));
  const fairnessGateScore = gate.allowed ? 100 : 30;

  const weights = { analysis: 0.30, mitigation: 0.25, queue: 0.25, gate: 0.20 };
  const compositeScore = Math.round(
    analysisScore * weights.analysis +
    mitigationScore * weights.mitigation +
    queueScore * weights.queue +
    fairnessGateScore * weights.gate
  );

  const checklist = [
    {
      label: 'Dataset inventory present',
      passed: totalDatasets > 0,
      detail: totalDatasets > 0 ? `${totalDatasets} dataset(s) available for governance` : 'Upload a dataset to begin fairness governance',
    },
    {
      label: 'Fairness testing coverage',
      passed: analysisScore >= 70,
      detail: `${analyzedDatasets}/${totalDatasets} datasets analyzed (${analysisScore}%)`,
    },
    {
      label: 'Mitigation adoption',
      passed: mitigationScore >= 50 || analyzedDatasets === 0,
      detail: `${mitigatedDatasets}/${analyzedDatasets} analyzed datasets mitigated (${mitigationScore}%)`,
    },
    {
      label: 'High-severity queue control',
      passed: highOpenItems.length === 0,
      detail: `${highOpenItems.length} unresolved high-severity item(s)`,
    },
    {
      label: 'Fairness gate operational',
      passed: gate.decision === 'ALLOW' || gate.mode === 'shadow',
      detail: `Gate mode: ${gate.mode || 'shadow'} — ${gate.message || 'No fairness violations detected'}`,
    },
    {
      label: 'Review queue manageable',
      passed: openItems.length <= 5,
      detail: `${openItems.length} open/acknowledged queue item(s)`,
    },
  ];

  const passedCount = checklist.filter(c => c.passed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--secondary)', margin: '0 0 6px' }}>
            Dataset Score
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-headline)' }}>
            Fairness Testing &amp; Mitigation Scorecard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
            Dataset-only governance score based on fairness testing coverage, mitigation adoption, review queue health, and gate status.
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Left: Gauge */}
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

        {/* Right: Breakdown + Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Score Breakdown */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>
              Score Breakdown
            </h3>
            <ScoreRow
              label="Fairness Testing Coverage"
              value={analysisScore}
              max={100}
              unit="%"
              color={analysisScore >= 70 ? 'success' : 'warning'}
              msym="dataset"
              detail={`${analyzedDatasets}/${totalDatasets} datasets analyzed (weight: 30%)`}
            />
            <ScoreRow
              label="Mitigation Coverage"
              value={mitigationScore}
              max={100}
              unit="%"
              color={mitigationScore >= 60 ? 'success' : mitigationScore >= 30 ? 'warning' : 'error'}
              msym="tune"
              detail={`${mitigatedDatasets}/${analyzedDatasets} analyzed datasets mitigated (weight: 25%)`}
            />
            <ScoreRow
              label="Review Queue Health"
              value={queueScore}
              max={100}
              unit="%"
              color={queueScore >= 70 ? 'success' : queueScore >= 40 ? 'warning' : 'error'}
              msym="rule"
              detail={`${openItems.length} open fairness item(s), ${highOpenItems.length} high severity (weight: 25%)`}
            />
            <ScoreRow
              label="Fairness Gate"
              value={fairnessGateScore}
              max={100}
              unit="%"
              color={fairnessGateScore === 100 ? 'success' : 'error'}
              msym="balance"
              detail={`Gate: ${gate.decision || 'ALLOW'} in ${gate.mode || 'shadow'} mode (weight: 20%)`}
            />
          </div>

          {/* Compliance Checklist */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>
              Compliance Checklist
            </h3>
            {checklist.map((item, i) => (
              <CheckItem key={i} label={item.label} passed={item.passed} detail={item.detail} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="card" style={{ padding: 20, marginTop: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Datasets</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-headline)' }}>{totalDatasets}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Analyzed</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-headline)' }}>{analyzedDatasets}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Mitigated</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--secondary)', fontFamily: 'var(--font-headline)' }}>{mitigatedDatasets}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Open Queue</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: openItems.length > 0 ? 'var(--warning)' : 'var(--success)', fontFamily: 'var(--font-headline)' }}>{openItems.length}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Gate Decisions</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: gate.allowed ? 'var(--success)' : 'var(--error)', fontFamily: 'var(--font-headline)' }}>
            {gateMetrics.total_evaluations || 0}
          </p>
        </div>
      </div>

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Dataset Score"
        subtitle="This score is only for fairness datasets, testing, queue resolution, and mitigation."
        sections={[
          {
            title: 'How to generate score data',
            steps: [
              'Upload one or more datasets from Dataset Management > Fairness.',
              'Run fairness analysis to produce dataset reports and queue items.',
              'Apply mitigation to improve fairness outcomes.',
              'Review or resolve fairness queue items, then recalculate score.',
            ],
          },
          {
            title: 'How to read the score',
            steps: [
              'Testing Coverage reflects how many datasets have been analyzed.',
              'Mitigation Coverage reflects adoption of mitigation on analyzed datasets.',
              'Queue Health drops when unresolved high-severity items remain open.',
              'Fairness Gate contributes final governance readiness signal.',
            ],
          },
        ]}
      />
    </motion.div>
  );
}
