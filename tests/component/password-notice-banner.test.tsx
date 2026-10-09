import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordNoticeBanner } from "@/components/PasswordNoticeBanner";

/**
 * The one-time "we cleared your password" notice. It has to say what happened
 * and offer the way out, and dismissing it has to reach the server — this one
 * marks the account as told, unlike the verification banner's 24h "Later".
 */
function stubFetch(ok = true) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PasswordNoticeBanner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays out of the way when there is nothing to say", () => {
    render(<PasswordNoticeBanner show={false} />);

    expect(screen.queryByText("Your password was removed")).toBeNull();
  });

  it("explains the removal and links to the password card", () => {
    render(<PasswordNoticeBanner show />);

    expect(screen.getByText("Your password was removed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set a password" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("tells the server once the notice is dismissed", async () => {
    const fetchMock = stubFetch();
    render(<PasswordNoticeBanner show />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/dismiss-password-notice",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.queryByText("Your password was removed")).toBeNull();
  });
});
