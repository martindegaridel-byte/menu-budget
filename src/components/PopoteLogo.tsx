/** Logo Popote : une marmite dont la vapeur dessine un €. Couleur = currentColor. */
export function PopoteLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 50h56v13a16 16 0 0 1-16 16H38a16 16 0 0 1-16-16z" />
      <path d="M15 50h70" />
      <path d="M10 58h9M81 58h9" />
      <path d="M66 15a15 15 0 1 0 0 23" />
      <path d="M36 23.5h18M36 30.5h18" strokeWidth={6} />
    </svg>
  );
}
