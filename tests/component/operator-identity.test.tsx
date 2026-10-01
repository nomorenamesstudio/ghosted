import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorContact } from "@/components/OperatorContact";

/**
 * The imprint and the privacy policy both render this, and the wording is the
 * point: a trading name on its own does not identify who is responsible, so the
 * person behind it has to be in the output. The suite runs with no
 * OPERATOR_* variables set, i.e. the hosted instance's defaults.
 */
describe("OperatorContact", () => {
  it("names the person behind the trading name, and says it is not a company", () => {
    render(<OperatorContact label="Contact" />);

    expect(screen.getAllByText(/No More Names Studio/)).toHaveLength(2);
    expect(
      screen.getByText(/independent development alias of\s*Krisztian Hadi/),
    ).toBeInTheDocument();
    expect(screen.getByText(/sole proprietorship/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hey@lostsignals.studio" })).toHaveAttribute(
      "href",
      "mailto:hey@lostsignals.studio",
    );
  });
});
