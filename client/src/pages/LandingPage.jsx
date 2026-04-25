import { motion } from 'framer-motion';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

export default function LandingPage({ onEnter }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

      {/* ══════════════════════════════════════════════════════
          HERO — Project mission framing
          ══════════════════════════════════════════════════ */}
      <section className="landing-hero relative" style={{ paddingBottom: '5rem' }}>
        <div className="relative z-10 text-center">
          {/* Mission badge */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
              style={{ background: 'rgba(127,165,190,0.06)', border: '1px solid rgba(127,165,190,0.15)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: 'var(--primary)' }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--primary)' }}>
                AI Safety & Fairness Platform
              </span>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="font-headline text-4xl md:text-6xl font-bold tracking-tighter mb-5 leading-[1.08]"
            style={{ color: 'var(--on-surface)' }}>
            Ensuring Fairness in
            <br />
            <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>Automated Decisions.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-sm md:text-base max-w-2xl mx-auto mb-8 leading-relaxed"
            style={{ color: 'var(--on-surface-variant)' }}>
            AI systems now decide who gets a loan, a job, or medical care. When they learn from flawed data,
            they amplify discrimination at scale. <strong style={{ color: 'var(--on-surface)' }}>TokenFlow inspects, flags, and fixes bias before it impacts real people.</strong>
          </motion.p>

          {/* Primary CTAs */}
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-3 mb-4">
            <button
              onClick={() => onEnter('enterprise')}
              className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em]"
              style={{
                background: 'var(--primary-container)',
                border: '1px solid rgba(127,165,190,0.25)',
                color: 'var(--on-surface)',
                boxShadow: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <M icon="domain" style={{ fontSize: 18 }} />
              Enterprise Audit
              <span className="text-xs font-normal opacity-80 normal-case tracking-normal">— upload &amp; analyze</span>
            </button>
            <button
              onClick={() => onEnter('fairness')}
              className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-bold uppercase tracking-[0.1em]"
              style={{
                background: 'var(--surface-container-high)',
                border: '1px solid rgba(46,59,68,0.45)',
                color: 'var(--on-surface-variant)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              <M icon="balance" style={{ fontSize: 18 }} />
              Fairness Audit
              <span className="text-xs font-normal opacity-80 normal-case tracking-normal">— detect bias</span>
            </button>
          </motion.div>

          {/* Secondary CTAs */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
            className="flex flex-wrap justify-center gap-3">
            <button onClick={() => onEnter('workflow')} className="btn-ghost text-xs">
              <M icon="token" style={{ fontSize: 16 }} /> Workflow Security
            </button>
            <button onClick={() => onEnter('dashboard')} className="btn-ghost text-xs">
              <M icon="space_dashboard" style={{ fontSize: 16 }} /> Mission Control
            </button>
            <button onClick={() => onEnter('incident')} className="btn-ghost text-xs">
              <M icon="info" style={{ fontSize: 16 }} /> About
            </button>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          THE PROBLEM — Why this matters
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">Why This Matters</h2>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--error)' }} />
          <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
            Inspired by the Google Vertex AI "Double Agent" incident — where a compromised AI agent accessed thousands of private records undetected
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="card-glow-error p-6">
            <div className="flex items-center gap-2 mb-4">
              <M icon="gpp_bad" style={{ color: 'var(--error)', fontSize: 22 }} />
              <h3 className="text-sm font-bold font-headline" style={{ color: 'var(--error)' }}>The Risks Today</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'AI systems trained on biased data discriminate against protected groups',
                'Automated loan, hiring, and medical decisions go unaudited',
                'AI agents with broad permissions access data they shouldn\'t',
                'No standardized tools to measure, flag, or fix model unfairness',
                'Regulatory non-compliance risks mount as AI adoption grows',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <M icon="close" style={{ color: 'var(--error)', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="card-glow-primary p-6">
            <div className="flex items-center gap-2 mb-4">
              <M icon="verified_user" style={{ color: 'var(--success)', fontSize: 22 }} />
              <h3 className="text-sm font-bold font-headline" style={{ color: 'var(--success)' }}>What TokenFlow Provides</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'Upload any dataset and measure fairness with statistical rigor',
                'Detect disparate impact, statistical parity, and equalized odds violations',
                'Apply threshold-based mitigation to reduce bias automatically',
                'Gate AI workflows with single-use tokens — no unauthorized access',
                'Generate compliance reports with combined security + fairness scoring',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <M icon="check_circle" style={{ color: 'var(--success)', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS — Full platform overview
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">How TokenFlow Works</h2>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--secondary)' }} />
          <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
            A comprehensive platform combining fairness auditing, workflow security, and compliance reporting
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { phase: '01', title: 'Upload & Inspect', desc: 'Upload datasets (CSV/JSON) and workflow definitions. TokenFlow analyzes structure, detects protected attributes, and maps your schema automatically.', msym: 'upload_file', color: 'var(--primary)' },
            { phase: '02', title: 'Measure Fairness', desc: 'Compute statistical parity, disparate impact, equalized odds, and more across every protected group. Surface violations with severity grading.', msym: 'balance', color: 'var(--secondary)' },
            { phase: '03', title: 'Secure Execution', desc: 'AI actions are gated by single-use capability tokens. Unauthorized access is blocked instantly. All events logged to an immutable audit trail.', msym: 'security', color: 'var(--success)' },
            { phase: '04', title: 'Report & Comply', desc: 'Generate combined security and fairness scores. Download compliance reports, save audit history, and track mitigation impact over time.', msym: 'summarize', color: 'var(--warning)' },
          ].map((step, i) => (
            <motion.div key={step.phase} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
              className="card p-6 text-center card-interactive">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: `color-mix(in srgb, ${step.color} 12%, transparent)` }}>
                <M icon={step.msym} style={{ fontSize: 24, color: step.color }} />
              </div>
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase block mb-2" style={{ color: step.color }}>Phase {step.phase}</span>
              <h4 className="text-sm font-bold mb-2 font-headline">{step.title}</h4>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PLATFORM FEATURES — Key capabilities
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl" style={{ background: 'rgba(127,165,190,0.06)' }}>
              <M icon="widgets" style={{ fontSize: 22, color: 'var(--secondary)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold font-headline">Platform Capabilities</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>Everything you need to audit, secure, and report on AI systems</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: 'balance', color: 'var(--secondary)', title: 'Fairness Analysis', desc: 'Upload datasets with protected attributes (gender, age, race). Measure disparate impact, statistical parity, and equalized odds. Apply threshold-based mitigation to reduce detected bias.' },
              { icon: 'security', color: 'var(--primary)', title: 'Workflow Security', desc: 'Every AI action gets a single-use capability token scoped to one service, one resource, one verb. Unauthorized access is blocked and logged instantly. Kill switch available.' },
              { icon: 'domain', color: 'var(--success)', title: 'Enterprise Audit', desc: 'Upload both a workflow and dataset for combined analysis. Get AI-generated context reports, run security + fairness checks, and download compliance evidence — all in one flow.' },
            ].map((s) => (
              <div key={s.title} className="p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
                    <M icon={s.icon} style={{ fontSize: 16, color: s.color }} />
                  </div>
                  <h4 className="text-sm font-bold font-headline">{s.title}</h4>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          QUICK START — Guide to all features
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="card p-8">
          <h3 className="font-headline text-lg font-bold mb-6 text-center">Quick Start Guide</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {[
              { step: '1', title: 'Audit a Dataset', desc: 'Go to Dataset Management → Fairness. Upload a CSV or JSON, map columns, add protected attributes, and run analysis.', msym: 'balance', color: 'var(--secondary)', target: 'fairness' },
              { step: '2', title: 'Test Workflow Security', desc: 'Go to Workflow Management → Mock Workflows. Launch a scenario and watch the token chain execute step-by-step.', msym: 'token', color: 'var(--primary)', target: 'workflow' },
              { step: '3', title: 'Run Testbench', desc: 'Go to Workflow Management → Testbench. Execute deep security invariant tests to validate the platform controls.', msym: 'science', color: 'var(--warning)', target: 'testbench' },
              { step: '4', title: 'Monitor Live Activity', desc: 'Go to Monitor → Overview for real-time stats. Check Monitor → Security to review flagged workflows.', msym: 'space_dashboard', color: 'var(--error)', target: 'dashboard' },
              { step: '5', title: 'Enterprise Audit', desc: 'Go to Enterprise Audit. Upload your own workflow + dataset for combined AI-powered security and fairness analysis.', msym: 'domain', color: 'var(--success)', target: 'enterprise' },
              { step: '6', title: 'Export Reports', desc: 'From Enterprise Audit → Combined Report, download compliance evidence. Save audits to compare results over time.', msym: 'download', color: 'var(--outline)', target: 'enterprise' },
            ].map((s) => (
              <button key={s.step} onClick={() => onEnter(s.target)} className="flex gap-3 text-left group" style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: '0.75rem' }}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
                  <M icon={s.msym} style={{ fontSize: 16, color: s.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold font-headline mb-1" style={{ color: 'var(--on-surface)' }}>{s.step}. {s.title}</p>
                  <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {/* Bottom CTA */}
          <div className="text-center">
            <button onClick={() => onEnter('enterprise')}
              className="btn-primary px-8 py-3 text-sm"
              style={{ boxShadow: 'none' }}>
              <M icon="play_arrow" style={{ fontSize: 20 }} />
              Start Enterprise Audit
            </button>
          </div>
        </div>
      </section>

    </motion.div>
  );
}
