import React, { useState } from 'react';
import InstructionsDialog from '../components/InstructionsDialog.jsx';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function GovernancePage({ activeTab, onSelectTab, scoreView, fairnessView }) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Dataset Analysis</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Check if your AI model's decisions are fair across different groups of people, and see your overall compliance score.
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => onSelectTab('fairness')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'fairness' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'fairness' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="balance" style={{ fontSize: 14 }} /> Fairness
        </button>
        <button
          onClick={() => onSelectTab('score')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'score' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'score' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="verified" style={{ fontSize: 14 }} /> Score
        </button>
      </div>

      {/* Contextual explanation */}
      <div className="p-3 rounded-xl mb-5 flex items-start gap-2.5" style={{ background: 'rgba(20,209,255,0.04)', border: '1px solid rgba(20,209,255,0.1)' }}>
        <M icon={activeTab === 'fairness' ? 'balance' : 'verified'} style={{ fontSize: 15, color: 'var(--secondary)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          {activeTab === 'fairness'
            ? 'Upload a dataset (like a list of loan decisions) and tell the system which columns to check for bias (like gender or age). TokenFlow will mathematically measure whether the AI is treating different groups fairly, and can help fix any unfairness it finds.'
            : 'This is your dataset compliance report card. It shows how well your dataset governance is doing based on whether you\'ve run fairness tests, fixed any issues found, and addressed flagged violations. A higher score means better compliance.'
          }
        </p>
      </div>

      {activeTab === 'fairness' ? fairnessView : scoreView}

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Dataset Management"
        subtitle="Upload datasets, check for bias, and track your fairness compliance score."
        sections={[
          {
            title: 'Fairness — Check if your AI is fair',
            steps: [
              'Upload a dataset file (CSV or JSON) — for example, a list of loan applications with outcomes.',
              'Map your columns: tell the system which column is the record ID, which is the actual outcome, and which is the AI\'s prediction.',
              'Add "protected attributes" — these are the groups you want to check for bias (like gender, age, or ethnicity). Each must have at least 2 different values.',
              'Click "Run Analysis" — TokenFlow will calculate whether the AI treats each group equally using standard fairness metrics.',
              'If bias is found, click "Run Mitigation" to automatically adjust decision thresholds and reduce unfairness.',
            ],
          },
          {
            title: 'Score — Your compliance report card',
            steps: [
              'The score automatically updates based on what you\'ve done in the Fairness tab.',
              'Running fairness analysis, fixing violations, and applying mitigations all improve your score.',
              'Check the detailed checklist to see exactly which requirements are met and which still need work.',
            ],
          },
        ]}
      />
    </div>
  );
}
