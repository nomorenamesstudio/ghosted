import { test, expect, type Page } from "@playwright/test";
import { createAppViaApi, registerUser, uniqueEmail } from "./helpers";

/**
 * The shell width follows the *view*, not the route: board is the wide one, and
 * a page you reached from it keeps the wide frame so nothing changes width under
 * you — on a reload in particular. Header and footer are the frame and move
 * together; the content column is the board's own, so it only widens on the
 * dashboard and a detail page is a column whatever view you came from.
 */
const COLUMN = 1024; // max-w-5xl

const widths = async (page: Page) => ({
  header: await page
    .locator("header .app-shell")
    .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
  footer: await page
    .locator("footer .app-shell")
    .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
  main: await page
    .locator("main")
    .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
});

const dashboardLoaded = (page: Page, view: "board" | "list") =>
  page.getByTestId(view === "board" ? "kanban-board" : "application-sections").waitFor();

for (const view of ["board", "list"] as const) {
  const wide = view === "board";

  test(`the ${view} dashboard is ${wide ? "the whole window" : "a column"}`, async ({
    page,
  }) => {
    const email = uniqueEmail(`shell-${view}`);
    await registerUser(page, email);
    await createAppViaApi(page, "Acme Corp", "Engineer");

    await page.addInitScript((v) => localStorage.setItem("ghosted-view", v), view);
    await page.goto("/app");
    await dashboardLoaded(page, view);

    const vw = page.viewportSize()!.width;
    const w = await widths(page);
    expect(w.main).toBe(wide ? vw : COLUMN);
    expect(w.header).toBe(w.main);
    // The frame includes the footer: a wide header over a column-width footer
    // reads as two shells on one page.
    expect(w.footer).toBe(w.header);
  });

  test(`a detail page reached from the ${view} keeps that shell, and a reload does not change it`, async ({
    page,
  }) => {
    const email = uniqueEmail(`shell-detail-${view}`);
    await registerUser(page, email);
    await createAppViaApi(page, "Acme Corp", "Engineer");

    await page.addInitScript((v) => localStorage.setItem("ghosted-view", v), view);
    await page.goto("/app");
    await dashboardLoaded(page, view);

    const card =
      view === "board"
        ? page.locator('[data-testid^="kanban-card-"] a').first()
        : page.getByTestId("section-applied").locator("li a").first();
    await card.click();
    await page.getByTestId("status-badge").waitFor();
    const clickedThrough = await widths(page);

    await page.reload();
    await page.getByTestId("status-badge").waitFor();
    const refreshed = await widths(page);

    // The frame — header and footer together — follows the view you came from;
    // the whole complaint was that a reload changed it.
    expect(refreshed).toEqual(clickedThrough);
    expect(refreshed.header).toBe(wide ? page.viewportSize()!.width : COLUMN);
    expect(refreshed.footer).toBe(refreshed.header);
    // The content column belongs to the board's own page.
    expect(refreshed.main).toBe(COLUMN);
  });
}
