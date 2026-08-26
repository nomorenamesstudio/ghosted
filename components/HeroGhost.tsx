/**
 * Animated brand ghost for the hero — an outline mascot with a translucent
 * 20% fill, matching the logo icon's silhouette (rounded dome + spiky
 * zigzag bottom) and white eyes. It slowly floats (with a levitation ground
 * shadow rendered by the caller) and the eyes glance around / blink
 * occasionally. Pure CSS keyframes; disabled under prefers-reduced-motion.
 *
 * The float animation lives on the <svg> element itself (not an inner
 * group): an inner group's translate would get clipped by the SVG viewport.
 */
export function HeroGhost({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <defs>
        {/* Vertical fade: luminous head → near-transparent feet. */}
        <linearGradient id="ghost-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Silhouette: dome + spiky zigzag bottom (as in the logo icon). */}
      <path
        d="M16.7 41.7
           C16.7 18 33.3 8.3 50 8.3
           C66.7 8.3 83.3 18 83.3 41.7
           L83.3 91.7 L70.8 79.2 L60.4 89.6 L50 79.2
           L39.6 89.6 L29.2 79.2 L16.7 91.7 Z"
        fill="url(#ghost-fill)"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Eyes (pill shapes — straight sides, rounded caps) glance + blink. */}
      <g className="ghost-eyes">
        <rect x="34" y="36.7" width="7" height="10" rx="3.5" fill="currentColor" />
        <rect x="59" y="36.7" width="7" height="10" rx="3.5" fill="currentColor" />
      </g>
    </svg>
  );
}
