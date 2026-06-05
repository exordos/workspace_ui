/**
 * Tests for the unified notification service.
 *
 * Verifies notification delivery across three runtimes: browser (Web Notifications
 * API), Electron (native IPC), and PWA (same as browser). Tests cover permission
 * management, notification display, click handling, badge count management, and
 * graceful degradation when APIs are unavailable. This is the single abstraction
 * layer for all notification types in the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as NotificationsModule from "./notifications";

vi.mock("./electron", () => ({
  isElectron: vi.fn(() => false),
  getElectronAPI: vi.fn(() => null),
}));

vi.mock("./pwa", () => ({
  getRuntime: vi.fn(() => "browser"),
}));

// Tests the Web Notifications API implementation (browser/PWA runtime)
describe("notificationService (web runtime)", () => {
  let getNotificationService: typeof NotificationsModule.getNotificationService;

  beforeEach(async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("browser");

    const mod = await import("./notifications");
    getNotificationService = mod.getNotificationService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- getPermission ----

  // Some browsers (e.g. embedded WebViews) lack the Notification API entirely
  it("returns 'unsupported' when Notification API is missing", () => {
    const origNotification = window.Notification;
    // @ts-expect-error — removing Notification for test
    delete window.Notification;

    const svc = getNotificationService();
    expect(svc.getPermission()).toBe("unsupported");

    window.Notification = origNotification;
  });

  // Should proxy the browser's permission state so UI can show appropriate prompts
  it("returns current Notification.permission", () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "denied", requestPermission: vi.fn() },
      writable: true,
      configurable: true,
    });
    const svc = getNotificationService();
    expect(svc.getPermission()).toBe("denied");
  });

  // ---- requestPermission ----

  // Graceful fallback when the API doesn't exist (no crash, just a status string)
  it("requestPermission returns 'unsupported' without Notification API", async () => {
    const origNotification = window.Notification;
    // @ts-expect-error — removing Notification for test
    delete window.Notification;

    const svc = getNotificationService();
    const result = await svc.requestPermission();
    expect(result).toBe("unsupported");

    Object.defineProperty(window, "Notification", {
      value: origNotification,
      writable: true,
      configurable: true,
    });
  });

  // The service must use the standard browser permission flow
  it("requestPermission delegates to Notification.requestPermission", async () => {
    const requestFn = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", {
      value: { permission: "default", requestPermission: requestFn },
      writable: true,
      configurable: true,
    });
    const svc = getNotificationService();
    const result = await svc.requestPermission();
    expect(result).toBe("granted");
    expect(requestFn).toHaveBeenCalledOnce();
  });

  // ---- show ----

  // Core happy path: notification should appear when the user has granted permission
  it("show creates a Notification when permission is granted", async () => {
    const instances: { title: string; opts: NotificationOptions }[] = [];
    const MockNotification = vi.fn().mockImplementation(function (
      this: Notification,
      title: string,
      opts: NotificationOptions,
    ) {
      instances.push({ title, opts });
      this.close = vi.fn();
    }) as unknown as typeof Notification;
    Object.defineProperty(MockNotification, "permission", { value: "granted", configurable: true });
    Object.defineProperty(MockNotification, "requestPermission", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, "Notification", {
      value: MockNotification,
      writable: true,
      configurable: true,
    });

    const svc = getNotificationService();
    await svc.show({ title: "Test", body: "Hello" });

    expect(instances).toHaveLength(1);
    expect(instances[0]!.title).toBe("Test");
    expect(instances[0]!.opts).toMatchObject({ body: "Hello" });
  });

  // Must silently skip (not throw) when permission was denied by the user
  it("show does not create a Notification when permission is not granted", async () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "denied", requestPermission: vi.fn() },
      writable: true,
      configurable: true,
    });

    const svc = getNotificationService();
    await svc.show({ title: "Test", body: "Hello" });
    // no error thrown, just silently skipped
  });

  // Clicking a notification should bring the app to focus and run the onClick callback
  it("show attaches onClick handler that focuses window", async () => {
    const closeFn = vi.fn();
    const focusFn = vi.spyOn(window, "focus").mockImplementation(() => {});
    let onclickSetter: ((e: Event) => void) | undefined;

    const MockNotification = vi.fn().mockImplementation(function (this: Notification) {
      this.close = closeFn;
      Object.defineProperty(this, "onclick", {
        set(fn: (e: Event) => void) {
          onclickSetter = fn;
        },
        configurable: true,
      });
    }) as unknown as typeof Notification;
    Object.defineProperty(MockNotification, "permission", { value: "granted", configurable: true });
    Object.defineProperty(MockNotification, "requestPermission", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, "Notification", {
      value: MockNotification,
      writable: true,
      configurable: true,
    });

    const onClick = vi.fn();
    const svc = getNotificationService();
    await svc.show({ title: "T", body: "B", onClick });

    expect(onclickSetter).toBeDefined();
    onclickSetter!(new Event("click"));

    expect(focusFn).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
    expect(closeFn).toHaveBeenCalled();

    focusFn.mockRestore();
  });

  it("closeByTag closes active notification with matching tag", async () => {
    const closeFn = vi.fn();
    const MockNotification = vi.fn().mockImplementation(function (this: Notification) {
      this.close = closeFn;
    }) as unknown as typeof Notification;
    Object.defineProperty(MockNotification, "permission", { value: "granted", configurable: true });
    Object.defineProperty(MockNotification, "requestPermission", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, "Notification", {
      value: MockNotification,
      writable: true,
      configurable: true,
    });

    const svc = getNotificationService() as unknown as {
      show: (options: { title: string; body: string; tag?: string }) => Promise<void>;
      closeByTag: (tag: string) => Promise<void>;
    };

    await svc.show({ title: "T", body: "B", tag: "msg-101" });
    await svc.closeByTag("msg-101");

    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  // ---- isSupported ----

  // UI uses this to conditionally show the "enable notifications" button
  it("isSupported returns true when Notification API exists", () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "default", requestPermission: vi.fn() },
      writable: true,
      configurable: true,
    });
    const svc = getNotificationService();
    expect(svc.isSupported()).toBe(true);
  });

  // Must correctly detect the absence of the API (e.g. in embedded WebViews)
  it("isSupported returns false when Notification API is missing", () => {
    const origNotification = window.Notification;
    // @ts-expect-error — removing Notification for test
    delete window.Notification;

    const svc = getNotificationService();
    expect(svc.isSupported()).toBe(false);

    window.Notification = origNotification;
  });

  // ---- setBadgeCount / clearBadge ----

  // App badge shows unread count on the PWA icon (Badging API)
  it("setBadgeCount calls navigator.setAppBadge when available", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "setAppBadge", {
      value: setAppBadge,
      writable: true,
      configurable: true,
    });

    const svc = getNotificationService();
    await svc.setBadgeCount(5);
    expect(setAppBadge).toHaveBeenCalledWith(5);

    // cleanup
    // @ts-expect-error — cleanup test property
    delete (navigator as Record<string, unknown>).setAppBadge;
  });

  // Clearing the badge when all messages are read
  it("clearBadge calls navigator.clearAppBadge when available", async () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clearAppBadge", {
      value: clearAppBadge,
      writable: true,
      configurable: true,
    });

    const svc = getNotificationService();
    await svc.clearBadge();
    expect(clearAppBadge).toHaveBeenCalled();

    // @ts-expect-error — cleanup test property
    delete (navigator as Record<string, unknown>).clearAppBadge;
  });

  // Graceful degradation: Badging API is not available in all browsers
  it("setBadgeCount is no-op when navigator.setAppBadge is missing", async () => {
    const svc = getNotificationService();
    await expect(svc.setBadgeCount(3)).resolves.toBeUndefined();
  });

  // Must not crash even when the Badging API doesn't exist
  it("clearBadge is no-op when navigator.clearAppBadge is missing", async () => {
    const svc = getNotificationService();
    await expect(svc.clearBadge()).resolves.toBeUndefined();
  });
});

// Tests the Electron IPC notification implementation (native desktop notifications)
describe("notificationService (electron runtime)", () => {
  it("returns 'default' until the user enables Electron notifications locally", async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();

    expect(svc.getPermission()).toBe("default");
    expect(svc.isSupported()).toBe(true);
  });

  it("requestPermission shows a native test notification and stores local Electron consent", async () => {
    vi.resetModules();

    const showFn = vi.fn().mockResolvedValue(true);
    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: { show: showFn },
    });

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();

    expect(svc.getPermission()).toBe("default");
    const result = await svc.requestPermission();

    expect(result).toBe("granted");
    expect(svc.getPermission()).toBe("granted");
    expect(showFn).toHaveBeenCalledWith(
      "Notifications enabled",
      "Workspace can now show desktop notifications.",
      {
        tag: "notification-permission-check",
        silent: false,
      },
    );
  });

  it("keeps Electron permission as 'default' when native test notification fails", async () => {
    vi.resetModules();

    const showFn = vi.fn().mockResolvedValue(false);
    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: { show: showFn },
    });

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();

    await expect(svc.requestPermission()).resolves.toBe("default");
    expect(svc.getPermission()).toBe("default");
  });

  // Notifications are sent through IPC to the main process for native display
  it("show delegates to electronAPI.notifications.show", async () => {
    vi.resetModules();

    const showFn = vi.fn().mockResolvedValue(undefined);
    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: { show: showFn },
    });

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();
    await svc.show({ title: "Title", body: "Body" });

    expect(showFn).toHaveBeenCalledWith("Title", "Body", {
      tag: undefined,
      silent: undefined,
      clickRoute: undefined,
    });
  });

  it("forwards clickRoute through electron notification IPC", async () => {
    vi.resetModules();

    const showFn = vi.fn().mockResolvedValue(undefined);
    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: { show: showFn },
    });

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();
    await svc.show({
      title: "Title",
      body: "Body",
      tag: "msg-42",
      silent: true,
      clickRoute: "/dm/42-alice?msg=42",
    });

    expect(showFn).toHaveBeenCalledWith("Title", "Body", {
      tag: "msg-42",
      silent: true,
      clickRoute: "/dm/42-alice?msg=42",
    });
  });

  // Electron uses os-integration for badges, not the notification service
  it("setBadgeCount and clearBadge are no-ops in electron service", async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("electron");

    const mod = await import("./notifications");
    const svc = mod.getNotificationService();
    await expect(svc.setBadgeCount(3)).resolves.toBeUndefined();
    await expect(svc.clearBadge()).resolves.toBeUndefined();
  });
});

// Verifies the singleton proxy that auto-detects the correct runtime implementation
describe("notificationService proxy", () => {
  // The proxy must expose the full NotificationService interface
  it("proxy delegates to the underlying service", async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const pwaMod = await import("./pwa");
    (pwaMod.getRuntime as ReturnType<typeof vi.fn>).mockReturnValue("browser");

    const mod = await import("./notifications");
    expect(typeof mod.notificationService.getPermission).toBe("function");
    expect(typeof mod.notificationService.requestPermission).toBe("function");
    expect(typeof mod.notificationService.show).toBe("function");
    expect(typeof (mod.notificationService as unknown as { closeByTag?: unknown }).closeByTag).toBe(
      "function",
    );
    expect(typeof mod.notificationService.isSupported).toBe("function");
    expect(typeof mod.notificationService.setBadgeCount).toBe("function");
    expect(typeof mod.notificationService.clearBadge).toBe("function");
  });
});
