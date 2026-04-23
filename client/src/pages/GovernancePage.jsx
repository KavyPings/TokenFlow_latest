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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Scope: Dataset Information</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Dataset Management shows fairness testing, mitigation, and dataset-only governance scoring (no workflow tokenchain data).
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => onSelectTab('score')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'score' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'score' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="verified" style={{ fontSize: 14 }} /> Score
        </button>
        <button
          onClick={() => onSelectTab('fairness')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${activeTab === 'fairness' ? 'btn-primary' : 'btn-ghost'}`}
          style={activeTab !== 'fairness' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="balance" style={{ fontSize: 14 }} /> Fairness
        </button>
      </div>
      {activeTab === 'score' ? scoreView : fairnessView}

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Dataset Management"
        subtitle="Dataset Management is dataset-focused. Workflow tokenchain score is in Workflow Management."
        sections={[
          {
            title: 'Fairness tab',
            steps: [
              'Upload datasets and map schema fields correctly.',
              'Run fairness analysis and review generated violations.',
              'Apply mitigation and re-analyze to compare outcomes.',
            ],
          },
          {
            title: 'Score tab',
            steps: [
              'Use Dataset Score to monitor testing coverage and mitigation adoption.',
              'Resolve high-severity queue items to improve score and gate posture.',
            ],
          },
        ]}
      />
    </div>
  );
}
