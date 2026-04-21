import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const M = ({ icon, style }) => <span className="material-symbols-outlined" style={style}>{icon}</span>;

const STEPS = [
  {
    id: 'incident',
    icon: 'warning',
    color: 'var(--error)',
    bg: 'rgba(255,180,171,0.1)',
    title: 'April 2026 — The Double Agent Incident',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          A flaw in Google Cloud's AI system allowed a loan-processing agent to silently exfiltrate service-account credentials from source control, gain unauthorized access to internal systems, and read thousands of private applicant records — undetected for hours.
        </p>
        <div className="space-y-2">
          {[
            { icon: 'close', color: 'var(--error)', text: 'The agent had broad, standing permissions — no per-action scoping' },
            { icon: 'close', color: 'var(--error)', text: 'Credentials lived inside the agent runtime — exposed to prompts' },
            { icon: 'close', color: 'var(--error)', text: 'No kill switch — agent continued autonomously for hours' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <M icon={item.icon} style={{ fontSize: 14, color: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    cta: 'See how TokenFlow prevents this →',
  },
  {
    id: 'tokens',
    icon: 'key',
    color: 'var(--primary)',
    bg: 'rgba(196,192,255,0.1)',
    title: 'Capability Tokens — One Action, One Use',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          TokenFlow mints a <strong style={{ color: 'var(--on-surface)' }}>single-use capability token</strong> for every action an AI agent wants to take. Each token is scoped to exactly one service, one resource, and one action verb.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { phase: '01', label: 'MINT', icon: 'add_circle', color: 'var(--primary)' },
            { phase: '02', label: 'ACTIVATE', icon: 'bolt', color: 'var(--secondary)' },
            { phase: '03', label: 'BURN', icon: 'local_fire_department', color: 'var(--success)' },
          ].map((t) => (
            <div key={t.phase} className="p-3 rounded-xl text-center" style={{ background: `color-mix(in srgb, ${t.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 20%, transparent)` }}>
              <M icon={t.icon} style={{ fontSize: 20, color: t.color }} />
              <p className="text-[8px] font-bold uppercase tracking-[0.15em] mt-1" style={{ color: t.color }}>{t.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
          If the agent tries to reuse a burned token, or access a different service — <span style={{ color: 'var(--error)' }}>it gets blocked immediately.</span>
        </p>
      </div>
    ),
    cta: 'Watch a live attack get blocked →',
  },
  {
    id: 'loan',
    icon: 'account_balance',
    color: 'var(--secondary)',
    bg: 'rgba(166,230,255,0.1)',
    title: 'The Demo — A Real Loan Application',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          We simulate a real loan application. An AI agent processes <strong style={{ color: 'var(--on-surface)' }}>Maya Patel's</strong> $35,000 home improvement loan — with real Gemini credit scoring, real fairness checks, and a real vault.
        </p>
        <div className="space-y-2">
          {[
            { step: '1', label: 'Read applicant record', icon: 'folder_open', color: 'var(--primary)' },
            { step: '2', label: 'Gemini credit scoring + fairness check', icon: 'psychology', color: 'var(--secondary)' },
            { step: '3', label: 'Write decision (vault-brokered)', icon: 'check_circle', color: 'var(--success)' },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--surface-container-high)' }}>
              <div className="flex h-6 w-6 items-center justify-center rounded" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
                <span className="text-[9px] font-bold" style={{ color: s.color }}>{s.step}</span>
              </div>
              <M icon={s.icon} style={{ fontSize: 14, color: s.color }} />
              <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    cta: 'Simulate the Double Agent attack →',
  },
  {
    id: 'attack',
    icon: 'gpp_bad',
    color: 'var(--error)',
    bg: 'rgba(255,180,171,0.1)',
    title: 'Ready — Let\'s Block an Attack',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          We'll run the <strong style={{ color: 'var(--on-surface)' }}>Double Agent scenario</strong>. The loan AI will try to exfiltrate credentials mid-workflow, exactly like the Vertex incident. Watch TokenFlow stop it.
        </p>
        <div className="p-4 rounded-xl font-mono text-xs" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,180,171,0.2)' }}>
          <div style={{ color: 'rgba(255,180,171,0.6)' }}>SCENARIO: SCENARIO-002</div>
          <div style={{ color: 'rgba(199,196,216,0.8)' }}>Agent: agent-loan-processor</div>
          <div style={{ color: 'rgba(199,196,216,0.8)' }}>Applicant: James Okafor</div>
          <div style={{ color: 'rgba(255,180,171,0.9)' }}>Malicious step: READ source-control</div>
          <div style={{ color: 'rgba(52,211,153,0.9)' }}>Expected: BLOCKED ✓</div>
        </div>
        <p className="text-xs" style={{ color: 'var(--outline)' }}>This sends a real API request. The backend executes it live.</p>
      </div>
    ),
    cta: null, // action button handled by parent
  },
];

/**
 * OnboardingWizard — First-time 4-step guided tour.
 * Fires once per browser session (localStorage flag).
 * Shows the incident → token model → loan demo → live attack.
 */
export default function OnboardingWizard({ onFinish, onRunAttack }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function finish() {
    localStorage.setItem('tf_onboarded', '1');
    onFinish?.();
  }

  function handleCTA() {
    if (isLast) {
      localStorage.setItem('tf_onboarded', '1');
      onRunAttack?.();
    } else {
      next();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md card p-8 relative overflow-hidden"
        style={{ border: `1px solid color-mix(in srgb, ${current.color} 25%, transparent)` }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 80% 10%, color-mix(in srgb, ${current.color} 8%, transparent), transparent 60%)` }} />

        {/* Skip */}
        <button onClick={finish} className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--outline)' }}>
          Skip tour
        </button>

        {/* Step dots */}
        <div className="flex gap-1.5 mb-6 relative z-10">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all" style={{ width: i === step ? '2rem' : '0.5rem', background: i <= step ? current.color : 'var(--outline-variant)' }} />
          ))}
        </div>

        {/* Icon */}
        <div className="relative z-10 flex items-center gap-3 mb-5">
          <div className="p-3 rounded-2xl" style={{ background: current.bg }}>
            <M icon={current.icon} style={{ fontSize: 28, color: current.color }} />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: current.color }}>Step {step + 1} of {STEPS.length}</p>
            <h3 className="text-base font-bold font-headline leading-tight">{current.title}</h3>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="relative z-10 mb-6">
            {current.content}
          </motion.div>
        </AnimatePresence>

        {/* CTA button */}
        <div className="relative z-10 flex gap-3">
          <button
            onClick={handleCTA}
            className="btn-primary flex-1"
            style={isLast ? { background: 'linear-gradient(135deg, var(--error-container), rgba(147,0,10,0.8))', boxShadow: '0 0 30px rgba(255,180,171,0.2)' } : {}}
          >
            {isLast ? (
              <><M icon="gpp_bad" style={{ fontSize: 18 }} /> Run the Attack Live</>
            ) : (
              <>{current.cta || 'Continue'} <M icon="arrow_forward" style={{ fontSize: 16 }} /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
