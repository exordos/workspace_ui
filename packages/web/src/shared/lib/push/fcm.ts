/**
 * Firebase Cloud Messaging (FCM) push provider.
 *
 * Uses the Firebase Messaging SDK v10+ (modular, tree-shakable).
 * Loads Firebase lazily — zero cost when push is not configured.
 *
 * Required env vars:
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
 *   VITE_FIREBASE_VAPID_KEY
 *
 * The service worker at /firebase-messaging-sw.js handles background messages.
 */

import { createLogger } from "../logger";
import { pushPipeline, type RawPushEnvelope } from "./middleware";
import type { PushMessagePayload, PushProvider } from "./types";
import type { FirebaseApp } from "firebase/app";
import type { Messaging, MessagePayload } from "firebase/messaging";

const log = createLogger("push:fcm");
const firebaseState: { app: FirebaseApp | null; messaging: Messaging | null } = {
  app: null,
  messaging: null,
};

function setFirebaseState(nextApp: FirebaseApp, nextMessaging: Messaging): void {
  firebaseState.app = nextApp;
  firebaseState.messaging = nextMessaging;
}

function getFirebaseConfig(): Record<string, string> | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY ?? "";
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "";
  const senderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "";
  const appId = import.meta.env.VITE_FIREBASE_APP_ID ?? "";

  if (!apiKey || !projectId || !senderId || !appId) return null;

  return {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId: senderId,
    appId,
  };
}

function getVapidKey(): string {
  return import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";
}

async function ensureInitialized(): Promise<Messaging | null> {
  if (firebaseState.messaging) return firebaseState.messaging;

  const config = getFirebaseConfig();
  if (!config) {
    log.warn("Firebase config missing — push disabled");
    return null;
  }

  try {
    const { initializeApp } = await import("firebase/app");
    const { getMessaging, isSupported } = await import("firebase/messaging");

    const supported = await isSupported();
    if (!supported) {
      log.warn("Firebase Messaging not supported in this browser");
      return null;
    }

    const nextApp = initializeApp(config);
    const nextMessaging = getMessaging(nextApp);
    setFirebaseState(nextApp, nextMessaging);

    log.info("Firebase Messaging initialized");
    return nextMessaging;
  } catch (err) {
    log.error("Firebase init failed", { error: String(err) });
    return null;
  }
}

export function createFcmProvider(): PushProvider {
  const messageHandlers = new Set<(payload: PushMessagePayload) => void>();

  return {
    name: "fcm",

    async init() {
      const msg = await ensureInitialized();
      if (!msg) return;

      try {
        const { onMessage } = await import("firebase/messaging");

        onMessage(msg, (fcmPayload: MessagePayload) => {
          const envelope: RawPushEnvelope = {
            data: fcmPayload.data ?? {},
            notification: fcmPayload.notification,
            transport: "fcm",
            receivedAt: Date.now(),
          };

          pushPipeline
            .process(envelope)
            .then((parsed) => {
              if (!parsed) return;
              for (const handler of messageHandlers) {
                try {
                  handler(parsed);
                } catch (err) {
                  log.warn("Push message handler error", { error: String(err) });
                }
              }
            })
            .catch((err) => {
              log.error("Push pipeline error", { error: String(err) });
            });
        });
      } catch (err) {
        log.error("FCM onMessage setup failed", { error: String(err) });
      }
    },

    async getToken(): Promise<string | null> {
      const msg = await ensureInitialized();
      if (!msg) return null;

      const vapidKey = getVapidKey();
      if (!vapidKey) {
        log.warn("VAPID key missing — cannot get FCM token");
        return null;
      }

      try {
        const sw = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");

        const { getToken: fcmGetToken } = await import("firebase/messaging");
        const token = await fcmGetToken(msg, {
          vapidKey,
          serviceWorkerRegistration: sw,
        });

        log.info("FCM token acquired", { tokenPrefix: token.slice(0, 12) + "..." });
        return token;
      } catch (err) {
        log.error("FCM getToken failed", { error: String(err) });
        return null;
      }
    },

    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },

    isSupported() {
      return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        !!getFirebaseConfig()
      );
    },
  };
}
