import { useEffect, useState, useCallback, useMemo } from 'react';
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

  const color =
    score >= 80 ? 'var(--success)' :
      score >= 55 ? 'var(--warning)' : 'var(--error)';

  const grade =
    score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';

  return (
    <div style={{ position: 'relative', width: size, height: size + 20 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeLinecap="round"
        />
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
          DATASET SCORE
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2, fontFamily: 'var(--font-headline)' }}>
          Grade {grade}
        </span>
      </div>
    </div>
  );
}

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
        marginTop: 1,
      }} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{label}</p>
        {detail && <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{detail}</p>}
      </div>
    </div>
  );
}

function scoreRiskLevel(level) {
  if (level === 'high') return 25;
  if (level === 'medium') return 12;
  return 0;
}

function mitigationQualityFromDeltas(deltas) {
  const perAttribute = Object.values(deltas?.per_attribute || {});
  let improved = 0;
  let worsened = 0;

  for (const attr of perAttribute) {
    for (const change of Object.values(attr?.fairness || {})) {
      const spd = Number(change?.spd_delta || 0);
      const dir = Number(change?.dir_delta || 0);
      const eod = Number(change?.eod_delta || 0);
      const aod = Number(change?.aod_delta || 0);

      if (spd < 0) improved++; else if (spd > 0) worsened++;
      if (dir > 0) improved++; else if (dir < 0) worsened++;
      if (eod < 0) improved++; else if (eod > 0) worsened++;
      if (aod < 0) improved++; else if (aod > 0) worsened++;
    }
  }

  if (improved === 0 && worsened === 0) return 55;
  return Math.max(0, Math.min(100, Math.round(50 + (improved - worsened) * 8)));
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

      const [datasetsResult, gateStatus] = await Promise.all([
        api('/api/fairness/datasets').catch(() => ({ datasets: [] })),
        api('/api/fairness/execution-gate').catch(() => ({
          gate: { allowed: true, decision: 'ALLOW', mode: 'shadow' },
          metrics: { total_evaluations: 0, blocked_count: 0, allowed_count: 0 },
        })),
      ]);

      const datasets = datasetsResult?.datasets || [];
      const scoredDatasetIds = datasets
        .filter((dataset) => dataset.status === 'analyzed' || dataset.status === 'mitigated')
        .map((dataset) => dataset.id);

      const [reports, mitigations] = await Promise.all([
        Promise.all(scoredDatasetIds.map(async (id) => {
          try {
            const report = await api(`/api/fairness/datasets/${id}/report`);
            return { id, report: report?.report || report };
          } catch {
            return { id, report: null };
          }
        })),
        Promise.all(scoredDatasetIds.map(async (id) => {
          try {
            const mitigation = await api(`/api/fairness/datasets/${id}/mitigation-report`);
            return { id, mitigation };
          } catch {
            return { id, mitigation: null };
          }
        })),
      ]);

      setData({ datasets, gateStatus, reports, mitigations });
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
          border: '3px solid rgba(127,165,190,0.2)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.8s linear infinite',
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

  const datasets = data?.datasets || [];
  const gate = data?.gateStatus?.gate || {};
  const gateMetrics = data?.gateStatus?.metrics || {};
  const reports = (data?.reports || []).filter((entry) => entry.report);
  const mitigations = (data?.mitigations || []).filter((entry) => entry.mitigation);

  const totalDatasets = datasets.length;
  const analyzedDatasets = datasets.filter((dataset) => dataset.status === 'analyzed' || dataset.status === 'mitigated').length;
  const mitigatedDatasets = datasets.filter((dataset) => dataset.status === 'mitigated').length;

  const analysisScore = totalDatasets > 0 ? Math.round((analyzedDatasets / totalDatasets) * 100) : 100;

  const complianceScores = reports.map(({ report }) => {
    const violationPenalty = Math.min(60, Number(report?.violation_count || 0) * 8);
    const riskPenalty = scoreRiskLevel(String(report?.risk_level || 'low').toLowerCase());
    return Math.max(0, 100 - violationPenalty - riskPenalty);
  });
  const fairnessComplianceScore = complianceScores.length > 0
    ? Math.round(complianceScores.reduce((sum, score) => sum + score, 0) / complianceScores.length)
    : (totalDatasets > 0 ? 0 : 100);

  const mitigationScores = mitigations.map(({ mitigation }) => {
    const quality = mitigationQualityFromDeltas(mitigation?.deltas);
    const impacted = Number(mitigation?.impacted_count || 0);
    return impacted > 0 ? quality : Math.min(quality, 55);
  });
  const mitigationEffectivenessScore = mitigationScores.length > 0
    ? Math.round(mitigationScores.reduce((sum, score) => sum + score, 0) / mitigationScores.length)
    : (analyzedDatasets > 0 ? 50 : 100);

  const fairnessGateScore = gate.decision === 'ALLOW' ? 100 : 25;

  const weights = { analysis: 0.30, compliance: 0.35, mitigation: 0.20, gate: 0.15 };
  const compositeScore = Math.round(
    analysisScore * weights.analysis +
    fairnessComplianceScore * weights.compliance +
    mitigationEffectivenessScore * weights.mitigation +
    fairnessGateScore * weights.gate
  );

  const totalViolations = reports.reduce((sum, entry) => sum + Number(entry.report?.violation_count || 0), 0);

  const checklist = useMemo(() => [
    {
      label: 'Dataset inventory present',
      passed: totalDatasets > 0,
      detail: totalDatasets > 0 ? `${totalDatasets} dataset(s) available for governance` : 'Upload a dataset to begin fairness governance',
    },
    {
      label: 'Fairness analysis coverage',
      passed: analysisScore >= 70,
      detail: `${analyzedDatasets}/${totalDatasets} datasets analyzed (${analysisScore}%)`,
    },
    {
      label: 'Fairness compliance quality',
      passed: fairnessComplianceScore >= 65,
      detail: `${totalViolations} total violations across analyzed datasets`,
    },
    {
      label: 'Mitigation effectiveness',
      passed: mitigationEffectivenessScore >= 60 || analyzedDatasets === 0,
      detail: `${mitigations.length} mitigation report(s) with average effectiveness ${mitigationEffectivenessScore}%`,
    },
    {
      label: 'Deterministic gate readiness',
      passed: gate.decision === 'ALLOW',
      detail: `Gate decision: ${gate.decision || 'ALLOW'} in ${gate.mode || 'shadow'} mode`,
    },
  ], [
    totalDatasets,
    analysisScore,
    analyzedDatasets,
    fairnessComplianceScore,
    totalViolations,
    mitigationEffectivenessScore,
    mitigations.length,
    gate.decision,
    gate.mode,
  ]);

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
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--secondary)', margin: '0 0 6px' }}>
            Dataset Score
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-headline)' }}>
            Fairness Governance Scorecard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
            Dataset governance score based on analysis coverage, compliance quality, mitigation effectiveness, and deterministic gate status.
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
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
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>
              Score Breakdown
            </h3>
            <ScoreRow
              label="Fairness Analysis Coverage"
              value={analysisScore}
              max={100}
              unit="%"
              color={analysisScore >= 70 ? 'success' : 'warning'}
              msym="dataset"
              detail={`${analyzedDatasets}/${totalDatasets} datasets analyzed (weight: 30%)`}
            />
            <ScoreRow
              label="Fairness Compliance Quality"
              value={fairnessComplianceScore}
              max={100}
              unit="%"
              color={fairnessComplianceScore >= 70 ? 'success' : fairnessComplianceScore >= 45 ? 'warning' : 'error'}
              msym="rule"
              detail={`${totalViolations} total violations across analyzed datasets (weight: 35%)`}
            />
            <ScoreRow
              label="Mitigation Effectiveness"
              value={mitigationEffectivenessScore}
              max={100}
              unit="%"
              color={mitigationEffectivenessScore >= 70 ? 'success' : mitigationEffectivenessScore >= 45 ? 'warning' : 'error'}
              msym="tune"
              detail={`${mitigations.length} mitigation report(s) evaluated by fairness deltas (weight: 20%)`}
            />
            <ScoreRow
              label="Fairness Gate Readiness"
              value={fairnessGateScore}
              max={100}
              unit="%"
              color={fairnessGateScore === 100 ? 'success' : 'error'}
              msym="balance"
              detail={`Gate decision: ${gate.decision || 'ALLOW'} in ${gate.mode || 'shadow'} mode (weight: 15%)`}
            />
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--secondary)', margin: '0 0 14px' }}>
              Compliance Checklist
            </h3>
            {checklist.map((item, index) => (
              <CheckItem key={index} label={item.label} passed={item.passed} detail={item.detail} />
            ))}
          </div>
        </div>
      </div>

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
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Total Violations</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: totalViolations > 0 ? 'var(--warning)' : 'var(--success)', fontFamily: 'var(--font-headline)' }}>{totalViolations}</p>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--on-surface-variant)' }}>Gate Evaluations</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: gate.allowed ? 'var(--success)' : 'var(--error)', fontFamily: 'var(--font-headline)' }}>
            {gateMetrics.total_evaluations || 0}
          </p>
        </div>
      </div>

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Dataset Score"
        subtitle="This score is only for fairness datasets and deterministic fairness controls."
        sections={[
          {
            title: 'How to generate score data',
            steps: [
              'Upload one or more datasets from Dataset Management > Fairness.',
              'Run fairness analysis so each dataset gets a risk level and violation report.',
              'Run mitigation where needed so effectiveness can be measured by metric deltas.',
              'Recalculate score after each new analysis/mitigation cycle.',
            ],
          },
          {
            title: 'How to read the score',
            steps: [
              'Fairness Analysis Coverage tracks how much of your dataset inventory is actually analyzed.',
              'Fairness Compliance Quality is higher when risk levels are lower and violation counts are lower.',
              'Mitigation Effectiveness measures whether fairness deltas moved in the right direction after mitigation.',
              'Fairness Gate Readiness reflects deterministic gate decision status (ALLOW vs BLOCK).',
            ],
          },
        ]}
      />
    </motion.div>
  );
}
