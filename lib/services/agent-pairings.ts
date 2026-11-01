import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agentPairings,
  type AgentPairingState,
  type AgentScope,
} from "@/lib/db/schema";
import { mintAgentToken } from "./agent-tokens";

/**
 * Pairing an agent without a secret in the transcript.
 *
 * The owner starts a pairing in Settings and gets a short code. The code is the
 * only thing that goes into the conversation: on its own it buys the agent a
 * request the owner never approves. The agent claims it, the owner approves,
 * and the agent collects its token over its own connection.
 *
 * The pairing lives in Postgres rather than in this process's memory because
 * Next.js route handlers are separate compiled entries: a `Map` in a module
 * shared by `/api/agent/pair` and `/api/agent/pair/claim` is not guaranteed to
 * be the same object, and a pairing that cannot be approved is not a pairing.
 */

/** No I, O, 0 or 1: a code gets read aloud, typed by hand, and pasted into a chat. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TTL_MS = 10 * 60 * 1000;

/**
 * A collection can be lost: an agent whose shell wipes its scratch directory
 * between commands gets the token once and then has nothing. While the code
 * lives it may collect again, up to this many times.
 */
const MAX_HANDOVERS = 5;

function newCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Case and dashes are the caller's business; the code itself is forgiving. */
export function normalizeCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8
    ? `${clean.slice(0, 4)}-${clean.slice(4)}`
    : input.trim().toUpperCase();
}

/**
 * Expired pairings are deleted on the way past: nothing sweeps them in the
 * background. Called from every route that touches a pairing — including the
 * claim, because a row that nobody reads again would otherwise keep the
 * plaintext token it handed over (review 2026-11-01, finding 1).
 */
async function pruneExpired(now = new Date()): Promise<void> {
  await db.delete(agentPairings).where(lt(agentPairings.expiresAt, now));
}

export interface PendingPairing {
  code: string;
  name: string;
  scope: AgentScope;
  state: AgentPairingState;
  createdAt: string;
  /** Who claimed it, so the owner can see a claim that is not their agent. */
  claimedFrom: string | null;
  claimedAgent: string | null;
}

export async function startPairing(
  userId: string,
  input: { name: string; scope: AgentScope },
): Promise<{ code: string; expiresAt: string }> {
  await pruneExpired();
  const code = newCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(agentPairings).values({
    code,
    userId,
    name: input.name,
    scope: input.scope,
    expiresAt,
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

/** What the pairing panel polls: this account's pairings that are still waiting on it. */
export async function listPairings(userId: string): Promise<PendingPairing[]> {
  const now = new Date();
  await pruneExpired(now);
  const rows = await db
    .select()
    .from(agentPairings)
    .where(
      and(
        eq(agentPairings.userId, userId),
        gt(agentPairings.expiresAt, now),
        ne(agentPairings.state, "approved"),
      ),
    )
    .orderBy(desc(agentPairings.createdAt));
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    scope: row.scope,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    claimedFrom: row.claimedFrom,
    claimedAgent: row.claimedAgent,
  }));
}

/** Who is asking. The address is what the handover is bound to; the agent is for display. */
export interface ClaimClient {
  address: string;
  agent: string;
}

export interface ClaimResult {
  /**
   * `unknown` — no such code (also expired or spent);
   * `claimed` — this connection is the claimer, waiting for the owner;
   * `foreign` — another connection claimed this code; this one may not collect;
   * `approved` — the handover, with the token.
   */
  state: "unknown" | "claimed" | "foreign" | "approved";
  /** Set only when `state` is `approved` and this is a handover. */
  secret?: string;
}

/**
 * The agent's side: claim the code, wait, then collect.
 *
 * The token is minted at the **first collection**, not at approval, so an
 * approval nobody comes back for leaves no orphan credential behind. The row is
 * locked for the duration, so two simultaneous polls cannot mint two tokens for
 * one pairing.
 */
export async function claimPairing(
  code: string,
  client: ClaimClient,
): Promise<ClaimResult> {
  const normalized = normalizeCode(code);
  const now = new Date();

  // Clears every pairing whose window has closed, so nothing can hand over a
  // token from a row that simply stopped being read.
  await pruneExpired(now);

  return db.transaction(async (tx) => {
    const [pairing] = await tx
      .select()
      .from(agentPairings)
      .where(eq(agentPairings.code, normalized))
      .for("update")
      .limit(1);

    // An unknown code and an expired one look the same on purpose; the expired
    // row goes, together with the plaintext token it was holding.
    if (!pairing) return { state: "unknown" as const };
    if (pairing.expiresAt.getTime() <= now.getTime()) {
      await tx.delete(agentPairings).where(eq(agentPairings.code, normalized));
      return { state: "unknown" as const };
    }

    // The handover belongs to the connection that claimed it. Anyone else who
    // saw the code gets nothing, approved or not.
    if (pairing.claimedFrom !== null && pairing.claimedFrom !== client.address) {
      return { state: "foreign" as const };
    }

    if (pairing.state === "waiting") {
      await tx
        .update(agentPairings)
        .set({
          state: "claimed",
          claimedAt: now,
          claimedFrom: client.address,
          claimedAgent: client.agent,
        })
        .where(eq(agentPairings.code, normalized));
      return { state: "claimed" as const };
    }

    if (pairing.state !== "approved") return { state: "claimed" as const };

    if (pairing.handovers >= MAX_HANDOVERS) {
      await tx.delete(agentPairings).where(eq(agentPairings.code, normalized));
      return { state: "unknown" as const };
    }

    let secret = pairing.secret;
    if (!secret) {
      const minted = await mintAgentToken(
        pairing.userId,
        { name: pairing.name, scope: pairing.scope },
        tx,
      );
      secret = minted.secret;
    }

    await tx
      .update(agentPairings)
      .set({
        secret,
        handovers: pairing.handovers + 1,
        claimedFrom: client.address,
        claimedAgent: client.agent,
      })
      .where(eq(agentPairings.code, normalized));

    return { state: "approved" as const, secret };
  });
}

/**
 * Approve: the state moves, and that is all. The token is minted by the
 * collection that follows, so approving and then closing the tab costs nothing.
 */
export async function approvePairing(
  userId: string,
  code: string,
): Promise<boolean> {
  const normalized = normalizeCode(code);
  const now = new Date();
  const [row] = await db
    .update(agentPairings)
    .set({ state: "approved" })
    .where(
      and(
        eq(agentPairings.code, normalized),
        eq(agentPairings.userId, userId),
        gt(agentPairings.expiresAt, now),
        ne(agentPairings.state, "approved"),
      ),
    )
    .returning({ code: agentPairings.code });
  return Boolean(row);
}

export async function denyPairing(
  userId: string,
  code: string,
): Promise<boolean> {
  const [row] = await db
    .delete(agentPairings)
    .where(
      and(
        eq(agentPairings.code, normalizeCode(code)),
        eq(agentPairings.userId, userId),
      ),
    )
    .returning({ code: agentPairings.code });
  return Boolean(row);
}
