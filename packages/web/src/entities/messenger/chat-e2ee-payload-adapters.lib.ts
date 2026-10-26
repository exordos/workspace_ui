import type { WorkspaceMessengerE2eePayloadDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessagePayload } from "./messenger-adapters.lib";
import type { ChatE2eePayload } from "./chat-e2ee.types";
import type { MessengerMessagePayload } from "./messenger.types";

export type ChatE2eePayloadDecodeResult =
  | { readonly ok: true; readonly value: ChatE2eePayload }
  | {
      readonly ok: false;
      readonly reason: "invalid-base64";
      readonly field: "content" | "public_key";
    };

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBytes(value: string): Uint8Array | null {
  // Require canonical standard Base64, including padding and unused zero bits.
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ||
    value.length === 0
  )
    return null;
  try {
    const binary = atob(value);
    if (btoa(binary) !== value) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeChatE2eePayload(payload: ChatE2eePayload): WorkspaceMessengerE2eePayloadDto {
  switch (payload.kind) {
    case "e2ee":
      return {
        kind: payload.kind,
        key_uuid: payload.keyUuid,
        content: encodeBytes(payload.content.bytes),
      };
    case "key_request":
      return {
        kind: payload.kind,
        key_uuid: payload.keyUuid,
        device_id: payload.deviceId,
        device_name: payload.deviceName,
        public_key: encodeBytes(payload.publicKey.bytes),
        ...(payload.targetMessageUuid === undefined
          ? {}
          : { target_message_uuid: payload.targetMessageUuid }),
      };
    case "key_announced":
      return { kind: payload.kind, key_uuid: payload.keyUuid };
    case "key_grant":
      return {
        kind: payload.kind,
        key_uuid: payload.keyUuid,
        request_message_uuid: payload.requestMessageUuid,
        sender_device_id: payload.senderDeviceId,
        recipient_device_id: payload.recipientDeviceId,
        content: encodeBytes(payload.content.bytes),
      };
    case "key_reject":
      return {
        kind: payload.kind,
        key_uuid: payload.keyUuid,
        request_message_uuid: payload.requestMessageUuid,
        sender_device_id: payload.senderDeviceId,
        recipient_device_id: payload.recipientDeviceId,
      };
  }
}

// REST/history/realtime preserve opaque strings; decode only when entering crypto operations.
export function decodeChatE2eePayload(
  dto: WorkspaceMessengerE2eePayloadDto,
): ChatE2eePayloadDecodeResult {
  const payload = adaptMessengerMessagePayload(dto);
  if (payload.kind === "markdown") throw new TypeError("Expected encrypted payload");
  return decodeMessengerE2eePayload(payload);
}

export function decodeMessengerE2eePayload(
  payload: Exclude<MessengerMessagePayload, { kind: "markdown" }>,
): ChatE2eePayloadDecodeResult {
  if (payload.kind === "key_reject" || payload.kind === "key_announced")
    return { ok: true, value: payload };
  const field = payload.kind === "key_request" ? "public_key" : "content";
  const bytes = decodeBytes(payload.kind === "key_request" ? payload.publicKey : payload.content);
  if (bytes === null) return { ok: false, reason: "invalid-base64", field };
  return payload.kind === "key_request"
    ? { ok: true, value: { ...payload, publicKey: { bytes } } }
    : { ok: true, value: { ...payload, content: { bytes } } };
}
