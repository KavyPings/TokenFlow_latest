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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Live Monitoring</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Watch what your AI workflows are doing right now. See which ones are running, which got flagged, and take action if something looks wrong.
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
          <M icon="policy" style={{ fontSize: 14 }} /> Security Review
        </button>
      </div>

      {/* Contextual explanation bar */}
      <div className="p-3 rounded-xl mb-5 flex items-start gap-2.5" style={{ background: 'rgba(196,192,255,0.04)', border: '1px solid rgba(196,192,255,0.1)' }}>
        <M icon={activeTab === 'overview' ? 'info' : 'shield'} style={{ fontSize: 15, color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          {activeTab === 'overview'
            ? 'This is your command center. It shows a summary of all workflow activity — how many are running, how many tokens have been used, and if anything was flagged for review. Think of it as a live dashboard for your AI operations.'
            : 'When an AI workflow tries to do something unauthorized (like accessing data it shouldn\'t), it gets paused and sent here for human review. You can look at the evidence and decide: resume the workflow if it\'s safe, or permanently block it.'
          }
        </p>
      </div>

      {activeTab === 'overview' ? overviewView : securityView}

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Monitor"
        subtitle="Your live dashboard for watching AI workflows and handling security alerts."
        sections={[
          {
            title: 'Overview — What\'s happening right now',
            steps: [
              'See how many workflows are currently running, completed, or flagged.',
              'Check the number of tokens (permission slips) that have been created and used up.',
              'View recent activity to see what your AI agents have been doing.',
              'Click any panel to jump directly to the relevant section for more details.',
            ],
          },
          {
            title: 'Security Review — Handle flagged workflows',
            steps: [
              'If an AI workflow does something suspicious, it appears here automatically.',
              'Read the details to understand exactly what the AI tried to do and why it was blocked.',
              'Click "Resume" if you trust the action and want to let the workflow continue.',
              'Click "Revoke" to permanently shut down the workflow and destroy its tokens.',
            ],
          },
        ]}
      />
    </div>
  );
}
