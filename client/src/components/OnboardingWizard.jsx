import { useState } from 'react';
import { motion } from 'framer-motion';

const M = ({ icon, style }) => <span className="material-symbols-outlined" style={style}>{icon}</span>;

const STEPS = [
  {
    id: 'problem',
    icon: 'warning',
    color: 'var(--error)',
    bg: 'rgba(255,180,171,0.1)',
    title: 'The Problem We Solve',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          Automated systems now make critical decisions — loan approvals, hiring, medical triage. But when these systems learn from <strong style={{ color: 'var(--on-surface)' }}>biased historical data</strong>, they repeat and amplify discrimination at scale.
        </p>
        <div className="space-y-2">
          {[
            { icon: 'close', color: 'var(--error)', text: 'Biased training data leads to unfair outcomes for protected groups' },
            { icon: 'close', color: 'var(--error)', text: 'AI agents with broad permissions can access data they shouldn\'t' },
            { icon: 'close', color: 'var(--error)', text: 'Without auditing tools, discrimination goes undetected' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <M icon={item.icon} style={{ fontSize: 14, color: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'fairness',
    icon: 'balance',
    color: 'var(--secondary)',
    bg: 'rgba(20,209,255,0.1)',
    title: 'Fairness Auditing & Bias Detection',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          Upload any dataset and TokenFlow will <strong style={{ color: 'var(--on-surface)' }}>mathematically measure</strong> fairness across protected groups — gender, age, ethnicity, or any attribute you define.
        </p>
        <div className="space-y-2">
          {[
            { icon: 'check_circle', color: 'var(--success)', text: 'Disparate impact, statistical parity, and equalized odds metrics' },
            { icon: 'check_circle', color: 'var(--success)', text: 'Threshold-based mitigation to reduce detected bias' },
            { icon: 'check_circle', color: 'var(--success)', text: 'Gemini AI-powered executive summaries of audit results' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <M icon={item.icon} style={{ fontSize: 14, color: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'security',
    icon: 'security',
    color: 'var(--primary)',
    bg: 'rgba(196,192,255,0.1)',
    title: 'Workflow Security & Token Controls',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          Every AI action is gated by a <strong style={{ color: 'var(--on-surface)' }}>single-use capability token</strong>. Each token is scoped to one service, one resource, and one verb — then permanently destroyed after use.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'MINT', icon: 'add_circle', color: 'var(--primary)' },
            { label: 'ACTIVATE', icon: 'bolt', color: 'var(--secondary)' },
            { label: 'BURN', icon: 'local_fire_department', color: 'var(--success)' },
          ].map((t) => (
            <div key={t.label} className="p-3 rounded-xl text-center" style={{ background: `color-mix(in srgb, ${t.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 20%, transparent)` }}>
              <M icon={t.icon} style={{ fontSize: 20, color: t.color }} />
              <p className="text-[8px] font-bold uppercase tracking-[0.15em] mt-1" style={{ color: t.color }}>{t.label}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'enterprise',
    icon: 'domain',
    color: 'var(--success)',
    bg: 'rgba(52,211,153,0.1)',
    title: 'Enterprise Audit & Reporting',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          The <strong style={{ color: 'var(--on-surface)' }}>Enterprise Audit</strong> tab brings everything together. Upload your workflow and dataset, run both security and fairness checks, and generate a combined compliance report — all in one place.
        </p>
        <div className="space-y-2">
          {[
            { icon: 'check_circle', color: 'var(--success)', text: 'Combined security + fairness scoring in a single report' },
            { icon: 'check_circle', color: 'var(--success)', text: 'Save, reload, and compare past audit results' },
            { icon: 'check_circle', color: 'var(--success)', text: 'Download compliance reports for regulatory review' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <M icon={item.icon} style={{ fontSize: 14, color: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

/**
 * OnboardingWizard — First-time feature walkthrough.
 * Fires once per browser session (sessionStorage flag).
 * Explains: problem → fairness → security → enterprise.
 */
export default function OnboardingWizard({ onFinish }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function finish() {
    sessionStorage.setItem('tf_session_toured', '1');
    onFinish?.();
  }

  function handleCTA() {
    if (isLast) {
      finish();
    } else {
      next();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md card p-8 relative overflow-hidden"
        style={{ border: `1px solid color-mix(in srgb, ${current.color} 25%, transparent)` }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 80% 10%, color-mix(in srgb, ${current.color} 8%, transparent), transparent 60%)` }} />

        {/* Skip */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
          style={{
            color: 'var(--on-surface-variant)',
            background: 'rgba(199,196,216,0.12)',
            border: '1px solid rgba(199,196,216,0.25)',
            letterSpacing: '0.12em',
          }}
        >
          ✕ Skip
        </button>

        {/* Step dots */}
        <div className="flex gap-1.5 mb-6 relative z-10">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 rounded-full" style={{ width: i === step ? '2rem' : '0.5rem', background: i <= step ? current.color : 'var(--outline-variant)', transition: 'all 0.2s ease' }} />
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

        {/* Content — no AnimatePresence, direct render for snappy transitions */}
        <div className="relative z-10 mb-6">
          {current.content}
        </div>

        {/* CTA button */}
        <div className="relative z-10 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="btn-ghost px-4"
            >
              <M icon="arrow_back" style={{ fontSize: 16 }} /> Back
            </button>
          )}
          <button
            onClick={handleCTA}
            className="btn-primary flex-1"
          >
            {isLast ? (
              <><M icon="check_circle" style={{ fontSize: 18 }} /> Get Started</>
            ) : (
              <>Next <M icon="arrow_forward" style={{ fontSize: 16 }} /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
