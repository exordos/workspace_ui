/**
 * Playwright test fixtures.
 *
 * Extends base test with helpers for auth, navigation, and page objects.
 *
 * Usage:
 *   import { test, expect } from "./fixtures";
 *
 *   test("my test", async ({ page, loginAs }) => {
 *     await loginAs("user@example.com", "<password-from-env>", "https://zulip.example.com");
 *     // ...
 *   });
 */

import { test as base, type Page } from "@playwright/test";

interface TestFixtures {
  loginAs: (email: string, password: string, realm: string) => Promise<void>;
  authenticated: Page;
}

export const test = base.extend<TestFixtures>({
  loginAs: async ({ page }, use) => {
    const fn = async (email: string, password: string, realm: string) => {
      await page.goto("/");
      await page.locator("#realm").fill(realm);
      await page.locator("#username").fill(email);
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
    };
    await use(fn);
  },

  authenticated: async ({ page }, use) => {
    const fixtureApiKey = `fixture-key-${Date.now()}`;
    await page.goto("/");
    await page.evaluate((apiKey) => {
      const instance = {
        id: "test-1",
        realm: "https://zulip.test.local",
        email: "test@example.com",
        apiKey,
      };
      localStorage.setItem("zulip-web-instances", JSON.stringify([instance]));
      localStorage.setItem("zulip-web-current-instance", "test-1");
    }, fixtureApiKey);
    await page.reload();
    await use(page);
  },
});

export { expect } from "@playwright/test";
