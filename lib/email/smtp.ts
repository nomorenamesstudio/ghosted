import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import type { EmailMessage, EmailTransport } from "./types";

/**
 * A minimal SMTP client, written rather than imported.
 *
 * `nodemailer` is the obvious choice and this file exists because the project's
 * dependency graph is pinned by `pnpm-lock.yaml`, which cannot be regenerated in
 * this environment — and because the job here is deliberately small: one
 * message per connection, implicit TLS or STARTTLS, AUTH PLAIN/LOGIN, no
 * attachments, no DKIM signing, no connection pool. Everything a self-hoster
 * needs (Postmark, SendGrid, Mailgun, Fastmail, a local Postfix) speaks exactly
 * that much.
 *
 * If the dependency is ever added, this file is the only thing that changes:
 * the transport interface above it stays.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** `smtps://` — TLS from the first byte. `smtp://` starts plain and upgrades. */
  secure: boolean;
  user?: string;
  password?: string;
  /**
   * Permit an unencrypted conversation when the server does not offer STARTTLS.
   * Off by default: `smtp://` means "upgrade me", not "send my password in the
   * clear if you cannot", and base64 is not encryption. The escape hatch exists
   * for an unauthenticated relay on the same host (a local Postfix), where the
   * traffic never leaves the machine.
   */
  allowInsecure?: boolean;
}

const REPLY_TIMEOUT_MS = 20_000;

/** `smtps://user:pass@smtp.example.com:465` → the parts. Throws on nonsense. */
export function parseSmtpUrl(raw: string): SmtpConfig {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Never echo the value: an SMTP URL carries the password in clear text, and
    // these messages end up in boot logs and deployment diagnostics.
    throw new Error("SMTP_URL is not a URL");
  }
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    throw new Error(
      `SMTP_URL must start with smtp:// or smtps:// (got "${url.protocol}//")`,
    );
  }
  const secure = url.protocol === "smtps:";
  const port = url.port ? Number(url.port) : secure ? 465 : 587;
  if (!url.hostname) throw new Error("SMTP_URL has no host");
  return {
    host: url.hostname,
    port,
    secure,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

interface Reply {
  code: number;
  lines: string[];
}

/**
 * Reads one SMTP reply: `250-first`, `250-more`, `250 last`. A reply is over
 * when a line has a space after the code rather than a hyphen.
 */
class SmtpSession {
  private buffer = "";
  private queue: Reply[] = [];
  private waiters: Array<{
    resolve: (reply: Reply) => void;
    reject: (error: Error) => void;
  }> = [];
  private failure: Error | null = null;
  private readonly onData = (chunk: string) => this.onData_(chunk);
  private readonly onError = (error: Error) => this.fail(error);
  private readonly onClose = () => this.fail(new Error("SMTP: connection closed"));

  constructor(private socket: Socket | TLSSocket) {
    socket.setEncoding("utf8");
    socket.setTimeout(REPLY_TIMEOUT_MS, () => {
      this.fail(new Error(`SMTP: no reply within ${REPLY_TIMEOUT_MS}ms`));
    });
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  /**
   * Stop listening, so the same descriptor can be handed to TLS. Without this
   * the old reader is still attached while the handshake bytes arrive, and it
   * consumes them as SMTP replies.
   */
  detach(): void {
    this.socket.removeListener("data", this.onData);
    this.socket.removeListener("error", this.onError);
    this.socket.removeListener("close", this.onClose);
    this.socket.setTimeout(0);
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  /** Continuation lines of one reply may arrive split across chunks. */
  private replyCode = 0;
  private replyLines: string[] = [];

  private onData_(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\r\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      const match = /^(\d{3})([- ])(.*)$/.exec(line);
      if (match) {
        const lineCode = Number(match[1]);
        if (this.replyLines.length === 0 || lineCode === this.replyCode) {
          this.replyCode = lineCode;
          this.replyLines.push(match[3]);
        }
        if (match[2] === " ") {
          const reply = { code: this.replyCode, lines: this.replyLines };
          const waiter = this.waiters.shift();
          if (waiter) waiter.resolve(reply);
          else this.queue.push(reply);
          this.replyLines = [];
        }
      }
      index = this.buffer.indexOf("\r\n");
    }
  }

  readReply(): Promise<Reply> {
    if (this.failure) return Promise.reject(this.failure);
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<Reply>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  write(line: string): void {
    this.socket.write(line + "\r\n");
  }
}

function upgradeToTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tls = connectTls({ socket, servername: host }, () => resolve(tls));
    tls.once("error", reject);
  });
}

function connect(config: SmtpConfig): Promise<Socket | TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? connectTls({ host: config.host, port: config.port, servername: config.host }, () =>
          resolve(socket),
        )
      : connectTcp({ host: config.host, port: config.port }, () => resolve(socket));
    socket.setTimeout(REPLY_TIMEOUT_MS, () => {
      socket.destroy(new Error(`SMTP: cannot reach ${config.host}:${config.port}`));
    });
    socket.once("error", reject);
  });
}

function expect(reply: Reply, codes: number[], step: string): void {
  if (!codes.includes(reply.code)) {
    throw new Error(`SMTP ${step} failed: ${reply.code} ${reply.lines.join(" ")}`);
  }
}

/**
 * A header or envelope field may not contain a line break: `\r\n` inside `to` or
 * `from` is header injection (a `Bcc:` smuggled into the message). The subject
 * is safe by construction because `encodeHeaderValue` base64s anything outside
 * printable ASCII; these two are not, so they are refused explicitly rather than
 * relied upon to stay internal.
 */
function assertSingleLine(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`SMTP: ${field} must not contain a line break`);
  }
  return value;
}

