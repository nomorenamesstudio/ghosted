"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Plug, Trash2 } from "lucide-react";
import {
  AGENT_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
} from "@/lib/agent-scope";
import {
  approvePairing,
  denyPairing,
  getAgentTokens,
  getPairings,
  mintAgentToken,
  revokeAgentToken,
  startPairing,
  ApiClientError,
  type AgentScope,
  type AgentTokenSummary,
  type PendingPairing,
} from "@/lib/api";
import { Message, type Msg } from "@/components/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Connecting an agent, without a secret in the chat log.
 *
 * Pairing is the primary path: the owner picks a name and a scope, Ghosted prints
 * a short code and a prompt, the agent claims the code, the owner approves, and
 * the agent collects its token over its own connection. "Create a token instead"
 * exists for clients that only take a pasted config block — they cannot run the
 * claim request a pairing depends on.
 *
 * The scope is the whole permission model, and it is chosen here: read only,
 * read and edit, or full access (which adds the destructive tools). Nothing on
 * this card can reach the account itself — no email, password or deletion.
 */
function mcpUrl(): string {
  return `${window.location.origin}/ouija`;
}

/** The block most clients read: Claude Desktop, Cursor, anything speaking MCP over HTTP. */
function configBlock(secret: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        ghosted: {
          type: "http",
          url: mcpUrl(),
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    },
    null,
    2,
  );
}

/**
 * The code is all the agent needs. The prompt says what to do with it, including
 * what a 202 means and where the token has to be kept, because an agent that
 * loses it mid-handshake asks the owner to start over.
 */
function pairingPrompt(code: string): string {
  const base = window.location.origin;
  const claim = `${base}/api/agent/pair/claim`;
  return [
    `I want you to help me keep my job applications in Ghosted, my own job tracker at ${base}.`,
    "",
    `Pair with it first: POST {"code": "${code}"} to ${claim}`,
    "While I have not approved the pairing that answers HTTP 202 — wait a few seconds and ask again, for up to ten minutes.",
    "If it answers HTTP 409, the code was claimed from another connection: stop and ask me to start a new pairing.",
    `Once I approve, the same request answers {"state":"approved","token":"ghosted_agt_..."}. Save that token somewhere that survives between your commands, never print it back to me.`,
    "",
    `Then connect to ${base}/ouija as a remote MCP server (HTTP transport) with the header "Authorization: Bearer <token>".`,
    "Its tools cover my applications, milestones and stats only — there is nothing there for my account, email or password.",
  ].join("\n");
}

function scopeLabel(scope: AgentScope): string {
  return SCOPE_LABELS[scope];
}

/**
 * The address a claim came from, or nothing when the deployment cannot say (no
 * client-address header). This is the human check the pairing never had: a claim
 * from somewhere unexpected is the one signal that the code was not only in your
 * hands.
 */
function claimAddress(claim: PendingPairing): string {
  if (!claim.claimedFrom || claim.claimedFrom === "unknown") return "";
  return claim.claimedFrom;
}

/** The claimer's client, shortened to the first product token ("curl/8.5.0"). */
function claimAgent(claim: PendingPairing): string {
  return claim.claimedAgent?.split(" ")[0]?.slice(0, 40) ?? "";
}

