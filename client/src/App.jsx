import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  RefreshCcw,
} from 'lucide-react';
import { api, getWebSocketUrl } from './api.js';
import LandingPage from './pages/LandingPage.jsx';
import TestbenchPage from './pages/TestbenchPage.jsx';
import IncidentPage from './pages/IncidentPage.jsx';
import FairnessPage from './pages/FairnessPage.jsx';
import ScoringPage from './pages/ScoringPage.jsx';
import WorkflowScorePage from './pages/WorkflowScorePage.jsx';
import RedTeamPage from './pages/RedTeamPage.jsx';
import ReplayPage from './pages/ReplayPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';
import GovernancePage from './pages/GovernancePage.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';
import InstructionsDialog from './components/InstructionsDialog.jsx';

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

// Nav tabs
const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'run', label: 'Workflow Management', badgeKey: 'running' },
  { id: 'monitor', label: 'Monitor', badgeKey: 'alerts' },
  { id: 'governance', label: 'Dataset Management' },
  { id: 'about', label: 'About' },
];

/* ═══════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [page, setPage] = useState('home');
  // workflowSubTab controls which sub-tab is active in the Workflow Control page
  const [workflowSubTab, setWorkflowSubTab] = useState('launch');
  const [monitorSubTab, setMonitorSubTab] = useState('overview');
  const [governanceSubTab, setGovernanceSubTab] = useState('score');
  const [overview, setOverview] = useState(null);
  const [health, setHealth] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('SCENARIO-002');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [chain, setChain] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  // Toast queue: replaces single notice/error strings so toasts never overlap
  const [toasts, setToasts] = useState([]);
  const [socketState, setSocketState] = useState('connecting');
  // Session-only: show onboarding once per browser session (sessionStorage, not localStorage)
  const [showOnboarding, setShowOnboarding] = useState(() => !sessionStorage.getItem('tf_session_toured'));
  const [fairnessAlert, setFairnessAlert] = useState(null);
  const refreshTimeoutRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId);
  const toastIdRef = useRef(0);

  function pushToast(message, type = 'info') {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

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

  useEffect(() => { loadDashboard().catch((e) => pushToast(e.message, 'error')); }, [loadDashboard]);
  useEffect(() => { loadChain(selectedWorkflowId).catch((e) => pushToast(e.message, 'error')); }, [selectedWorkflowId, loadChain]);
  useEffect(() => { selectedWorkflowIdRef.current = selectedWorkflowId; }, [selectedWorkflowId]);
  // Do NOT re-show onboarding on every navigation to home — session flag handled in handleDemoReset

  useEffect(() => {
    let ws;
    let reconnectTimeout;
    let reconnectDelay = 1000;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(getWebSocketUrl());

      ws.addEventListener('open', () => {
        setSocketState('live');
        reconnectDelay = 1000; // reset backoff on successful connect
      });

      ws.addEventListener('close', () => {
        if (destroyed) return;
        setSocketState('offline');
        // Reconnect with exponential backoff (max 10s)
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
          connect();
        }, reconnectDelay);
      });

      ws.addEventListener('error', () => {
        setSocketState('degraded');
        // Let the close event handle reconnect
      });

      ws.addEventListener('message', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'SECURITY_VIOLATION' && d.payload?.workflowType !== 'testbench') {
            pushToast('Security violation detected — review queue updated.', 'error');
          }
          if (d.type === 'FAIRNESS_FLAG') {
            setFairnessAlert(d.payload);
            pushToast(`Fairness signal: ${d.payload?.applicant || 'applicant'} — human review recommended.`, 'warning');
            setTimeout(() => setFairnessAlert(null), 8000);
          }
          if (d.type === 'DECISION_MADE') {
            pushToast(`Loan decision: ${d.payload?.decision?.toUpperCase() || 'PROCESSED'} for ${d.payload?.applicant || 'applicant'}`, 'info');
          }
        } catch { }

        // Debounced dashboard refresh — skip if already in-flight
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(() => {
          if (isRefreshingRef.current) return;
          isRefreshingRef.current = true;
          loadDashboard()
            .then(() => loadChain(selectedWorkflowIdRef.current))
            .catch((err) => pushToast(err.message, 'error'))
            .finally(() => { isRefreshingRef.current = false; });
        }, 800);
      });
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(refreshTimeoutRef.current);
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [loadDashboard, loadChain]);

  async function withBusy(name, fn) {
    setBusyAction(name);
    try { await fn(); }
    catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyAction(''); }
  }

  function navigateToPage(target) {
    switch (target) {
      case 'workflow':
      case 'run':
        setPage('run');
        return;
      case 'dashboard':
        setPage('monitor');
        setMonitorSubTab('overview');
        return;
      case 'security':
        setPage('monitor');
        setMonitorSubTab('security');
        return;
      case 'fairness':
        setPage('governance');
        setGovernanceSubTab('fairness');
        return;
      case 'scoring':
        setPage('governance');
        setGovernanceSubTab('score');
        return;
      case 'incident':
      case 'about':
        setPage('about');
        return;
      case 'testbench':
        setPage('run');
        setWorkflowSubTab('testbench');
        return;
      case 'monitor':
      case 'governance':
      case 'home':
        setPage(target);
        return;
      default:
        setPage('home');
    }
  }

  function handleStart() {
    withBusy('start', async () => {
      const r = await api('/api/workflows/start', { method: 'POST', body: JSON.stringify({ taskId: selectedTask }) });
      pushToast(`Workflow started — watching token chain.`, 'info');
      setSelectedWorkflowId(r.workflowId);
      await loadDashboard(r.workflowId);
      await loadChain(r.workflowId);
      // Auto-navigate to Token Chain tab
      navigateToPage('workflow');
      setWorkflowSubTab('chain');
    });
  }

  function handleResume(id) { withBusy('resume', async () => { await api(`/api/workflows/${id}/resume`, { method: 'POST' }); pushToast('Workflow resumed.', 'info'); await loadDashboard(id); await loadChain(id); }); }
  function handleRevoke(id) { withBusy('revoke', async () => { await api(`/api/workflows/${id}/revoke`, { method: 'POST' }); pushToast('Workflow aborted.', 'info'); await loadDashboard(id); await loadChain(id); }); }
  function handleKill(id) { if (!id) return; withBusy('kill', async () => { await api(`/api/workflows/${id}/kill`, { method: 'POST' }); pushToast('Kill switch engaged.', 'error'); await loadDashboard(id); await loadChain(id); }); }

  async function handleUploadedWorkflowRun(uploadedWorkflowId) {
    const result = await api(`/api/workflows/upload/${uploadedWorkflowId}/run`, { method: 'POST' });
    setSelectedWorkflowId(result.workflowId);
    await loadDashboard(result.workflowId);
    await loadChain(result.workflowId);
    pushToast(`Uploaded workflow started — watching token chain.`, 'info');
    // Auto-navigate to Token Chain
    navigateToPage('workflow');
    setWorkflowSubTab('chain');
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
      pushToast(result.count ? `Cleared ${result.count} settled workflow${result.count === 1 ? '' : 's'}.` : 'No settled workflows to clear.', 'info');
      setSelectedWorkflowId(nextId);
      await loadChain(nextId);
    });
  }

  function handleClearAuditLog() {
    withBusy('clear-audit', async () => {
      const result = await api('/api/tokens/audit/clear', { method: 'POST' });
      await loadDashboard(selectedWorkflowIdRef.current);
      await loadChain(selectedWorkflowIdRef.current);
      pushToast(result.count ? `Cleared ${result.count} audit event${result.count === 1 ? '' : 's'}.` : 'Audit log already empty.', 'info');
    });
  }

  function handleRefresh() { withBusy('refresh', async () => { await loadDashboard(); await loadChain(selectedWorkflowId); pushToast('Refreshed.', 'info'); }); }

  function handleDemoReset() {
    withBusy('demo-reset', async () => {
      await api('/api/demo/reset', { method: 'POST' });
      await loadDashboard();
      // Clear BOTH storages so onboarding shows again after demo reset
      localStorage.removeItem('tf_onboarded');
      sessionStorage.removeItem('tf_session_toured');
      setShowOnboarding(true);
      navigateToPage('home');
      setWorkflowSubTab('launch');
      setMonitorSubTab('overview');
      setGovernanceSubTab('score');
      setSelectedWorkflowId(null);
      setChain([]);
      setAudit([]);
      pushToast('Demo reset — all state cleared. Ready for a fresh run.', 'info');
    });
  }

  function handleRunAttack() {
    setSelectedTask('SCENARIO-002');
    // Auto-start after a brief nav delay, navigate straight to token chain
    setTimeout(() => {
      withBusy('start', async () => {
        const r = await api('/api/workflows/start', { method: 'POST', body: JSON.stringify({ taskId: 'SCENARIO-002' }) });
        pushToast('Double Agent attack scenario started — watch the chain.', 'error');
        setSelectedWorkflowId(r.workflowId);
        await loadDashboard(r.workflowId);
        await loadChain(r.workflowId);
        navigateToPage('workflow');
        setWorkflowSubTab('chain');
      });
    }, 400);
  }

  function handleOpenReplay(workflowId) {
    if (workflowId) {
      setSelectedWorkflowId(workflowId);
    }
    navigateToPage('workflow');
    setWorkflowSubTab('replay');
  }

  const alertCount = reviewQueue.length;
  const runningCount = workflows.filter((w) => w.status === 'running' || w.status === 'paused').length;
  const showRefreshButton = socketState === 'offline' || socketState === 'degraded';
  const normalizedPage =
    page === 'dashboard' || page === 'security' ? 'monitor'
      : page === 'workflow' || page === 'testbench' ? 'run'
        : page === 'fairness' || page === 'scoring' ? 'governance'
          : page === 'incident' ? 'about'
            : page;
  const activeMonitorTab = page === 'security' ? 'security' : monitorSubTab;
  const activeGovernanceTab = page === 'fairness' ? 'fairness' : page === 'scoring' ? 'score' : governanceSubTab;

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
                  {fairnessAlert.applicant} — score {fairnessAlert.score} — {fairnessAlert.recommendation}
                </p>
              </div>
              <button onClick={() => setFairnessAlert(null)} style={{ color: 'var(--outline)', fontSize: 12 }}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Toast Stack (bottom-right, non-overlapping) ─── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" style={{ maxWidth: 'min(400px, calc(100vw - 3rem))' }}>
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-2.5 px-4 py-3 rounded-2xl shadow-xl"
              style={{
                background: t.type === 'error' ? 'rgba(55,15,15,0.97)' : t.type === 'warning' ? 'rgba(45,35,0,0.97)' : 'rgba(18,18,32,0.97)',
                border: t.type === 'error' ? '1px solid rgba(255,100,100,0.35)' : t.type === 'warning' ? '1px solid rgba(251,191,36,0.35)' : '1px solid rgba(196,192,255,0.2)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <M icon={t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'check_circle'}
                style={{ fontSize: 16, flexShrink: 0, marginTop: 1, color: t.type === 'error' ? 'var(--error)' : t.type === 'warning' ? 'var(--warning)' : 'var(--success)' }} />
              <span className="text-xs leading-relaxed flex-1" style={{ color: 'var(--on-surface)' }}>{t.message}</span>
              <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} style={{ color: 'var(--outline)', fontSize: 11, flexShrink: 0, marginTop: 1 }}>✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ─── Floating Top Navbar ─── */}
      <nav className="top-navbar">
        <div className="flex items-center gap-3">
          <M icon="security" style={{ color: 'var(--primary)', fontSize: 22 }} />
          <span className="text-base font-bold tracking-[0.15em] uppercase font-headline" style={{ color: 'var(--on-surface)' }}>TokenFlow</span>
        </div>
        <div className="nav-pills">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => navigateToPage(item.id)} className={`nav-pill ${normalizedPage === item.id ? 'active' : ''}`}>
              {item.label}
              {item.badgeKey === 'alerts' && alertCount > 0 && <span className="badge-dot" />}
              {item.badgeKey === 'running' && runningCount > 0 && <span className="badge-dot" style={{ background: 'var(--success)' }} />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {showRefreshButton && (
            <button onClick={handleRefresh} disabled={busyAction === 'refresh'} className="btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem' }}>
              <RefreshCcw className="h-3 w-3" /> Refresh
            </button>
          )}
          <button onClick={handleDemoReset} disabled={!!busyAction} className="btn-ghost" title="Reset all demo state"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', color: 'var(--warning)', borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}>
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

      <div className="main-wrap">
        <AnimatePresence mode="wait">
          <motion.div key={`${normalizedPage}:${activeMonitorTab}:${activeGovernanceTab}`} className="page-stage"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {normalizedPage === 'home' && <LandingPage key="home" onEnter={navigateToPage} />}
            {normalizedPage === 'run' && (
              <WorkflowControlPage
                key="wf"
                workflows={workflows}
                chainWorkflows={chainWorkflows}
                chainNodes={chainNodes}
                audit={audit}
                currentWorkflow={currentWorkflow}
                currentChainWorkflow={currentChainWorkflow}
                selectedWorkflowId={selectedWorkflowId}
                setSelectedWorkflowId={setSelectedWorkflowId}
                tasks={tasks}
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
                onStart={handleStart}
                onKill={() => handleKill(currentWorkflow?.id)}
                onClearWorkflows={handleClearWorkflows}
                busyAction={busyAction}
                setPage={navigateToPage}
                onRunUploadedWorkflow={handleUploadedWorkflowRun}
                onOpenReplay={handleOpenReplay}
                activeTab={workflowSubTab}
                setActiveTab={setWorkflowSubTab}
              />
            )}
            {normalizedPage === 'monitor' && (
              <MonitorPage
                activeTab={activeMonitorTab}
                onSelectTab={setMonitorSubTab}
                overviewView={(
                  <DashboardPage
                    key="d"
                    workflows={workflows}
                    reviewQueue={reviewQueue}
                    credentials={credentials}
                    health={health}
                    currentWorkflow={currentWorkflow}
                    chainNodes={chainNodes}
                    audit={audit}
                    socketState={socketState}
                    totalTokens={workflows.reduce((s, w) => s + Object.values(w.token_summary || {}).reduce((a, b) => a + b, 0), 0)}
                    burnedTokens={workflows.reduce((s, w) => s + (w.token_summary?.burned || 0), 0)}
                    busyAction={busyAction}
                    setPage={navigateToPage}
                    setWorkflowSubTab={setWorkflowSubTab}
                    onKill={() => handleKill(currentWorkflow?.id)}
                  />
                )}
                securityView={(
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
              />
            )}
            {normalizedPage === 'governance' && (
              <GovernancePage
                activeTab={activeGovernanceTab}
                onSelectTab={setGovernanceSubTab}
                scoreView={<ScoringPage key="score" />}
                fairnessView={<FairnessPage key="fair" />}
              />
            )}
            {normalizedPage === 'about' && <IncidentPage key="inc" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE: Workflow Control (Launch | Token Chain | Testbench)
   ═══════════════════════════════════════════════════════════ */
function WorkflowControlPage({
  workflows, chainWorkflows, chainNodes, audit,
  currentWorkflow, currentChainWorkflow,
  selectedWorkflowId, setSelectedWorkflowId,
  tasks, selectedTask, setSelectedTask,
  onStart, onKill, onClearWorkflows, busyAction, setPage, onRunUploadedWorkflow, onOpenReplay,
  activeTab, setActiveTab,
}) {
  const [showInstructions, setShowInstructions] = useState(false);

  const tabs = [
    { id: 'launch', label: 'Mock Workflows', msym: 'play_arrow' },
    { id: 'uploads', label: 'Uploaded Workflows', msym: 'upload_file' },
    { id: 'chain', label: 'Token Chain', msym: 'token' },
    { id: 'testbench', label: 'Testbench', msym: 'science' },
    { id: 'redteam', label: 'Red-Team', msym: 'shield' },
    { id: 'replay', label: 'Replay', msym: 'history' },
    { id: 'workflowScore', label: 'Workflow Score', msym: 'verified' },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Scope: Workflow Information</p>
          <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Workflow Management controls workflow execution, token chains, and workflow-only scoring.
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => setShowInstructions(true)}>
          <M icon="help" style={{ fontSize: 14 }} /> How to use
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-1.5 flex-shrink-0 ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={activeTab !== t.id ? { padding: '0.5rem 1.25rem' } : {}}
          >
            <M icon={t.msym} style={{ fontSize: 14 }} />{t.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {activeTab === 'launch' && (
          <motion.div key="launch" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <LaunchTab tasks={tasks} selectedTask={selectedTask} setSelectedTask={setSelectedTask}
              onStart={onStart} busyAction={busyAction} />
          </motion.div>
        )}
        {activeTab === 'uploads' && (
          <motion.div key="uploads" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <UploadedWorkflowsTab onRunUploadedWorkflow={onRunUploadedWorkflow} />
          </motion.div>
        )}
        {activeTab === 'chain' && (
          <motion.div key="chain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ChainTab workflows={chainWorkflows} chainNodes={chainNodes}
              currentWorkflow={currentChainWorkflow}
              selectedWorkflowId={selectedWorkflowId} setSelectedWorkflowId={setSelectedWorkflowId}
              audit={audit} onKill={onKill} onClearWorkflows={onClearWorkflows} busyAction={busyAction} />
          </motion.div>
        )}
        {activeTab === 'testbench' && (
          <motion.div key="testbench" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <TestbenchPage />
          </motion.div>
        )}
        {activeTab === 'redteam' && (
          <motion.div key="redteam" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <RedTeamPage onOpenReplay={onOpenReplay} />
          </motion.div>
        )}
        {activeTab === 'replay' && (
          <motion.div key="replay" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ReplayPage
              workflowId={selectedWorkflowId}
              onSelectWorkflow={setSelectedWorkflowId}
              workflows={workflows}
            />
          </motion.div>
        )}
        {activeTab === 'workflowScore' && (
          <motion.div key="workflow-score" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <WorkflowScorePage />
          </motion.div>
        )}
      </AnimatePresence>

      <InstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="Workflow Management"
        subtitle="Workflow Management contains workflow-only operations and scoring."
        sections={[
          {
            title: 'Mock Workflows',
            steps: [
              'Choose a built-in workflow scenario and start secure execution.',
              'This is the fastest path to generate token chain and score evidence.',
            ],
          },
          {
            title: 'Uploaded Workflows',
            steps: [
              'Upload a JSON workflow definition.',
              'Run the uploaded workflow to execute through the exact same token engine.',
              'Inspect results in Token Chain exactly like mock workflows.',
            ],
          },
          {
            title: 'Token Chain, Testbench, Workflow Score',
            steps: [
              'Token Chain shows per-workflow token lifecycle and audit evidence.',
              'Testbench validates invariants and stress-tests controls.',
              'Workflow Score summarizes workflow-only posture from chain, intercept, and tests.',
            ],
          },
        ]}
      />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE: Dashboard — Clean stats hub (no sub-tabs)
   ═══════════════════════════════════════════════════════════ */
function DashboardPage({
  workflows, reviewQueue, credentials,
  currentWorkflow, chainNodes, audit, socketState,
  totalTokens, burnedTokens, busyAction,
  setPage, setWorkflowSubTab, onKill,
}) {
  const runningWf = workflows.filter((w) => w.status === 'running' || w.status === 'paused');
  const completedWf = workflows.filter((w) => w.status === 'completed');
  const progress = chainNodes.length
    ? Math.round((chainNodes.filter((n) => n.status === 'burned').length / chainNodes.length) * 100) : 0;
  const recentAudit = audit.slice(-5).reverse();
  const interceptCount = reviewQueue.length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4" style={{ background: 'rgba(196,192,255,0.08)', border: '1px solid rgba(196,192,255,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-subtle" style={{ background: 'var(--primary)' }} />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--primary)' }}>Mission Control</span>
        </div>
        <h1 className="font-headline text-3xl font-bold tracking-tight mb-2" style={{ color: 'var(--on-surface)' }}>System Overview</h1>
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Live status across Workflow Management, Monitor, and Dataset Management.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Workflows" value={workflows.length} msym="hub" color="primary" sub={`${runningWf.length} active`} delay={0} />
        <MetricCard label="Intercepts" value={interceptCount} msym="shield" color="error" sub="Flagged for review" delay={1} />
        <MetricCard label="Tokens" value={totalTokens} msym="key_visualizer" color="secondary" sub={`${burnedTokens} burned`} delay={2} />
        <MetricCard label="Credentials" value={credentials.length} msym="lock" color="success" sub="Vault isolated" delay={3} />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Workflow Management panel */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(196,192,255,0.12)' }}><M icon="hub" style={{ fontSize: 16, color: 'var(--primary)' }} /></div>
              <p className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--primary)' }}>Workflow Management</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: runningWf.length ? 'rgba(52,211,153,0.12)' : 'rgba(70,69,85,0.15)', color: runningWf.length ? 'var(--success)' : 'var(--outline)' }}>
              {runningWf.length ? `${runningWf.length} active` : 'idle'}
            </span>
          </div>
          <div className="space-y-2.5 mb-4">
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Chain progress</span><span className="font-bold font-mono" style={{ color: 'var(--on-surface)' }}>{progress}%</span></div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(70,69,85,0.2)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: progress === 100 ? 'var(--success)' : 'var(--primary)' }} />
            </div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Completed</span><span className="font-bold font-mono" style={{ color: 'var(--on-surface)' }}>{completedWf.length}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Current task</span><span className="font-bold truncate" style={{ color: currentWorkflow ? 'var(--secondary)' : 'var(--outline)', maxWidth: 100 }}>{currentWorkflow?.name?.slice(0, 20) || '—'}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPage('workflow'); setWorkflowSubTab('launch'); }} className="btn-primary flex-1 py-2 text-xs"><M icon="play_arrow" style={{ fontSize: 14 }} />Launch</button>
            <button onClick={() => { setPage('workflow'); setWorkflowSubTab('chain'); }} className="btn-ghost flex-1 py-2 text-xs"><M icon="token" style={{ fontSize: 14 }} />Chain</button>
          </div>
        </div>

        {/* Fairness panel */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(20,209,255,0.12)' }}><M icon="balance" style={{ fontSize: 16, color: 'var(--secondary)' }} /></div>
              <p className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--secondary)' }}>Fairness Audit</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: interceptCount ? 'rgba(255,180,171,0.12)' : 'rgba(52,211,153,0.1)', color: interceptCount ? 'var(--error)' : 'var(--success)' }}>
              {interceptCount ? `${interceptCount} flagged` : 'clear'}
            </span>
          </div>
          <div className="space-y-2.5 mb-4">
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Review queue</span><span className="font-bold font-mono" style={{ color: interceptCount ? 'var(--error)' : 'var(--on-surface)' }}>{interceptCount} items</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Gate mode</span><span className="font-bold" style={{ color: 'var(--on-surface)' }}>shadow</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>AI reports</span><span className="font-bold" style={{ color: 'var(--outline)' }}>ready</span></div>
          </div>
          <button onClick={() => setPage('fairness')} className="btn-primary w-full py-2 text-xs"><M icon="balance" style={{ fontSize: 14 }} />Open Fairness</button>
        </div>

        {/* Security panel */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255,180,171,0.12)' }}><M icon="shield" style={{ fontSize: 16, color: 'var(--error)' }} /></div>
              <p className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--error)' }}>Security</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: socketState === 'live' ? 'var(--success)' : 'var(--error)' }} />
              <span className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--on-surface-variant)' }}>{socketState}</span>
            </div>
          </div>
          <div className="space-y-2.5 mb-4">
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Vault</span><span className="font-bold" style={{ color: 'var(--success)' }}>ONLINE</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Events logged</span><span className="font-bold font-mono" style={{ color: 'var(--on-surface)' }}>{audit.length}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--on-surface-variant)' }}>Credentials</span><span className="font-bold" style={{ color: 'var(--on-surface)' }}>{credentials.length} isolated</span></div>
          </div>
          <button onClick={() => setPage('security')} className="btn-ghost w-full py-2 text-xs"><M icon="policy" style={{ fontSize: 14 }} />Security Log</button>
        </div>
      </div>

      {/* Live activity + active workflows */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.12em]">Recent Activity</h3>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{recentAudit.length} events</span>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>No activity yet. Launch a workflow to begin.</p>
          ) : (
            <div className="space-y-2">{recentAudit.map((e) => <StreamRow key={`${e.id}-${e.timestamp}`} entry={e} />)}</div>
          )}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.12em]">Active Workflows</h3>
            <button onClick={() => { setPage('workflow'); setWorkflowSubTab('chain'); }}
              className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--primary)' }}>
              View chain <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {runningWf.length === 0 ? (
            <EmptyState msym="hub" text="No active workflows." action="Launch one" onAction={() => { setPage('workflow'); setWorkflowSubTab('launch'); }} />
          ) : (
            <div className="space-y-2">
              {runningWf.slice(0, 4).map((w) => (
                <motion.div key={w.id} whileHover={{ x: 4 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)', cursor: 'pointer' }}
                  onClick={() => { setPage('workflow'); setWorkflowSubTab('chain'); }}>
                  <M icon="hub" style={{ color: 'var(--primary)', fontSize: 14 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{w.name}</p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--on-surface-variant)' }}>{w.id.slice(0, 14)}</p>
                  </div>
                  <StatusPill status={w.status} />
                </motion.div>
              ))}
            </div>
          )}
          {currentWorkflow && (
            <button onClick={onKill} disabled={busyAction === 'kill'} className="btn-danger w-full py-2 text-xs mt-3">
              <M icon="local_fire_department" style={{ fontSize: 14 }} />{busyAction === 'kill' ? 'Halting…' : 'Kill Switch'}
            </button>
          )}
        </div>
      </div>

      {/* Feature guide */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5"><M icon="menu_book" style={{ color: 'var(--primary)', fontSize: 18 }} /><h3 className="text-sm font-bold uppercase tracking-[0.15em]">How to Use TokenFlow</h3></div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { icon: 'play_arrow', color: 'var(--primary)', bg: 'rgba(196,192,255,0.08)', title: 'Workflow Management', steps: ['Open Workflow Management in the top nav', 'Use Mock Workflows for built-in scenarios', 'Use Uploaded Workflows for your JSON definitions', 'Track results in Token Chain', 'Use Workflow Score for workflow-only posture'] },
            { icon: 'balance', color: 'var(--secondary)', bg: 'rgba(20,209,255,0.08)', title: 'Dataset Management', steps: ['Open Dataset Management', 'Switch to Fairness', 'Upload a CSV dataset', 'Run analysis and review violations', 'Use Dataset Score for fairness testing + mitigation posture'] },
            { icon: 'shield', color: 'var(--error)', bg: 'rgba(255,180,171,0.08)', title: 'Monitor', steps: ['Open Monitor and switch to Security', 'Review flagged workflows', 'Resume or revoke paused workflows', 'Credentials stay isolated in Vault', 'Use Reset Demo to clear state'] },
            { icon: 'verified', color: 'var(--success)', bg: 'rgba(52,211,153,0.08)', title: 'Dataset Score', steps: ['Open Dataset Management and switch to Score', 'Run fairness analysis from Fairness to create score evidence', 'Review the compliance gauge', 'Inspect the checklist and breakdown'] },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl p-4" style={{ background: item.bg, border: `1px solid ${item.color}25` }}>
              <div className="flex items-center gap-2 mb-3"><M icon={item.icon} style={{ fontSize: 15, color: item.color }} /><h4 className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>{item.title}</h4></div>
              <ol className="space-y-1">{item.steps.map((step, i) => (
                <li key={i} className="text-[11px] flex gap-2 leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
                  <span className="flex-shrink-0 font-bold font-mono" style={{ color: item.color }}>{i + 1}.</span>{step}
                </li>
              ))}</ol>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
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
        <h2 className="text-2xl font-bold font-headline tracking-tight">Mock Workflows</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>Select a built-in scenario and execute a secure, token-gated workflow</p>
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

function UploadedWorkflowsTab({ onRunUploadedWorkflow }) {
  const [uploadedWfId, setUploadedWfId] = useState(null);
  const [uploadedWfName, setUploadedWfName] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const fd = new FormData();
      fd.append('workflow', file);
      const res = await fetch('/api/workflows/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
      setUploadedWfId(data.uploadedWorkflowId || data.id);
      setUploadedWfName(json?.name || file.name);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleRunUploaded() {
    if (!uploadedWfId || !onRunUploadedWorkflow) return;
    setUploadBusy(true);
    try {
      await onRunUploadedWorkflow(uploadedWfId);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--secondary), var(--secondary-container))', boxShadow: '0 0 30px rgba(20,209,255,0.2)' }}>
          <M icon="upload_file" style={{ fontSize: 30, color: 'var(--on-secondary)' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline tracking-tight">Uploaded Workflows</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>
          Upload JSON workflows and run them through the exact same token chain engine as mock workflows.
        </p>
      </div>

      <div className="card p-5">
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
        {!uploadedWfId ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy}
            className="btn-ghost w-full py-3 text-xs"
            style={{ borderStyle: 'dashed', borderColor: 'rgba(196,192,255,0.25)' }}
          >
            <M icon="folder_open" style={{ fontSize: 16 }} />
            {uploadBusy ? 'Uploading…' : 'Browse JSON file…'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(196,192,255,0.08)', border: '1px solid rgba(196,192,255,0.2)' }}>
              <M icon="description" style={{ fontSize: 14, color: 'var(--primary)' }} />
              <span className="text-xs font-bold flex-1 truncate">{uploadedWfName}</span>
              <button onClick={() => { setUploadedWfId(null); setUploadedWfName(''); }} style={{ color: 'var(--outline)', fontSize: 12 }}>✕</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleRunUploaded} disabled={uploadBusy} className="btn-primary flex-1 py-2.5 text-xs">
                <M icon="play_arrow" style={{ fontSize: 16 }} />
                {uploadBusy ? 'Starting…' : 'Run Uploaded Workflow'}
              </button>
            </div>
          </div>
        )}
        {uploadError && <p className="text-[10px] mt-2" style={{ color: 'var(--error)' }}>{uploadError}</p>}
      </div>
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
            Launch a workflow from Workflow Management → Mock Workflows to populate this audit trail.
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
