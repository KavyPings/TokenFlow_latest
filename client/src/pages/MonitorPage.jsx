import React from 'react';

function M({ icon, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>;
}

export default function MonitorPage({ activeTab, onSelectTab, overviewView, securityView }) {
  return (
    <div>
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
    </div>
  );
}
