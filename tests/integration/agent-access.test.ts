import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

import {
  GET as listTokens,
  POST as mintToken,
} from "@/app/api/agent/tokens/route";
import { DELETE as revokeToken } from "@/app/api/agent/tokens/[id]/route";
import {
  GET as listPairings,
  POST as startPairing,
} from "@/app/api/agent/pair/route";
import { POST as claim } from "@/app/api/agent/pair/claim/route";
import { POST as approve } from "@/app/api/agent/pair/[code]/approve/route";
import { POST as deny } from "@/app/api/agent/pair/[code]/deny/route";
import { POST as mcp } from "@/app/ouija/route";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentPairings, users } from "@/lib/db/schema";
import { mintAgentToken } from "@/lib/services/agent-tokens";
import { countApplications } from "@/lib/services/applications";
import {
  authMock,
  createUser,
  jsonRequest,
  mockSession,
  readJson,
  resetDb,
} from "@/tests/helpers";

/**
 * Agent access: the pairing handshake, and the scope that decides what the
 * resulting connection can do.
 *
 * Driven through the HTTP boundaries the agent and the browser actually use —
 * the pairing routes, and `/ouija` speaking JSON-RPC — because the promises being
 * kept here are protocol promises: a code that is harmless until approved, a
 * token that is handed over once, and a tool surface that matches the scope the
 * owner picked.
 */

const base = "http://localhost";

