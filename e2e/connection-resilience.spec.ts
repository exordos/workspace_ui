/**
 * E2E: connection banner, offline mode, API failures, and Workspace event catch-up.
 */
import { test, expect } from "./fixtures";
import { reconnectSidebarDeltaEvents } from "./mocks/messenger-default-responses";
import { setBrowserOffline, setBrowserOnline } from "./helpers/network";
import { seedAuthStorage } from "./helpers/seed-auth";
import { seedChatListIndexedDb } from "./helpers/seed-chat-list-cache";
import { ConnectionBannerPage, ConnectionBlockedPage } from "./pages/connection-banner.page";

test.describe("Connection resilience @mock", () => {
  test.describe.configure({ mode: "serial" });

  test("shows blocked screen when bootstrap API fails without cache", async ({
    page,
    messengerApi,
  }) => {
    // 400 avoids client retry backoff on 503 (bootstrap would stay on fullscreen loader too long).
    messengerApi.statusMatching(/\/api\/workspace\/v1\//, 400, 100);
    // Keep the IAM instance valid while omitting identity claims so bootstrap must resolve the
    // current user from the unavailable API rather than treating the JWT subject as cached data.
    await seedAuthStorage(page, "e2e.invalid.signature");
    await page.reload();

    const blocked = new ConnectionBlockedPage(page);
    await expect
      .poll(() => blocked.alert.isVisible().catch(() => false), { timeout: 30_000 })
      .toBe(true);
  });

  test("shows degraded banner with cached sidebar when bootstrap fails", async ({
    page,
    messengerApi,
  }) => {
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await seedChatListIndexedDb(page);

    messengerApi.abortMatching(/\/api\/workspace\/v1\//, 100);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    await expect(page.locator("[data-focus-zone='topbar']")).toBeVisible({ timeout: 30_000 });
    const banner = new ConnectionBannerPage(page);
    await expect
      .poll(() => banner.banner.isVisible().catch(() => false), { timeout: 30_000 })
      .toBe(true);
    await banner.expectDegradedMessage();
  });

  test("shows degraded banner when events request aborts", async ({
    authenticated,
    messengerApi,
  }) => {
    messengerApi.abortMatching(/\/events/, 3);

    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });
    await banner.expectDegradedMessage();
    await expect(banner.reloadButton).toBeVisible();
  });

  test("hides banner after API recovers", async ({ authenticated, messengerApi }) => {
    messengerApi.abortMatching(/\/events/, 2);
    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });

    messengerApi.restoreDefaults();
    await banner.expectHidden({ timeout: 20_000 });
  });

  test("shows offline banner during initial bootstrap when offline on load", async ({
    page,
    messengerApi: _messengerApi,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", {
        get: () => false,
        configurable: true,
      });
    });
    await seedAuthStorage(page);
    await page.reload();

    const banner = new ConnectionBannerPage(page);
    await banner.expectVisible({ timeout: 30_000 });
    await banner.expectOfflineMessage();
  });

  test("shows offline message when browser goes offline", async ({ authenticated, context }) => {
    await setBrowserOffline(context);
    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });
    await banner.expectOfflineMessage();
  });

  test("refreshes sidebar preview after network reconnect", async ({
    authenticated,
    context,
    messengerApi,
  }) => {
    await seedChatListIndexedDb(authenticated);
    await authenticated.reload();
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await expect(authenticated.getByText("Cached hello")).toBeVisible({ timeout: 15_000 });

    await setBrowserOffline(context);
    messengerApi.setNextEventsResponse(reconnectSidebarDeltaEvents());
    await setBrowserOnline(context);
    await authenticated.evaluate(() => window.dispatchEvent(new Event("focus")));
    await authenticated.waitForTimeout(800);

    await expect(authenticated.getByText("After reconnect sidebar")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("clears offline banner when browser goes back online", async ({
    authenticated,
    context,
  }) => {
    await setBrowserOffline(context);
    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });

    await setBrowserOnline(context);
    await banner.expectHidden({ timeout: 20_000 });
  });

  test("fetches the current event feed after bootstrap", async ({ page, messengerApi }) => {
    const eventsBefore = messengerApi.getEventsCallCount();
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 30_000 });

    await expect
      .poll(() => messengerApi.getEventsCallCount(), { timeout: 20_000 })
      .toBeGreaterThan(eventsBefore);
  });

  test("accepts the current event envelope response", async ({ page, messengerApi }) => {
    messengerApi.setNextEventsResponse({ events: reconnectSidebarDeltaEvents() });
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 30_000 });

    await expect(page.getByText("After reconnect sidebar")).toBeVisible({ timeout: 20_000 });
  });
});
