"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
import {
  DONATE_URL,
  dismissBanner,
  readDonateState,
  shouldShowBanner,
  writeDonateState,
} from "@/lib/utils/donate-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

/** The lucide Coffee icon paths (24×24 grid). */
const CUP_PATHS =
  `<path d="M10 2v2"/><path d="M14 2v2"/>` +
  `<path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>` +
  `<path d="M6 2v2"/>`;

/**
 * Seamless 45°-rotated brick grid of faint dark coffee cups, like the hero
 * tornado — generated, no geometry gymnastics in the component. The brick
 * lattice (spacing 48px, rows offset 50%) is rotated 45°; its axis-aligned
 * period is 2√2·s ≈ 135.8px, so a tile of that size repeats seamlessly.
 * Cups touching a tile edge are also drawn at the wrap-around positions so
 * adjacent tiles complete them. Plain CSS background, no overlay transform.
 */
const TILE_SPACING = 48; // brick spacing (horizontal cup distance)
const TILE = 2 * Math.SQRT2 * TILE_SPACING; // ≈ 135.8, lattice period
const C45 = Math.SQRT2 / 2;
const LATTICE_POINTS: Array<[number, number]> = [];
for (let m = -8; m <= 8; m++) {
  for (let n = -8; n <= 8; n++) {
    const ux = m * TILE_SPACING + (n * TILE_SPACING) / 2;
    const uy = n * TILE_SPACING;
    const rx = (ux - uy) * C45;
    const ry = (ux + uy) * C45;
    if (rx >= 0 && rx < TILE && ry >= 0 && ry < TILE) {
      LATTICE_POINTS.push([rx, ry]);
    }
  }
}
let CUP_GROUPS = "";
for (const [x, y] of LATTICE_POINTS) {
  // All 9 wrap copies (±T, 0): a cup near any tile edge spills over, and
  // the copy at the opposite edge completes it in the neighbour's tile.
  for (const dx of [-TILE, 0, TILE]) {
    for (const dy of [-TILE, 0, TILE]) {
      CUP_GROUPS += `<g transform="translate(${x + dx} ${y + dy}) rotate(45) scale(1.05)">${CUP_PATHS}</g>`;
    }
  }
}
const COFFEE_PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">` +
    `<defs><pattern id="p" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse">` +
    `<g stroke="#09090b" stroke-opacity="0.12" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    CUP_GROUPS +
    `</g></pattern></defs>` +
    `<rect width="${TILE}" height="${TILE}" fill="url(#p)"/>` +
    `</svg>`,
)}")`;

export function DonateBanner({ offers }: { offers: number }) {
  const [state, setState] = useState(readDonateState);

  if (!shouldShowBanner(state, offers > 0)) return null;

  function onDismiss() {
    const next = dismissBanner(state);
    setState(next);
    writeDonateState(next);
  }

  return (
    <Card className="relative overflow-hidden border-violet-300/40 bg-gradient-to-b from-violet-600 to-violet-700 dark:border-violet-800/60 dark:from-violet-600 dark:to-violet-700">
      {/* Seamless diagonal coffee-cup pattern, behind the content. The SVG
          tile is already seamless (wrap-around copies), so a plain inset-0
          overlay is enough — no rotation/scale needed. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: COFFEE_PATTERN }}
        aria-hidden
      />
      <CardContent className="relative flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-white">
              Congratulations on the offer! 🎉
            </p>
            <p className="text-sm text-violet-100">
              If Ghosted has been useful in your job-seeking journey, please
              consider buying us a coffee — every cup keeps the ghost alive
              and the tracker free for everyone.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            className="bg-white text-violet-700 hover:bg-violet-100"
          >
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              <Coffee />
              Buy us a coffee
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={onDismiss}
          >
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
