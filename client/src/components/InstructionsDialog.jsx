import { AnimatePresence, motion } from 'framer-motion';

export default function InstructionsDialog({
  open,
  onClose,
  title,
  subtitle,
  sections = [],
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close instructions"
            onClick={onClose}
            className="fixed inset-0 z-60"
            style={{ background: 'rgba(0,0,0,0.55)', border: 'none' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-70 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5"
            style={{
              background: 'var(--surface-container)',
              borderColor: 'rgba(196,192,255,0.2)',
              boxShadow: '0 16px 60px rgba(0,0,0,0.45)',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--secondary)' }}>Instructions</p>
                <h3 className="text-lg font-bold font-headline" style={{ color: 'var(--on-surface)' }}>{title}</h3>
                {subtitle && (
                  <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>{subtitle}</p>
                )}
              </div>
              <button type="button" onClick={onClose} className="btn-ghost" style={{ fontSize: '0.65rem', padding: '0.35rem 0.7rem' }}>
                Close
              </button>
            </div>

            <div className="space-y-4">
              {sections.map((section, sectionIndex) => (
                <div key={`${section.title}-${sectionIndex}`} className="rounded-xl p-4" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.15)' }}>
                  <h4 className="text-xs font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--primary)' }}>{section.title}</h4>
                  <ol className="space-y-1">
                    {(section.steps || []).map((step, stepIndex) => (
                      <li key={`${section.title}-${stepIndex}`} className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
                        <span className="font-bold font-mono" style={{ color: 'var(--secondary)' }}>{stepIndex + 1}.</span> {step}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
