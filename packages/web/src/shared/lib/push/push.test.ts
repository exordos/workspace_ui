/**
 * Tests for the push notification module — unified API for FCM and native push.
 *
 * Covers payload type shapes, the pushService facade (permission, registration,
 * message subscription), the initPush bootstrap, the usePushState hook export,
 * Zulip push token registration, and the FCM provider factory. In test
 * environment, most browser APIs are unavailable so tests focus on API shape
 * and safe fallback behavior.
 */
import { describe, expect, it, vi } from "vitest";
import { pushService, initPush, usePushState } from "./push.service";
import type { PushMessagePayload, PushState, PushPermission } from "./types";

// Type-level smoke tests ensure payload shapes match what the server sends.
describe("push notification types", () => {
  // "message" event carries full message data for display in the notification.
  it("PushMessagePayload message event has correct shape", () => {
    const payload: PushMessagePayload = {
      event: "message",
      realm_uri: "https://zulip.example.com",
      message: {
        id: 1,
        sender_id: 42,
        sender_full_name: "Alice",
        type: "stream",
        stream_name: "general",
        topic: "hello",
        content: "Hi!",
        timestamp: 1710331200,
      },
    };
    expect(payload.event).toBe("message");
    expect(payload.message?.sender_full_name).toBe("Alice");
  });

  // "remove" event clears notifications for read messages.
  it("PushMessagePayload remove event has message_ids", () => {
    const payload: PushMessagePayload = {
      event: "remove",
      message_ids: [1, 2, 3],
    };
    expect(payload.message_ids).toHaveLength(3);
  });

  // "test" event is used to verify push setup — carries no message data.
  it("PushMessagePayload test event is minimal", () => {
    const payload: PushMessagePayload = {
      event: "test",
      realm_uri: "https://zulip.example.com",
    };
    expect(payload.event).toBe("test");
  });

  // PushState shape drives the UI (permission badge, registration status).
  it("PushState has all required fields", () => {
    const state: PushState = {
      permission: "default",
      token: null,
      registered: false,
      provider: null,
      registrationError: null,
    };
    expect(state.permission).toBe("default");
    expect(state.registered).toBe(false);
  });

  // All four permission states must be representable.
  it("PushPermission has all valid values", () => {
    const perms: PushPermission[] = ["granted", "denied", "default", "unsupported"];
    expect(perms).toHaveLength(4);
  });
});

// pushService is the unified facade that abstracts over FCM/native providers.
describe("pushService", () => {
  // All required methods must be present — components depend on this interface.
  it("exports all expected methods", () => {
    expect(typeof pushService.requestPermission).toBe("function");
    expect(typeof pushService.register).toBe("function");
    expect(typeof pushService.unregister).toBe("function");
    expect(typeof pushService.onMessage).toBe("function");
    expect(typeof pushService.isSupported).toBe("function");
    expect(typeof pushService.getPermission).toBe("function");
    expect(typeof pushService.getState).toBe("function");
  });

  // getState must return a well-formed PushState even before init.
  it("getState returns valid PushState", () => {
    const state = pushService.getState();
    expect(state).toHaveProperty("permission");
    expect(state).toHaveProperty("token");
    expect(state).toHaveProperty("registered");
    expect(state).toHaveProperty("provider");
    expect(state).toHaveProperty("registrationError");
  });

  // Permission must be one of the four valid values.
  it("getPermission returns a valid permission", () => {
    const perm = pushService.getPermission();
    expect(["granted", "denied", "default", "unsupported"]).toContain(perm);
  });

  // onMessage must return an unsubscribe function to prevent memory leaks.
  it("onMessage returns unsubscribe function", () => {
    const unsub = pushService.onMessage(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("register is a silent no-op when provider is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(pushService.register()).resolves.toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// initPush bootstraps push notification state — must be safe in all environments.
describe("initPush", () => {
  // Must not crash even when Notification API is unavailable (e.g. Node/test env).
  it("does not throw", () => {
    expect(() => initPush()).not.toThrow();
  });

  // After init, permission must reflect the browser's notification permission.
  it("sets permission in state after init", () => {
    initPush();
    const state = pushService.getState();
    expect(["granted", "denied", "default", "unsupported"]).toContain(state.permission);
  });
});

// usePushState is the React hook for components that need push state.
describe("usePushState", () => {
  // Must be a callable function (React hook).
  it("is exported as a function", () => {
    expect(typeof usePushState).toBe("function");
  });
});

// Zulip push registration sends the device token to the server for routing.
describe("zulip push registration", () => {
  it("registerPushToken is exported", async () => {
    const { registerPushToken } = await import("./zulip");
    expect(typeof registerPushToken).toBe("function");
  });

  it("unregisterPushToken is exported", async () => {
    const { unregisterPushToken } = await import("./zulip");
    expect(typeof unregisterPushToken).toBe("function");
  });
});

// FCM (Firebase Cloud Messaging) provider — production push implementation.
describe("FCM provider", () => {
  // Factory must be available for dynamic provider selection.
  it("createFcmProvider is exported", async () => {
    const { createFcmProvider } = await import("./fcm");
    expect(typeof createFcmProvider).toBe("function");
  });

  // Provider must expose all required methods per the PushProvider contract.
  it("creates a provider with correct interface", async () => {
    const { createFcmProvider } = await import("./fcm");
    const provider = createFcmProvider();
    expect(provider.name).toBe("fcm");
    expect(typeof provider.init).toBe("function");
    expect(typeof provider.getToken).toBe("function");
    expect(typeof provider.onMessage).toBe("function");
    expect(typeof provider.isSupported).toBe("function");
  });

  // Without Firebase config env vars, FCM must report as unsupported.
  it("isSupported returns false without Firebase config", async () => {
    const { createFcmProvider } = await import("./fcm");
    const provider = createFcmProvider();
    expect(provider.isSupported()).toBe(false);
  });
});
