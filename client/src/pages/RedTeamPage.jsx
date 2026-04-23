import { useState } from 'react';
import { api } from '../api.js';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function RedTeamPage({ onOpenReplay }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [campaign, setCampaign] = useState(null);

  async function runCampaign() {
    setRunning(true);
    setError('');
    try {
      const result = await api('/api/redteam/run', { method: 'POST' });
      setCampaign(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="card p-6 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Red-Team Simulation Mode</p>
        <h2 className="text-xl font-bold font-headline mt-1 mb-2">One-click attack campaign</h2>
        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
          Runs all attack scenarios, measures containment, and summarizes blocked behavior for judge demos.
        </p>
        <button onClick={runCampaign} disabled={running} className="btn-primary mt-4">
          <M icon="play_arrow" style={{ fontSize: 16 }} />
          {running ? 'Running Red-Team Campaign...' : 'Run Red-Team Campaign'}
        </button>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--error)' }}>{error}</p>}
      </div>

      {campaign && (
        <>
          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <Metric label="Scenarios" value={campaign.summary?.total ?? 0} />
            <Metric label="Blocked" value={campaign.summary?.blocked_count ?? 0} tone="success" />
            <Metric label="Failed invariants" value={campaign.summary?.failed_invariants ?? 0} tone="error" />
            <Metric
              label="Mean containment"
              value={campaign.summary?.mean_containment_ms != null ? `${campaign.summary.mean_containment_ms}ms` : 'n/a'}
              tone="secondary"
            />
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] mb-3">Scenario outcomes</h3>
            <div className="space-y-2">
              {(campaign.scenarios || []).map((item) => (
                <div
                  key={item.scenario_id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)' }}
                >
                  <M icon={item.blocked ? 'shield' : 'warning'} style={{ fontSize: 16, color: item.blocked ? 'var(--success)' : 'var(--warning)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{item.scenario_name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>
                      status: {item.status} | workflow: {item.workflow_status || 'n/a'} | containment: {item.containment_ms ?? 'n/a'}ms
                    </p>
                  </div>
                  {item.workflow_id && (
                    <button className="btn-ghost text-[10px]" onClick={() => onOpenReplay?.(item.workflow_id)}>
                      Open replay
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = 'primary' }) {
  const color = tone === 'success'
    ? 'var(--success)'
    : tone === 'error'
      ? 'var(--error)'
      : tone === 'secondary'
        ? 'var(--secondary)'
        : 'var(--primary)';

  return (
    <div className="card p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--outline)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}
