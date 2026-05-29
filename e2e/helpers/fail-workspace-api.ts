import type { Page } from "@playwright/test";

/** Simulates Workspace REST outage (registered after the default E2E mock). */
export async function failWorkspaceApi(page: Page, status = 503): Promise<void> {
  await page.route(/\/workspace\/v1\//, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ detail: "E2E simulated workspace error" }),
    }),
  );
}
