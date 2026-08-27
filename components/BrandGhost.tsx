/**
 * The brand ghost mark (violet outline + translucent fill + pill eyes) —
 * matches the mark used in transactional emails. No tile/background; a
 * lighter violet variant in dark mode.
 */
export function BrandGhost({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <path
        d="M16.7 41.7 C16.7 18 33.3 8.3 50 8.3 C66.7 8.3 83.3 18 83.3 41.7 L83.3 91.7 L70.8 79.2 L60.4 89.6 L50 79.2 L39.6 89.6 L29.2 79.2 L16.7 91.7 Z"
        className="fill-violet-700/15 stroke-violet-700 dark:fill-violet-300/20 dark:stroke-violet-300"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <rect x="34" y="36.7" width="7" height="10" rx="3.5" className="fill-violet-700 dark:fill-violet-300" />
      <rect x="59" y="36.7" width="7" height="10" rx="3.5" className="fill-violet-700 dark:fill-violet-300" />
    </svg>
  );
}
