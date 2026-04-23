import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function ReplayPage({ workflowId, onSelectWorkflow, workflows = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  const replayableWorkflows = useMemo(
    () => (workflows || []).filter((workflow) => Boolean(workflow.id)),
    [workflows]
  );

  useEffect(() => {
    if (!workflowId) return;
    let timer;
    if (playing && data?.timeline?.length) {
      timer = setInterval(() => {
        setCursor((prev) => {
          if (prev >= data.timeline.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 750);
    }
    return () => clearInterval(timer);
  }, [playing, data]);

  useEffect(() => {
    async function loadReplay() {
      if (!workflowId) return;
      setLoading(true);
      setError('');
      try {
        const result = await api(`/api/replay/${workflowId}`);
        setData(result);
        setCursor(0);
        setPlaying(false);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadReplay();
  }, [workflowId]);

  const visibleTimeline = (data?.timeline || []).slice(0, cursor + 1);

  function exportJson() {
    if (!workflowId) return;
    window.open(`/api/compliance/export/${workflowId}?format=json`, '_blank');
  }

  function exportPdf() {
    if (!workflowId) return;
    window.open(`/api/compliance/export/${workflowId}?format=pdf`, '_blank');
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="card p-4 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Incident Replay + Compliance Export</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <select
            value={workflowId || ''}
            onChange={(e) => onSelectWorkflow?.(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs"
            style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.2)', color: 'var(--on-surface)' }}
          >
            <option value="">Select workflow...</option>
            {replayableWorkflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name} ({workflow.id.slice(0, 10)})
              </option>
            ))}
          </select>
          <button className="btn-ghost text-xs" onClick={() => setPlaying((p) => !p)} disabled={!data?.timeline?.length}>
            <M icon={playing ? 'pause' : 'play_arrow'} style={{ fontSize: 14 }} />{playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn-ghost text-xs" onClick={() => setCursor((c) => Math.min(c + 1, (data?.timeline?.length || 1) - 1))} disabled={!data?.timeline?.length}>
            <M icon="skip_next" style={{ fontSize: 14 }} />Step
          </button>
          <button className="btn-ghost text-xs" onClick={exportJson} disabled={!workflowId}>
            <M icon="download" style={{ fontSize: 14 }} />Export JSON
          </button>
          <button className="btn-primary text-xs" onClick={exportPdf} disabled={!workflowId}>
            <M icon="picture_as_pdf" style={{ fontSize: 14 }} />Export PDF
          </button>
        </div>
      </div>

      {loading && <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>Loading replay...</p>}
      {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}

      {data && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-[0.1em]">Timeline</h3>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>
              {cursor + 1}/{data.timeline.length} events
            </span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {visibleTimeline.map((event, idx) => {
              const isContainment = ['SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED', 'FLAGGED'].includes(event.event_type);
              return (
                <div
                  key={`${event.timestamp}-${event.event_type}-${idx}`}
                  className="p-3 rounded-xl"
                  style={{
                    background: isContainment ? 'rgba(255,180,171,0.08)' : 'var(--surface-container-high)',
                    border: `1px solid ${isContainment ? 'rgba(255,180,171,0.25)' : 'rgba(70,69,85,0.12)'}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: isContainment ? 'var(--error)' : 'var(--primary)' }}>
                      {event.event_type}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{new Date(event.timestamp).toLocaleTimeString()}</p>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                    source: {event.source} | token: {String(event.token_id || 'n/a').slice(0, 16)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