/** One JSON-RPC message over `/ouija`, as a client sends it. */
async function rpc(token: string | null, message: unknown) {
  const res = await mcp(
    new Request(`${base}/ouija`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // What the streamable-HTTP transport asks of a client.
        Accept: "application/json, text/event-stream",
        // Its own address, so the per-address throttle is not shared test to test.
        "x-real-ip": "203.0.113.20",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(message),
    }),
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function toolNames(token: string): Promise<string[]> {
  const { body } = await rpc(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  return (body.result.tools as Array<{ name: string }>)
    .map((tool) => tool.name)
    .sort();
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const { body } = await rpc(token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  return body;
}

async function mint(scope: "read" | "edit" | "full"): Promise<string> {
  authMock.mockResolvedValueOnce(mockSession(userId));
  const res = await mintToken(
    jsonRequest(`${base}/api/agent/tokens`, "POST", { name: `${scope} agent`, scope }),
  );
  const json = await readJson(res);
  return (json.data as { secret: string }).secret;
}

let userId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  const user = await createUser();
  userId = user.id;
});

describe("pairing an agent", () => {
  async function start(scope: "read" | "edit" | "full" = "read") {
    authMock.mockResolvedValueOnce(mockSession(userId));
    const res = await startPairing(
      jsonRequest(`${base}/api/agent/pair`, "POST", {
        name: "laptop agent",
        scope,
      }),
    );
    const json = await readJson(res);
    return json.data as { code: string; expiresAt: string };
  }

  async function claimCode(
    code: string,
    /** The connection the claim comes from; the handover is bound to it. */
    ip = "203.0.113.10",
    agent = "test-agent/1.0",
  ) {
    const res = await claim(
      new Request(`${base}/api/agent/pair/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-real-ip": ip,
          "user-agent": agent,
        },
        body: JSON.stringify({ code }),
      }),
    );
    return { status: res.status, body: await readJson(res) };
  }

  it("hands over a working token only after approval, and only once the agent collects it", async () => {
    const { code } = await start();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // The code on its own buys a claim and nothing else: an attacker who read it
    // out of the chat log gets a 202, not a credential.
    const claimed = await claimCode(code);
    expect(claimed.status).toBe(202);
    expect(claimed.body).toEqual({ state: "claimed" });

    // Another connection holding the same code is refused before approval too —
    // the claim belongs to the address that made it.
    const rival = await claimCode(code, "198.51.100.66", "other-agent/2.0");
    expect(rival.status).toBe(409);

    authMock.mockResolvedValueOnce(mockSession(userId));
    const approved = await approve(
      new Request(`${base}/api/agent/pair/${code}/approve`, { method: "POST" }),
      { params: Promise.resolve({ code }) },
    );
    expect(approved.status).toBe(200);

    const collected = await claimCode(code);
    expect(collected.status).toBe(200);
    expect(collected.body.state).toBe("approved");
    const token = collected.body.token as string;
    expect(token).toMatch(/^ghosted_agt_/);

    // The token is what `/ouija` accepts, and it identifies this account.
    const initialized = await rpc(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.serverInfo.name).toBe("ghosted");
  });

  it("refuses a code that was never issued", async () => {
    const { status } = await claimCode("ZZZZ-ZZZZ");
    expect(status).toBe(404);
  });

  it("kills a code when the owner denies it, so the claim can never collect", async () => {
    const { code } = await start();
    await claimCode(code);

    // Deny is the owner's session route; the agent's claim after it is dead.
    authMock.mockResolvedValueOnce(mockSession(userId));
    const denied = await deny(
      new Request(`${base}/api/agent/pair/${code}/deny`, { method: "POST" }),
      { params: Promise.resolve({ code }) },
    );
    expect(denied.status).toBe(200);

    const afterDeny = await claimCode(code);
    expect(afterDeny.status).toBe(404);
  });

  it("shows the owner a claimed pairing, and nothing once it is approved", async () => {
    const { code } = await start();
    await claimCode(code);

    authMock.mockResolvedValueOnce(mockSession(userId));
    const pending = await readJson(await listPairings());
    expect(pending.data).toEqual([
      expect.objectContaining({
        code,
        state: "claimed",
        name: "laptop agent",
        claimedFrom: "203.0.113.10",
        claimedAgent: "test-agent/1.0",
      }),
    ]);

    authMock.mockResolvedValueOnce(mockSession(userId));
    await approve(
      new Request(`${base}/api/agent/pair/${code}/approve`, { method: "POST" }),
      { params: Promise.resolve({ code }) },
    );
    await claimCode(code);

    authMock.mockResolvedValueOnce(mockSession(userId));
    const afterApproval = await readJson(
      await listPairings(),
    );
    expect(afterApproval.data).toEqual([]);
  });
});

describe("what a scope can reach", () => {
  /**
   * The whole tool surface, per scope, asserted exactly.
   *
   * A scope is not a check inside a handler that someone can forget to call: the
   * tools that are not in reach are never registered, so this list *is* the
   * permission model. Adding a tool therefore has to change this test, which is
   * the point — the MCP surface is a security contract, not an implementation
   * detail.
   */
  const READ_TOOLS = [
    "get_application",
    "get_guide",
    "get_stats",
    "list_applications",
  ];
  const EDIT_TOOLS = [
    ...READ_TOOLS,
    "add_milestone",
    "create_application",
    "find_or_create_application",
    "reopen_application",
    "update_application",
    "update_milestone",
  ].sort();
  const FULL_TOOLS = [
    ...EDIT_TOOLS,
    "archive_application",
    "delete_milestone",
    "reset_timeline",
  ].sort();

  it("gives a read-only connection the read tools and no way to write", async () => {
    const token = await mint("read");
    const names = await toolNames(token);
    expect(names).toEqual(READ_TOOLS);

    const call = await callTool(token, "create_application", {
      company: "Acme Corp",
      role: "Engineer",
    });
    // Not a permission refusal the model could be argued out of: the tool is not
    // registered on this connection at all, so there is nothing to call.
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toContain("not found");
    expect(await countApplications(userId)).toBe(0);
  });

  it("gives an edit connection the write tools but not the destructive ones", async () => {
    const token = await mint("edit");
    expect(await toolNames(token)).toEqual(EDIT_TOOLS);

    const created = await callTool(token, "create_application", {
      company: "Acme Corp",
      role: "Engineer",
    });
    expect(created.result.isError).toBeUndefined();
    expect(await countApplications(userId)).toBe(1);
  });

  it("gives a full connection every tool, destructive ones included", async () => {
    const token = await mint("full");
    expect(await toolNames(token)).toEqual(FULL_TOOLS);
  });
});

describe("the token itself", () => {
  it("refuses a request without a token, and one with a made-up token", async () => {
    const anonymous = await rpc(null, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(anonymous.status).toBe(401);

    const invented = await rpc("ghosted_agt_not-a-real-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(invented.status).toBe(401);
  });

  it("is listed without its secret or hash, and stops working once revoked", async () => {
    const secret = await mint("read");

    authMock.mockResolvedValueOnce(mockSession(userId));
    const listed = await readJson(await listTokens());
    const [token] = listed.data as Array<Record<string, unknown>>;
    expect(token).toMatchObject({ name: "read agent", scope: "read" });
    expect(JSON.stringify(listed)).not.toContain(secret);
    expect(token).not.toHaveProperty("secretHash");

    authMock.mockResolvedValueOnce(mockSession(userId));
    const revoked = await revokeToken(
      new Request(`${base}/api/agent/tokens/${token.id as string}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: token.id as string }) },
    );
    expect(revoked.status).toBe(204);

    const after = await rpc(secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(after.status).toBe(401);
  });
});

