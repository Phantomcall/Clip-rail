/** YouTube Shorts mark (simplified). */
export function ShortsIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="YouTube Shorts" role="img">
      <path
        fill="#FF0033"
        d="M17.8 9.6 12.6 12.5l5.2 2.9a3.6 3.6 0 0 1-3.5 6.3l-8-4.4a3.6 3.6 0 0 1 0-6.3l1.5-.8-1.5-.9a3.6 3.6 0 0 1 3.5-6.3l8 4.4a3.6 3.6 0 0 1 0 6.3Z"
      />
      <path fill="#fff" d="m10 9.2 5 2.8-5 2.8V9.2Z" />
    </svg>
  );
}

export function VerifiedIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Verified" role="img">
      <path fill="var(--color-accent)" d="m12 2 2.4 1.8 3 .2.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3 .2L12 22l-2.4-1.8-3-.2-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3-.2L12 2Z" />
      <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m8.5 12.2 2.3 2.3 4.7-4.9" />
    </svg>
  );
}

export function CheckCircle({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="var(--color-money)" />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m7.5 12.3 3 3 6-6.3" />
    </svg>
  );
}

/** Outline icons (24 px grid, 2 px stroke, current text colour), used instead of emoji so they look the same on
 * every device. */
function Outline({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
export const KeyIcon = ({ className = "size-5" }: { className?: string }) => (
  <Outline className={className}>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15 19 4m-2.5 2.5L19 9m-5-1 2 2" />
  </Outline>
);
export const LockIcon = ({ className = "size-4" }: { className?: string }) => (
  <Outline className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
  </Outline>
);
export const ClockIcon = ({ className = "size-5" }: { className?: string }) => (
  <Outline className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Outline>
);
export const CheckIcon = ({ className = "size-4" }: { className?: string }) => (
  <Outline className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Outline>
);
export const AlertIcon = ({ className = "size-4" }: { className?: string }) => (
  <Outline className={className}>
    <path d="M12 7v6m0 4h.01" />
  </Outline>
);
export const CloseIcon = ({ className = "size-4" }: { className?: string }) => (
  <Outline className={className}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </Outline>
);
export const ExternalIcon = ({ className = "size-3" }: { className?: string }) => (
  <Outline className={className}>
    <path d="M8 16 16 8m-6.5 0H16v6.5" />
  </Outline>
);
export const InboxIcon = ({ className = "size-6" }: { className?: string }) => (
  <Outline className={className}>
    <path d="M3.5 13.5h4.25l1.5 2.5h5.5l1.5-2.5h4.25" />
    <path d="M6 5h12l2.5 8.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-4.5Z" />
  </Outline>
);
/** A filled play triangle for view counts. */
export const PlayIcon = ({ className = "size-2.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.5-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8Z" fill="currentColor" />
  </svg>
);
