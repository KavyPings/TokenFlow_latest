import { motion } from 'framer-motion';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ═══════════════════════════════════════════════════════════
   LANDING PAGE — Premium onboarding experience
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage({ onEnter }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Hero Section */}
      <section className="landing-hero text-center relative">
        <div className="relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8" style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse-subtle" style={{ background: 'var(--error)' }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--error)' }}>Incident Response Active</span>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="font-headline text-4xl md:text-6xl font-bold tracking-tighter mb-5 leading-tight" style={{ color: 'var(--on-surface)' }}>
            AI Agents Don't Hack Systems.<br />
            <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>They Misuse Credentials.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-sm md:text-base max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
            TokenFlow OS prevents the class of AI security failure exposed by the Google Vertex AI "Double Agent" incident — where an AI agent extracted service-account credentials and moved laterally across internal systems.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-3">
            <button onClick={() => onEnter('dashboard')} className="btn-primary">
              <M icon="space_dashboard" style={{ fontSize: 18 }} /> Enter Mission Control
            </button>
            <button onClick={() => onEnter('testbench')} className="btn-ghost">
              <M icon="science" style={{ fontSize: 18 }} /> Run Security Testbench
            </button>
          </motion.div>
        </div>
      </section>

      {/* ─── The Incident ─── */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">The Incident</h2>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--error)' }} />
          <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>Google Vertex AI "Double Agent" Data Exposure — April 2026</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="card-glow-error p-6">
            <div className="flex items-center gap-2 mb-4">
              <M icon="gpp_bad" style={{ color: 'var(--error)', fontSize: 24 }} />
              <h3 className="text-base font-bold font-headline" style={{ color: 'var(--error)' }}>What Happened</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'A flaw in Google Cloud\'s AI system allowed agents to act as "double agents"',
                'Attackers extracted service-account credentials from the agent runtime',
                'The AI autonomously accessed internal systems and customer data',
                'The agent had broad, standing permissions — no per-action scoping',
                'There was no kill switch — the agent ran unchecked for hours',
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
              <M icon="verified_user" style={{ color: 'var(--success)', fontSize: 24 }} />
              <h3 className="text-base font-bold font-headline" style={{ color: 'var(--success)' }}>How TokenFlow Prevents This</h3>
            </div>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {[
                'Credentials never live inside the agent runtime — vault proxy only',
                'No broad standing permissions — each action gets a single-use token',
                'Tokens are scoped to one service, one action, one resource',
                'Cross-service movement is blocked at the policy engine',
                'Kill switch instantly revokes all active tokens',
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

      {/* ─── How it Works ─── */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">How TokenFlow Works</h2>
          <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'var(--secondary)' }} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { phase: '01', title: 'Agent Requests Action', desc: 'The AI agent declares what it wants to do. It does NOT get a credential.', msym: 'hub', color: 'var(--primary)' },
            { phase: '02', title: 'Token Minted', desc: 'A single-use capability token is minted with narrow scope: one service, one action, one resource.', msym: 'key', color: 'var(--secondary)' },
            { phase: '03', title: 'Vault Executes', desc: 'The backend retrieves the credential from the vault and executes the action. Agent never sees the secret.', msym: 'lock', color: 'var(--primary-container)' },
            { phase: '04', title: 'Token Burned', desc: 'The token is destroyed after use. It cannot be replayed, reused, or escalated.', msym: 'local_fire_department', color: 'var(--error)' },
          ].map((step, i) => (
            <motion.div key={step.phase} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
              className="card p-6 text-center card-interactive">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${step.color} 12%, transparent)` }}>
                <M icon={step.msym} style={{ fontSize: 24, color: step.color }} />
              </div>
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase block mb-2" style={{ color: step.color }}>Phase {step.phase}</span>
              <h4 className="text-sm font-bold mb-2 font-headline">{step.title}</h4>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Product Pages Guide ─── */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="font-headline text-2xl font-bold mb-2">Explore the Platform</h2>
          <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'var(--primary)' }} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: 'Dashboard', desc: 'Operational overview of workflows, tokens, credentials, and the kill switch.', msym: 'space_dashboard', page: 'dashboard' },
            { title: 'Token Chain', desc: 'Live visualization of the capability token lifecycle — mint, activate, burn, flag.', msym: 'token', page: 'chain' },
            { title: 'Security Review', desc: 'Human review queue for flagged violations. Approve, override, or revoke.', msym: 'shield', page: 'security' },
            { title: 'Testbench', desc: 'Run 7 attack scenarios against the system and validate 12 security invariants.', msym: 'science', page: 'testbench' },
            { title: 'Upload Workflow', desc: 'Upload custom workflow definitions in JSON. Validated, previewed, executed.', msym: 'upload_file', page: 'upload' },
            { title: 'Vault', desc: 'Credential vault status. See what\'s stored but never the secret values.', msym: 'lock', page: 'vault' },
          ].map((item, i) => (
            <motion.div key={item.page} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
              className="card p-5 card-interactive" onClick={() => onEnter(item.page)}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl" style={{ background: 'rgba(196,192,255,0.1)' }}>
                  <M icon={item.msym} style={{ fontSize: 20, color: 'var(--primary)' }} />
                </div>
                <h4 className="text-sm font-bold font-headline">{item.title}</h4>
              </div>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Quick Start ─── */}
      <section className="mb-8">
        <div className="card p-8">
          <h3 className="font-headline text-lg font-bold mb-6 text-center">Quick Start Guide</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Launch a Scenario', desc: 'Go to Launch and select a scenario. Try "Double Agent" to see a compromised agent get blocked.', msym: 'play_arrow' },
              { step: '2', title: 'Watch the Chain', desc: 'Switch to Token Chain to see tokens mint, activate, and burn in real-time. Flagged tokens glow red.', msym: 'visibility' },
              { step: '3', title: 'Run the Testbench', desc: 'Open the Testbench and run the full security suite. All 12 invariants should pass.', msym: 'science' },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'rgba(196,192,255,0.1)' }}>
                  <span className="text-sm font-bold font-headline" style={{ color: 'var(--primary)' }}>{s.step}</span>
                </div>
                <div>
                  <p className="text-sm font-bold font-headline mb-1">{s.title}</p>
                  <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
