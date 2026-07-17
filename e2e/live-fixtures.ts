/**
 * Fixtures for tests that use a real Workspace organization.
 *
 * Keep this separate from ./fixtures: live scenarios must not install REST route mocks.
 */

import { test as base, expect as baseExpect, type Page } from "@playwright/test";

interface LiveTestFixtures {
  loginAs: (email: string, password: string, organizationUrl: string) => Promise<void>;
}

const LOGIN_NEXT_BUTTON = /next|далее/i;

async function loginWithWorkspaceCredentials(
  page: Page,
  email: string,
  password: string,
  organizationUrl: string,
): Promise<void> {
  await page.goto("/");
  await page.locator("#realm").fill(organizationUrl);
  await page.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();
  await baseExpect(page.locator("#username")).toBeVisible({ timeout: 30_000 });
  await page.locator("#username").fill(email);
  await baseExpect(page.locator("#password")).toBeVisible({ timeout: 30_000 });
  await page.locator("#password").fill(password);
  await page.locator("form button[type='submit']").click();
  await page.waitForFunction(
    () => {
      const pathname = window.location.pathname;
      if (pathname.includes("/stream/")) return true;
      const text = document.body?.textContent ?? "";
      return /Неправильное имя пользователя или пароль|Your username or password is incorrect/i.test(
        text,
      );
    },
    { timeout: 30_000 },
  );
  if (!new URL(page.url()).pathname.includes("/stream/")) {
    throw new Error("Live auth failed before shell navigation: invalid credentials.");
  }
}

export const test = base.extend<LiveTestFixtures>({
  loginAs: async ({ page }, use) => {
    await use((email, password, organizationUrl) =>
      loginWithWorkspaceCredentials(page, email, password, organizationUrl),
    );
  },
});

export { expect } from "@playwright/test";
