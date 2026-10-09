import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordCard } from "@/components/PasswordCard";

/**
 * The password card in both shapes. The one that matters is the account with no
 * password: it must offer to *set* one and post to the route that accepts it
 * without a current password — the old card asked for a password that account
 * does not have, which is what made the state a dead end.
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
  });
});
