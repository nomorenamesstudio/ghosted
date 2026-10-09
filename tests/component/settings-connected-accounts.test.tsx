import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectedAccountsCard } from "@/components/ConnectedAccountsCard";
import type { OAuthProvider } from "@/lib/config/oauth-providers";

/**
 * The connected-accounts panel: it must show every link that exists — including
 * one the operator has since stopped offering — and must only offer Connect for
 * a provider that can actually start a flow.
 */
function setup({
  providers = ["google", "linkedin"],
  linkedProviders = [],
}: {
  providers?: OAuthProvider[];
  linkedProviders?: OAuthProvider[];
} = {}) {
  const onConnect = vi.fn();
  render(
    <ConnectedAccountsCard
      providers={providers}
      linkedProviders={linkedProviders}
      onConnect={onConnect}
    />,
  );
  return { onConnect };
}

describe("ConnectedAccountsCard", () => {
  it("marks a linked provider as connected and offers the other one", async () => {
    const { onConnect } = setup({ linkedProviders: ["linkedin"] });

    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    const connect = screen.getByRole("button", { name: "Connect" });

    await userEvent.click(connect);
    expect(onConnect).toHaveBeenCalledWith("google");
  });

  it("keeps showing a linked provider the deployment no longer offers", () => {
    setup({ providers: ["google"], linkedProviders: ["linkedin"] });

    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    // Only the offered provider gets a button: the removed one still has its
    // row, but there is no flow left to start.
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(1);
  });

  it("says so when the instance has no provider at all", () => {
    setup({ providers: [], linkedProviders: [] });

    expect(
      screen.getByText("This instance has no single sign-on provider configured."),
    ).toBeInTheDocument();
  });
});
