/**
 * Playwright test fixtures.
 *
 * Usage:
 *   import { test, expect } from "./fixtures";
 *
 *   test("with mock API", async ({ authenticated, zulipApi }) => {
 *     zulipApi.abortMatching(/\/events/, 1);
 *     // ...
 *   });
 */

import { test as base, expect as baseExpect, type Page } from "@playwright/test";
import { clearAppStorage } from "./helpers/clear-app-storage";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";
import { WorkspaceApiMock } from "./helpers/workspace-api-mock";
import { ZulipApiMock } from "./helpers/zulip-api-mock";
import { seedAuthStorage } from "./helpers/seed-auth";

interface TestFixtures {
  loginAs: (email: string, password: string, realm: string) => Promise<void>;
  zulipApi: ZulipApiMock;
  guestPage: Page;
  authenticatedMocked: Page;
  authenticated: Page;
}

const LOGIN_BUTTON = /login|log in|войти/i;
const LOGIN_NEXT_BUTTON = /next|далее/i;
const LOGIN_SERVER_FIELD = /адрес сервера|server url|zulip/i;
export { LOGIN_BUTTON, LOGIN_NEXT_BUTTON, LOGIN_SERVER_FIELD };

export async function expectLoginOrganizationStep(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  await baseExpect(page.getByLabel(LOGIN_SERVER_FIELD)).toBeVisible(options);
  await baseExpect(page.getByRole("button", { name: LOGIN_NEXT_BUTTON })).toBeVisible(options);
}

async function openAuthenticatedShell(page: Page): Promise<void> {
  await page.reload();
  await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
}

export const test = base.extend<TestFixtures>({
  page: async ({ page }, use) => {
    const workspaceApi = new WorkspaceApiMock(page);
    await workspaceApi.install();
    await use(page);
    await workspaceApi.uninstall();
  },

  loginAs: async ({ page }, use) => {
    const fn = async (email: string, password: string, realm: string) => {
      await page.goto("/");
      await page.locator("#realm").fill(realm);
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
    };
    await use(fn);
  },

  zulipApi: async ({ page }, use) => {
    const mock = new ZulipApiMock(page);
    await mock.install();
    await use(mock);
    await mock.uninstall();
  },

  guestPage: async ({ page }, use) => {
    await clearAppStorage(page);
    await use(page);
  },

  authenticatedMocked: async ({ page, zulipApi: _zulipApi }, use) => {
    await seedAuthStorage(page);
    await openAuthenticatedShell(page);
    await use(page);
  },

  authenticated: async ({ authenticatedMocked }, use) => {
    await use(authenticatedMocked);
  },
});

export { expect } from "@playwright/test";
