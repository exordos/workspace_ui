/**
 * Tests for WebView bridge — communication layer between the React SPA and
 * native mobile apps (iOS/Android) that embed it in a WebView.
 *
 * Covers WebView detection (NativeApp object / URL param), platform identification,
 * the native bridge facade (postMessage to native), the page registry for
 * WebView-specific routes, and event subscription for native→web messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebView,
  getWebViewPlatform,
  getNativeBridge,
  getWebViewPages,
  registerWebViewPage,
  onNativeMessage,
  onAuthFromNative,
  initWebViewBridge,
} from "./webview";

// isWebView detects if the app is running inside a native mobile container.
describe("isWebView", () => {
  afterEach(() => {
    (window as unknown as Record<string, unknown>).NativeApp = undefined;
  });

  // Normal browser (no NativeApp, no ?webview param) must return false.
  it("returns false in normal browser", () => {
    expect(isWebView()).toBe(false);
  });

  // NativeApp global is injected by the mobile app's WebView setup.
  it("returns true when NativeApp is present", () => {
    (window as unknown as Record<string, unknown>).NativeApp = {
      postMessage: vi.fn(),
    };
    expect(isWebView()).toBe(true);
  });

  // URL param fallback for cases where NativeApp injection fails.
  it("returns true when ?webview=1 in URL", () => {
    const orig = window.location.search;
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "?webview=1" },
      writable: true,
    });
    expect(isWebView()).toBe(true);
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: orig },
      writable: true,
    });
  });
});

// getWebViewPlatform identifies the host OS — used for platform-specific behavior.
describe("getWebViewPlatform", () => {
  afterEach(() => {
    (window as unknown as Record<string, unknown>).NativeApp = undefined;
  });

  // No NativeApp = no platform — must return null.
  it("returns null in normal browser", () => {
    expect(getWebViewPlatform()).toBeNull();
  });

  it("returns ios when NativeApp.platform is ios", () => {
    (window as unknown as Record<string, unknown>).NativeApp = {
      platform: "ios",
      postMessage: vi.fn(),
    };
    expect(getWebViewPlatform()).toBe("ios");
  });

  it("returns android when NativeApp.platform is android", () => {
    (window as unknown as Record<string, unknown>).NativeApp = {
      platform: "android",
      postMessage: vi.fn(),
    };
    expect(getWebViewPlatform()).toBe("android");
  });
});

// getNativeBridge provides a safe facade for calling native app methods.
describe("getNativeBridge", () => {
  // Bridge must expose all methods even when no native app is present (no-op fallback).
  it("returns bridge with all methods", () => {
    const bridge = getNativeBridge();
    expect(typeof bridge.close).toBe("function");
    expect(typeof bridge.navigateNative).toBe("function");
    expect(typeof bridge.setTitle).toBe("function");
    expect(typeof bridge.setLoading).toBe("function");
    expect(typeof bridge.share).toBe("function");
    expect(typeof bridge.postEvent).toBe("function");
    expect(typeof bridge.requestAuth).toBe("function");
  });

  // Methods must be safe no-ops in browser — calling them must not throw.
  it("does not throw when no native bridge", () => {
    const bridge = getNativeBridge();
    expect(() => bridge.close()).not.toThrow();
    expect(() => bridge.setTitle("Test")).not.toThrow();
    expect(() => bridge.setLoading(true)).not.toThrow();
  });

  // When NativeApp is present, bridge methods must delegate via postMessage.
  it("calls NativeApp.postMessage when available", () => {
    const postMessage = vi.fn();
    (window as unknown as Record<string, unknown>).NativeApp = { postMessage };

    const bridge = getNativeBridge();
    bridge.close();

    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"type":"close"'));

    (window as unknown as Record<string, unknown>).NativeApp = undefined;
  });
});

// Page registry controls which routes are available when embedded in a WebView.
describe("WebView page registry", () => {
  // Default pages (licenses, profile) must be registered out of the box.
  it("returns default pages", () => {
    const pages = getWebViewPages();
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.some((p) => p.path === "/licenses")).toBe(true);
    expect(pages.some((p) => p.path === "/updates")).toBe(true);
    expect(pages.some((p) => p.path === "/settings/personal-info")).toBe(true);
    expect(pages.some((p) => p.path === "/settings/logs")).toBe(true);
    expect(pages.some((p) => p.path === "/logs")).toBe(true);
    expect(pages.some((p) => p.path === "/settings/build")).toBe(true);
    expect(pages.some((p) => p.path === "/inbox")).toBe(true);
    expect(pages.some((p) => p.path === "/feed")).toBe(true);
  });

  // Custom pages can be registered at runtime by plugins or feature flags.
  it("allows registering custom pages", () => {
    const before = getWebViewPages().length;
    registerWebViewPage({ path: "/test-custom", label: "Custom" });
    expect(getWebViewPages().length).toBe(before + 1);
  });

  // Duplicate paths must be silently ignored to prevent double entries in nav.
  it("does not register duplicates", () => {
    const before = getWebViewPages().length;
    registerWebViewPage({ path: "/licenses", label: "Dup" });
    expect(getWebViewPages().length).toBe(before);
  });

  it("omits diagnostics pages when diagnostics are disabled", async () => {
    vi.resetModules();
    vi.doMock("~/shared/config/constants", async (importOriginal) => {
      const actual = await importOriginal<typeof import("~/shared/config/constants")>();
      return {
        ...actual,
        IS_CONNECTION_DIAGNOSTICS_ENABLED: false,
      };
    });

    const { getWebViewPages: getWebViewPagesWithDiagnosticsDisabled } = await import("./webview");
    const pages = getWebViewPagesWithDiagnosticsDisabled();
    expect(pages.some((p) => p.path === "/settings/logs")).toBe(false);
    expect(pages.some((p) => p.path === "/logs")).toBe(false);

    vi.doUnmock("~/shared/config/constants");
    vi.resetModules();
  });
});

// onNativeMessage subscribes to messages from the native app (e.g. back button).
describe("onNativeMessage", () => {
  // Must return an unsubscribe function to prevent memory leaks.
  it("returns unsubscribe function", () => {
    const unsub = onNativeMessage(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

// onAuthFromNative handles SSO/token handoff from the native login flow.
describe("onAuthFromNative", () => {
  // Must return an unsubscribe function.
  it("returns unsubscribe function", () => {
    const unsub = onAuthFromNative(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

// isTrustedOrigin rejects untrusted postMessage sources to prevent XSS injection.
describe("origin validation via postMessage", () => {
  let handler: ReturnType<typeof onNativeMessage>;
  let cleanupBridge: (() => void) | undefined;

  beforeEach(() => {
    cleanupBridge = initWebViewBridge();
  });

  afterEach(() => {
    handler?.();
    cleanupBridge?.();
    cleanupBridge = undefined;
  });

  it("accepts messages from own window.location.origin", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "theme", theme: "dark" },
      }),
    );

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ type: "theme" }));
  });

  it("rejects navigate messages with unsafe path", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "navigate", path: "//evil.example.com" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("rejects theme messages with invalid mode", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "theme", mode: "neon" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("rejects locale messages with non-string locale", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "locale", locale: 42 },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("accepts logout messages from trusted origin", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "logout" },
      }),
    );

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ type: "logout" }));
  });

  it("rejects messages from empty origin", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "",
        data: { type: "theme", theme: "dark" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("rejects messages from untrusted external origin", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example.com",
        data: { type: "auth", email: "x", apiKey: "k", realm: "https://r.com" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("accepts messages with 'null' origin when NativeApp bridge is present", () => {
    (window as unknown as Record<string, unknown>).NativeApp = { postMessage: vi.fn() };
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "null",
        data: { type: "back" },
      }),
    );

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ type: "back" }));
    (window as unknown as Record<string, unknown>).NativeApp = undefined;
  });

  it("rejects messages with 'null' origin when NativeApp bridge is absent", () => {
    (window as unknown as Record<string, unknown>).NativeApp = undefined;
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "null",
        data: { type: "back" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("ignores messages without data", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: null,
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("ignores messages without type field", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { foo: "bar" },
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("ignores non-object message data", () => {
    const received = vi.fn();
    handler = onNativeMessage(received);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: "string-data",
      }),
    );

    expect(received).not.toHaveBeenCalled();
  });

  it("does not crash when handler throws", () => {
    handler = onNativeMessage(() => {
      throw new Error("handler error");
    });

    expect(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "navigate", path: "/test" },
        }),
      );
    }).not.toThrow();
  });
});

// Auth injection from native validates realm URL before accepting credentials.
describe("auth from native — realm validation", () => {
  let cleanupBridge: (() => void) | undefined;

  beforeEach(() => {
    cleanupBridge = initWebViewBridge();
  });

  afterEach(() => {
    cleanupBridge?.();
    cleanupBridge = undefined;
  });

  it("accepts valid https realm URL", () => {
    const callback = vi.fn();
    const unsub = onAuthFromNative(callback);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "auth",
          email: "user@example.com",
          apiKey: "abc123",
          realm: "https://zulip.example.com",
        },
      }),
    );

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        realm: "https://zulip.example.com",
      }),
    );
    unsub();
  });

  it("rejects auth with missing fields", () => {
    const callback = vi.fn();
    const unsub = onAuthFromNative(callback);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "auth", email: "user@example.com" },
      }),
    );

    expect(callback).not.toHaveBeenCalled();
    unsub();
  });

  it("rejects auth with invalid realm URL", () => {
    const callback = vi.fn();
    const unsub = onAuthFromNative(callback);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "auth",
          email: "user@example.com",
          apiKey: "abc123",
          // eslint-disable-next-line no-script-url -- testing that javascript: URLs are rejected
          realm: "javascript:alert(1)",
        },
      }),
    );

    expect(callback).not.toHaveBeenCalled();
    unsub();
  });
});

describe("native message logging noise", () => {
  afterEach(() => {
    (window as unknown as Record<string, unknown>).NativeApp = undefined;
  });

  it("does not warn on malformed native-like messages in regular web mode", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanupBridge = initWebViewBridge();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { foo: "bar" },
      }),
    );

    expect(warnSpy).not.toHaveBeenCalled();
    cleanupBridge();
    warnSpy.mockRestore();
  });

  it("keeps malformed-message warnings when bridge runs in WebView mode", () => {
    (window as unknown as Record<string, unknown>).NativeApp = { postMessage: vi.fn() };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanupBridge = initWebViewBridge();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { foo: "bar" },
      }),
    );

    expect(warnSpy).toHaveBeenCalled();
    cleanupBridge();
    warnSpy.mockRestore();
  });
});
