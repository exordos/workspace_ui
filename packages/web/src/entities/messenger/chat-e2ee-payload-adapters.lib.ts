import type { WorkspaceMessengerE2eePayloadDto } from "~/shared/api/messenger.types";
import type { ChatE2eePayload } from "./chat-e2ee.types";

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
  if (dto.kind === "key_reject")
    return {
      ok: true,
      value: {
        kind: dto.kind,
        keyUuid: dto.key_uuid,
        requestMessageUuid: dto.request_message_uuid,
        senderDeviceId: dto.sender_device_id,
        recipientDeviceId: dto.recipient_device_id,
      },
    };
  if (dto.kind === "key_announced")
    return { ok: true, value: { kind: dto.kind, keyUuid: dto.key_uuid } };
  const field = dto.kind === "key_request" ? "public_key" : "content";
  const bytes = decodeBytes(dto.kind === "key_request" ? dto.public_key : dto.content);
  if (bytes === null) return { ok: false, reason: "invalid-base64", field };
  switch (dto.kind) {
    case "e2ee":
      return { ok: true, value: { kind: dto.kind, keyUuid: dto.key_uuid, content: { bytes } } };
    case "key_request":
      return {
        ok: true,
        value: {
          kind: dto.kind,
          keyUuid: dto.key_uuid,
          deviceId: dto.device_id,
          deviceName: dto.device_name,
          publicKey: { bytes },
        },
      };
    case "key_grant":
      return {
        ok: true,
        value: {
          kind: dto.kind,
          keyUuid: dto.key_uuid,
          requestMessageUuid: dto.request_message_uuid,
          senderDeviceId: dto.sender_device_id,
          recipientDeviceId: dto.recipient_device_id,
          content: { bytes },
        },
      };
  }
}