describe("the pairing row does not outlive its window", () => {
  it("deletes an expired pairing, and the token it held with it", async () => {
    // An expired row is what a claimed pairing becomes ten minutes later. It used
    // to keep the plaintext token indefinitely, because pruning only ran when
    // Settings was opened (review 2026-11-01, finding 1).
    await db.insert(agentPairings).values({
      code: "ZZZZ-ZZZZ",
      userId,
      name: "stale",
      scope: "read",
      state: "approved",
      secret: "ghosted_agt_residue",
      handovers: 1,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await claim(
      new Request(`${base}/api/agent/pair/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.44" },
        body: JSON.stringify({ code: "ZZZZ-ZZZZ" }),
      }),
    );
    expect(res.status).toBe(404);

    const rows = await db
      .select()
      .from(agentPairings)
      .where(eq(agentPairings.code, "ZZZZ-ZZZZ"));
    expect(rows).toEqual([]);
  });

  it("hands the token to one connection only", async () => {
    authMock.mockResolvedValueOnce(mockSession(userId));
    const started = await readJson(
      await startPairing(
        jsonRequest(`${base}/api/agent/pair`, "POST", { name: "one connection", scope: "read" }),
      ),
    );
    const code = (started.data as { code: string }).code;

    const claimFrom = async (ip: string) =>
      claim(
        new Request(`${base}/api/agent/pair/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-real-ip": ip },
          body: JSON.stringify({ code }),
        }),
      );

    expect((await claimFrom("203.0.113.50")).status).toBe(202);

    authMock.mockResolvedValueOnce(mockSession(userId));
    await approve(
      new Request(`${base}/api/agent/pair/${code}/approve`, { method: "POST" }),
      { params: Promise.resolve({ code }) },
    );

    const owner = await claimFrom("203.0.113.50");
    const ownerBody = await readJson(owner);
    expect(owner.status).toBe(200);
    expect(ownerBody.token).toMatch(/^ghosted_agt_/);

    // The attacker who read the code out of a chat log: refused, and never sees a
    // token, even though the owner approved.
    const rival = await claimFrom("198.51.100.66");
    expect(rival.status).toBe(409);
    const rivalBody = await readJson(rival);
    expect(rivalBody.token).toBeUndefined();
    expect(rivalBody.code).toBe("CLAIMED_ELSEWHERE");
  });
});

describe("the write gate", () => {
  it("refuses agent writes while the account must choose its own password", async () => {
    // The session path refuses these writes (lib/utils/api.ts); the agent path
    // used to spend only the budget, not the rule (review 2026-11-01, finding 4).
    await db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, userId));
    const { secret } = await mintAgentToken(userId, { name: "seeded", scope: "edit" });

    const call = await callTool(secret, "create_application", {
      company: "Should not exist",
      role: "Engineer",
    });
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toContain("password");
    expect(await countApplications(userId)).toBe(0);

    // Reads still work, the same way the dashboard still renders for the account.
    const listed = await callTool(secret, "list_applications", {});
    expect(listed.result.isError).toBeUndefined();
  });

  it("does not let a full connection archive through a status update", async () => {
    // The tool schema already excludes `archived`; this pins the handler guard
    // behind it, because the app's own schema would accept it (finding 5).
    const secret = await mint("full");
    const created = await callTool(secret, "create_application", {
      company: "Acme Corp",
      role: "Engineer",
    });
    const applicationId = JSON.parse(created.result.content[0].text).application
      .id as string;

    const call = await callTool(secret, "update_application", {
      applicationId,
      status: "archived",
    });
    expect(call.result.isError).toBe(true);

    const { getApplication } = await import("@/lib/services/applications");
    const after = await getApplication(userId, applicationId);
    expect(after?.status).toBe("applied");
  });
});

