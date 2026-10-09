import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderButtons } from "@/components/ProviderButtons";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

/**
 * The shared provider buttons. They lead with the brand mark, and every one of
 * them starts the same flow — the account it lands on (existing or new) is
 * decided server-side, so both auth pages can show the same thing.
 */
describe("ProviderButtons", () => {
  it("renders nothing without credentials", () => {
    const { container } = render(<ProviderButtons providers={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("starts the provider flow with both marks shown", async () => {
    render(<ProviderButtons providers={["google", "linkedin"]} />);

    const google = screen.getByRole("button", { name: /Continue with Google/ });
    const linkedin = screen.getByRole("button", { name: /Continue with LinkedIn/ });
    expect(google.querySelector("svg")).not.toBeNull();
    expect(linkedin.querySelector("svg")).not.toBeNull();

    await userEvent.click(linkedin);
    expect(signIn).toHaveBeenCalledWith("linkedin", { callbackUrl: "/app" });
  });
});
