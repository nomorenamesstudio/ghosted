import { NextResponse } from "next/server";
import {
  listAgentTokens,
  mintAgentToken,
} from "@/lib/services/agent-tokens";
import { agentAccessSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  readJsonBody,
  requireSession,
  requireSessionForWrite,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** The connected agents, without anything secret. */
export async function GET() {
  try {
    const userId = await requireSession();
    return NextResponse.json({ data: await listAgentTokens(userId) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * The no-pairing path: mint a token and show it once.
 *
 * This is what a client that only takes a pasted config block needs — it cannot
 * run the claim request a pairing depends on. The secret is in this response and
 * nowhere else.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionForWrite("agent");
    const body = await readJsonBody(req);
    const parsed = agentAccessSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        400,
        "Invalid request payload",
        "VALIDATION_ERROR",
        parsed.error.flatten(),
      );
    }
    return NextResponse.json(
      { data: await mintAgentToken(userId, parsed.data) },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
