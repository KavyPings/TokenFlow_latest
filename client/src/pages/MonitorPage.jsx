import React, { useState } from 'react';
import InstructionsDialog from '../components/InstructionsDialog.jsx';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function MonitorPage({ activeTab, onSelectTab, overviewView, securityView }) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Scope: Workflow Information</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Monitor shows workflow operations only (including tokenchain context). Dataset fairness information is shown in Dataset Management.
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => onSelectTab('overview')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'overview' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'overview' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="dashboard" style={{ fontSize: 14 }} /> Overview
        </button>
        <button
          onClick={() => onSelectTab('security')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'security' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'security' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="policy" style={{ fontSize: 14 }} /> Security
        </button>
      </div>
      {activeTab === 'overview' ? overviewView : securityView}

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Monitor"
        subtitle="Monitor is workflow-focused. It does not score or analyze datasets."
        sections={[
          {
            title: 'Overview tab',
            steps: [
              'Review high-level workflow health, intercepts, and live activity.',
              'Use quick actions to jump to workflow launch or token chain inspection.',
            ],
          },
          {
            title: 'Security tab',
            steps: [
              'Inspect flagged workflows and read full audit evidence.',
              'Resume or revoke paused workflows based on security review.',
            ],
          },
        ]}
      />
    </div>
  );
}
