import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAgentServer } from "@/lib/mcp/server";
import { verifyAgentToken } from "@/lib/services/agent-tokens";
import { jsonError } from "@/lib/utils/api";
import { getClientIp, rateLimit } from "@/lib/utils/rate-limit";

/**
 * The agent's tools, served by this app — at `/ouija`, because a Ghosted user
 * talks to what went quiet.
 *
 * A client needs a URL and a bearer token — nothing runs on the agent's machine
 * and no version has to be kept in step. Stateless: every request builds a
 * server bound to the caller's own token, so the scope is decided per request
 * and a revoked token stops working on its next call.
 *
 * Two things this route deliberately is not:
 *
 * - **Not a session.** There is no `Mcp-Session-Id`, no server-initiated
 *   message, no SSE stream: tools are request/response, and a job tracker has
 *   nothing to push.
 * - **Not cookie-authenticated.** A browser session cannot reach `/ouija`, so a
 *   cross-site request cannot drive the tools with the user's own cookies.
 */

export const dynamic = "force-dynamic";

function bearerSecret(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const secret = rest.join(" ").trim();
  return secret.length > 0 ? secret : null;
}

/**
 * A public endpoint behind a bearer check still costs something per request: one
 * SHA-256 and one indexed lookup for any well-formed prefix. The allowance is
 * well above what a real client does (a few tool calls a second at most) and it
 * is per address, so one noisy agent cannot spend another's.
 */
const MCP_REQUESTS_PER_MINUTE = 300;

export async function POST(req: Request) {
  const limit = rateLimit(getClientIp(req), "ouija", {
    max: MCP_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError(
      429,
      "Too many requests, please try again later",
      "RATE_LIMITED",
      undefined,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const secret = bearerSecret(req);
  const principal = secret ? await verifyAgentToken(secret) : null;
  if (!principal) {
    return jsonError(
      401,
      "A valid agent token is required",
      "UNAUTHORIZED",
      undefined,
      // A rejected agent should be told what to do, not left guessing.
      { "WWW-Authenticate": 'Bearer realm="ghosted"' },
    );
  }

  const server = createAgentServer({
    userId: principal.userId,
    scope: principal.scope,
    mustChangePassword: principal.mustChangePassword,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

/**
 * No streaming and no sessions, so GET and DELETE have nothing to answer.
 * Saying so beats a 404 that looks like a wrong URL.
 */
export async function GET() {
  return jsonError(
    405,
    "Ghosted serves MCP statelessly: POST to /ouija",
    "METHOD_NOT_ALLOWED",
    undefined,
    { Allow: "POST" },
  );
}

export async function DELETE() {
  return jsonError(
    405,
    "Ghosted serves MCP statelessly: POST to /ouija",
    "METHOD_NOT_ALLOWED",
    undefined,
    { Allow: "POST" },
  );
}
