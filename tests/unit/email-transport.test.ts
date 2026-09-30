import { describe, expect, it } from "vitest";
import { readTransportChoice } from "@/lib/email/transport";
import { createLogTransport } from "@/lib/email/log";
import { ConfigError, readConfig } from "@/lib/config/flags";

/**
 * Deployment validation, not implementation detail: which combinations of
 * environment variables may boot, and which must stop. The interesting cases
 * are the two failure shapes that reach production silently — an instance open
 * to registration with no way to deliver a verification link, and a transport
 * named but not configured.
 */
describe("readTransportChoice", () => {
  it("keeps the pre-transport behaviour: Resend when the key is there, the log stub when it is not", () => {
    expect(readTransportChoice({})).toMatchObject({
      name: "log",
      delivers: false,
      problems: [],
    });
    expect(readTransportChoice({ RESEND_API_KEY: "re_test" })).toMatchObject({
      name: "resend",
      delivers: true,
      problems: [],
    });
  });

  it("refuses a transport name it does not implement", () => {
    const choice = readTransportChoice({ EMAIL_TRANSPORT: "sendgrid" });
    expect(choice.problems[0]).toMatch(/EMAIL_TRANSPORT="sendgrid" is not a transport/);
  });

  it("refuses a transport that is named but not configured", () => {
    expect(readTransportChoice({ EMAIL_TRANSPORT: "resend" }).problems[0]).toMatch(
      /needs RESEND_API_KEY/,
    );
    expect(readTransportChoice({ EMAIL_TRANSPORT: "smtp" }).problems[0]).toMatch(
      /needs SMTP_URL/,
    );
    expect(
      readTransportChoice({ EMAIL_TRANSPORT: "smtp", SMTP_URL: "http://mail.example.com" })
        .problems[0],
    ).toMatch(/must start with smtp:\/\/ or smtps:\/\//);
  });

  it("accepts a configured SMTP URL", () => {
    const choice = readTransportChoice({
      EMAIL_TRANSPORT: "smtp",
      SMTP_URL: "smtps://user:pass@smtp.example.com:465",
    });
    expect(choice).toMatchObject({ name: "smtp", delivers: true, problems: [] });
  });
});

describe("readConfig email rules", () => {
  const production = { NODE_ENV: "production" };

  it("lets a solo instance run on the log stub", () => {
    const config = readConfig({
      ...production,
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: "owner@example.com",
    });
    expect(config.allowRegistration).toBe(false);
  });

  it("refuses an open-registration production instance that cannot deliver mail", () => {
    expect(() => readConfig({ ...production, ALLOW_REGISTRATION: "true" })).toThrow(
      ConfigError,
    );
    expect(() => readConfig({ ...production, ALLOW_REGISTRATION: "true" })).toThrow(
      /needs a delivering email transport/,
    );
  });

  it("accepts open registration once a transport and a From address are configured", () => {
    const config = readConfig({
      ...production,
      ALLOW_REGISTRATION: "true",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Ghosted <hi@example.com>",
    });
    expect(config.allowRegistration).toBe(true);
  });

  it("still complains about a delivering transport with no From address", () => {
    expect(() =>
      readConfig({
        ...production,
        RESEND_API_KEY: "re_test",
      }),
    ).toThrow(/EMAIL_FROM is not set/);
  });

  it("leaves development alone — the log stub is the whole point there", () => {
    const config = readConfig({ NODE_ENV: "development" });
    expect(config.allowRegistration).toBe(true);
  });
});

describe("the log transport", () => {
  it("records the message, links and all, instead of sending it", async () => {
    // The dev and solo-instance path: this log line is the only place a
    // developer ever sees the verification link, so it has to carry the body.
    const written: Array<{ context: Record<string, unknown>; message: string }> = [];
    const transport = createLogTransport((context, message) =>
      written.push({ context, message }),
    );

    expect(transport.delivers).toBe(false);
    await transport.send(
      {
        to: "you@example.com",
        subject: "Confirm your email",
        text: "open http://localhost:3100/verify?token=abc123",
      },
      "Ghosted <hi@example.com>",
    );

    expect(written).toHaveLength(1);
    expect(written[0].context).toMatchObject({ to: "you@example.com" });
    expect(written[0].message).toContain("http://localhost:3100/verify?token=abc123");
  });
});
