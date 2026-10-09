import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OAuthProvider } from "@/lib/config/oauth-providers";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: vi.fn(), invalidateQueries: vi.fn() }),
}));

import { LoginForm } from "@/app/(auth)/login/login-form";
import { RegisterForm } from "@/app/(auth)/register/register-form";

/** Does `first` come before `second` in the document? */
function precedes(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

/**
 * The front door, on both pages. Provider sign-in leads, the email form follows
 * under the "or", and closing sign-ups hides the register link — never the
 * buttons, because the accounts that exist may have no password.
 */
describe("LoginForm", () => {
  function setup({
    providers = [],
    allowRegistration = true,
  }: { providers?: OAuthProvider[]; allowRegistration?: boolean } = {}) {
    render(
      <LoginForm providers={providers} allowRegistration={allowRegistration} />,
    );
  }

  it("puts the provider buttons above the email form", () => {
    setup({ providers: ["google", "linkedin"], allowRegistration: false });

    expect(
      precedes(
        screen.getByRole("button", { name: /Continue with Google/ }),
        screen.getByLabelText("Email"),
      ),
    ).toBe(true);
    expect(screen.getByText("or")).toBeInTheDocument();
    // Closed sign-ups hide the register link; the buttons stay.
    expect(screen.queryByText("Register")).toBeNull();
  });

  it("leaves the email form alone when there are no credentials", () => {
    setup({ providers: [] });

    expect(screen.queryByText(/Continue with/)).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

describe("RegisterForm", () => {
  it("offers the same buttons in the same place as signing in", () => {
    render(<RegisterForm providers={["google", "linkedin"]} />);

    expect(
      precedes(
        screen.getByRole("button", { name: /Continue with LinkedIn/ }),
        screen.getByLabelText("Name"),
      ),
    ).toBe(true);
    // The email form is still there, under the "or".
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });
});