describe("the endpoint throttle", () => {
  it("answers 429 to a flood from one address", async () => {
    // Public and unauthenticated before the token check, so it has to be bounded
    // like the claim route (review 2026-11-01, finding 3). A value without our
    // prefix is refused before any database work, which keeps this cheap.
    const flood = (n: number) =>
      mcp(
        new Request(`${base}/ouija`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: "Bearer not-our-token",
            "x-real-ip": "198.51.100.99",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: n, method: "tools/list", params: {} }),
        }),
      );

    let last = 0;
    for (let i = 0; i <= 300; i += 1) {
      const res = await flood(i);
      last = res.status;
      expect([401, 429]).toContain(res.status);
    }
    expect(last).toBe(429);
  });
});

describe("what the agent is told", () => {
  it("serves the same guide at initialize and through get_guide", async () => {
    const secret = await mint("read");

    const initialized = await rpc(secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    });
    const instructions = initialized.body.result.instructions as string;

    const guide = await callTool(secret, "get_guide", {});
    const fetched = guide.result.content[0].text as string;

    // One constant, two channels: a client that never shows `instructions` can
    // still ask for the same text, and the two cannot drift apart.
    expect(instructions).toContain(fetched);

    // The facts an agent gets wrong when it has only tool descriptions: which
    // status it must report, and that the timeline is what advances one.
    for (const fact of ["displayStatus", "patience window", "derived from the timeline"]) {
      expect(fetched).toContain(fact);
    }
    expect(fetched).toContain("read only");

    // The timeline rule: editable when there is something to record, untouched
    // when there is not. An agent that guesses here writes fiction into the user's
    // record.
    expect(fetched).toContain("THE TIMELINE IS EDITABLE");
    expect(fetched).toContain("do not invent rounds");
    expect(fetched).toContain("add_milestone");

    // The rules for recording what actually happened: lay out a known process,
    // put a rejection where it happened, tidy the timeline after an offer.
    expect(fetched).toContain("When the hiring process is actually known");
    expect(fetched).toContain("A rejection goes where it happened");
    expect(fetched).toContain("An offer closes the timeline");
  });
});

describe("the logbook drop-in", () => {
  it("files an application once, then finds it on the next run", async () => {
    const secret = await mint("edit");
    const first = await callTool(secret, "find_or_create_application", {
      company: "Stripe",
      role: "Design Engineer",
      url: "https://stripe.com/jobs/123",
      notes: "from the digest",
    });
    const created = JSON.parse(first.result.content[0].text);
    expect(created.created).toBe(true);
    expect(created.matchedOn).toBe("none");

    // The same digest run again: same row, nothing written, and the answer says so.
    const second = await callTool(secret, "find_or_create_application", {
      company: "Stripe",
      role: "Design Engineer",
      url: "https://stripe.com/jobs/123",
    });
    const found = JSON.parse(second.result.content[0].text);
    expect(found.created).toBe(false);
    expect(found.matchedOn).toBe("url");
    expect(found.application.id).toBe(created.application.id);
    expect(await countApplications(userId)).toBe(1);
  });

  it("matches company + role when the email carried no link, case-insensitively", async () => {
    const secret = await mint("edit");
    await callTool(secret, "find_or_create_application", {
      company: "Linear",
      role: "Product Engineer",
    });

    const again = await callTool(secret, "find_or_create_application", {
      company: "  linear ",
      role: "product engineer",
    });
    const found = JSON.parse(again.result.content[0].text);
    expect(found.created).toBe(false);
    expect(found.matchedOn).toBe("company+role");
    expect(await countApplications(userId)).toBe(1);
  });

  it("prefers the posting URL over the company and role", async () => {
    const secret = await mint("edit");
    const a = JSON.parse(
      (
        await callTool(secret, "find_or_create_application", {
          company: "Figma",
          role: "Designer",
          url: "https://figma.com/careers/1",
        })
      ).result.content[0].text,
    );
    // Same posting, refreshed title: the URL wins even though the role moved.
    const b = JSON.parse(
      (
        await callTool(secret, "find_or_create_application", {
          company: "Figma",
          role: "Senior Designer",
          url: "https://figma.com/careers/1",
        })
      ).result.content[0].text,
    );
    expect(b.created).toBe(false);
    expect(b.matchedOn).toBe("url");
    expect(b.application.id).toBe(a.application.id);
  });

  it("is a write tool, so it is not on a read-only connection", async () => {
    const names = await toolNames(await mint("read"));
    expect(names).not.toContain("find_or_create_application");
  });
});

