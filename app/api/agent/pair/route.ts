import { NextResponse } from "next/server";
import {
  listPairings,
  startPairing,
} from "@/lib/services/agent-pairings";
import { agentAccessSchema } from "@/lib/utils/validation";
import {
  handleRouteError,
  jsonError,
  readJsonBody,
  requireSession,
  requireSessionForWrite,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Pairings still waiting on this account, for the panel to poll. */
export async function GET() {
  try {
    const userId = await requireSession();
    return NextResponse.json({ data: await listPairings(userId) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Start a pairing: the code that follows is all the agent needs, and it does
 * nothing until the owner approves it here.
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
      { data: await startPairing(userId, parsed.data) },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
