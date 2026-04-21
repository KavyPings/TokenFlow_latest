import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  RefreshCcw,
} from 'lucide-react';
import { api, getWebSocketUrl } from './api.js';
import LandingPage from './pages/LandingPage.jsx';
import TestbenchPage from './pages/TestbenchPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import IncidentPage from './pages/IncidentPage.jsx';
import FairnessPage from './pages/FairnessPage.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';

/* ─── Interactive Particle Canvas ─── */
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    let mouse = { x: W / 2, y: H / 2 };
    const N = 80;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
    }));
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('mousemove', onMove);
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) { p.vx += dx / dist * 0.04; p.vy += dy / dist * 0.04; }
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196,192,255,0.35)';
        ctx.fill();
      });
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(196,192,255,${0.06 * (1 - d / 100)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={canvasRef} id="particle-canvas" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}

/* ─── Material Symbol shortcut ─── */
const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */
const STEP_ORDER = ['READ_OBJECT', 'CALL_INTERNAL_API', 'WRITE_OBJECT'];

const STEP_META = {
  READ_OBJECT: { label: 'Read Applicant Record', msym: 'folder_open', service: 'Cloud Storage / GCS', desc: 'Load applicant data via vault-brokered GCS credential', phase: '01' },
  CALL_INTERNAL_API: { label: 'Gemini Credit Scoring', msym: 'psychology', service: 'Gemini 1.5 Flash', desc: 'AI assesses credit risk — fairness flags checked', phase: '02' },
  WRITE_OBJECT: { label: 'Write Decision', msym: 'check_circle', service: 'Cloud Storage / GCS', desc: 'Record loan decision — agent never held credentials', phase: '03' },
  READ_REPO: { label: 'Exfiltrate Credentials', msym: 'dangerous', service: 'Source Control', desc: 'BLOCKED — unauthorized access attempt intercepted', phase: 'XX' },
};

// 7 tabs — added Scoring
const NAV_ITEMS = [
  { id: 'home', label: 'Home', msym: 'home' },
  { id: 'dashboard', label: 'Dashboard', msym: 'space_dashboard' },
  { id: 'security', label: 'Security', msym: 'shield', badgeKey: 'alerts' },
  { id: 'testbench', label: 'Testbench', msym: 'science' },
  { id: 'fairness', label: 'Fairness', msym: 'balance' },
  { id: 'incident', label: 'Incident', msym: 'gpp_bad' },
  { id: 'scoring', label: 'Score', msym: 'verified' },
];

/* ═══════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [page, setPage] = useState('home');
  const [overview, setOverview] = useState(null);
  const [health, setHealth] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('SCENARIO-002');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [chain, setChain] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [socketState, setSocketState] = useState('connecting');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('tf_onboarded'));
  const [fairnessAlert, setFairnessAlert] = useState(null);
  const refreshTimeoutRef = useRef(null);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId);

  const workflows = overview?.workflows || [];
  const chainWorkflows = workflows.filter((workflow) => !workflow.hidden_from_chain);
  const currentWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0] || null;
  const currentChainWorkflow = chainWorkflows.find((workflow) => workflow.id === selectedWorkflowId) || chainWorkflows[0] || null;
  const reviewQueue = overview?.reviewQueue || [];
  const currentReview = reviewQueue.find((i) => i.workflowId === selectedWorkflowId) || reviewQueue[0] || null;
  const credentials = overview?.credentials || [];
  const chainNodes = buildChainNodes(chain);

  const loadDashboard = useCallback(async (preferredId) => {
    const [o, h, t] = await Promise.all([
      api('/api/dashboard/overview'), api('/api/health'), api('/api/workflows/tasks/list'),
    ]);
    setOverview(o); setHealth(h); setTasks(t.tasks || []);
    if (preferredId) { setSelectedWorkflowId(preferredId); return o; }
    setSelectedWorkflowId((c) => (c && o.workflows.some((w) => w.id === c)) ? c : o.workflows[0]?.id || null);
    return o;
  }, []);

  const loadChain = useCallback(async (wfId) => {
    if (!wfId) { setChain([]); setAudit([]); return; }
    const [c, a] = await Promise.all([api(`/api/tokens/chain/${wfId}`), api(`/api/tokens/audit?workflowId=${wfId}`)]);
    setChain(c.chain || []); setAudit(a.audit_log || []);
  }, []);

  useEffect(() => { loadDashboard().catch((e) => setError(e.message)); }, [loadDashboard]);
  useEffect(() => { loadChain(selectedWorkflowId).catch((e) => setError(e.message)); }, [selectedWorkflowId, loadChain]);
  useEffect(() => { selectedWorkflowIdRef.current = selectedWorkflowId; }, [selectedWorkflowId]);

  useEffect(() => {
    const ws = new WebSocket(getWebSocketUrl());
    ws.addEventListener('open', () => setSocketState('live'));
    ws.addEventListener('close', () => setSocketState('offline'));
    ws.addEventListener('error', () => setSocketState('degraded'));
    ws.addEventListener('message', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'SECURITY_VIOLATION' && d.payload?.workflowType !== 'testbench') {
          setNotice('Security violation detected — review queue updated.');
        }
        if (d.type === 'FAIRNESS_FLAG') {
          setFairnessAlert(d.payload);
          setNotice(`Fairness signal detected for ${d.payload?.applicant || 'applicant'} — review recommended.`);
          setTimeout(() => setFairnessAlert(null), 8000);
        }
        if (d.type === 'DECISION_MADE') {
          setNotice(`Loan decision: ${d.payload?.decision?.toUpperCase() || 'PROCESSED'} for ${d.payload?.applicant || 'applicant'}`);
        }
      } catch { }
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        loadDashboard().then(() => loadChain(selectedWorkflowIdRef.current)).catch((err) => setError(err.message));
      }, 300);
    });
    return () => { clearTimeout(refreshTimeoutRef.current); ws.close(); };
  }, [loadDashboard, loadChain]);

  useEffect(() => { if (!notice && !error) return; const t = setTimeout(() => { setNotice(''); setError(''); }, 5000); return () => clearTimeout(t); }, [notice, error]);

  async function withBusy(name, fn) { setBusyAction(name); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusyAction(''); } }

  function handleStart() {
    withBusy('start', async () => {
      const r = await api('/api/workflows/start', { method: 'POST', body: JSON.stringify({ taskId: selectedTask }) });
      setNotice(`Workflow ${r.workflowId} started.`);
      setSelectedWorkflowId(r.workflowId);
      await loadDashboard(r.workflowId);
      await loadChain(r.workflowId);
    });
  }

  function handleResume(id) { withBusy('resume', async () => { await api(`/api/workflows/${id}/resume`, { method: 'POST' }); setNotice('Workflow resumed.'); await loadDashboard(id); await loadChain(id); }); }
  function handleRevoke(id) { withBusy('revoke', async () => { await api(`/api/workflows/${id}/revoke`, { method: 'POST' }); setNotice('Workflow aborted.'); await loadDashboard(id); await loadChain(id); }); }
  function handleKill(id) { if (!id) return; withBusy('kill', async () => { await api(`/api/workflows/${id}/kill`, { method: 'POST' }); setNotice('Kill switch engaged.'); await loadDashboard(id); await loadChain(id); }); }

  async function handleUploadedWorkflowRun(uploadedWorkflowId) {
    const result = await api(`/api/workflows/upload/${uploadedWorkflowId}/run`, { method: 'POST' });
    setSelectedWorkflowId(result.workflowId);
    await loadDashboard(result.workflowId);
    await loadChain(result.workflowId);
    setNotice(`Uploaded workflow ${result.taskData?.name || uploadedWorkflowId} started.`);
    setPage('dashboard');
    return result;
  }

  function handleClearWorkflows() {
    withBusy('clear-workflows', async () => {
      const result = await api('/api/workflows/clear', { method: 'POST' });
      const updatedOverview = await loadDashboard();
      const visibleWorkflows = (updatedOverview?.workflows || []).filter((workflow) => !workflow.hidden_from_chain);
      const nextId = selectedWorkflowIdRef.current && visibleWorkflows.some((w) => w.id === selectedWorkflowIdRef.current)
        ? selectedWorkflowIdRef.current
        : (visibleWorkflows.find((w) => w.status === 'running' || w.status === 'paused')?.id || visibleWorkflows[0]?.id || null);
      setNotice(result.count ? `Cleared ${result.count} settled workflow${result.count === 1 ? '' : 's'}.` : 'No settled workflows to clear.');
      setSelectedWorkflowId(nextId);
      await loadChain(nextId);
    });
  }

  function handleClearAuditLog() {
    withBusy('clear-audit', async () => {
      const result = await api('/api/tokens/audit/clear', { method: 'POST' });
      await loadDashboard(selectedWorkflowIdRef.current);
      await loadChain(selectedWorkflowIdRef.current);
      setNotice(result.count ? `Cleared ${result.count} audit event${result.count === 1 ? '' : 's'}.` : 'Audit log already empty.');
    });
  }

  function handleRefresh() { withBusy('refresh', async () => { await loadDashboard(); await loadChain(selectedWorkflowId); setNotice('Refreshed.'); }); }

  function handleDemoReset() {
    withBusy('demo-reset', async () => {
      await api('/api/demo/reset', { method: 'POST' });
      await loadDashboard();
      setSelectedWorkflowId(null);
      setChain([]);
      setAudit([]);
      setNotice('Demo reset — all state cleared. Ready for a fresh run.');
    });
  }

  function handleRunAttack() {
    setSelectedTask('SCENARIO-002');
    setPage('dashboard');
    // Auto-start after a brief nav delay
    setTimeout(() => {
      withBusy('start', async () => {
        const r = await api('/api/workflows/start', { method: 'POST', body: JSON.stringify({ taskId: 'SCENARIO-002' }) });
        setNotice('Double Agent attack scenario started — watch the chain.');
        setSelectedWorkflowId(r.workflowId);
        await loadDashboard(r.workflowId);
        await loadChain(r.workflowId);
      });
    }, 400);
  }

  const alertCount = reviewQueue.length;
  const showRefreshButton = socketState === 'offline' || socketState === 'degraded';

  return (
    <div className="app-shell min-h-screen">
      <ParticleCanvas />

      {/* ─── Onboarding Wizard ─── */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWizard
            onFinish={() => setShowOnboarding(false)}
            onRunAttack={() => { setShowOnboarding(false); handleRunAttack(); }}
          />
        )}
      </AnimatePresence>

      {/* ─── Fairness Alert Banner ─── */}
      <AnimatePresence>
        {fairnessAlert && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className="fixed top-16 left-1/2 z-40 -translate-x-1/2"
            style={{ width: 'min(480px, calc(100vw - 2rem))' }}>
            <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}>
              <M icon="warning" style={{ color: 'var(--warning)', fontSize: 20, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: 'var(--warning)' }}>Fairness Signal Detected</p>
                <p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>
                  {fairnessAlert.applicant} — score {fairnessAlert.score} — {fairnessAlert.recommendation} — Human review recommended
                </p>
              </div>
              <button onClick={() => setFairnessAlert(null)} className="text-[10px]" style={{ color: 'var(--outline)' }}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ─── Floating Top Navbar ─── */}
      <nav className="top-navbar">
        <div className="flex items-center gap-3">
          <M icon="security" style={{ color: 'var(--primary)', fontSize: 22 }} />
          <span className="text-base font-bold tracking-[0.15em] uppercase font-headline" style={{ color: 'var(--on-surface)' }}>TokenFlow</span>
        </div>
        <div className="nav-pills">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setPage(item.id)} className={`nav-pill ${page === item.id ? 'active' : ''}`}>
              {item.label}
              {item.badgeKey === 'alerts' && alertCount > 0 && <span className="badge-dot" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {showRefreshButton && (
            <button onClick={handleRefresh} disabled={busyAction === 'refresh'} className="btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem' }}>
              <RefreshCcw className="h-3 w-3" /> Refresh
            </button>
          )}
          <button
            onClick={handleDemoReset}
            disabled={!!busyAction}
            className="btn-ghost"
            title="Reset all demo state"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', color: 'var(--warning)', borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}
          >
            <M icon="restart_alt" style={{ fontSize: 14 }} /> Reset Demo
          </button>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{
              background: socketState === 'live' ? 'var(--success)' : 'var(--error)',
              boxShadow: socketState === 'live' ? '0 0 6px var(--success)' : '0 0 6px var(--error)',
              animation: socketState === 'live' ? 'pulse-subtle 2s infinite' : 'none',
            }} />
            <span className="text-[9px] font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--on-surface-variant)' }}>{socketState}</span>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {(notice || error) && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`toast ${error ? 'toast-error' : 'toast-info'}`}>
            <div className="flex items-center gap-2">
              <M icon={error ? 'error' : 'check_circle'} style={{ fontSize: 16 }} />
              {error || notice}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="main-wrap">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            className="page-stage"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {page === 'home' && <LandingPage key="home" onEnter={setPage} />}
            {page === 'dashboard' && (
              <DashboardPage
                key="d"
                workflows={workflows}
                chainWorkflows={chainWorkflows}
                reviewQueue={reviewQueue}
                credentials={credentials}
                health={health}
                currentWorkflow={currentWorkflow}
                currentChainWorkflow={currentChainWorkflow}
                chainNodes={chainNodes}
                audit={audit}
                socketState={socketState}
                tasks={tasks}
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
                selectedWorkflowId={selectedWorkflowId}
                setSelectedWorkflowId={setSelectedWorkflowId}
                onStart={handleStart}
                onKill={() => handleKill(currentWorkflow?.id)}
                onClearWorkflows={handleClearWorkflows}
                busyAction={busyAction}
                setPage={setPage}
              />
            )}
            {page === 'security' && (
              <SecurityPage
                key="s"
                currentReview={currentReview}
                reviewQueue={reviewQueue}
                workflows={workflows}
                selectedWorkflowId={selectedWorkflowId}
                setSelectedWorkflowId={setSelectedWorkflowId}
                audit={audit}
                onResume={handleResume}
                onRevoke={handleRevoke}
                onClearAudit={handleClearAuditLog}
                busyAction={busyAction}
              />
            )}
            {page === 'testbench' && (
              <TestbenchWithUpload
                key="tb"
                setPage={setPage}
                onRunUploadedWorkflow={handleUploadedWorkflowRun}
              />
            )}
            {page === 'fairness' && <FairnessPage key="fair" />}
            {page === 'incident' && <IncidentPage key="inc" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Testbench + Upload (tabbed wrapper)
   ═══════════════════════════════════════════════════════════ */
function TestbenchWithUpload({ setPage, onRunUploadedWorkflow }) {
  const [tab, setTab] = useState('scenarios');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('scenarios')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all ${tab === 'scenarios' ? 'btn-primary' : 'btn-ghost'}`}
          style={tab !== 'scenarios' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="science" style={{ fontSize: 14 }} /> Scenarios
        </button>
        <button
          onClick={() => setTab('upload')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all ${tab === 'upload' ? 'btn-primary' : 'btn-ghost'}`}
          style={tab !== 'upload' ? { padding: '0.5rem 1.25rem' } : {}}
        >
          <M icon="upload_file" style={{ fontSize: 14 }} /> Upload Custom
        </button>
      </div>
      <AnimatePresence mode="wait">
        {tab === 'scenarios' && (
          <motion.div key="scenarios" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <TestbenchPage />
          </motion.div>
        )}
        {tab === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <UploadPage setPage={setPage} onRunUploadedWorkflow={onRunUploadedWorkflow} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE: Dashboard (with internal tabs: Overview | Chain | Launch)
   ═══════════════════════════════════════════════════════════ */
function DashboardPage({
  workflows, chainWorkflows, reviewQueue, credentials, health,
  currentWorkflow, currentChainWorkflow, chainNodes, audit, socketState,
  tasks, selectedTask, setSelectedTask, selectedWorkflowId, setSelectedWorkflowId,
  onStart, onKill, onClearWorkflows, busyAction, setPage,
}) {
  const [tab, setTab] = useState('overview');

  const totalTokens = workflows.reduce((s, w) => s + Object.values(w.token_summary || {}).reduce((a, b) => a + b, 0), 0);
  const burnedTokens = workflows.reduce((s, w) => s + (w.token_summary?.burned || 0), 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Internal tab bar */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'overview', label: 'Overview', msym: 'space_dashboard' },
          { id: 'chain', label: 'Token Chain', msym: 'token' },
          { id: 'launch', label: 'Launch', msym: 'play_arrow' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={tab !== t.id ? { padding: '0.5rem 1.25rem' } : {}}
          >
            <M icon={t.msym} style={{ fontSize: 14 }} />{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <OverviewTab
              workflows={workflows}
              reviewQueue={reviewQueue}
              credentials={credentials}
              health={health}
              currentWorkflow={currentWorkflow}
              chainNodes={chainNodes}
              audit={audit}
              socketState={socketState}
              totalTokens={totalTokens}
              burnedTokens={burnedTokens}
              onKill={onKill}
              busyAction={busyAction}
              setTab={setTab}
              setPage={setPage}
              setSelectedWorkflowId={setSelectedWorkflowId}
            />
          </motion.div>
        )}
        {tab === 'chain' && (
          <motion.div key="chain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ChainTab
              workflows={chainWorkflows}
              chainNodes={chainNodes}
              currentWorkflow={currentChainWorkflow}
              selectedWorkflowId={selectedWorkflowId}
              setSelectedWorkflowId={setSelectedWorkflowId}
              audit={audit}
              onKill={onKill}
              onClearWorkflows={onClearWorkflows}
              busyAction={busyAction}
            />
          </motion.div>
        )}
        {tab === 'launch' && (
          <motion.div key="launch" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <LaunchTab
              tasks={tasks}
              selectedTask={selectedTask}
              setSelectedTask={setSelectedTask}
              onStart={onStart}
              busyAction={busyAction}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Dashboard: Overview Tab ─── */
function OverviewTab({ workflows, reviewQueue, credentials, health, currentWorkflow, chainNodes, audit, socketState, totalTokens, burnedTokens, onKill, busyAction, setTab, setPage, setSelectedWorkflowId }) {
  const liveNodes = chainNodes.length ? chainNodes : STEP_ORDER.map((action, i) => ({ id: `preview-${action}-${i}`, action, status: 'pending', token: null }));
  const recentEvents = audit.slice(-4).reverse();
  const progress = chainNodes.length ? Math.round((chainNodes.filter((n) => n.status === 'burned').length / chainNodes.length) * 100) : 0;

  return (
    <div>
      {/* Hero section */}
      <section className="hero-grid mb-8">
        <div className="hero-section hero-stage text-center md:text-left relative">
          <div className="hero-copy relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6" style={{ background: 'rgba(20, 209, 255, 0.08)', border: '1px solid rgba(166, 230, 255, 0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: 'var(--secondary)' }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--secondary)' }}>Protocol Active</span>
            </div>
            <h1 className="font-headline text-4xl md:text-6xl font-bold tracking-tighter mb-5 leading-tight" style={{ color: 'var(--on-surface)' }}>
              Secure AI Agents<br /><span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>Before They Act</span>
            </h1>
            <p className="text-sm md:text-base max-w-xl md:mx-0 mx-auto mb-8 leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
              Every agent action is restricted by a single-use capability token. Cross-service access is blocked. Credentials never leave the vault.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-8">
              <button onClick={() => setTab('launch')} className="btn-primary"><M icon="play_arrow" style={{ fontSize: 18 }} /> Launch Execution</button>
              <button onClick={() => setTab('chain')} className="btn-ghost"><M icon="token" style={{ fontSize: 18 }} /> View Chain</button>
            </div>
            <div className="hero-flow-strip">
              {liveNodes.map((node, index) => {
                const meta = STEP_META[node.action] || {};
                const tone = node.status === 'flagged' || node.status === 'revoked'
                  ? 'var(--error)'
                  : node.status === 'burned'
                    ? 'var(--success)'
                    : node.status === 'active'
                      ? 'var(--secondary)'
                      : 'var(--outline)';
                return (
                  <motion.div key={node.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * index }} className="hero-phase-chip">
                    <span className="hero-phase-index" style={{ color: tone }}>{meta.phase || String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="hero-phase-title">{meta.label || node.action}</p>
                      <p className="hero-phase-meta" style={{ color: tone }}>{node.status}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ops-panel card">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Live Control Room</p>
              <h3 className="font-headline text-2xl font-bold mt-2">Mission status stays visible while the chain moves.</h3>
            </div>
            <div className="ops-live-pill">
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: socketState === 'live' ? 'var(--success)' : 'var(--warning)' }} />
              {socketState}
            </div>
          </div>

          <div className="signal-grid mb-5">
            <SignalMetric label="Chain progress" value={`${progress}%`} hint={currentWorkflow ? 'burned through execution' : 'waiting for a workflow'} tone={progress === 100 ? 'success' : 'primary'} msym="token" />
            <SignalMetric label="Review pressure" value={reviewQueue.length ? `${reviewQueue.length} queued` : '0 queued'} hint={reviewQueue.length ? 'manual intervention required' : 'no pending intercepts'} tone={reviewQueue.length ? 'danger' : 'success'} msym="shield" />
            <SignalMetric label="Vault mode" value={health?.auth0 ? String(health.auth0).toUpperCase() : 'ONLINE'} hint={`${credentials.length} secrets backend-only`} tone="secondary" msym="lock" />
            <SignalMetric label="Execution" value={currentWorkflow?.status || 'idle'} hint={currentWorkflow ? currentWorkflow.id.slice(0, 14) : 'select Launch to start'} tone={currentWorkflow?.status === 'paused' ? 'warning' : 'neutral'} msym="hub" />
          </div>

          <div className="ops-stream mb-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold uppercase tracking-[0.12em]">Recent transmission</h4>
              <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{recentEvents.length ? `${recentEvents.length} events` : 'awaiting activity'}</span>
            </div>
            {recentEvents.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Launch a workflow and this panel will fill with token events in real time.</p>
            ) : (
              <div className="space-y-2">
                {recentEvents.map((entry) => (
                  <StreamRow key={`${entry.id}-${entry.timestamp}`} entry={entry} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => setTab('chain')} className="btn-primary">
              <M icon="north_east" style={{ fontSize: 16 }} /> {currentWorkflow ? 'Open Active Chain' : 'View Chain'}
            </button>
            <button onClick={() => setPage('security')} className="btn-ghost">
              <M icon="policy" style={{ fontSize: 16 }} /> Security Log
            </button>
            {currentWorkflow && (
              <button onClick={onKill} disabled={busyAction === 'kill'} className="btn-danger">
                <M icon="local_fire_department" style={{ fontSize: 16 }} /> {busyAction === 'kill' ? 'Halting...' : 'Kill Switch'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <MetricCard label="Workflows" value={workflows.length} msym="hub" color="primary" sub="Execution chains" delay={0} />
        <MetricCard label="Intercepts" value={reviewQueue.length} msym="shield" color="error" sub="Flagged for review" delay={1} />
        <MetricCard label="Tokens" value={totalTokens} msym="key_visualizer" color="secondary" sub={`${burnedTokens} burned`} delay={2} />
        <MetricCard label="Credentials" value={credentials.length} msym="lock" color="success" sub="Isolated services" delay={3} />
      </div>

      {/* Active workflows */}
      <div className="card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--on-surface)' }}>Active Workflows</h3>
          <button onClick={() => setTab('chain')} className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 transition-all hover:gap-2" style={{ color: 'var(--primary)' }}>
            View chain <ChevronRight className="h-3 w-3" /></button>
        </div>
        {workflows.length === 0 ? (
          <EmptyState msym="hub" text="No workflows yet. Launch a task to begin." action="Launch" onAction={() => setTab('launch')} />
        ) : (
          <div className="space-y-2">
            {workflows.slice(0, 5).map((w) => (
              <motion.div key={w.id} whileHover={{ x: 4 }} className="flex items-center gap-4 p-3 rounded-xl card-interactive"
                style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)', cursor: 'pointer' }}
                onClick={() => { setSelectedWorkflowId(w.id); setTab('chain'); }}>
                <div className="p-2 rounded-lg" style={{ background: 'rgba(196,192,255,0.1)' }}>
                  <M icon="hub" style={{ color: 'var(--primary)', fontSize: 16 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>{w.name}</p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--on-surface-variant)' }}>{w.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={w.status} />
                  <ChevronRight className="h-3 w-3" style={{ color: 'var(--outline)' }} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Dashboard: Chain Tab (was standalone ChainPage) ─── */
function ChainTab({ chainNodes, currentWorkflow, workflows, selectedWorkflowId, setSelectedWorkflowId, audit, onKill, onClearWorkflows, busyAction }) {
  const burnedCount = chainNodes.filter(n => n.status === 'burned').length;
  const flaggedCount = chainNodes.filter(n => n.status === 'flagged').length;
  const liveCount = chainNodes.filter((n) => n.status === 'active' || n.status === 'pending').length;
  const total = chainNodes.length || 1;
  const progress = Math.round((burnedCount / total) * 100);
  const recentEvents = audit.slice(-4).reverse();

  const cliLines = [];
  cliLines.push({ type: 'cmd', text: `tokenflow chain --workflow ${currentWorkflow?.id?.slice(0, 20) || 'none'} --live` });
  cliLines.push({ type: 'out', text: `Agent: agent-cloud-worker  |  Task: ${currentWorkflow?.name || 'N/A'}` });
  cliLines.push({ type: 'muted', text: '─'.repeat(48) });
  chainNodes.forEach((node, i) => {
    const meta = STEP_META[node.action] || {};
    if (node.status === 'burned') cliLines.push({ type: 'success', text: `[${String(i + 1).padStart(2, '0')}] ✓  ${meta.label || node.action}  →  BURNED  (${fmtTime(node.mintedAt)})` });
    else if (node.status === 'flagged' || node.status === 'revoked') cliLines.push({ type: 'error', text: `[${String(i + 1).padStart(2, '0')}] ✗  ${meta.label || node.action}  →  BLOCKED  [UNAUTHORIZED]` });
    else if (node.status === 'active') cliLines.push({ type: 'success', text: `[${String(i + 1).padStart(2, '0')}] ●  ${meta.label || node.action}  →  EXECUTING...` });
    else cliLines.push({ type: 'muted', text: `[${String(i + 1).padStart(2, '0')}] ○  ${meta.label || node.action}  →  PENDING` });
  });
  if (flaggedCount > 0) {
    cliLines.push({ type: 'muted', text: '─'.repeat(48) });
    cliLines.push({ type: 'error', text: '⚠  SECURITY VIOLATION DETECTED — workflow paused for review' });
    cliLines.push({ type: 'warn', text: '   Unauthorized cross-service access attempt intercepted.' });
  } else if (burnedCount === total && total > 0) {
    cliLines.push({ type: 'muted', text: '─'.repeat(48) });
    cliLines.push({ type: 'success', text: '✓  All tokens burned. Execution chain complete.' });
  }

  return (
    <div>
      {/* Workflow Selector */}
      {workflows.length > 0 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <span className="text-[9px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: 'var(--outline)' }}>Workflow:</span>
          {workflows.length > 1 && workflows.map(w => (
            <button key={w.id} onClick={() => setSelectedWorkflowId(w.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-bold font-mono transition-all"
              style={{
                background: w.id === selectedWorkflowId ? 'rgba(196,192,255,0.15)' : 'var(--surface-container-high)',
                border: w.id === selectedWorkflowId ? '1px solid rgba(196,192,255,0.35)' : '1px solid rgba(70,69,85,0.15)',
                color: w.id === selectedWorkflowId ? 'var(--primary)' : 'var(--on-surface-variant)',
              }}>
              {w.name ? w.name.slice(0, 24) + (w.name.length > 24 ? '…' : '') : w.id.slice(0, 18) + '…'} <StatusPill status={w.status} small />
            </button>
          ))}
          <button
            onClick={onClearWorkflows}
            disabled={busyAction === 'clear-workflows'}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1"
            style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)', color: 'var(--error)', opacity: busyAction === 'clear-workflows' ? 0.6 : 1 }}
          >
            <M icon="delete_sweep" style={{ fontSize: 12 }} /> {busyAction === 'clear-workflows' ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="card-glow-primary p-6 mb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-bold font-headline">{currentWorkflow?.name || 'No Active Workflow'}</h3>
              {currentWorkflow && <StatusPill status={currentWorkflow.status} />}
            </div>
            <p className="text-xs font-mono" style={{ color: 'var(--on-surface-variant)' }}>{currentWorkflow?.id || '—'} • Agent: agent-cloud-worker</p>
          </div>
          {currentWorkflow && (
            <button onClick={onKill} disabled={!currentWorkflow || busyAction === 'kill'} className="btn-danger animate-glow">
              <M icon="local_fire_department" style={{ fontSize: 16 }} /> {busyAction === 'kill' ? 'Halting…' : 'Kill Switch'}
            </button>
          )}
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--on-surface-variant)' }}>Chain Progress</span>
            <span className="text-xs font-bold font-mono">{progress}%</span>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${flaggedCount > 0 ? 'danger' : ''}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="signal-grid mb-5">
        <SignalMetric label="Burned tokens" value={String(burnedCount).padStart(2, '0')} hint="single-use steps completed" tone="success" msym="local_fire_department" />
        <SignalMetric label="Live steps" value={String(liveCount).padStart(2, '0')} hint="pending or executing now" tone={liveCount ? 'primary' : 'neutral'} msym="bolt" />
        <SignalMetric label="Blocked steps" value={String(flaggedCount).padStart(2, '0')} hint={flaggedCount ? 'workflow diverted to review' : 'no violations'} tone={flaggedCount ? 'danger' : 'success'} msym="shield" />
        <SignalMetric label="Recent events" value={String(recentEvents.length).padStart(2, '0')} hint={recentEvents[0] ? recentEvents[0].event_type.toLowerCase() : 'waiting for activity'} tone="secondary" msym="history" />
      </div>

      <div className="grid gap-5 md:grid-cols-2 mb-5">
        {/* Vertical Token Chain */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <M icon="token" style={{ color: 'var(--primary)', fontSize: 18 }} />
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Live Token Chain</h3>
          </div>
          <p className="text-xs mb-6" style={{ color: 'var(--on-surface-variant)' }}>Single-use capability tokens • execution DAG</p>
          <div className="timeline">
            {chainNodes.map((node, idx) => {
              const meta = STEP_META[node.action] || {};
              const isError = node.action === 'READ_REPO';
              const dotClass = node.status === 'burned' ? 'burned' : node.status === 'flagged' || node.status === 'revoked' ? 'flagged' : node.status === 'active' ? 'active' : 'idle';
              return (
                <motion.div key={node.id} className="timeline-node" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1, duration: 0.35 }}>
                  <div className={`timeline-dot ${dotClass}`}><div className="ping" /></div>
                  <div className="card p-4" style={isError ? { borderColor: 'rgba(255,180,171,0.3)' } : {}}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: isError ? 'var(--error)' : 'var(--primary)' }}>Phase {meta.phase || '??'}</span>
                      <StatusPill status={node.status} small />
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="p-1.5 rounded-lg" style={{ background: isError ? 'rgba(255,180,171,0.1)' : 'rgba(196,192,255,0.08)' }}>
                        <M icon={meta.msym || 'help'} style={{ fontSize: 15, color: isError ? 'var(--error)' : 'var(--primary)' }} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold font-headline" style={{ color: isError ? 'var(--error)' : 'var(--on-surface)' }}>{meta.label || node.action}</h4>
                        <p className="text-[9px]" style={{ color: 'var(--on-surface-variant)' }}>{meta.service}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px]" style={{ color: 'var(--outline)' }}>{node.token?.id?.slice(0, 14) || '—'}</span>
                      {node.mintedAt && <span className="text-[9px]" style={{ color: 'var(--outline)' }}>{fmtTime(node.mintedAt)}</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CLI Terminal + audit stream */}
        <div className="flex flex-col gap-4">
          <div className="cli-terminal flex-1">
            <div className="cli-titlebar">
              <span className="cli-dot cli-dot-red" /><span className="cli-dot cli-dot-yellow" /><span className="cli-dot cli-dot-green" />
              <span className="cli-titlebar-label">tokenflow-cli v2.0 — execution log</span>
            </div>
            <div className="cli-body">
              {cliLines.map((line, i) => (
                <div key={i} className={`cli-${line.type}`}>
                  {line.type === 'cmd' && <><span className="cli-prompt">$</span> <span className="cli-cmd">{line.text}</span></>}
                  {line.type !== 'cmd' && line.text}
                </div>
              ))}
              <div className="cli-out" style={{ marginTop: 4 }}><span className="cli-cursor" /></div>
            </div>
          </div>
          {currentWorkflow && (
            <div className="grid grid-cols-1 gap-3">
              <InfoCard label="Workflow ID" value={currentWorkflow.id} msym="hub" />
              <InfoCard label="Workflow" value={currentWorkflow.name || 'Unnamed Workflow'} msym="assignment" />
            </div>
          )}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold uppercase tracking-[0.12em]">Recent Transmissions</h4>
              <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{recentEvents.length ? `${recentEvents.length} events` : 'idle'}</span>
            </div>
            {recentEvents.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Audit telemetry will appear here once this chain starts moving.</p>
            ) : (
              <div className="space-y-2">
                {recentEvents.map((entry) => (
                  <StreamRow key={`${entry.id}-${entry.timestamp}`} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard: Launch Tab ─── */
function LaunchTab({ tasks, selectedTask, setSelectedTask, onStart, busyAction }) {
  const sel = tasks.find(t => t.id === selectedTask);
  const outcomeTone = {
    completed: { label: 'Expected: Complete', color: 'var(--success)', bg: 'rgba(52,211,153,0.1)' },
    paused: { label: 'Expected: Pause', color: 'var(--warning)', bg: 'rgba(251,191,36,0.12)' },
    aborted: { label: 'Expected: Abort', color: 'var(--error)', bg: 'rgba(255,180,171,0.12)' },
  };
  const scenarioTone = {
    safe: { label: 'Safe', icon: 'verified_user', bg: 'rgba(52,211,153,0.1)', color: 'var(--success)' },
    attack: { label: 'Compromised', icon: 'gpp_bad', bg: 'rgba(255,180,171,0.1)', color: 'var(--error)' },
    control: { label: 'Control', icon: 'admin_panel_settings', bg: 'rgba(251,191,36,0.12)', color: 'var(--warning)' },
  };
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', boxShadow: '0 0 30px rgba(196,192,255,0.2)' }}>
          <M icon="play_arrow" style={{ fontSize: 32, color: 'var(--on-primary)' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline tracking-tight">Launch Agent Task</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>Select a scenario and execute a secure, token-gated agent workflow</p>
      </div>

      <div className="space-y-3 mb-6">
        {tasks.map((t) => {
          const tone = scenarioTone[t.category] || scenarioTone.safe;
          const outcomeLabel = t.category === 'attack' && t.expected_status === 'completed'
            ? 'Expected: Complete After Block'
            : (outcomeTone[t.expected_status]?.label || `Expected: ${t.expected_status}`);
          return (
            <button key={t.id} onClick={() => setSelectedTask(t.id)}
              className="w-full text-left p-5 rounded-[2rem] transition-all"
              style={{
                background: t.id === selectedTask ? 'var(--surface-container)' : 'var(--surface-container-low)',
                border: t.id === selectedTask ? '2px solid rgba(196,192,255,0.4)' : '2px solid rgba(70,69,85,0.1)',
                boxShadow: t.id === selectedTask ? '0 0 20px rgba(196,192,255,0.08)' : 'none',
              }}>
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: tone.bg }}>
                  <M icon={tone.icon} style={{ fontSize: 20, color: tone.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="text-sm font-bold font-headline">{t.name}</h4>
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded" style={{ background: tone.bg, color: tone.color }}>{tone.label}</span>
                    {t.expected_status && (
                      <span className="text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
                        style={{ background: outcomeTone[t.expected_status]?.bg || 'var(--surface-container-highest)', color: outcomeTone[t.expected_status]?.color || 'var(--on-surface-variant)' }}>
                        {outcomeLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(t.steps || []).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[9px] font-mono font-medium" style={{ background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>{s.action}</span>
                    ))}
                    {t.malicious_step && <span className="px-2 py-0.5 rounded text-[9px] font-mono font-medium" style={{ background: 'rgba(255,180,171,0.1)', color: 'var(--error)' }}>⚠ {t.malicious_step.action}</span>}
                  </div>
                </div>
                <div className="flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0 mt-1" style={{ border: `2px solid ${t.id === selectedTask ? 'var(--primary)' : 'var(--outline-variant)'}`, background: t.id === selectedTask ? 'var(--primary)' : 'transparent' }}>
                  {t.id === selectedTask && <div className="h-2 w-2 rounded-full" style={{ background: 'var(--on-primary)' }} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button onClick={onStart} disabled={busyAction === 'start'} className="btn-primary w-full py-4 text-sm" style={{ boxShadow: '0 0 30px rgba(196,192,255,0.3)' }}>
        <M icon="play_arrow" style={{ fontSize: 20 }} /> {busyAction === 'start' ? 'Starting Execution…' : 'Start Secure Execution'}
      </button>
      {sel && (
        <p className="text-center text-xs mt-4" style={{ color: 'var(--outline)' }}>
          {sel.expected_status === 'completed' && sel.category === 'attack' && 'This attack attempt will be blocked while the workflow still completes safely.'}
          {sel.expected_status === 'completed' && sel.category !== 'attack' && 'This scenario should complete cleanly under the TokenFlow policy engine.'}
          {sel.expected_status === 'paused' && 'This scenario will be intercepted and paused for review.'}
          {sel.expected_status === 'aborted' && 'This scenario will terminate early — the kill-switch control revokes the chain.'}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE: Security
   ═══════════════════════════════════════════════════════════ */
function SecurityPage({ currentReview, reviewQueue, workflows, selectedWorkflowId, setSelectedWorkflowId, audit, onResume, onRevoke, onClearAudit, busyAction }) {
  const securityWorkflows = (workflows || []).filter((workflow) => (workflow.audit_event_count || 0) > 0);
  const hasWorkflows = securityWorkflows.length > 0;
  const selectedWorkflow = securityWorkflows.find((workflow) => workflow.id === selectedWorkflowId) || securityWorkflows[0] || null;
  const selectedReview = selectedWorkflow
    ? reviewQueue.find((item) => item.workflowId === selectedWorkflow.id) || null
    : currentReview || null;
  const selectedTokenSummary = selectedWorkflow?.token_summary || {};
  const selectedTokenTotal = Object.values(selectedTokenSummary).reduce((sum, value) => sum + value, 0);
  const selectedStatusTone = selectedWorkflow?.status === 'completed'
    ? 'var(--success)'
    : selectedWorkflow?.status === 'paused'
      ? 'var(--warning)'
      : selectedWorkflow?.status === 'aborted'
        ? 'var(--error)'
        : 'var(--primary)';
  const selectedDetailRef = useRef(null);

  function inspectWorkflow(workflowId) {
    setSelectedWorkflowId(workflowId);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        selectedDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Page Header */}
      <div className="card p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at 80% 50%, var(--error), transparent 60%)' }} />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl" style={{ background: 'rgba(255,180,171,0.1)', boxShadow: '0 0 20px rgba(255,180,171,0.08)' }}>
            <M icon="shield" style={{ color: 'var(--error)', fontSize: 28 }} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold font-headline">Security Audit Log</h2>
            <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>All workflow executions, security violations, flagged tokens, and kill switch activations.</p>
          </div>
          <button onClick={onClearAudit} disabled={busyAction === 'clear-audit'} className="btn-ghost"
            style={{ padding: '0.55rem 0.9rem', color: 'var(--error)', borderColor: 'rgba(255,180,171,0.2)', background: 'rgba(255,180,171,0.06)' }}>
            <M icon="delete_sweep" style={{ fontSize: 16 }} />
            {busyAction === 'clear-audit' ? 'Clearing…' : 'Clear Log'}
          </button>
          {reviewQueue.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(255,80,80,0.1)', color: 'var(--error)', border: '1px solid rgba(255,180,171,0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: 'var(--error)' }} />
              {reviewQueue.length} Alert{reviewQueue.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {reviewQueue.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Flagged Workflows</h4>
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                Switch between intercepted workflows to review audit details.
              </p>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>
              {reviewQueue.length} workflow{reviewQueue.length === 1 ? '' : 's'} awaiting review
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reviewQueue.map((item, idx) => {
              const isSelected = item.workflowId === selectedWorkflow?.id;
              return (
                <motion.button key={item.workflowId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                  onClick={() => inspectWorkflow(item.workflowId)} className="text-left p-4 rounded-2xl transition-all"
                  style={{ background: isSelected ? 'rgba(255,180,171,0.08)' : 'var(--surface-container-high)', border: isSelected ? '1px solid rgba(255,180,171,0.35)' : '1px solid rgba(70,69,85,0.1)', boxShadow: isSelected ? '0 0 24px rgba(255,180,171,0.08)' : 'none' }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>{item.workflowName}</p>
                      <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--outline)' }}>{item.workflowId}</p>
                    </div>
                    <StatusPill status={item.workflow?.status || 'paused'} small />
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
                    {item.review?.summary || 'Security review required before this workflow can proceed.'}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Review Alert */}
      {selectedReview && (
        <div className="space-y-4 mb-6">
          <div className="security-alert-card">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2.5 }}
                  className="p-3 rounded-2xl flex-shrink-0" style={{ background: 'rgba(255,80,80,0.15)', border: '1px solid rgba(255,180,171,0.3)' }}>
                  <M icon="gpp_bad" style={{ color: 'var(--error)', fontSize: 32 }} />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.15em]" style={{ background: 'rgba(255,80,80,0.15)', color: 'var(--error)', border: '1px solid rgba(255,180,171,0.3)' }}>⚠ Security Violation</span>
                  </div>
                  <h3 className="text-xl font-bold font-headline" style={{ color: 'var(--on-surface)' }}>{selectedReview.workflowName}</h3>
                </div>
              </div>
              <div className="p-4 rounded-xl font-mono text-xs leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,180,171,0.1)', color: 'rgba(199,196,216,0.8)' }}>
                <span style={{ color: 'rgba(255,180,171,0.6)' }}>ALERT </span>
                {selectedReview.review?.summary || 'Unauthorized action detected. Manual intervention required.'}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card-glow-error p-5">
              <div className="flex items-center gap-2 mb-2">
                <M icon="dns" style={{ fontSize: 13, color: 'var(--error)' }} />
                <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--error)' }}>Attempted Service</p>
              </div>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--error)' }}>{selectedReview.review?.attempted_service || 'n/a'}</p>
            </div>
            <div className="card-glow-error p-5">
              <div className="flex items-center gap-2 mb-2">
                <M icon="search" style={{ fontSize: 13, color: 'var(--error)' }} />
                <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--error)' }}>Attempted Resource</p>
              </div>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--error)' }}>{selectedReview.review?.attempted_resource || 'n/a'}</p>
            </div>
            <DetailCard label="Attempted Action" value={selectedReview.review?.attempted_action || 'n/a'} msym="bolt" />
            <DetailCard label="Task" value={selectedReview.review?.taskData?.name || selectedReview.task?.name || 'n/a'} msym="assignment" />
          </div>

          {(selectedReview.review?.violations || []).length > 0 && (
            <div className="card p-5">
              <h4 className="text-sm font-bold uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                <M icon="warning" style={{ color: 'var(--warning)', fontSize: 16 }} /> Violations Detected
              </h4>
              <div className="space-y-2">
                {(selectedReview.review?.violations || []).map((v, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="violation-card">
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--error)' }}>{v.type}</p>
                    <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>{v.message}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => onResume(selectedReview.workflowId)} disabled={busyAction === 'resume'} className="btn-success flex-1">
              <M icon="check_circle" style={{ fontSize: 16 }} /> {busyAction === 'resume' ? 'Resuming…' : 'Override & Resume'}
            </button>
            <button onClick={() => onRevoke(selectedReview.workflowId)} disabled={busyAction === 'revoke'} className="btn-danger flex-1">
              <M icon="cancel" style={{ fontSize: 16 }} /> {busyAction === 'revoke' ? 'Revoking…' : 'Revoke & Abort'}
            </button>
          </div>
        </div>
      )}

      {/* Selected Workflow Detail */}
      {selectedWorkflow && (
        <div ref={selectedDetailRef} className="card p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-lg font-bold font-headline">Selected Workflow Detail</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ background: 'rgba(196,192,255,0.08)', color: selectedStatusTone, border: `1px solid color-mix(in srgb, ${selectedStatusTone} 35%, transparent)` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedStatusTone }} />
                  {selectedWorkflow.status}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>Inspect this workflow's audit stream here.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
            <DetailCard label="Workflow" value={selectedWorkflow.name || 'n/a'} msym="assignment" />
            <DetailCard label="Workflow ID" value={selectedWorkflow.id || 'n/a'} msym="hub" />
            <DetailCard label="Started" value={selectedWorkflow.created_at ? fmtDateTime(selectedWorkflow.created_at) : '—'} msym="schedule" />
            <DetailCard label="Updated" value={selectedWorkflow.updated_at ? fmtDateTime(selectedWorkflow.updated_at) : '—'} msym="update" />
          </div>

          <div className="grid gap-3 sm:grid-cols-4 mb-5">
            <SignalMetric label="Burned" value={String(selectedTokenSummary.burned || 0).padStart(2, '0')} hint="completed steps" tone="success" msym="local_fire_department" />
            <SignalMetric label="Flagged" value={String(selectedTokenSummary.flagged || 0).padStart(2, '0')} hint="security interventions" tone={(selectedTokenSummary.flagged || 0) ? 'danger' : 'neutral'} msym="gpp_bad" />
            <SignalMetric label="Revoked" value={String(selectedTokenSummary.revoked || 0).padStart(2, '0')} hint="terminated tokens" tone={(selectedTokenSummary.revoked || 0) ? 'danger' : 'neutral'} msym="cancel" />
            <SignalMetric label="Total" value={String(selectedTokenTotal).padStart(2, '0')} hint="observed in workflow" tone="secondary" msym="token" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="card p-5" style={{ background: 'var(--surface-container-high)' }}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Workflow Audit Events</h4>
                <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{audit.length} events</span>
              </div>
              {audit.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Select a workflow above to load its security events.</p>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {audit.map((entry, idx) => (
                    <motion.div key={`${entry.id}-${entry.timestamp}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                      className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-container)', border: '1px solid rgba(70,69,85,0.1)' }}>
                      <EventIcon type={entry.event_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: evtColor(entry.event_type) }}>{entry.event_type}</p>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--on-surface)' }}>{describeAudit(entry)}</p>
                        <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--outline)' }}>{entry.token_id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>{fmtTime(entry.timestamp)}</p>
                        <p className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--outline)' }}>{entry.actor}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5" style={{ background: 'var(--surface-container-high)' }}>
              <div className="flex items-center gap-2 mb-4">
                <M icon="rule" style={{ color: 'var(--primary)', fontSize: 18 }} />
                <h4 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Disposition</h4>
              </div>
              {selectedReview ? (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    This workflow is paused behind a security checkpoint. Override or revoke.
                  </p>
                  <button onClick={() => onResume(selectedReview.workflowId)} disabled={busyAction === 'resume'} className="btn-success w-full">
                    <M icon="check_circle" style={{ fontSize: 16 }} /> {busyAction === 'resume' ? 'Resuming…' : 'Override & Resume'}
                  </button>
                  <button onClick={() => onRevoke(selectedReview.workflowId)} disabled={busyAction === 'revoke'} className="btn-danger w-full">
                    <M icon="cancel" style={{ fontSize: 16 }} /> {busyAction === 'revoke' ? 'Revoking…' : 'Revoke & Abort'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    This workflow does not need manual intervention.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Audit Trail */}
      {hasWorkflows ? (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <M icon="history" style={{ color: 'var(--primary)', fontSize: 18 }} />
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Workflow Audit Trail</h3>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{securityWorkflows.length} workflows</span>
          </div>
          <p className="text-xs mb-6" style={{ color: 'var(--on-surface-variant)' }}>All workflows with status, timestamps, and security events.</p>

          <div className="space-y-2 max-h-[calc(100vh-420px)] overflow-auto pr-1">
            {securityWorkflows.map((w, idx) => {
              const tokenSummary = w.token_summary || {};
              const totalTokens = Object.values(tokenSummary).reduce((a, b) => a + b, 0);
              const hasFlagged = tokenSummary.flagged > 0;
              const isAborted = w.status === 'aborted';
              const isPaused = w.status === 'paused';
              const statusColor = isAborted || hasFlagged ? 'var(--error)' : isPaused ? 'var(--warning)' : w.status === 'completed' ? 'var(--success)' : 'var(--primary)';
              const statusIcon = isAborted ? 'dangerous' : hasFlagged ? 'gpp_bad' : isPaused ? 'pause_circle' : w.status === 'completed' ? 'check_circle' : 'play_circle';
              const isSelected = selectedWorkflow?.id === w.id;

              return (
                <motion.div key={w.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-4 p-3 rounded-xl cursor-pointer"
                  style={{ background: isSelected ? 'rgba(196,192,255,0.08)' : hasFlagged || isAborted ? 'rgba(255,180,171,0.04)' : 'var(--surface-container-high)', border: isSelected ? '1px solid rgba(196,192,255,0.28)' : hasFlagged || isAborted ? '1px solid rgba(255,180,171,0.15)' : '1px solid rgba(70,69,85,0.1)' }}
                  onClick={() => inspectWorkflow(w.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>{w.name}</p>
                    <p className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--outline)' }}>{w.id}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <M icon={statusIcon} style={{ fontSize: 14, color: statusColor }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: statusColor }}>{w.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    {tokenSummary.burned > 0 && <span style={{ color: 'var(--success)' }}>{tokenSummary.burned}✓</span>}
                    {tokenSummary.flagged > 0 && <span style={{ color: 'var(--error)' }}>{tokenSummary.flagged}⚠</span>}
                    {tokenSummary.revoked > 0 && <span style={{ color: 'var(--error)' }}>{tokenSummary.revoked}✗</span>}
                    {totalTokens === 0 && <span style={{ color: 'var(--outline)' }}>—</span>}
                  </div>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--on-surface-variant)' }}>{w.created_at ? fmtDateTime(w.created_at) : '—'}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)' }}>
            <M icon="verified_user" style={{ fontSize: 28, color: 'var(--outline)' }} />
          </div>
          <h4 className="text-base font-bold font-headline mb-2">Security Audit Log</h4>
          <p className="text-sm max-w-md" style={{ color: 'var(--on-surface-variant)' }}>
            Launch a workflow from the Dashboard → Launch tab to populate this audit trail.
          </p>
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════ */
function SignalMetric({ label, value, hint, tone = 'primary', msym = 'monitoring' }) {
  const toneMap = { primary: 'var(--primary)', secondary: 'var(--secondary)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--error)', neutral: 'var(--outline)' };
  const color = toneMap[tone] || toneMap.primary;
  return (
    <div className="signal-metric">
      <div className="flex items-center justify-between mb-3">
        <span className="signal-metric-label">{label}</span>
        <span className="signal-metric-icon" style={{ color }}><M icon={msym} style={{ fontSize: 15 }} /></span>
      </div>
      <p className="signal-metric-value">{value}</p>
      <p className="signal-metric-hint">{hint}</p>
      <div className="signal-metric-bar"><span style={{ background: color }} /></div>
    </div>
  );
}

function StreamRow({ entry }) {
  return (
    <div className="stream-row">
      <div className="stream-row-icon"><EventIcon type={entry.event_type} /></div>
      <div className="flex-1 min-w-0">
        <p className="stream-row-label" style={{ color: evtColor(entry.event_type) }}>{entry.event_type}</p>
        <p className="stream-row-copy">{describeAudit(entry)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="stream-row-time">{fmtTime(entry.timestamp)}</p>
        <p className="stream-row-actor">{entry.actor}</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, msym, color, sub, delay }) {
  const colorMap = { primary: 'var(--primary)', secondary: 'var(--secondary)', error: 'var(--error)', success: 'var(--success)' };
  const c = colorMap[color] || 'var(--primary)';
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay * 0.08 }} className="metric-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
        <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${c} 10%, transparent)` }}><M icon={msym} style={{ fontSize: 14, color: c }} /></div>
      </div>
      <p className="text-2xl font-bold font-headline">{String(value).padStart(2, '0')}</p>
      <p className="text-[10px] mt-1" style={{ color: 'var(--outline)' }}>{sub}</p>
    </motion.div>
  );
}

function StatusPill({ status, small, label }) {
  const display = label || status;
  const dotColor = { burned: 'var(--success)', completed: 'var(--success)', active: 'var(--primary)', running: 'var(--primary)', flagged: 'var(--error)', revoked: 'var(--error)', aborted: 'var(--error)', paused: 'var(--warning)' }[status] || 'var(--outline)';
  return (
    <span className={`pill pill-${status} ${small ? 'text-[8px] px-1.5 py-0' : ''}`}>
      <span className="dot" style={{ width: 5, height: 5, background: dotColor, boxShadow: `0 0 5px ${dotColor}` }} />
      {display}
    </span>
  );
}

function EventIcon({ type }) {
  const map = { MINTED: ['var(--primary)', 'token'], ACTIVATED: ['var(--secondary)', 'check_circle'], BURNED: ['var(--success)', 'local_fire_department'], REVOKED: ['var(--error)', 'cancel'], FLAGGED: ['var(--error)', 'gpp_bad'] };
  const [c, icon] = map[type] || ['var(--outline)', 'help'];
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0" style={{ background: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      <M icon={icon} style={{ fontSize: 16, color: c }} />
    </div>
  );
}

function InfoCard({ label, value, msym }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <M icon={msym} style={{ fontSize: 13, color: 'var(--outline)' }} />
        <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--outline)' }}>{label}</p>
      </div>
      <p className="text-sm font-bold font-mono truncate">{value}</p>
    </div>
  );
}

function DetailCard({ label, value, danger, msym }) {
  return (
    <div className="card p-4" style={danger ? { borderColor: 'rgba(255,180,171,0.2)' } : {}}>
      <div className="flex items-center gap-2 mb-1">
        <M icon={msym} style={{ fontSize: 13, color: danger ? 'var(--error)' : 'var(--outline)' }} />
        <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: danger ? 'var(--error)' : 'var(--outline)' }}>{label}</p>
      </div>
      <p className="text-sm font-bold font-mono" style={{ color: danger ? 'var(--error)' : 'var(--on-surface)' }}>{value}</p>
    </div>
  );
}

function EmptyState({ msym, text, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)' }}>
        <M icon={msym} style={{ fontSize: 28, color: 'var(--outline)' }} />
      </div>
      <p className="text-sm max-w-xs mb-4" style={{ color: 'var(--on-surface-variant)' }}>{text}</p>
      {action && onAction && <button onClick={onAction} className="btn-primary text-xs">{action}</button>}
    </div>
  );
}

/* ─── Helpers ─── */
function buildChainNodes(chain) {
  const byAction = new Map(chain.map(t => [t.action_type, t]));
  const hasMalicious = chain.some(t => t.action_type === 'READ_REPO');
  const steps = [...STEP_ORDER];
  if (hasMalicious) steps.splice(2, 0, 'READ_REPO');
  return steps.map((action, i) => { const t = byAction.get(action); return { id: t?.id || `${action}-${i}`, action, status: t?.status || 'idle', mintedAt: t?.minted_at || null, token: t }; });
}

function fmtTime(v) { if (!v) return '—'; return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function evtColor(type) {
  return { MINTED: 'var(--primary)', ACTIVATED: 'var(--secondary)', BURNED: 'var(--success)', REVOKED: 'var(--error)', FLAGGED: 'var(--error)', EXPIRED: 'var(--warning)' }[type] || 'var(--outline)';
}

function describeAudit(entry) {
  const d = entry.details || {};
  if (entry.event_type === 'FLAGGED') return d.summary || 'Security violation detected.';
  if (entry.event_type === 'REVOKED') return d.reason || 'Token revoked.';
  if (entry.event_type === 'MINTED') return `Token minted for ${STEP_META[d.actionType]?.label || d.actionType || 'UNKNOWN'}.`;
  if (entry.event_type === 'BURNED') return 'Token consumed and destroyed after execution.';
  if (entry.event_type === 'ACTIVATED') return 'Token activated — execution authorized.';
  return 'Lifecycle event recorded.';
}