function usedLabel(token: AgentTokenSummary): string {
  if (!token.lastUsedAt) return "never used";
  return `used ${new Date(token.lastUsedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // No clipboard on an http origin: the caller selects the text instead.
    return false;
  }
}

/** Fallback for a browser that refuses the clipboard: select, then the owner long-presses. */
function selectText(element: HTMLElement | null): void {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function AgentAccessCard({
  tokens: initialTokens,
}: {
  /** The connection list, rendered on the server so there is no empty flash. */
  tokens: AgentTokenSummary[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<AgentScope>("edit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [claimed, setClaimed] = useState<PendingPairing | null>(null);
  const [approvedAt, setApprovedAt] = useState<number | null>(null);
  const [minted, setMinted] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState<"prompt" | "config" | null>(null);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const promptRef = useRef<HTMLPreElement>(null);
  const configRef = useRef<HTMLPreElement>(null);

  const canStart = name.trim().length > 0 && !busy;

  // While a pairing is open, ask who has claimed it. Only this panel's own code,
  // and only once an agent has actually claimed it: a row before that reads as
  // "it already happened".
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;
    const look = () => {
      void getPairings()
        .then(({ data }) => {
          if (cancelled) return;
          setClaimed(
            data.find(
              (entry) => entry.code === pairing.code && entry.state === "claimed",
            ) ?? null,
          );
        })
        .catch(() => {
          // A failed poll is not worth a banner; the next one may work.
        });
    };
    look();
    const timer = window.setInterval(look, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pairing]);

  // Approving mints nothing by itself: the token appears when the agent collects
  // it. Watch the list until that happens, so the panel says "paired" instead of
  // silently emptying.
  useEffect(() => {
    if (approvedAt === null) return;
    let cancelled = false;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void getAgentTokens()
        .then(({ data }) => {
          if (cancelled) return;
          const collected = data.some(
            (token) => new Date(token.createdAt).getTime() >= approvedAt - 1000,
          );
          setTokens(data);
          if (collected) {
            window.clearInterval(timer);
            setApprovedAt(null);
            setPairing(null);
            setMsg({ type: "ok", text: "Paired — the agent is connected." });
          }
        })
        .catch(() => {
          // Keep waiting; the row is written by the agent's next request.
        });
      if (tries >= 15) {
        window.clearInterval(timer);
        setApprovedAt(null);
        setPairing(null);
        setMsg({
          type: "ok",
          text: "Approved. The agent collects its token on its next request.",
        });
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [approvedAt]);

  async function pair() {
    setBusy(true);
    setMsg(null);
    setMinted(null);
    setClaimed(null);
    setApprovedAt(null);
    try {
      const { data } = await startPairing({ name: name.trim(), scope });
      setPairing(data);
    } catch (problem) {
      setMsg({
        type: "error",
        text:
          problem instanceof ApiClientError
            ? problem.message
            : "Could not start the pairing.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function mint() {
    setBusy(true);
    setMsg(null);
    setPairing(null);
    setApprovedAt(null);
    try {
      const { data } = await mintAgentToken({ name: name.trim(), scope });
      setTokens((current) => [data.token, ...current]);
      setMinted({ name: data.token.name, secret: data.secret });
      setName("");
    } catch (problem) {
      setMsg({
        type: "error",
        text:
          problem instanceof ApiClientError
            ? problem.message
            : "Could not create the token.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!pairing) return;
    setBusy(true);
    setMsg(null);
    try {
      await approvePairing(pairing.code);
      setClaimed(null);
      setApprovedAt(Date.now());
    } catch (problem) {
      setMsg({
        type: "error",
        text:
          problem instanceof ApiClientError
            ? problem.message
            : "Could not approve the pairing.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deny() {
    if (!pairing) return;
    setBusy(true);
    try {
      await denyPairing(pairing.code);
      setPairing(null);
      setClaimed(null);
      setMsg({ type: "ok", text: "Pairing cancelled. The code is dead." });
    } catch (problem) {
      setMsg({
        type: "error",
        text:
          problem instanceof ApiClientError
            ? problem.message
            : "Could not cancel the pairing.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: AgentTokenSummary) {
    setMsg(null);
    try {
      await revokeAgentToken(token.id);
      setTokens((current) => current.filter((entry) => entry.id !== token.id));
      setMsg({ type: "ok", text: `"${token.name}" can no longer connect.` });
    } catch (problem) {
      setMsg({
        type: "error",
        text:
          problem instanceof ApiClientError
            ? problem.message
            : "Could not revoke that connection.",
      });
    }
  }

  function copy(
    kind: "prompt" | "config",
    text: string,
    element: HTMLElement | null,
  ) {
    void copyText(text).then((ok) => {
      setCopied(ok ? kind : null);
      setCopyBlocked(!ok);
      if (!ok) selectText(element);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4" />
          Agent access
        </CardTitle>
        <CardDescription>
          Let an AI agent you already use read and change your applications over
          MCP. Pairing hands the token over without it ever passing through a
          chat log, and the scope you pick here is what the agent can reach —
          never your account itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="the agent in my laptop"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-scope">Scope</Label>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as AgentScope)}
            >
              <SelectTrigger id="agent-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_SCOPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {scopeLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {SCOPE_DESCRIPTIONS[scope]}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void pair()} disabled={!canStart}>
            <Plug />
            {busy ? "Working…" : "Pair an agent"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void mint()}
            disabled={!canStart}
          >
            Create a token instead
          </Button>
        </div>

        {pairing ? (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            <p className="text-sm">
              Paste the prompt into the agent. The code inside it is all it
              needs: nothing happens until you approve here, and the token goes
              straight to the agent.
            </p>
            <p className="text-sm">
              Code{" "}
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-base tracking-widest">
                {pairing.code}
              </code>
              <span className="text-muted-foreground">
                {" "}
                — read it out if the agent asks, instead of the whole prompt.
              </span>
            </p>
            <pre
              ref={promptRef}
              tabIndex={0}
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-2 text-xs"
            >
              {pairingPrompt(pairing.code)}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  copy("prompt", pairingPrompt(pairing.code), promptRef.current)
                }
              >
                {copied === "prompt" ? <Check /> : <Copy />}
                {copied === "prompt" ? "Copied" : "Copy prompt"}
              </Button>
              {copyBlocked ? (
                <span className="text-xs text-muted-foreground">
                  This browser will not let the page copy (no HTTPS). The prompt
                  above is selected — copy it by hand.
                </span>
              ) : null}
            </div>

            {approvedAt !== null ? (
              <p role="status" className="text-sm">
                Approved. Waiting for the agent to collect its token…
              </p>
            ) : claimed ? (
              <div className="space-y-2">
                <p className="text-sm">An agent claimed the code.</p>
                <p className="text-xs text-muted-foreground">
                  {claimAddress(claimed) ? (
                    <>
                      Claimed from{" "}
                      <span className="font-mono">{claimAddress(claimed)}</span>
                      {claimAgent(claimed) ? ` · ${claimAgent(claimed)}` : ""}.{" "}
                    </>
                  ) : null}
                  The token goes to that connection only, so approve only if it
                  is your agent.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void approve()}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void deny()}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Waiting for an agent to claim the code…
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void deny()}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {minted ? (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            <p className="text-sm">
              <strong>Copy this now.</strong> It is stored as a hash and cannot
              be shown again. Paste it into your client&rsquo;s MCP
              configuration — it is the whole connection.
            </p>
            <pre
              ref={configRef}
              tabIndex={0}
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-2 text-xs"
            >
              {configBlock(minted.secret)}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  copy("config", configBlock(minted.secret), configRef.current)
                }
              >
                {copied === "config" ? <Check /> : <Copy />}
                {copied === "config" ? "Copied" : "Copy config"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {copyBlocked
                  ? "This browser will not let the page copy (no HTTPS) — the block above is selected."
                  : `Ghosted serves the tools itself at ${mcpUrl()}, so nothing is installed next to the agent.`}
              </span>
            </div>
          </div>
        ) : null}

        <Message state={msg} />

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Connected agents</p>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing connected yet.</p>
          ) : (
            <ul className="space-y-2">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* The same rounded-square chip the board uses for a company: an
                        agent is an identity on this screen, and the glyph says which
                        kind. Decorative — the name is right next to it. */}
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground"
                      aria-hidden
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{token.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {scopeLabel(token.scope)} · {usedLabel(token)}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${token.name}`}
                    title="Revoke"
                    onClick={() => void revoke(token)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {tokens.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Revoking cuts that agent off on its next request. Everything else —
              your applications, your account — stays exactly as it is.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
