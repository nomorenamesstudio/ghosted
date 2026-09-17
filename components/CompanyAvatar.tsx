"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Three sizes: `sm` for tight spots, `md` next to the detail page's headline,
 * and `lg` for a card's identity block, where it is sized to match the company
 * name and the role together (20 + 16 = 36px tall).
 */
const SIZES = {
  sm: { box: "h-6 w-6", radius: "rounded-md", text: "text-[11px]" },
  md: { box: "h-8 w-8", radius: "rounded-lg", text: "text-[13px]" },
  lg: { box: "h-9 w-9", radius: "rounded-lg", text: "text-[13px]" },
} as const;

/**
 * The company chip shown in front of the company name.
 *
 * A rounded square rather than the round user avatar: favicons are square with
 * detail near the corners, and a circle crops exactly that. The monogram
 * fallback (first letter of the company) is what shows for a company with no
 * logo, and it stays neutral - the card already carries its status colour.
 *
 * The image is decorative: the company name sits right next to it, so it is
 * hidden from assistive tech instead of being announced twice.
 */
export function CompanyAvatar({
  applicationId,
  company,
  version,
  cacheKey,
  size = "sm",
  className,
}: {
  applicationId: string;
  company: string;
  /** Application `updatedAt` - bumps the URL so a state change cannot serve a stale logo. */
  version?: string | number | Date | null;
  /**
   * The fields the lookup itself reads (job URL and company website). Editing
   * one of those no longer moves `updatedAt`, so the cached image would go
   * stale without them in the URL.
   */
  cacheKey?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const stamp = version ? new Date(version).getTime() : null;
  const params = new URLSearchParams();
  if (stamp) params.set("v", String(stamp));
  if (cacheKey) params.set("c", cacheKey);
  const src = `/logos/${applicationId}${params.size ? `?${params}` : ""}`;
  const initial = company.trim().charAt(0).toUpperCase() || "?";
  const s = SIZES[size];

  return (
    <Avatar
      className={cn(s.box, s.radius, "shrink-0", className)}
      aria-hidden
    >
      <AvatarImage src={src} alt="" className={s.radius} />
      <AvatarFallback
        className={cn(
          s.radius,
          s.text,
          "bg-muted/80 font-semibold leading-none text-muted-foreground",
        )}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
