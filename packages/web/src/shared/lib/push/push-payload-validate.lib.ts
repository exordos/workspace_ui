/**
 * Pure push payload validation shared by foreground middleware and the service worker.
 *
 * Keep logic in sync with `public/firebase-messaging-sw.js` (SW cannot import TS modules).
 */
import { isMessageId } from "../message-id.lib";
import type { PushMessagePayload } from "./types";

export function resolvePushEventType(data: Record<string, string>): PushMessagePayload["event"] {
  const raw = data.event ?? data.type ?? "message";
  if (raw === "remove" || raw === "test") {
    return raw;
  }
  return "message";
}

/** Validates raw FCM data before showing a background notification. */
export function isValidPushEnvelopeData(data: Record<string, string>): boolean {
  const event = resolvePushEventType(data);

  if (event === "remove" || event === "test") {
    return true;
  }

  if (data.encrypted_payload && !data.event && !data.type) {
    return false;
  }

  const senderId = Number(data.sender_id);
  return isMessageId(data.message_id) && Number.isFinite(senderId) && senderId > 0;
}

export function isValidPushMessagePayload(payload: PushMessagePayload): boolean {
  if (payload.event === "remove" || payload.event === "test") {
    return true;
  }
  const msg = payload.message;
  if (msg == null) {
    return false;
  }
  return isMessageId(msg.id) && msg.sender_id > 0;
}
