import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bareAddress,
  buildMessage,
  encodeHeaderValue,
  parseSmtpUrl,
  sendSmtpMessage,
} from "@/lib/email/smtp";

/**
 * The SMTP client is the one piece of this app that speaks a wire protocol, so
 * the tests speak it too: a fake server records the dialogue and the tests
 * assert what went over the socket. That is the contract that matters — a
 * message that is dot-stuffed correctly and CRLF-terminated arrives intact at
 * every provider, and a client that guesses differently does not.
 */

interface FakeServer {
  port: number;
  close: () => Promise<void>;
  /** Every line the client sent, in order. */
  dialogue: string[];
  /** The raw DATA payload, without the terminating dot. */
  body: () => string;
  sockets: Socket[];
}

/**
 * The certificate the STARTTLS fake presents.
 *
 * Self-signed and generated here, because the point of the test below is the
 * *protocol* — that the client upgrades, re-EHLOs, and only then sends
 * credentials — not certificate validation, which is Node's default behaviour
 * and is not something this client overrides. The test disables verification
 * for its own duration rather than the client gaining a "trust anything" switch
 * that production could accidentally inherit.
 */
function selfSignedCertificate(): { key: string; cert: string } {
  const dir = join(process.cwd(), ".tmp-review", "tls");
  mkdirSync(dir, { recursive: true });
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  if (!existsSync(cert)) {
    // Generated rather than committed: a key in the repository is a key
    // everybody has, and this one never leaves the test.
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=localhost",
      ],
      { stdio: "ignore" },
    );
  }
  return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
}

/**
 * A STARTTLS conversation that actually upgrades.
 *
 * The existing fake answers `STARTTLS` with a 220 and then garbage, which is
 * enough to prove the client refuses to fall back to cleartext — and nothing
 * about the path every real provider on port 587 uses. This one completes the
 * handshake and then keeps talking SMTP over TLS, so the assertions can cover
 * the whole sequence: EHLO, STARTTLS, a second EHLO *inside* the tunnel, AUTH,
 * and DATA.
 */
async function startTlsSmtp(): Promise<FakeServer & { secured: () => boolean }> {
  const { key, cert } = selfSignedCertificate();
  const context = createSecureContext({ key, cert });
  const dialogue: string[] = [];
  let data = "";
  let upgraded = false;
  const sockets: Socket[] = [];

  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.setEncoding("utf8");
    socket.write("220 fake ESMTP\r\n");

    let buffer = "";
    let inData = false;
    let secure: TLSSocket | null = null;

    const handle = (line: string, reply: (text: string) => void) => {
      dialogue.push(line);
      if (inData) {
        if (line === ".") {
          inData = false;
          reply("250 2.0.0 queued");
        } else {
          data += line + "\r\n";
        }
        return;
      }
      if (line.startsWith("EHLO")) {
        reply("250-fake greets you\r\n250-8BITMIME\r\n250-STARTTLS\r\n250 AUTH PLAIN LOGIN");
        return;
      }
      if (line === "STARTTLS") {
        reply("220 Ready to start TLS");
        // Upgrading in place is what a real server does: same socket, now TLS.
        secure = new TLSSocket(socket, { isServer: true, secureContext: context });
        upgraded = true;
        secure.setEncoding("utf8");
        secure.on("data", (chunk: string) => {
          buffer += chunk;
          let index = buffer.indexOf("\r\n");
          while (index !== -1) {
            const next = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            index = buffer.indexOf("\r\n");
            handle(next, (text) => secure!.write(`${text}\r\n`));
          }
        });
        return;
      }
      if (line.startsWith("AUTH PLAIN")) return reply("235 2.7.0 accepted");
      if (line.startsWith("MAIL FROM")) return reply("250 2.1.0 ok");
      if (line.startsWith("RCPT TO")) return reply("250 2.1.5 ok");
      if (line === "DATA") {
        inData = true;
        return reply("354 End data with <CR><LF>.<CR><LF>");
      }
      if (line === "QUIT") return reply("221 2.0.0 bye");
      reply("250 2.0.0 ok");
    };

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\r\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf("\r\n");
        handle(line, (text) => socket.write(`${text}\r\n`));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");

  return {
    port: address.port,
    sockets,
    dialogue,
    body: () => data,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    secured: () => upgraded,
  };
}

