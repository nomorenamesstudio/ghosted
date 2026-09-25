"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The landing's product shot: the board and the list as one window with a
 * draggable split down the middle, so a visitor can pull the seam either way and
 * see the view they care about instead of squinting at two shrunken screenshots
 * side by side.
 *
 * The two layers are full-width captures of the same dashboard, clipped at the
 * seam — nothing moves when you drag, the boundary does, which is what makes it
 * read as one window rather than two images sliding past each other. The app bar
 * above them is a third capture, so the frame is the real app header rather than
 * a lookalike drawn in markup.
 *
 * The handle is a proper slider: pointer (mouse, pen, touch) plus arrow keys,
 * Home and End, with `aria-valuenow`, so it is usable without a mouse and does
 * not trip the accessibility gate.
 */
const MIN = 18;
const MAX = 82;

export function LandingViewSplit() {
  const [split, setSplit] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const { left, width } = frame.getBoundingClientRect();
    const pct = ((clientX - left) / width) * 100;
    setSplit(Math.min(MAX, Math.max(MIN, Math.round(pct))));
  }, []);

  // Window listeners rather than pointer capture: the seam keeps following the
  // pointer once the drag has left the frame (and off the handle), which is what
  // makes it feel like dragging a divider instead of chasing a small target.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) setFromClientX(event.clientX);
    };
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [setFromClientX]);

  const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setFromClientX(event.clientX);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 4;
    if (event.key === "ArrowLeft") setSplit((v) => Math.max(MIN, v - step));
    else if (event.key === "ArrowRight") setSplit((v) => Math.min(MAX, v + step));
    else if (event.key === "Home") setSplit(MIN);
    else if (event.key === "End") setSplit(MAX);
    else return;
    event.preventDefault();
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xl">
      {/* Browser chrome */}
      <div
        aria-hidden
        className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2"
      >
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="ml-1 truncate rounded-md bg-background/80 px-2 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground">
          ghosted.lostsignals.studio
        </span>
      </div>

      {/* The app's own bar, captured once: one header for one window. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing-views/appbar.jpg"
        width={1280}
        height={57}
        alt=""
        aria-hidden
        className="block w-full border-b"
      />

      <div
        ref={frameRef}
        onPointerDown={startDragging}
        className="relative cursor-ew-resize touch-pan-y select-none"
        style={{ aspectRatio: "1280 / 743" }}
      >
        {/* Two halves of one window, and nothing moves while you drag: the seam
            decides how much of each capture you get, which is what a split view
            does. The list sits on the left because its cards lead with the
            company name — a vertical cut through the board takes a card's left
            edge, a cut through a full-width list card would take its middle. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing-views/list.jpg"
          width={1280}
          height={743}
          alt="The Ghosted dashboard in list view: applications grouped by stage."
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing-views/board.jpg"
          width={1280}
          height={743}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          draggable={false}
        />

        {/* The seam and its handle. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Reveal the board or the list"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={split}
          aria-valuetext={`${split}% board`}
          onKeyDown={onKeyDown}
          className="absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ left: `${split}%` }}
        >
          <span aria-hidden className="absolute inset-y-0 w-px bg-border" />
          <span
            aria-hidden
            className="relative flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground shadow-sm",
            split === 50 && "opacity-100",
            split !== 50 && "opacity-0",
          )}
        >
          Drag the seam
        </div>
      </div>
    </div>
  );
}
