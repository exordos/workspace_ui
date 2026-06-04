/**
 * Firebase Messaging Service Worker — handles background push notifications.
 *
 * This file MUST be at the web root (/firebase-messaging-sw.js).
 * It runs independently of the main app when the tab is closed or backgrounded.
 *
 * Firebase SDK is loaded from CDN (the main app uses the npm package for foreground).
 */

/* global importScripts, firebase */
// @ts-nocheck
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: self.__FIREBASE_CONFIG__?.apiKey ?? "",
  projectId: self.__FIREBASE_CONFIG__?.projectId ?? "",
  messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId ?? "",
  appId: self.__FIREBASE_CONFIG__?.appId ?? "",
});

const messaging = firebase.messaging();

function slugifyStreamName(streamName) {
  return String(streamName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "")
    .replace(/^-+/, "");
}

function buildMessageRedirectRoute(messageId, realmUri) {
  const base = `/message/${messageId}`;
  return realmUri ? `${base}?realm=${encodeURIComponent(realmUri)}` : base;
}

/** Keep in sync with push-payload-validate.lib.ts */
function isValidPushEnvelopeData(data) {
  const event = data.event || data.type || "message";
  if (event === "remove" || event === "test") {
    return true;
  }
  if (data.encrypted_payload && !data.event && !data.type) {
    return false;
  }
  const messageId = Number(data.message_id);
  const senderId = Number(data.sender_id);
  return Number.isFinite(messageId) && messageId > 0 && Number.isFinite(senderId) && senderId > 0;
}

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notification = payload.notification || {};

  if (!isValidPushEnvelopeData(data)) {
    return;
  }

  const event = data.event || data.type || "message";

  if (event === "remove" || event === "test") {
    return;
  }

  const showNotification = () => {
    const title = notification.title || data.sender_full_name || "New message";
    const body =
      notification.body ||
      data.content ||
      (data.stream_name
        ? `#${data.stream_name} > ${data.topic || "message"}`
        : "New message");

    const options = {
      body,
      icon: data.sender_avatar_url || "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: `msg-${data.message_id || Date.now()}`,
      data: {
        messageId: data.message_id,
        messageType: data.message_type,
        streamId: data.stream_id,
        streamName: data.stream_name || data.stream,
        topic: data.topic,
        senderId: data.sender_id,
        realmUri: data.realm_uri || data.realm_url,
      },
      actions: [{ action: "open", title: "Open" }],
      renotify: true,
      requireInteraction: false,
    };

    return self.registration.showNotification(title, options);
  };

  // Skip OS toast only when a visible tab is open (long-poll handles it there).
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      const hasVisibleClient = clients.some((client) => client.visibilityState === "visible");
      if (hasVisibleClient) {
        return;
      }
      return showNotification();
    })
    .catch(() => showNotification());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = "/";

  if (data.messageId) {
    url = buildMessageRedirectRoute(data.messageId, data.realmUri);
  } else if (data.messageType === "stream" && data.streamName) {
    if (data.streamId) {
      url = `/stream/${data.streamId}-${slugifyStreamName(data.streamName) || "channel"}`;
    } else {
      url = `/stream/${data.streamName}`;
    }
    if (data.topic) {
      url += `/topic/${encodeURIComponent(data.topic)}`;
    }
  } else if (data.messageType === "private" && data.senderId) {
    url = `/dm/${data.senderId}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage({
            type: "PUSH_NOTIFICATION_CLICK",
            messageId: data.messageId,
            messageType: data.messageType,
            streamId: data.streamId,
            streamName: data.streamName,
            topic: data.topic,
            senderId: data.senderId,
            realmUri: data.realmUri,
          });
          return;
        }
        return self.clients.openWindow(url);
      }),
  );
});
