import { useState } from 'react';

export default function ContextTooltip({ term, explanation }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="inline-flex items-center gap-1 relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      style={{ cursor: 'help' }}
    >
      <span>{term}</span>
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{ fontSize: 13, color: 'var(--outline)' }}
      >
        help
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-20 p-2 rounded-lg text-[10px] leading-relaxed"
          style={{
            width: 220,
            background: 'var(--surface-container-high)',
            border: '1px solid rgba(70,69,85,0.2)',
            color: 'var(--on-surface-variant)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          }}
        >
          {explanation}
        </span>
      )}
    </span>
  );
}

