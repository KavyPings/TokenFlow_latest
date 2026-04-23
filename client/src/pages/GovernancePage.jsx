import React from 'react';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function GovernancePage({ activeTab, onSelectTab, scoreView, fairnessView }) {
  return (
    <div>
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
    </div>
  );
}
