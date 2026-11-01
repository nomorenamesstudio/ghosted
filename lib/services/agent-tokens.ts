import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { agentTokens, users, type AgentScope } from "@/lib/db/schema";

/**
 * The credential behind an MCP connection.
 *
 * A token is the whole permission model: one scope, and nothing but the
 * applications and milestones the account already owns. There is no token that
 * reaches the account itself — no email, password, session or deletion — because
 * nothing in `lib/mcp/` imports those services. Only a SHA-256 of the secret is
 * stored, and the secret is returned exactly once: at mint, or at the handover
 * that ends a pairing.
 */

type Tx = PostgresJsDatabase<typeof schema>;

/**
 * A recognizable prefix, so a bearer value that was never one of ours is
 * rejected without a database read.
 */
const SECRET_PREFIX = "ghosted_agt_";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** What the UI and the API may see about a token. Never the hash. */
export interface AgentTokenSummary {
  id: string;
  name: string;
  scope: AgentScope;
  /** ISO strings: one shape for the API response and the server-rendered list. */
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MintAgentInput {
  name: string;
  scope: AgentScope;
}

function summarise(row: {
  id: string;
  name: string;
  scope: AgentScope;
  createdAt: Date;
  lastUsedAt: Date | null;
}): AgentTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listAgentTokens(
  userId: string,
): Promise<AgentTokenSummary[]> {
  const rows = await db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(desc(agentTokens.createdAt));
  return rows.map(summarise);
}

/**
 * Create a token and return its secret in the same breath — the only time it
 * exists in plaintext on this side. `tx` lets a pairing mint and record the
 * secret inside the transaction that claimed the code, so two simultaneous
 * collections cannot mint two tokens for one pairing.
 */
export async function mintAgentToken(
  userId: string,
  input: MintAgentInput,
  tx: Tx = db,
): Promise<{ token: AgentTokenSummary; secret: string }> {
  const secret = `${SECRET_PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await tx
    .insert(agentTokens)
    .values({
      userId,
      name: input.name,
      scope: input.scope,
      secretHash: hashSecret(secret),
    })
    .returning();
  return { token: summarise(row), secret };
}

export async function revokeAgentToken(
  userId: string,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .delete(agentTokens)
    .where(and(eq(agentTokens.userId, userId), eq(agentTokens.id, id)))
    .returning({ id: agentTokens.id });
  // The last-used marker would otherwise outlive the token it describes.
  if (row) touched.delete(row.id);
  return Boolean(row);
}

/** What a verified connection is allowed to do, and for whom. */
export interface AgentPrincipal {
  id: string;
  userId: string;
  scope: AgentScope;
  /**
   * Carried so the MCP write path can hold the same rule the session path does:
   * an account whose operator-chosen password is still pending may read and may
   * not write (review 2026-11-01, finding 4).
   */
  mustChangePassword: boolean;
}

/**
 * `lastUsedAt` is written at most once a minute per token: it is a convenience
 * for the Connected agents list, not an audit log, and an MCP client that polls
 * does not need a write per request.
 */
const touched = new Map<string, number>();

export async function verifyAgentToken(
  secret: string,
): Promise<AgentPrincipal | null> {
  if (!secret.startsWith(SECRET_PREFIX)) return null;

  // Joined to the account so the caller learns the write gate in the same round
  // trip, and a token whose account vanished cannot authenticate.
  const [row] = await db
    .select({
      id: agentTokens.id,
      userId: agentTokens.userId,
      scope: agentTokens.scope,
      mustChangePassword: users.mustChangePassword,
    })
    .from(agentTokens)
    .innerJoin(users, eq(users.id, agentTokens.userId))
    .where(eq(agentTokens.secretHash, hashSecret(secret)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  if (now - (touched.get(row.id) ?? 0) > 60_000) {
    touched.set(row.id, now);
    void db
      .update(agentTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(agentTokens.id, row.id))
      .catch(() => {
        // A token that cannot record its use is still a usable token.
      });
  }

  return {
    id: row.id,
    userId: row.userId,
    scope: row.scope,
    mustChangePassword: row.mustChangePassword,
  };
}