describe("the logbook drop-in, under load", () => {
  it("treats a tracked, http, trailing-slash copy of the posting as the same one", async () => {
    const secret = await mint("edit");
    const first = await callTool(secret, "find_or_create_application", {
      company: "Vercel",
      role: "Design Engineer",
      url: "https://vercel.com/careers/design-engineer-1",
    });
    expect(JSON.parse(first.result.content[0].text).created).toBe(true);

    // Tomorrow's digest: a tracked link from a different board, plain http.
    const again = await callTool(secret, "find_or_create_application", {
      company: "Vercel",
      role: "Design Engineer",
      url: "http://www.vercel.com/careers/design-engineer-1/?utm_source=linkedin&gh_src=abc",
    });
    const found = JSON.parse(again.result.content[0].text);
    expect(found.created).toBe(false);
    expect(found.matchedOn).toBe("url");
    expect(await countApplications(userId)).toBe(1);
  });

  it("files one row when the same digest runs concurrently", async () => {
    // The race the lock exists for: five simultaneous runs, all of which read
    // before any of them wrote. Without the advisory lock every one inserts.
    const { createApplicationIfAbsent } = await import("@/lib/services/applications");
    const input = {
      company: "Notion",
      role: "Product Engineer",
      url: "https://notion.so/careers/product-engineer",
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createApplicationIfAbsent(userId, input)),
    );

    const ids = new Set(results.map((result) => result.application.id));
    expect(ids.size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await countApplications(userId)).toBe(1);
  });

  it("writes nothing when the budget refuses mid-flight", async () => {
    // The budget is spent inside the transaction, so a refusal rolls the insert
    // back rather than refusing after the row has landed.
    const { createApplicationIfAbsent } = await import("@/lib/services/applications");
    expect(() =>
      createApplicationIfAbsent(
        userId,
        { company: "Linear", role: "Designer" },
        () => {
          throw new Error("budget refused");
        },
      ),
    ).rejects.toThrow("budget refused");
    expect(await countApplications(userId)).toBe(0);
  });
});

describe("create_application checks before it writes", () => {
  it("writes nothing and names the row when the posting is already there", async () => {
    const secret = await mint("edit");
    await callTool(secret, "create_application", {
      company: "Stripe",
      role: "Design Engineer",
      url: "https://stripe.com/jobs/9",
    });

    const again = await callTool(secret, "create_application", {
      company: "Stripe",
      role: "Design Engineer",
      url: "https://stripe.com/jobs/9?utm_source=mail",
    });
    const answer = JSON.parse(again.result.content[0].text);
    expect(answer.created).toBe(false);
    expect(answer.duplicateOf).toMatchObject({ company: "Stripe", status: "applied" });
    expect(answer.message).toContain("Already on the board");
    expect(await countApplications(userId)).toBe(1);
  });

  it("files a second row only when the user's answer is force", async () => {
    const secret = await mint("edit");
    await callTool(secret, "create_application", {
      company: "Figma",
      role: "Designer",
    });

    const forced = await callTool(secret, "create_application", {
      company: "Figma",
      role: "Designer",
      force: true,
    });
    const answer = JSON.parse(forced.result.content[0].text);
    expect(answer.created).toBe(true);
    expect(await countApplications(userId)).toBe(2);
  });

  it("names a rejection as a legitimate reapplication", async () => {
    const secret = await mint("edit");
    const first = JSON.parse(
      (
        await callTool(secret, "create_application", {
          company: "Linear",
          role: "Engineer",
        })
      ).result.content[0].text,
    );
    await callTool(secret, "update_application", {
      applicationId: first.application.id,
      status: "rejected",
    });

    const again = JSON.parse(
      (
        await callTool(secret, "create_application", {
          company: "Linear",
          role: "Engineer",
        })
      ).result.content[0].text,
    );
    expect(again.created).toBe(false);
    expect(again.duplicateOf.status).toBe("rejected");
    expect(again.message).toContain("reapplication is legitimate");
  });
});
