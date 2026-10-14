import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-auth/react", () => ({ signOut: vi.fn().mockResolvedValue(undefined) }));
// The card navigates in-app after signing out rather than letting signOut build
// the URL: that URL is resolved against Auth.js's base, which a dev server
// pinned to one origin answers with (a phone on the LAN got sent to localhost).
const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { signOut } from "next-auth/react";
import { PasswordCard } from "@/components/PasswordCard";

/**
 * The password card in both shapes. The one that matters is the account with no
 * password: it must offer to *set* one and post to the route that accepts it
 * without a current password — the old card asked for a password that account
 * does not have, which is what made the state a dead end.
 *
 * The second contract is what happens after a save: both routes move the
 * account's session counter on, which revokes every session including this one,
 * so the card signs out and hands over to the login screen — the same ending the
 * forced first-run change already had.
 */
function stubFetch(ok = true) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function submitNewPassword() {
  await userEvent.type(screen.getByLabelText("New password"), "newpassword1");
  await userEvent.type(
    screen.getByLabelText("Confirm new password"),
    "newpassword1",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /^(Update|Save) password$/ }),
  );
}

describe("PasswordCard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(signOut).mockClear();
    pushMock.mockClear();
  });

  it("changes an existing password and asks for the current one", async () => {
    const fetchMock = stubFetch();
    render(<PasswordCard hasPassword />);

    await userEvent.click(
      screen.getByRole("button", { name: "Change password" }),
    );
    const current = screen.getByLabelText("Current password");
    await userEvent.type(current, "oldpassword1");
    await submitNewPassword();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({ method: "POST" }),
    );
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(pushMock).toHaveBeenCalledWith("/login?passwordChanged=1");
  });

  it("sets the first password without asking for one", async () => {
    const fetchMock = stubFetch();
    render(<PasswordCard hasPassword={false} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Set a password" }),
    );
    expect(screen.queryByLabelText("Current password")).toBeNull();
    await submitNewPassword();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/set-password",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      newPassword: "newpassword1",
      confirmPassword: "newpassword1",
    });
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(pushMock).toHaveBeenCalledWith("/login?passwordChanged=1");
  });

  it("stays signed in when the password was not changed", async () => {
    stubFetch(false);
    render(<PasswordCard hasPassword />);

    await userEvent.click(
      screen.getByRole("button", { name: "Change password" }),
    );
    await userEvent.type(
      screen.getByLabelText("Current password"),
      "oldpassword1",
    );
    await submitNewPassword();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
