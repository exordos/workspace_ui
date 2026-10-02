import { describe, expect, it } from "vitest";
import { isWorkspaceMessengerMessagePayloadDto } from "~/shared/api/messenger.types";
import type { WorkspaceMessengerE2eePayloadDto } from "~/shared/api/messenger.types";
import { decodeChatE2eePayload, encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { adaptMessengerMessagePayload } from "./messenger-adapters.lib";
import type { ChatE2eePayload } from "./chat-e2ee.types";

const keyUuid = "11111111-1111-4111-8111-111111111111";
const requestMessageUuid = "22222222-2222-4222-8222-222222222222";
const bytes = new Uint8Array([0, 127, 128, 255]);
const payloads: ChatE2eePayload[] = [
  { kind: "e2ee", keyUuid, content: { bytes } },
  { kind: "key_request", keyUuid, deviceId: "mac", deviceName: "MacBook", publicKey: { bytes } },
  { kind: "key_announced", keyUuid, publicKey: { bytes } },
  {
    kind: "key_grant",
    keyUuid,
    requestMessageUuid,
    senderDeviceId: "admin",
    recipientDeviceId: "mac",
    content: { bytes },
  },
  {
    kind: "key_reject",
    keyUuid,
    requestMessageUuid,
    senderDeviceId: "admin",
    recipientDeviceId: "mac",
  },
];

describe("E2EE payload boundaries", () => {
  it.each(payloads)("preserves $kind bytes and metadata without adding wire fields", (payload) => {
    const dto = encodeChatE2eePayload(payload);
    expect(isWorkspaceMessengerMessagePayloadDto(dto)).toBe(true);
    expect(decodeChatE2eePayload(dto)).toEqual({ ok: true, value: payload });
    const stored = adaptMessengerMessagePayload(dto);
    expect(stored.kind).toBe(payload.kind);
    if ("content" in dto) expect(dto.content).toBe("AH+A/w==");
    if ("public_key" in dto) expect(dto.public_key).toBe("AH+A/w==");
    expect(dto).not.toHaveProperty("bytes");
    expect(dto).not.toHaveProperty("version");
  });

  it.each(["", "AA", "AA=", "AB==", " AA==", "AA==\n", "__8=", "invalid?"])(
    "rejects noncanonical Base64 %j at crypto boundary while transport retains opaque content",
    (content) => {
      const dto: WorkspaceMessengerE2eePayloadDto = { kind: "e2ee", key_uuid: keyUuid, content };
      expect(isWorkspaceMessengerMessagePayloadDto(dto)).toBe(true);
      expect(adaptMessengerMessagePayload(dto)).toEqual({ kind: "e2ee", keyUuid, content });
      expect(decodeChatE2eePayload(dto)).toEqual({
        ok: false,
        reason: "invalid-base64",
        field: "content",
      });
    },
  );

  it("reports public-key errors separately and rejects incomplete service payloads", () => {
    expect(
      decodeChatE2eePayload({ kind: "key_announced", key_uuid: keyUuid, public_key: "!" }),
    ).toEqual({ ok: false, reason: "invalid-base64", field: "public_key" });
    expect(
      isWorkspaceMessengerMessagePayloadDto({
        kind: "key_request",
        key_uuid: keyUuid,
        device_id: "mac",
        public_key: "AA==",
      }),
    ).toBe(false);
    expect(
      isWorkspaceMessengerMessagePayloadDto({
        kind: "key_grant",
        key_uuid: keyUuid,
        request_message_uuid: "device-not-uuid",
        sender_device_id: "a",
        recipient_device_id: "b",
        content: "AA==",
      }),
    ).toBe(false);
  });
});
