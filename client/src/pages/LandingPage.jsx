import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

const APPLICANTS = [
  { name: 'Maya Patel', purpose: 'Home Improvement', amount: '$35,000', id: 'APP-001' },
  { name: 'James Okafor', purpose: 'Business Expansion', amount: '$15,000', id: 'APP-002' },
  { name: 'Elena Rodriguez', purpose: 'Education', amount: '$28,000', id: 'APP-003' },
];

export default function LandingPage({ onEnter }) {
  const [attackPulsing, setAttackPulsing] = useState(false);
  const [activeApplicant, setActiveApplicant] = useState(0);

  // Cycle through applicants in the hero
  useEffect(() => {
    const t = setInterval(() => setActiveApplicant(i => (i + 1) % APPLICANTS.length), 3200);
    return () => clearInterval(t);
  }, []);

  function handleRunAttack() {
    setAttackPulsing(true);
    setTimeout(() => {
      onEnter('dashboard');
    }, 600);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

      {/* ══════════════════════════════════════════════════════
          HERO — Dramatic incident framing + one-click attack
          ══════════════════════════════════════════════════ */}
      <section className="landing-hero relative" style={{ paddingBottom: '5rem' }}>
        <div className="relative z-10 text-center">
          {/* Incident badge */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
              style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: 'var(--error)' }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--error)' }}>
                Google Vertex AI Incident — April 2026
              </span>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="font-headline text-4xl md:text-6xl font-bold tracking-tighter mb-5 leading-[1.08]"
            style={{ color: 'var(--on-surface)' }}>
            AI Agents Don't Hack Systems.
            <br />
            <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>They Misuse Credentials.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-sm md:text-base max-w-2xl mx-auto mb-8 leading-relaxed"
            style={{ color: 'var(--on-surface-variant)' }}>
            A compromised loan AI extracts source-control credentials and reads thousands of private applicant records —
            undetected for hours. <strong style={{ color: 'var(--on-surface)' }}>TokenFlow stops it before step 3.</strong>
          </motion.p>

          {/* ── One Massive Attack Button ── */}
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
            <motion.button
              onClick={handleRunAttack}
              animate={attackPulsing ? { scale: [1, 1.05, 0.98, 1] } : {}}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="relative overflow-hidden rounded-2xl px-10 py-5 text-base font-bold uppercase tracking-[0.15em] mb-4"
              style={{
                background: 'linear-gradient(135deg, rgba(147,0,10,0.9) 0%, rgba(196,50,50,0.85) 100%)',
                border: '1px solid rgba(255,180,171,0.3)',
                color: 'var(--on-error)',
                boxShadow: '0 0 60px rgba(255,100,100,0.2), 0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <span className="relative z-10 flex items-center gap-3 justify-center">
                <M icon="gpp_bad" style={{ fontSize: 24 }} />
                Simulate the Double Agent Attack
                <span className="text-xs font-normal opacity-75 normal-case tracking-normal">— watch it get blocked live</span>
              </span>
              <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(135deg, rgba(255,80,80,0.15), transparent)' }} />
            </motion.button>
          </motion.div>

          {/* Secondary CTAs */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
            className="flex flex-wrap justify-center gap-3">
            <button onClick={() => onEnter('dashboard')} className="btn-ghost text-xs">
              <M icon="space_dashboard" style={{ fontSize: 16 }} /> Mission Control
            </button>
            <button onClick={() => onEnter('testbench')} className="btn-ghost text-xs">
              <M icon="science" style={{ fontSize: 16 }} /> Security Testbench
            </button>
            <button onClick={() => onEnter('incident')} className="btn-ghost text-xs">
              <M icon="history" style={{ fontSize: 16 }} /> The Incident
            </button>
          </motion.div>
        </div>

        {/* ── Live Applicant Preview Strip ── */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="mt-12 max-w-3xl mx-auto">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--outline)' }}>
            Real applicants in the demo
          </p>
          <div className="grid grid-cols-3 gap-3">
            {APPLICANTS.map((app, i) => (
              <motion.div key={app.id}
                animate={{ opacity: i === activeApplicant ? 1 : 0.45, scale: i === activeApplicant ? 1.02 : 1 }}
                transition={{ duration: 0.4 }}
                className="card p-4 text-center"
                style={{ border: i === activeApplicant ? '1px solid rgba(196,192,255,0.3)' : '1px solid rgba(70,69,85,0.1)' }}>
                <div className="mx-auto mb-2 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: 'rgba(196,192,255,0.1)', color: 'var(--primary)' }}>
                  {app.name.split(' ').map(n => n[0]).join('')}
                </div>
                <p className="text-xs font-bold truncate">{app.name}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{app.purpose}</p>
                <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--primary)' }}>{app.amount}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════
          THE INCIDENT — Before/After
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">What Went Wrong</h2>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--error)' }} />
          <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
            Google Vertex AI "Double Agent" — a loan processing AI became a credential exfiltration tool
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="card-glow-error p-6">
            <div className="flex items-center gap-2 mb-4">
              <M icon="gpp_bad" style={{ color: 'var(--error)', fontSize: 22 }} />
              <h3 className="text-sm font-bold font-headline" style={{ color: 'var(--error)' }}>Without TokenFlow</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'Loan AI had broad service-account permissions by default',
                'Compromised prompt pivoted agent to read source-control secrets',
                'Credentials extracted → unauthorized internal system access',
                'Thousands of applicant records exposed → no detection',
                'Agent ran autonomously for hours — no kill switch',
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
              <h3 className="text-sm font-bold font-headline" style={{ color: 'var(--success)' }}>With TokenFlow</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'Each step gets a single-use token scoped to one service',
                'Cross-service pivot immediately blocked at policy engine',
                'Credentials never enter agent runtime — vault proxy only',
                'Immutable audit log captures every token event in real time',
                'Kill switch revokes all active tokens instantly',
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
          HOW IT WORKS — 4 phases
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">How TokenFlow Works</h2>
          <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'var(--secondary)' }} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { phase: '01', title: 'Agent Requests Action', desc: 'The AI declares what it wants to do. No credential is issued upfront.', msym: 'hub', color: 'var(--primary)' },
            { phase: '02', title: 'Token Minted', desc: 'A single-use capability token is created: one service, one action, one resource.', msym: 'key', color: 'var(--secondary)' },
            { phase: '03', title: 'Vault Executes', desc: 'The vault retrieves the credential and runs the action. The agent never sees the secret.', msym: 'lock', color: 'var(--success)' },
            { phase: '04', title: 'Token Burned', desc: 'The token is destroyed on use. Replay, reuse, and escalation are all impossible.', msym: 'local_fire_department', color: 'var(--error)' },
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
          LOAN SCENARIO WALKTHROUGH
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl" style={{ background: 'rgba(166,230,255,0.1)' }}>
              <M icon="account_balance" style={{ fontSize: 22, color: 'var(--secondary)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold font-headline">The Live Demo — Loan Application Processing</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>5 real applicants, Gemini AI scoring, Auth0 vault-brokered decisions</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: 'folder_open', color: 'var(--primary)', step: '1', title: 'Read Applicant Record', desc: 'Gemini loads the application from Cloud Storage via GCS credential — vault-brokered, never exposed.' },
              { icon: 'psychology', color: 'var(--secondary)', step: '2', title: 'AI Credit Scoring', desc: 'Gemini 1.5 Flash assesses risk, flags protected attributes. Any fairness signal triggers a human review gate.' },
              { icon: 'check_circle', color: 'var(--success)', step: '3', title: 'Write Decision + Notify', desc: 'Decision recorded to GCS and email sent via vault-brokered SendGrid. Agent never held a raw credential.' },
            ].map((s) => (
              <div key={s.step} className="p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}>STEP {s.step}</span>
                  <M icon={s.icon} style={{ fontSize: 16, color: s.color }} />
                </div>
                <h4 className="text-sm font-bold font-headline mb-1">{s.title}</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          QUICK START
          ══════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="card p-8">
          <h3 className="font-headline text-lg font-bold mb-6 text-center">Quick Start</h3>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              { step: '1', title: 'Run an Attack', desc: 'Hit the big red button above. The Double Agent attack runs live and gets blocked in real time.', msym: 'gpp_bad', color: 'var(--error)' },
              { step: '2', title: 'Watch the Chain', desc: 'Open Dashboard → Token Chain to see tokens mint, activate, and burn step by step.', msym: 'token', color: 'var(--primary)' },
              { step: '3', title: 'Run All 7 Scenarios', desc: 'Go to Testbench and run the full suite. Every security invariant should hold.', msym: 'science', color: 'var(--secondary)' },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
                  <M icon={s.msym} style={{ fontSize: 16, color: s.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold font-headline mb-1">{s.title}</p>
                  <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Bottom attack button repeat */}
          <div className="text-center">
            <button onClick={handleRunAttack}
              className="btn-primary px-8 py-3 text-sm"
              style={{ boxShadow: '0 0 40px rgba(196,192,255,0.15)' }}>
              <M icon="play_arrow" style={{ fontSize: 20 }} />
              Open Mission Control
            </button>
          </div>
        </div>
      </section>

    </motion.div>
  );
}
