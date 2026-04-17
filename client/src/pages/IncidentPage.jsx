import { motion } from 'framer-motion';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ═══════════════════════════════════════════════════════════
   INCIDENT EXPLAINER PAGE
   Visual comparison of old model vs TokenFlow model
   ═══════════════════════════════════════════════════════════ */
export default function IncidentPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--error), rgba(147,0,10,0.8))', boxShadow: '0 0 30px rgba(255,180,171,0.2)' }}>
          <M icon="gpp_bad" style={{ fontSize: 32, color: '#fff' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline">The Vertex AI "Double Agent" Incident</h2>
        <p className="text-sm mt-2 max-w-xl mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
          April 2026 — How an AI agent extracted service credentials and moved laterally through internal systems, and how TokenFlow prevents this class of failure.
        </p>
      </div>

      {/* Incident Timeline */}
      <section className="mb-10">
        <h3 className="font-headline text-lg font-bold mb-6 text-center">Incident Timeline</h3>
        <div className="timeline max-w-2xl mx-auto">
          {[
            { phase: '01', title: 'Initial Compromise', desc: 'Attacker identifies a flaw in the Vertex AI agent system that allows it to access credentials stored in the runtime environment.', color: 'var(--warning)' },
            { phase: '02', title: 'Credential Extraction', desc: 'The AI agent — acting as a "double agent" — extracts service-account credentials that were available in its runtime.', color: 'var(--error)' },
            { phase: '03', title: 'Lateral Movement', desc: 'Using the extracted credentials, the agent accesses internal systems it was never authorized for: source control, customer databases, deployment pipelines.', color: 'var(--error)' },
            { phase: '04', title: 'Data Exposure', desc: 'Customer data and internal configuration secrets are exfiltrated. The agent operated autonomously for hours before detection.', color: 'var(--error)' },
          ].map((step, i) => (
            <motion.div key={step.phase} className="timeline-node" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}>
              <div className="timeline-dot" style={{ borderColor: step.color }}><div className="ping" style={{ background: step.color }} /></div>
              <div className="card p-5" style={{ borderColor: step.color === 'var(--error)' ? 'rgba(255,180,171,0.2)' : undefined }}>
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase block mb-1" style={{ color: step.color }}>Phase {step.phase}</span>
                <h4 className="text-sm font-bold mb-1 font-headline">{step.title}</h4>
                <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Side-by-Side Comparison */}
      <section className="mb-10">
        <h3 className="font-headline text-lg font-bold mb-6 text-center">Architecture Comparison</h3>
        <div className="grid md:grid-cols-2 gap-5">
          {/* Old Model */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="card-glow-error p-6">
            <div className="flex items-center gap-2 mb-5">
              <M icon="gpp_bad" style={{ color: 'var(--error)', fontSize: 22 }} />
              <h4 className="text-base font-bold font-headline" style={{ color: 'var(--error)' }}>Traditional Model (Vulnerable)</h4>
            </div>
            <div className="space-y-3">
              {[
                { icon: 'key_off', text: 'Credentials stored in agent runtime', fatal: true },
                { icon: 'open_in_full', text: 'Broad, standing permissions', fatal: true },
                { icon: 'all_inclusive', text: 'No per-action scoping', fatal: true },
                { icon: 'swap_horiz', text: 'Free cross-service movement', fatal: true },
                { icon: 'visibility_off', text: 'No real-time audit trail', fatal: true },
                { icon: 'block', text: 'No kill switch or pause mechanism', fatal: true },
                { icon: 'replay', text: 'Credentials reusable indefinitely', fatal: true },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,180,171,0.04)', border: '1px solid rgba(255,180,171,0.1)' }}>
                  <M icon={item.icon} style={{ fontSize: 16, color: 'var(--error)' }} />
                  <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
                  {item.fatal && <span className="ml-auto text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--error)' }}>FATAL</span>}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* TokenFlow Model */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="card-glow-primary p-6">
            <div className="flex items-center gap-2 mb-5">
              <M icon="verified_user" style={{ color: 'var(--success)', fontSize: 22 }} />
              <h4 className="text-base font-bold font-headline" style={{ color: 'var(--success)' }}>TokenFlow Model (Protected)</h4>
            </div>
            <div className="space-y-3">
              {[
                { icon: 'lock', text: 'Credentials in vault — agent never sees secrets' },
                { icon: 'key', text: 'Single-use capability tokens, per-action' },
                { icon: 'target', text: 'Scoped to one service, one action, one resource' },
                { icon: 'block', text: 'Cross-service movement blocked at policy engine' },
                { icon: 'history', text: 'Complete immutable audit trail' },
                { icon: 'local_fire_department', text: 'Kill switch revokes all active tokens instantly' },
                { icon: 'auto_delete', text: 'Tokens burned after single use — no replay' },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.1)' }}>
                  <M icon={item.icon} style={{ fontSize: 16, color: 'var(--success)' }} />
                  <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.text}</span>
                  <span className="ml-auto text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--success)' }}>SAFE</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Failure → Mechanism Mapping */}
      <section className="mb-8">
        <h3 className="font-headline text-lg font-bold mb-6 text-center">Failure Mode → TokenFlow Mechanism</h3>
        <div className="card p-6 overflow-auto">
          <table className="incident-table">
            <thead>
              <tr>
                <th>Failure Mode</th>
                <th>Vertex Impact</th>
                <th>TokenFlow Defense</th>
                <th>Blast Radius</th>
              </tr>
            </thead>
            <tbody>
              {[
                { failure: 'Credential in runtime', impact: 'Agent extracts service-account keys', defense: 'Vault proxy — agent never sees credentials', blast: 'Zero' },
                { failure: 'Over-permissioned agent', impact: 'Agent accesses any service with one key', defense: 'Per-action token scoping', blast: 'Single action' },
                { failure: 'Cross-service movement', impact: 'From GCS to source control to DB', defense: 'Service scope enforcement in policy engine', blast: 'Blocked at boundary' },
                { failure: 'No audit trail', impact: 'Breach undetected for hours', defense: 'Immutable audit log + WebSocket alerts', blast: 'Real-time detection' },
                { failure: 'No kill switch', impact: 'Agent continues unimpeded', defense: 'Kill switch revokes all tokens instantly', blast: 'Immediate halt' },
                { failure: 'Credential replay', impact: 'Stolen cred used repeatedly', defense: 'Burn-after-use + nonce verification', blast: 'Single use' },
                { failure: 'No human review', impact: 'Agent operates autonomously', defense: 'Step-up auth + review gates', blast: 'Human-controlled' },
              ].map((row, i) => (
                <tr key={i}>
                  <td><span className="font-bold text-xs">{row.failure}</span></td>
                  <td className="text-xs" style={{ color: 'var(--error)' }}>{row.impact}</td>
                  <td className="text-xs" style={{ color: 'var(--success)' }}>{row.defense}</td>
                  <td>
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)', color: 'var(--success)' }}>{row.blast}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </motion.div>
  );
}
