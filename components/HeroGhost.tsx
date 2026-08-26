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
      {/* Silhouette: dome + spiky zigzag bottom (as in the logo icon). */}
      <path
        d="M16.7 41.7
           C16.7 18 33.3 8.3 50 8.3
           C66.7 8.3 83.3 18 83.3 41.7
           L83.3 91.7 L70.8 79.2 L60.4 89.6 L50 79.2
           L39.6 89.6 L29.2 79.2 L16.7 91.7 Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Eyes glance around and blink together. */}
      <g className="ghost-eyes">
        <circle cx="37.5" cy="41.7" r="4" fill="currentColor" />
        <circle cx="62.5" cy="41.7" r="4" fill="currentColor" />
      </g>
    </svg>
  );
}
