import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  it("exposes the value it draws", () => {
    // Regression: the bar was visual only. `value` was destructured for the
    // fill transform and never handed to Radix, so every progress bar in the
    // app announced an indeterminate bar with no number. axe cannot catch it -
    // the role and the name were both correct.
    render(<Progress value={40} aria-label="Application progress" />);

    const bar = screen.getByRole("progressbar", {
      name: "Application progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("exposes zero rather than nothing", () => {
    render(<Progress value={0} aria-label="Application progress" />);
    expect(
      screen.getByRole("progressbar", { name: "Application progress" }),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("still draws one divider per boundary", () => {
    render(
      <Progress value={20} segments={5} aria-label="Application progress" />,
    );
    expect(screen.getAllByTestId("progress-segment")).toHaveLength(4);
  });
});
