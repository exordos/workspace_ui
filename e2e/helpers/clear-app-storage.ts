import type { Page } from "@playwright/test";

/** Clears persisted auth/theme so guest flows start on the login page. */
export async function clearAppStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
