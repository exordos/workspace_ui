import path from "node:path";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface RegisteredServiceWorker {
  backgroundHandler: ((payload: { data?: Record<string, string>; notification?: Record<string, string> }) => void) | null;
  notificationClickHandler: ((event: {
    notification: { close: () => void; data?: Record<string, unknown> };
    waitUntil: (promise: Promise<unknown>) => void;
  }) => void) | null;
  showNotification: ReturnType<typeof vi.fn>;
  clientsMatchAll: ReturnType<typeof vi.fn>;
  clientsOpenWindow: ReturnType<typeof vi.fn>;
}

function loadServiceWorker(): RegisteredServiceWorker {
  const sourcePath = path.resolve(import.meta.dirname, "../../../../public/firebase-messaging-sw.js");
  const source = readFileSync(sourcePath, "utf8");

  let backgroundHandler:
    | ((payload: { data?: Record<string, string>; notification?: Record<string, string> }) => void)
    | null = null;
  let notificationClickHandler:
    | ((event: {
        notification: { close: () => void; data?: Record<string, unknown> };
        waitUntil: (promise: Promise<unknown>) => void;
      }) => void)
    | null = null;

  const showNotification = vi.fn();
  const clientsMatchAll = vi.fn().mockResolvedValue([]);
  const clientsOpenWindow = vi.fn().mockResolvedValue(undefined);

  const sandbox = {
    console,
    Date,
    URL,
    encodeURIComponent,
    importScripts: vi.fn(),
    firebase: {
      initializeApp: vi.fn(),
      messaging: () => ({
        onBackgroundMessage: (
          handler: (payload: { data?: Record<string, string>; notification?: Record<string, string> }) => void,
        ) => {
          backgroundHandler = handler;
        },
      }),
    },
    self: {
      __FIREBASE_CONFIG__: {},
      registration: {
        showNotification,
      },
      clients: {
        matchAll: clientsMatchAll,
        openWindow: clientsOpenWindow,
      },
      location: {
        origin: "https://workspace.example.com",
      },
      addEventListener: (
        type: string,
        handler: (event: {
          notification: { close: () => void; data?: Record<string, unknown> };
          waitUntil: (promise: Promise<unknown>) => void;
        }) => void,
      ) => {
        if (type === "notificationclick") {
          notificationClickHandler = handler;
        }
      },
    },
  };

  vm.runInNewContext(source, sandbox, { filename: sourcePath });

  return {
    backgroundHandler,
    notificationClickHandler,
    showNotification,
    clientsMatchAll,
    clientsOpenWindow,
  };
}

describe("firebase-messaging-sw", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("drops remove and test events without showing notifications", () => {
    const worker = loadServiceWorker();
    expect(worker.backgroundHandler).not.toBeNull();

    worker.backgroundHandler?.({ data: { event: "remove", message_ids: "[1]" } });
    worker.backgroundHandler?.({ data: { event: "test" } });

    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("drops encrypted payloads that lack a plaintext fallback event", () => {
    const worker = loadServiceWorker();

    worker.backgroundHandler?.({
      data: {
        encrypted_payload: "deadbeef",
        encryption_scheme: "aes-256-gcm",
      },
    });

    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("drops malformed message payloads missing ids", () => {
    const worker = loadServiceWorker();

    worker.backgroundHandler?.({
      data: {
        event: "message",
        sender_id: "1",
        sender_full_name: "Alice",
        content: "Hello",
      },
    });

    worker.backgroundHandler?.({
      data: {
        event: "message",
        message_id: "42",
        sender_full_name: "Alice",
        content: "Hello",
      },
    });

    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("shows a notification for a validated message payload", () => {
    const worker = loadServiceWorker();

    worker.backgroundHandler?.({
      data: {
        event: "message",
        message_id: "42",
        sender_id: "7",
        sender_full_name: "Alice",
        content: "Hello from push",
        message_type: "stream",
        stream_name: "general",
        topic: "updates",
        realm_uri: "https://zulip.example.com",
      },
    });

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    expect(worker.showNotification).toHaveBeenCalledWith(
      "Alice",
      expect.objectContaining({
        body: "Hello from push",
        tag: "zulip-msg-42",
        data: expect.objectContaining({
          messageId: 42,
          senderId: 7,
          realmUri: "https://zulip.example.com",
        }),
      }),
    );
  });

  it("deduplicates repeated background messages by message id", () => {
    const worker = loadServiceWorker();
    const payload = {
      data: {
        event: "message",
        message_id: "42",
        sender_id: "7",
        sender_full_name: "Alice",
        content: "Hello from push",
      },
    };

    worker.backgroundHandler?.(payload);
    worker.backgroundHandler?.(payload);

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it("opens a normalized message route on notification click", async () => {
    const worker = loadServiceWorker();
    expect(worker.notificationClickHandler).not.toBeNull();

    let pending: Promise<unknown> | null = null;
    const close = vi.fn();
    worker.notificationClickHandler?.({
      notification: {
        close,
        data: {
          messageId: 42,
          realmUri: "https://zulip.example.com",
        },
      },
      waitUntil(promise) {
        pending = promise;
      },
    });

    await pending;

    expect(close).toHaveBeenCalledOnce();
    expect(worker.clientsOpenWindow).toHaveBeenCalledWith(
      "/message/42?realm=https%3A%2F%2Fzulip.example.com",
    );
  });
});