/** `Ghosted <hi@example.com>` or `hi@example.com` → `hi@example.com`. */
export function bareAddress(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim();
}

/** RFC 2047, so a subject with an em dash or an accent survives the wire. */
export function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * The DATA payload: headers, the two alternative bodies, and CRLF line endings.
 * A line that starts with "." is doubled — that is what ends the body early
 * otherwise (`\r\n.\r\n`), and dot-stuffing is the sender's job, not the
 * server's.
 */
export function buildMessage({
  from,
  to,
  subject,
  text,
  html,
  date = new Date(),
}: EmailMessage & { from: string; date?: Date }): string {
  assertSingleLine(from, "from");
  assertSingleLine(to, "to");
  // `encodeHeaderValue` base64s anything non-printable, which incidentally
  // covers CR/LF — but only while the subject has such a character. A subject
  // that is entirely printable ASCII, a line break included, would pass
  // through untouched, so it gets the same explicit guard.
  assertSingleLine(subject, "subject");

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
  ];

  const body = html
    ? [
        headers.join("\r\n"),
        `Content-Type: multipart/alternative; boundary="${BOUNDARY}"`,
        "",
        `--${BOUNDARY}`,
        'Content-Type: text/plain; charset="utf-8"',
        "",
        text,
        `--${BOUNDARY}`,
        'Content-Type: text/html; charset="utf-8"',
        "",
        html,
        `--${BOUNDARY}--`,
        "",
      ].join("\r\n")
    : [
        headers.join("\r\n"),
        'Content-Type: text/plain; charset="utf-8"',
        "",
        text,
      ].join("\r\n");

  // Normalise first: the templates above are ordinary JS strings with LF
  // endings, and a bare LF is not a line break SMTP agrees on — it would skip
  // both the dot-stuffing and the CRLF the wire requires.
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

const BOUNDARY = "ghosted-alt-boundary";

/** One conversation, one message, then QUIT. */
export async function sendSmtpMessage(
  config: SmtpConfig,
  message: EmailMessage & { from: string },
): Promise<void> {
  const socket = await connect(config);
  // The socket the session is actually talking through: after STARTTLS that is
  // the wrapped one, and closing the original would leave the TLS layer to die
  // on its own.
  let active: Socket | TLSSocket = socket;
  const session = new SmtpSession(socket);
  try {
    expect(await session.readReply(), [220], "greeting");

    const hostname = process.env.HOSTNAME ?? "localhost";
    session.write(`EHLO ${hostname}`);
    let ehlo = await session.readReply();
    expect(ehlo, [250], "EHLO");
    let capabilities = ehlo.lines.join(" ").toUpperCase();

    if (!config.secure && !capabilities.includes("STARTTLS") && !config.allowInsecure) {
      throw new Error(
        `SMTP: ${config.host} does not offer STARTTLS — refusing to send credentials or mail in the clear. Use smtps:// (port 465), or set SMTP_ALLOW_INSECURE=1 for a relay on this machine.`,
      );
    }

    if (!config.secure && capabilities.includes("STARTTLS")) {
      session.write("STARTTLS");
      expect(await session.readReply(), [220], "STARTTLS");
      // Detach *before* the handshake: the TLS bytes arrive on the same
      // descriptor, and a reader still attached would eat them.
      session.detach();
      const upgraded = await upgradeToTls(socket as Socket, config.host);
      active = upgraded;
      const secureSession = new SmtpSession(upgraded);
      secureSession.write(`EHLO ${hostname}`);
      ehlo = await secureSession.readReply();
      expect(ehlo, [250], "EHLO after STARTTLS");
      capabilities = ehlo.lines.join(" ").toUpperCase();
      return await authenticateAndSend(secureSession, capabilities, config, message);
    }

    return await authenticateAndSend(session, capabilities, config, message);
  } finally {
    active.end();
  }
}

async function authenticateAndSend(
  session: SmtpSession,
  capabilities: string,
  config: SmtpConfig,
  message: EmailMessage & { from: string },
): Promise<void> {
  if (config.user && config.password && capabilities.includes("AUTH")) {
    const plain = Buffer.from(
      `\0${config.user}\0${config.password}`,
      "utf8",
    ).toString("base64");
    if (capabilities.includes("PLAIN")) {
      session.write(`AUTH PLAIN ${plain}`);
    } else {
      // LOGIN: the user name and the password are asked for separately.
      session.write("AUTH LOGIN");
      expect(await session.readReply(), [334], "AUTH LOGIN");
      session.write(Buffer.from(config.user, "utf8").toString("base64"));
      expect(await session.readReply(), [334], "AUTH LOGIN user");
      session.write(Buffer.from(config.password, "utf8").toString("base64"));
    }
    expect(await session.readReply(), [235], "AUTH");
  }

  session.write(`MAIL FROM:<${assertSingleLine(bareAddress(message.from), "from")}>`);
  expect(await session.readReply(), [250], "MAIL FROM");

  session.write(`RCPT TO:<${assertSingleLine(bareAddress(message.to), "to")}>`);
  expect(await session.readReply(), [250, 251], "RCPT TO");

  session.write("DATA");
  expect(await session.readReply(), [354], "DATA");

  session.write(`${buildMessage(message)}\r\n.`);
  expect(await session.readReply(), [250], "message body");

  // Wait for the 221 before closing: the message is already accepted at this
  // point, so a missing goodbye must not turn a sent email into a failure.
  session.write("QUIT");
  await session.readReply().catch(() => undefined);
}

export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  return {
    name: "smtp",
    delivers: true,
    async send(message, from) {
      await sendSmtpMessage(config, { ...message, from });
      // SMTP acknowledges delivery to the next hop and hands back no id.
      return null;
    },
  };
}
