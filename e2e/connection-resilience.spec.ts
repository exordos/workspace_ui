/**
 * E2E: connection banner, offline mode, API failures, event-queue re-register.
 */
import { test, expect } from "./fixtures";
import { badEventQueueIdError } from "./helpers/zulip-api-mock";
import { reconnectSidebarDeltaMessages } from "./mocks/zulip-default-responses";
import { failWorkspaceApi } from "./helpers/fail-workspace-api";
import { setBrowserOffline, setBrowserOnline } from "./helpers/network";
import { seedAuthStorage } from "./helpers/seed-auth";
import { seedChatListIndexedDb } from "./helpers/seed-chat-list-cache";
import { ConnectionBannerPage, ConnectionBlockedPage } from "./pages/connection-banner.page";

test.describe("Connection resilience @mock", () => {
  test.describe.configure({ mode: "serial" });

  test("shows blocked screen when bootstrap API fails without cache", async ({
    page,
    zulipApi,
  }) => {
    // 400 avoids client retry backoff on 503 (bootstrap would stay on fullscreen loader too long).
    zulipApi.statusMatching(/\/api\/v1\//, 400, 100);
    await failWorkspaceApi(page);
    await seedAuthStorage(page);
    await page.reload();

    const blocked = new ConnectionBlockedPage(page);
    await expect
      .poll(() => blocked.alert.isVisible().catch(() => false), { timeout: 30_000 })
      .toBe(true);
  });

  test("shows degraded banner with cached sidebar when bootstrap fails", async ({
    page,
    zulipApi,
  }) => {
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await seedChatListIndexedDb(page);

    zulipApi.statusMatching(/\/api\/v1\//, 400, 100);
    await failWorkspaceApi(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    await expect(page.locator("[data-focus-zone='topbar']")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Cached hello")).toBeVisible({ timeout: 30_000 });
    const banner = new ConnectionBannerPage(page);
    await expect
      .poll(() => banner.banner.isVisible().catch(() => false), { timeout: 30_000 })
      .toBe(true);
    await banner.expectDegradedMessage();
    await expect(banner.reloadButton).toBeVisible();
  });

  test("shows degraded banner when events request aborts", async ({ authenticated, zulipApi }) => {
    const initialRegisters = zulipApi.getRegisterCallCount();
    zulipApi.abortMatching(/\/events/, 3);

    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });
    await banner.expectDegradedMessage();
    await expect(banner.reloadButton).toBeVisible();
    expect(zulipApi.getRegisterCallCount()).toBeGreaterThanOrEqual(initialRegisters);
  });

  test("hides banner after API recovers", async ({ authenticated, zulipApi }) => {
    zulipApi.abortMatching(/\/events/, 2);
    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });

    zulipApi.restoreDefaults();
    await banner.expectHidden({ timeout: 20_000 });
  });

  test("shows offline banner during initial bootstrap when offline on load", async ({
    page,
    zulipApi: _zulipApi,
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
    zulipApi,
  }) => {
    await seedChatListIndexedDb(authenticated);
    await authenticated.reload();
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await expect(authenticated.getByText("Cached hello")).toBeVisible({ timeout: 15_000 });

    zulipApi.setPersistentMessagesResponse(reconnectSidebarDeltaMessages());
    await setBrowserOffline(context);
    await setBrowserOnline(context);
    // Full reconnect stages stream previews until the next queue register (rare in mock E2E).
    // Window focus triggers the light reconnect path, which applies the /messages delta directly.
    await authenticated.evaluate(() => window.dispatchEvent(new Event("focus")));
    await authenticated.waitForTimeout(800);

    await expect(authenticated.getByText("After reconnect sidebar")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("clears offline banner when browser goes back online", async ({ authenticated, context }) => {
    await setBrowserOffline(context);
    const banner = new ConnectionBannerPage(authenticated);
    await banner.expectVisible({ timeout: 15_000 });

    await setBrowserOnline(context);
    await banner.expectHidden({ timeout: 20_000 });
  });

  test("re-registers queue after BAD_EVENT_QUEUE_ID on events", async ({ page, zulipApi }) => {
    zulipApi.setFixedQueueId("e2e-queue-initial");
    zulipApi.setNextEventsResponse(badEventQueueIdError("e2e-queue-initial"));
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 30_000 });

    await expect.poll(() => zulipApi.getRegisterCallCount(), { timeout: 20_000 }).toBeGreaterThanOrEqual(
      2,
    );
  });

  test("re-registers queue when events response omits result", async ({ page, zulipApi }) => {
    const registersBefore = zulipApi.getRegisterCallCount();
    zulipApi.setNextEventsResponse({ events: [] });
    await seedAuthStorage(page);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 30_000 });

    await expect.poll(() => zulipApi.getRegisterCallCount(), { timeout: 20_000 }).toBeGreaterThan(
      registersBefore + 1,
    );
  });
});
