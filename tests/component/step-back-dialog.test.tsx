import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepBackDialog } from "@/components/StepBackDialog";

type Props = Parameters<typeof StepBackDialog>[0];

function setup(overrides: Partial<Props> = {}) {
  const onConfirm = vi.fn();
  const onMoveAnyway = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <StepBackDialog
      kind="add-step"
      company="Stripe"
      from="offer"
      to="interviewing"
      defaultTitle="Additional interview round"
      open
      isPending={false}
      error={null}
      onConfirm={onConfirm}
      onMoveAnyway={onMoveAnyway}
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );
  return { onConfirm, onMoveAnyway, onOpenChange };
}

describe("StepBackDialog — back from Offers", () => {
  it("asks to record the round, naming the card and the direction", () => {
    setup();
    expect(screen.getByText("Add a step?")).toBeInTheDocument();
    expect(
      screen.getByText(/Moving Stripe back from Offers to Interviewing/),
    ).toBeInTheDocument();
  });

  it("confirms with the suggested step title", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add step and move/ }));
    expect(onConfirm).toHaveBeenCalledWith("Additional interview round");
  });

  it("confirms with an edited title", () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText("New step"), {
      target: { value: "Second round with the CTO" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add step and move/ }));
    expect(onConfirm).toHaveBeenCalledWith("Second round with the CTO");
  });

  it("falls back to the suggestion when the title is cleared", () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText("New step"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add step and move/ }));
    expect(onConfirm).toHaveBeenCalledWith("Additional interview round");
  });

  it("offers moving without touching the timeline", () => {
    const { onMoveAnyway, onConfirm } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Leave it as is, but move" }),
    );
    expect(onMoveAnyway).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancelling writes nothing", () => {
    const { onConfirm, onMoveAnyway, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onMoveAnyway).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the failure when the step could not be recorded", () => {
    setup({ error: "Failed to add milestone" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to add milestone",
    );
  });
});

describe("StepBackDialog — all the way back to Applied", () => {
  it("asks about resetting the timeline instead of adding a step", () => {
    setup({ kind: "reset", from: "interviewing", to: "applied" });
    expect(screen.getByText("Reset the timeline?")).toBeInTheDocument();
    expect(
      screen.getByText(/Moving Stripe back from Interviewing to Applied/),
    ).toBeInTheDocument();
    // Nothing to name: resetting does not create a step.
    expect(screen.queryByLabelText("New step")).not.toBeInTheDocument();
  });

  it("confirms the reset", () => {
    const { onConfirm } = setup({
      kind: "reset",
      from: "interviewing",
      to: "applied",
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Reset timeline and move/ }),
    );
    expect(onConfirm).toHaveBeenCalled();
  });

  it("still allows moving without a reset", () => {
    const { onMoveAnyway } = setup({
      kind: "reset",
      from: "interviewing",
      to: "applied",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Leave it as is, but move" }),
    );
    expect(onMoveAnyway).toHaveBeenCalled();
  });
});