async function fakeSmtp(
  options: {
    capabilities?: string[];
    failRcpt?: boolean;
    greeting?: string;
    /** Write a reply's continuation lines separately, as TCP may. */
    splitReplies?: boolean;
  } = {},
): Promise<FakeServer> {
  const capabilities = options.capabilities ?? ["AUTH PLAIN LOGIN"];
  const dialogue: string[] = [];
  let data = "";
  const sockets: Socket[] = [];

  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.setEncoding("utf8");
    socket.write(`${options.greeting ?? "220 fake ESMTP"}\r\n`);
    let buffer = "";
    let inData = false;
    // AUTH LOGIN is a conversation, so the fake has to know which base64 line
    // it is looking at. Matching "any line that looks like base64" also matches
    // DATA, which is exactly how a fake server passes for the wrong reason.
    let authStep: "user" | "password" | null = null;

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\r\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf("\r\n");

        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 queued\r\n");
          } else {
            data += line + "\r\n";
          }
          continue;
        }

        dialogue.push(line);
        if (line.startsWith("EHLO")) {
          const reply = [
            "250-fake greets you",
            "250-8BITMIME",
            ...capabilities.map((capability) => `250-${capability}`),
            "250 SMTPUTF8",
          ];
          if (options.splitReplies) {
            // One line now, the rest a tick later: two chunks, one reply.
            socket.write(`${reply[0]}\r\n`);
            const rest = reply.slice(1).join("\r\n") + "\r\n";
            setTimeout(() => socket.write(rest), 15);
          } else {
            socket.write(reply.join("\r\n") + "\r\n");
          }
        } else if (line.startsWith("AUTH PLAIN")) {
          socket.write("235 2.7.0 accepted\r\n");
        } else if (line === "AUTH LOGIN") {
          authStep = "user";
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (authStep === "user") {
          authStep = "password";
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else if (authStep === "password") {
          authStep = null;
          socket.write("235 2.7.0 accepted\r\n");
        } else if (line.startsWith("MAIL FROM")) {
          socket.write("250 2.1.0 ok\r\n");
        } else if (line.startsWith("RCPT TO")) {
          socket.write(
            options.failRcpt ? "550 5.1.1 no such user\r\n" : "250 2.1.5 ok\r\n",
          );
        } else if (line === "STARTTLS") {
          socket.write("220 2.0.0 Ready to start TLS\r\n");
          // No certificate here: the client must fail the handshake cleanly
          // rather than continue in the clear.
          socket.write("this is not a TLS ServerHello\r\n");
        } else if (line === "DATA") {
          inData = true;
          socket.write("354 end with <CRLF>.<CRLF>\r\n");
        } else if (line === "QUIT") {
          socket.write("221 2.0.0 bye\r\n");
          socket.end();
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    port: address.port,
    dialogue,
    body: () => data,
    sockets,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

let running: FakeServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

describe("parseSmtpUrl", () => {
  it("reads the implicit-TLS and STARTTLS shapes with their default ports", () => {
    expect(parseSmtpUrl("smtps://user:p%40ss@smtp.example.com")).toEqual({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "user",
      password: "p@ss",
    });
    expect(parseSmtpUrl("smtp://smtp.example.com:2525")).toEqual({
      host: "smtp.example.com",
      port: 2525,
      secure: false,
      user: undefined,
      password: undefined,
    });
  });

  it("refuses what it cannot dial", () => {
    expect(() => parseSmtpUrl("not a url")).toThrow(/is not a URL/);
    expect(() => parseSmtpUrl("https://smtp.example.com")).toThrow(
      /must start with smtp:\/\//,
    );
  });
});

describe("buildMessage", () => {
  const base = {
    from: "Ghosted <hi@example.com>",
    to: "you@example.com",
    subject: "Reset your password",
    text: "line one\n.dot line",
  };

  it("terminates every line with CRLF and stuffs a leading dot", () => {
    const message = buildMessage(base);
    expect(message).toContain("To: you@example.com\r\n");
    // A bare "." line would end the DATA block early.
    expect(message).toContain("\r\n..dot line");
    expect(message.split("\r\n").every((line, i, all) => i === all.length - 1 || line.length >= 0)).toBe(true);
    expect(message).not.toMatch(/[^\r]\n/);
  });

  it("sends both alternatives, in one multipart body, when there is HTML", () => {
    const message = buildMessage({ ...base, html: "<p>hello</p>" });
    expect(message).toContain("Content-Type: multipart/alternative");
    expect(message).toContain('Content-Type: text/plain; charset="utf-8"');
    expect(message).toContain('Content-Type: text/html; charset="utf-8"');
    expect(message).toContain("<p>hello</p>");
  });

  it("encodes a non-ASCII subject and leaves an ASCII one readable", () => {
    // Both halves of one contract: `encodeHeaderValue` may only encode what it
    // has to, and a subject that needs encoding must never reach the wire raw.
    expect(buildMessage(base)).toContain("Subject: Reset your password");
    expect(encodeHeaderValue("Reset your password")).toBe("Reset your password");

    const encoded = buildMessage({ ...base, subject: "Jelszó — visszaállítás" });
    expect(encoded).toMatch(/^Subject: =\?UTF-8\?B\?/m);
    expect(encoded).not.toContain("Jelszó");
  });

  it("refuses a line break in From or To rather than injecting a header", () => {
    expect(() =>
      buildMessage({ ...base, to: "you@example.com\r\nBcc: someone@example.com" }),
    ).toThrow(/must not contain a line break/);
    expect(() =>
      buildMessage({ ...base, from: "hi@example.com\nX-Evil: 1" }),
    ).toThrow(/must not contain a line break/);
  });

  it("unwraps the display-name form for the envelope", () => {
    expect(bareAddress("Ghosted <hi@example.com>")).toBe("hi@example.com");
    expect(bareAddress("hi@example.com")).toBe("hi@example.com");
  });
});

describe("sendSmtpMessage", () => {
  it("authenticates, envelopes the message and sends the body", async () => {
    // No STARTTLS advertised + the explicit opt-in: this test is about the
    // dialogue, not about TLS (the TLS requirement has its own cases above).
    running = await fakeSmtp();
    await sendSmtpMessage(
      {
        host: "127.0.0.1",
        port: running.port,
        secure: false,
        user: "apikey",
        password: "hunter2",
        allowInsecure: true,
      },
      {
        from: "Ghosted <hi@example.com>",
        to: "you@example.com",
        subject: "Confirm your email",
        text: "open this link\n.\nsoon",
      },
    );

    const expectedAuth = Buffer.from("\0apikey\0hunter2", "utf8").toString("base64");
    expect(running.dialogue[0]).toMatch(/^EHLO /);
    expect(running.dialogue[1]).toBe(`AUTH PLAIN ${expectedAuth}`);
    expect(running.dialogue[2]).toBe("MAIL FROM:<hi@example.com>");
    expect(running.dialogue[3]).toBe("RCPT TO:<you@example.com>");
    expect(running.dialogue[4]).toBe("DATA");
    expect(running.dialogue.at(-1)).toBe("QUIT");

    const body = running.body();
    expect(body).toContain("Subject: Confirm your email");
    expect(body).toContain("\r\n..\r\n"); // the lone dot, stuffed
    expect(body).toContain("open this link");
  });

  it("falls back to AUTH LOGIN when the server does not offer PLAIN", async () => {
    running = await fakeSmtp({ capabilities: ["AUTH LOGIN"] });
    await sendSmtpMessage(
      {
        host: "127.0.0.1",
        port: running.port,
        secure: false,
        user: "apikey",
        password: "hunter2",
        allowInsecure: true,
      },
      { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
    );
    expect(running.dialogue[1]).toBe("AUTH LOGIN");
    expect(running.dialogue[2]).toBe(Buffer.from("apikey").toString("base64"));
    expect(running.dialogue[3]).toBe(Buffer.from("hunter2").toString("base64"));
  });

  it("refuses to speak in the clear when the server cannot upgrade", async () => {
    // base64 is not encryption: a misconfigured relay on port 587 must not
    // receive AUTH PLAIN, and the mail must not go out unencrypted either.
    running = await fakeSmtp({ capabilities: [] });
    await expect(
      sendSmtpMessage(
        { host: "127.0.0.1", port: running.port, secure: false, user: "apikey", password: "hunter2" },
        { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
      ),
    ).rejects.toThrow(/does not offer STARTTLS/);
    expect(running.dialogue.some((line) => line.startsWith("AUTH"))).toBe(false);
    expect(running.dialogue.some((line) => line.startsWith("MAIL FROM"))).toBe(false);
    expect(running.body()).toBe("");
  });

  it("allows an unencrypted relay only when the operator opts in", async () => {
    running = await fakeSmtp({ capabilities: [] });
    await sendSmtpMessage(
      {
        host: "127.0.0.1",
        port: running.port,
        secure: false,
        user: "apikey",
        password: "hunter2",
        allowInsecure: true,
      },
      { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
    );
    expect(running.dialogue.some((line) => line.startsWith("MAIL FROM"))).toBe(true);
  });

  it("keeps a multiline reply's earlier lines when the socket splits them", async () => {
    // TCP is free to break the EHLO reply anywhere; if the continuation lines
    // are dropped, the client never sees AUTH and silently sends unauthenticated
    // mail (or misses STARTTLS).
    running = await fakeSmtp({ capabilities: ["AUTH PLAIN"], splitReplies: true });
    await sendSmtpMessage(
      {
        host: "127.0.0.1",
        port: running.port,
        secure: false,
        user: "apikey",
        password: "hunter2",
        allowInsecure: true,
      },
      { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
    );
    const expectedAuth = Buffer.from("\0apikey\0hunter2", "utf8").toString("base64");
    expect(running.dialogue[1]).toBe(`AUTH PLAIN ${expectedAuth}`);
  });

  it("upgrades with a real handshake, and only then sends credentials", async () => {
    // The whole path a port-587 provider uses: 220 greeting, EHLO, STARTTLS,
    // handshake, a second EHLO inside the tunnel, AUTH, DATA. The earlier
    // STARTTLS tests stop at "the client asked and refused to degrade"; this
    // one proves the upgrade itself works and that nothing is sent in the clear
    // before it.
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // the fake's cert is self-signed
    const server = await startTlsSmtp();
    try {
      await sendSmtpMessage(
        {
          host: "127.0.0.1",
          port: server.port,
          secure: false,
          user: "apikey",
          password: "hunter2",
        },
        {
          from: "Ghosted <hi@example.com>",
          to: "you@example.com",
          subject: "Over TLS",
          text: "hello over tls",
        },
      );

      expect(server.secured(), "the server saw a TLS handshake").toBe(true);
      expect(server.dialogue[0]).toMatch(/^EHLO /);
      expect(server.dialogue[1]).toBe("STARTTLS");
      // A second EHLO, inside the tunnel: capabilities change after the upgrade.
      expect(server.dialogue[2]).toMatch(/^EHLO /);
      // And the credentials only exist after it.
      const auth = server.dialogue.findIndex((line) => line.startsWith("AUTH PLAIN"));
      const startTls = server.dialogue.indexOf("STARTTLS");
      expect(auth).toBeGreaterThan(startTls);
      expect(server.body()).toContain("Subject: Over TLS");
      expect(server.body()).toContain("hello over tls");
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
      await server.close();
    }
  });

  it("asks for STARTTLS when the server offers it", async () => {
    // Only the pre-handshake half is testable here: upgrading needs a
    // certificate the client will accept, and a fake server cannot present one.
    // What this pins is the decision and the write — offered STARTTLS must be
    // taken, not skipped — plus a clean failure when the upgrade cannot happen.
    running = await fakeSmtp({ capabilities: ["STARTTLS", "AUTH PLAIN"] });
    await expect(
      sendSmtpMessage(
        { host: "127.0.0.1", port: running.port, secure: false, user: "apikey", password: "hunter2" },
        { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
      ),
    ).rejects.toThrow();
    expect(running.dialogue).toContain("STARTTLS");
    // It must not carry on in the clear after being told TLS is coming.
    expect(running.dialogue.some((line) => line.startsWith("MAIL FROM"))).toBe(false);
  });

  it("sends unauthenticated when no credentials are configured", async () => {
    running = await fakeSmtp({ capabilities: [] });
    await sendSmtpMessage(
      { host: "127.0.0.1", port: running.port, secure: false, allowInsecure: true },
      { from: "hi@example.com", to: "you@example.com", subject: "Hi", text: "body" },
    );
    expect(running.dialogue.some((line) => line.startsWith("AUTH"))).toBe(false);
    expect(running.dialogue[1]).toBe("MAIL FROM:<hi@example.com>");
  });

  it("throws with the server's own words when a recipient is refused", async () => {
    running = await fakeSmtp({ failRcpt: true, capabilities: [] });
    await expect(
      sendSmtpMessage(
        { host: "127.0.0.1", port: running.port, secure: false, allowInsecure: true },
        { from: "hi@example.com", to: "nobody@example.com", subject: "Hi", text: "body" },
      ),
    ).rejects.toThrow(/RCPT TO failed: 550 5\.1\.1 no such user/);
  });
});
