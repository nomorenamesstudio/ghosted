import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  BCRYPT_ROUNDS: 12,
  SESSION_IDLE_SECONDS: 0,
  SESSION_ABSOLUTE_SECONDS: 0,
}));

// `redirect` throws in Next's own runtime; here it records where it sent the
// caller, which is the whole contract of the page guard.
const redirected: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirected.push(path);
    throw new Error("NEXT_REDIRECT");
  },
}));

import { requireUser, CHANGE_PASSWORD_PATH } from "@/lib/auth/current-user";
import { authMock, mockSession } from "@/tests/helpers";

beforeEach(() => {
  redirected.length = 0;
  authMock.mockReset();
});

describe("requireUser", () => {
  it("sends a boot-seeded owner to the password form instead of the app", async () => {
    // The password in the container log must not open the dashboard: every page
    // behind the dashboard layout goes through this guard.
    authMock.mockResolvedValueOnce(
      mockSession("user-1", { mustChangePassword: true }),
    );

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected).toEqual([CHANGE_PASSWORD_PATH]);
  });

  it("lets an ordinary account through, and a signed-out visitor to login", async () => {
    authMock.mockResolvedValueOnce(mockSession("user-2"));
    const user = await requireUser();
    expect(user.id).toBe("user-2");
    expect(user.mustChangePassword).toBe(false);

    authMock.mockResolvedValueOnce(null);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirected).toEqual(["/login"]);
  });
});
