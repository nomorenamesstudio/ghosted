import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Appearance is three choices, not a toggle, and `system` is the default.
 *
 * What this pins — the part that breaks silently: an explicit choice must win and
 * stay put when the device changes its mind, and `system` must follow the device,
 * including a change while the page is open. Getting this wrong looks like "the
 * theme keeps resetting", which no type check catches.
 */
function setSystemDark(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    /** The operating system flips while the page is open. */
    flip: (next: boolean) => {
      media.matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

let platform: ReturnType<typeof setSystemDark>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { ThemeProvider, useTheme } from "@/components/theme-provider";

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <output data-testid="setting">{theme}</output>
      <output data-testid="resolved">{resolvedTheme}</output>
      <button type="button" onClick={() => setTheme("light")}>
        light
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        system
      </button>
    </div>
  );
}

function setup() {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  it("follows the device by default, and keeps following it", async () => {
    platform = setSystemDark(true);
    setup();

    await waitFor(() =>
      expect(screen.getByTestId("setting")).toHaveTextContent("system"),
    );
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    platform.flip(false);
    await waitFor(() =>
      expect(screen.getByTestId("resolved")).toHaveTextContent("light"),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    // Nothing was written just by looking at the page.
    expect(localStorage.getItem("ghosted-theme")).toBeNull();
  });

  it("lets an explicit choice win, and stops following the device", async () => {
    platform = setSystemDark(true);
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark"),
    );

    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByTestId("setting")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("ghosted-theme")).toBe("light");

    // The device going dark must not override the choice.
    platform.flip(false);
    platform.flip(true);
    await waitFor(() =>
      expect(screen.getByTestId("resolved")).toHaveTextContent("light"),
    );
  });

  it("returns to the device when system is chosen again", async () => {
    platform = setSystemDark(false);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByTestId("setting")).toHaveTextContent("light");

    platform.flip(true);
    await userEvent.click(screen.getByRole("button", { name: "system" }));
    await waitFor(() =>
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark"),
    );
    expect(localStorage.getItem("ghosted-theme")).toBe("system");
  });
});
