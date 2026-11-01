import { NextResponse } from "next/server";
import { claimPairing } from "@/lib/services/agent-pairings";
import { pairingClaimSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  rateLimited,
  readJsonBody,
} from "@/lib/utils/api";
import { getClientIp, rateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The agent's side of a pairing — the one route here without a session.
 *
 * The code is claimed, then polled: `202` until the owner approves, `200` with
 * the token on the first collection after that. A code that is unknown, expired
 * or already spent all answer the same `404`, so a leaked code buys an attacker
 * a request nobody approved and no information.
 *
 * The claim is bound to the address that made it: the token is handed over to
 * that connection only. A second party holding the same code gets `409` and no
 * token — which is the difference between "a code in a chat log is a request"
 * and "a code in a chat log is the agent's credential".
 *
 * Throttled per address because it is public. The allowance is generous enough
 * for the polling this route invites (an agent waiting on approval asks every
 * couple of seconds) and useless for guessing an eight-character code.
 */
export async function POST(req: Request) {
  try {
    const limit = rateLimit(getClientIp(req), "agent-pair", {
      max: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

    const body = await readJsonBody(req);
    const parsed = pairingClaimSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Send the pairing code from Settings",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }

    const claimed = await claimPairing(parsed.data.code, {
      address: getClientIp(req),
      // Truncated because it is shown in the panel, not stored as evidence.
      agent: (req.headers.get("user-agent") ?? "").slice(0, 120),
    });
    if (claimed.state === "unknown") {
      return jsonError(404, "That code is unknown or has expired", "NOT_FOUND");
    }
    if (claimed.state === "foreign") {
      return jsonError(
        409,
        "That code was claimed by a different connection. Ask the owner to start a new pairing.",
        "CLAIMED_ELSEWHERE",
      );
    }
    if (claimed.state === "approved") {
      return NextResponse.json({ state: "approved", token: claimed.secret });
    }
    // Still waiting on the owner: the agent polls, it does not retry blindly.
    return NextResponse.json({ state: claimed.state }, { status: 202 });
  } catch (err) {
    return handleRouteError(err);
  }
}
