import type { AgentScope } from "@/lib/db/schema";

/**
 * The three scopes, and the words for them.
 *
 * Client-safe on purpose: the Settings card renders exactly these labels and
 * descriptions, and the MCP instructions repeat them to the agent, so the thing
 * the owner picks and the thing the agent is told are one string each.
 */

/** Narrowest first: each scope includes every scope below it. */
export const AGENT_SCOPES = ["read", "edit", "full"] as const;

const RANK: Record<AgentScope, number> = { read: 0, edit: 1, full: 2 };

export function scopeIncludes(scope: AgentScope, needed: AgentScope): boolean {
  return RANK[scope] >= RANK[needed];
}

export const SCOPE_LABELS: Record<AgentScope, string> = {
  read: "Read only",
  edit: "Read and edit",
  full: "Full access",
};

export const SCOPE_DESCRIPTIONS: Record<AgentScope, string> = {
  read: "See applications, milestones and stats. Change nothing.",
  edit:
    "Everything read only can do, plus adding and changing applications and milestones.",
  full:
    "Everything read and edit can do, plus the destructive tools: archive an application, delete a milestone, reset a timeline.",
};
