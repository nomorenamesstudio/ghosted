# Using Ghosted with your own agent

Ghosted doesn't run a model of its own. It serves an MCP server instead, so an AI agent
you already use can do the typing: file an application from a posting, move a timeline
along after an interview, mark a rejection. You decide what it's allowed to touch, and
you can cut it off at any time.

The server lives at `/ouija` — because you're talking to the ones that went quiet.

## Connect an agent

1. In Ghosted, open **Settings → Agent access**.
2. Give the agent a name and pick a scope:
   - **Read only** — it can look, nothing else.
   - **Read and edit** — it can add and update applications and their timelines.
   - **Full access** — editing plus the destructive tools (archive, reset).
3. Click **Pair an agent**. Ghosted shows a short code and a prompt.
4. Paste the prompt into your agent, then approve the pairing in Settings.

The token goes straight to the agent. It never passes through the chat log.

If your agent takes a config file instead, this is the shape (the token comes from
the same Settings page):

```json
{ "mcpServers": { "ghosted": { "type": "http", "url": "https://<your host>/ouija",
  "headers": { "Authorization": "Bearer ghosted_agt_…" } } } }
```

On the hosted instance, `<your host>` is `ghosted.boo`.

## What an agent can't touch

No scope reaches your email, your password, your sessions, the export or account
deletion. Those stay yours.

Every connected agent is listed in Settings with its scope and when it was last used.
Revoke one and it's cut off on its next request.

## Dropping it into a workflow

Ghosted is meant to be the logbook, not the bot. If you already run an agent that reads
your mailbox or a job digest, point it at Ghosted and let it file what it finds:
`find_or_create_application` matches the posting URL first, then company and role, so
running the same job twice updates an application instead of duplicating it. When a
posting lists its interview process, the agent writes those steps into the timeline
instead of leaving the five defaults.

The agent reads Ghosted's own guide (`get_guide`) before it writes anything, so the
house rules travel with the server.

## For developers

Endpoint, auth model, pairing flow and the full tool list:
[API → Agent access (MCP)](API.md#agent-access-mcp).
