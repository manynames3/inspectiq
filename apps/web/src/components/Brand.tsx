export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`supreme-wordmark ${compact ? "compact" : ""}`}>
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none" aria-hidden="true">
      <path d="M16 2 30 26 16 20 2 26 16 2Z" fill="currentColor" />
      <path d="m2 31 14-6 14 6-14 4-14-4Z" fill="currentColor" opacity=".5" />
    </svg>
    <span><strong>Inspect<span>IQ</span></strong>{!compact ? <small>BY SUPREME AI VENTURES</small> : null}</span>
  </span>;
}
