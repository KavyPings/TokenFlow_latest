import { motion } from 'framer-motion';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
});

/* ═══════════════════════════════════════════════════════════
   ABOUT PAGE — Fairness & Bias detection mission
   ═══════════════════════════════════════════════════════════ */
export default function IncidentPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

      {/* ── Page Header ── */}
      <motion.div {...fade(0)} className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
          style={{ background: 'rgba(127,165,190,0.06)', border: '1px solid rgba(127,165,190,0.15)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--primary)' }}>
            About TokenFlow
          </span>
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Ensuring Fairness &amp;<br />
          <span style={{ color: 'var(--primary)' }}>Detecting Bias</span> in Automated Decisions
        </h1>
        <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--on-surface-variant)' }}>
          Computer programs now make life-changing decisions about who gets a job, a bank loan, or medical care.
          When these systems learn from flawed or unfair historical data, they repeat and amplify the same
          discriminatory mistakes — invisibly, at scale.
        </p>
      </motion.div>

      {/* ── The Problem ── */}
      <motion.section {...fade(0.1)} className="mb-8">
        <div className="card-glow-error p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,180,171,0.1)' }}>
              <M icon="gpp_bad" style={{ fontSize: 24, color: 'var(--error)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold font-headline" style={{ color: 'var(--error)' }}>
                The Problem
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                Why algorithmic bias is one of the most urgent risks of our time
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: 'work',
                title: 'Hiring Decisions',
                desc: 'Automated resume screeners trained on historical patterns systematically penalise candidates from underrepresented groups — rejecting qualified people before a human ever sees their application.',
              },
              {
                icon: 'account_balance',
                title: 'Loan Approvals',
                desc: 'Credit-scoring models absorb decades of redlining and discriminatory lending. The result: identical profiles receive opposite outcomes depending solely on demographic attributes.',
              },
              {
                icon: 'medical_services',
                title: 'Medical Care',
                desc: 'Clinical AI tools calibrated on non-representative patient populations underestimate illness severity in minority groups, leading to delayed referrals and misallocated care.',
              },
            ].map((item) => (
              <div key={item.title} className="p-4 rounded-2xl"
                style={{ background: 'rgba(255,180,171,0.04)', border: '1px solid rgba(255,180,171,0.1)' }}>
                <M icon={item.icon} style={{ fontSize: 20, color: 'var(--error)', marginBottom: '0.5rem', display: 'block' }} />
                <h3 className="text-sm font-bold mb-1 font-headline" style={{ color: 'var(--on-surface)' }}>{item.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Our Objective ── */}
      <motion.section {...fade(0.15)} className="mb-8">
        <div className="card-glow-primary p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(127,165,190,0.06)' }}>
              <M icon="target" style={{ fontSize: 24, color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold font-headline" style={{ color: 'var(--primary)' }}>
                Our Objective
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                A clear, accessible solution to the bias problem
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--on-surface)' }}>
            TokenFlow is an open platform designed to <strong>thoroughly inspect datasets and AI models for
            hidden unfairness or discrimination</strong>. Our goal is to give organisations — large and small —
            an easy, rigorous way to <strong>measure, flag, and fix</strong> harmful bias{' '}
            <em>before</em> their systems impact real people.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: 'upload_file', color: 'var(--primary)', text: 'Upload any dataset or AI workflow' },
              { icon: 'analytics', color: 'var(--secondary)', text: 'Measure bias across every protected attribute' },
              { icon: 'flag', color: 'var(--warning)', text: 'Flag violations with severity grading' },
              { icon: 'tune', color: 'var(--success)', text: 'Apply targeted mitigation automatically' },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ background: 'rgba(127,165,190,0.04)', border: '1px solid rgba(127,165,190,0.08)' }}>
                <M icon={item.icon} style={{ fontSize: 18, color: item.color, flexShrink: 0, marginTop: 2 }} />
                <span className="text-xs leading-snug font-medium" style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── How We Measure Fairness ── */}
      <motion.section {...fade(0.2)} className="mb-8">
        <h2 className="font-headline text-lg font-bold mb-1">How We Measure Fairness</h2>
        <div className="w-8 h-0.5 rounded-full mb-5" style={{ background: 'var(--primary)' }} />
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              metric: 'Disparate Impact',
              icon: 'compare_arrows',
              color: 'var(--primary)',
              desc: 'Compares positive-outcome rates between groups. A ratio below 0.8 (the "80% rule") signals potential discrimination under US employment law.',
            },
            {
              metric: 'Statistical Parity',
              icon: 'equalizer',
              color: 'var(--secondary)',
              desc: 'Measures the raw difference in selection rates across demographic groups. TokenFlow flags gaps above configurable thresholds for human review.',
            },
            {
              metric: 'Equalized Odds',
              icon: 'balance',
              color: 'var(--success)',
              desc: 'Checks whether true-positive and false-positive rates are equal across groups — critical for medical diagnosis and criminal-justice applications.',
            },
          ].map((m) => (
            <div key={m.metric} className="card p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 rounded-lg flex-shrink-0"
                  style={{ background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}>
                  <M icon={m.icon} style={{ fontSize: 18, color: m.color }} />
                </div>
                <h3 className="text-sm font-bold font-headline" style={{ color: m.color }}>{m.metric}</h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Security Layer — Vertex AI Inspiration ── */}
      <motion.section {...fade(0.25)} className="mb-8">
        <div className="card p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full mb-4"
                style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)' }}>
                <M icon="security" style={{ fontSize: 12, color: 'var(--error)' }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--error)' }}>
                  Security Layer — Inspired by Google Vertex AI
                </span>
              </div>
              <h2 className="font-headline text-lg font-bold mb-3">
                Why Workflow Security Matters for AI Fairness
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--on-surface-variant)' }}>
                The Google Vertex AI "Double Agent" incident (April 2026) demonstrated how an AI agent
                with over-permissioned access can silently exfiltrate data and move laterally across
                internal systems — going undetected for hours.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
                Bias audits are only trustworthy when the underlying pipeline is secure. If an
                AI agent can tamper with the data flowing into a fairness check, the results are
                meaningless. TokenFlow solves both problems together:
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: 'key', label: 'Single-use capability tokens', desc: 'Every AI action is gated by a one-time token scoped to a single service, resource, and verb.' },
                { icon: 'lock', label: 'Credential vault isolation', desc: 'The agent never holds raw credentials — all secrets live in a vault and are never exposed to the model.' },
                { icon: 'history', label: 'Immutable audit trail', desc: 'Every action is logged in real time. Any anomaly triggers an alert and blocks further execution.' },
                { icon: 'local_fire_department', label: 'Kill switch', desc: 'One click revokes every active token simultaneously, halting a compromised workflow instantly.' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(46,59,68,0.3)' }}>
                  <div className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(127,165,190,0.06)' }}>
                    <M icon={item.icon} style={{ fontSize: 16, color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--on-surface)' }}>{item.label}</p>
                    <p className="text-xs leading-snug" style={{ color: 'var(--on-surface-variant)' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── Who This Is For ── */}
      <motion.section {...fade(0.3)} className="mb-8">
        <h2 className="font-headline text-lg font-bold mb-1">Who This Is For</h2>
        <div className="w-8 h-0.5 rounded-full mb-5" style={{ background: 'var(--secondary)' }} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: 'domain', color: 'var(--primary)', title: 'Enterprises', desc: 'HR, finance, and healthcare teams that use ML models to make consequential decisions at scale.' },
            { icon: 'policy', color: 'var(--secondary)', title: 'Compliance Teams', desc: 'Legal and risk officers preparing for GDPR, the EU AI Act, or US EEOC audits.' },
            { icon: 'code', color: 'var(--success)', title: 'ML Engineers', desc: 'Data scientists who need fast, reproducible fairness metrics integrated into their build pipeline.' },
    { icon: 'school', color: 'var(--warning)', title: 'Researchers', desc: 'Academics studying algorithmic fairness who need transparent, reproducible evaluation tooling.' },
          ].map((item) => (
            <div key={item.title} className="card p-5 card-interactive">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl"
                style={{ background: `color-mix(in srgb, ${item.color} 12%, transparent)` }}>
                <M icon={item.icon} style={{ fontSize: 20, color: item.color }} />
              </div>
              <h3 className="text-sm font-bold mb-1 font-headline">{item.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Principles ── */}
      <motion.section {...fade(0.35)} className="mb-2">
        <div className="card p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(52,211,153,0.1)' }}>
              <M icon="verified_user" style={{ fontSize: 22, color: 'var(--success)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold font-headline">Design Principles</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                What guides every decision in how TokenFlow is built
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
            {[
              { label: 'Human-first', desc: 'Flagged decisions are queued for human review, never silently overridden. AI assists; humans decide.' },
              { label: 'Transparent metrics', desc: 'All fairness calculations are shown with their formula, inputs, and thresholds — no black boxes.' },
              { label: 'Minimal footprint', desc: 'AI agents request only the permissions they need, when they need them. Excess access is blocked by design.' },
              { label: 'Auditability first', desc: 'Every action, token, and decision is logged with a timestamp and actor. Nothing happens off the record.' },
              { label: 'Fail safe', desc: 'If a token is invalid, expired, or out of scope, the action stops immediately — not silently degraded.' },
              { label: 'Open standards', desc: 'TokenFlow is built against established fairness definitions (disparate impact, equalized odds) — not proprietary metrics.' },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-2.5">
                <M icon="check_circle" style={{ fontSize: 16, color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <span className="text-sm font-bold" style={{ color: 'var(--on-surface)' }}>{p.label} — </span>
                  <span className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>{p.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

    </motion.div>
  );
}
