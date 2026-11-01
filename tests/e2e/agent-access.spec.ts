import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

/**
 * The whole agent handshake through the UI, because the scope is chosen here.
 *
 * A pairing is only useful if the browser path works end to end: pick a scope,
 * get a code, the agent claims it, the owner approves, and the agent collects a
 * token that is *exactly* as wide as the scope picked. Integration tests drive
 * the routes directly; this is the seam where a card that always sent `read`, or
 * an approve button wired to nothing, would still pass them.
 */
const READ_TOOLS = [
  "get_application",
  "get_guide",
  "get_stats",
  "list_applications",
];

async function mcp(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  body: unknown,
) {
  const res = await request.post("/ouija", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: body,
  });
  return { status: res.status(), json: (await res.json().catch(() => null)) as any };
}

test("pairs a read-only agent through the UI and revokes it", async ({
  page,
  request,
}) => {
  await registerUser(page, `agent-${Date.now()}@example.com`);
  await page.goto("/settings");

  await page.locator("#agent-scope").click();
  await page.getByRole("option", { name: "Read only" }).click();
  await page.locator("#agent-name").fill("e2e agent");
  await page.getByRole("button", { name: "Pair an agent" }).click();

  const codeField = page.locator("code").filter({ hasText: /^[A-Z0-9]{4}-[A-Z0-9]{4}$/ });
  await expect(codeField).toBeVisible();
  const code = (await codeField.innerText()).trim();

  // The agent's side, as a real client makes it: claim, then poll until the
  // owner approves. A claim alone must not return a token.
  const claimed = await request.post("/api/agent/pair/claim", { data: { code } });
  expect(claimed.status()).toBe(202);
  expect(await claimed.json()).toEqual({ state: "claimed" });

  await expect(page.getByText("An agent claimed the code.")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  let token = "";
  for (let attempt = 0; attempt < 20 && !token; attempt += 1) {
    await page.waitForTimeout(500);
    const collected = await request.post("/api/agent/pair/claim", { data: { code } });
    const body = (await collected.json()) as { token?: string };
    token = body.token ?? "";
  }
  expect(token).toMatch(/^ghosted_agt_/);
  await expect(page.getByText("Paired — the agent is connected.")).toBeVisible();
  await expect(page.getByText("e2e agent")).toBeVisible();

  // The scope picked in the browser is the scope on the wire: read tools only.
  const listed = await mcp(request, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  expect(listed.status).toBe(200);
  expect(
    (listed.json.result.tools as Array<{ name: string }>)
      .map((tool) => tool.name)
      .sort(),
  ).toEqual(READ_TOOLS);

  // Revoking is the owner's act, and it lands on the agent's next request.
  await page.getByRole("button", { name: "Revoke e2e agent" }).click();
  await expect(page.getByText("Nothing connected yet.")).toBeVisible();

  const afterRevoke = await mcp(request, token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  expect(afterRevoke.status).toBe(401);
});
