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
}

const REPLY_TIMEOUT_MS = 20_000;

/** `smtps://user:pass@smtp.example.com:465` → the parts. Throws on nonsense. */
export function parseSmtpUrl(raw: string): SmtpConfig {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SMTP_URL="${raw}" is not a URL`);
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

  constructor(private socket: Socket | TLSSocket) {
    socket.setEncoding("utf8");
    socket.setTimeout(REPLY_TIMEOUT_MS, () => {
      this.fail(new Error(`SMTP: no reply within ${REPLY_TIMEOUT_MS}ms`));
    });
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("SMTP: connection closed")));
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\r\n");
    let code = 0;
    let lines: string[] = [];
    while (index !== -1) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      const match = /^(\d{3})([- ])(.*)$/.exec(line);
      if (match) {
        const lineCode = Number(match[1]);
        if (lines.length === 0 || lineCode === code) {
          code = lineCode;
          lines.push(match[3]);
        }
        if (match[2] === " ") {
          const reply = { code, lines };
          const waiter = this.waiters.shift();
          if (waiter) waiter.resolve(reply);
          else this.queue.push(reply);
          lines = [];
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
  const session = new SmtpSession(socket);
  try {
    expect(await session.readReply(), [220], "greeting");

    const hostname = process.env.HOSTNAME ?? "localhost";
    session.write(`EHLO ${hostname}`);
    let ehlo = await session.readReply();
    expect(ehlo, [250], "EHLO");
    let capabilities = ehlo.lines.join(" ").toUpperCase();

    if (!config.secure && capabilities.includes("STARTTLS")) {
      session.write("STARTTLS");
      expect(await session.readReply(), [220], "STARTTLS");
      const upgraded = await upgradeToTls(socket as Socket, config.host);
      // A new socket, a new reader: the old one must not consume the TLS bytes.
      socket.removeAllListeners("data");
      const secureSession = new SmtpSession(upgraded);
      secureSession.write(`EHLO ${hostname}`);
      ehlo = await secureSession.readReply();
      expect(ehlo, [250], "EHLO after STARTTLS");
      capabilities = ehlo.lines.join(" ").toUpperCase();
      return await authenticateAndSend(secureSession, capabilities, config, message);
    }

    return await authenticateAndSend(session, capabilities, config, message);
  } finally {
    socket.end();
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

  session.write(`MAIL FROM:<${bareAddress(message.from)}>`);
  expect(await session.readReply(), [250], "MAIL FROM");

  session.write(`RCPT TO:<${bareAddress(message.to)}>`);
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
