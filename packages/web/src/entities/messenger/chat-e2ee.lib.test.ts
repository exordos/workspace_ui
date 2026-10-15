import { describe, expect, it } from "vitest";
import { correlateChatKeyResponse, resolveChatGenerationAccess } from "./chat-e2ee.lib";
import type {
  ChatE2eeMessage,
  ChatKeyRequestPayload,
  ChatKeyResponsePayload,
} from "./chat-e2ee.types";

const request: ChatE2eeMessage<ChatKeyRequestPayload> = {
  uuid: "request-message",
  streamUuid: "chat-one",
  authorUuid: "requesting-account",
  payload: {
    kind: "key_request",
    keyUuid: "generation-one",
    deviceId: "requesting-device",
    deviceName: "MacBook",
    publicKey: { bytes: new Uint8Array([1]) },
  },
};

const grant: ChatE2eeMessage<ChatKeyResponsePayload> = {
  uuid: "response-message",
  streamUuid: request.streamUuid,
  authorUuid: "issuing-account",
  payload: {
    kind: "key_grant",
    keyUuid: request.payload.keyUuid,
    requestMessageUuid: request.uuid,
    senderDeviceId: "issuing-device",
    recipientDeviceId: request.payload.deviceId,
    content: { bytes: new Uint8Array([2]) },
  },
};

describe("correlateChatKeyResponse", () => {
  it("resolves an earlier response when its request arrives without treating delivery as access", () => {
    expect(
      correlateChatKeyResponse({ request: null, response: grant, issuerCanGrantKey: true }),
    ).toEqual({ status: "unresolved", reason: "request-not-loaded" });

    const input = { request, response: grant, issuerCanGrantKey: true };
    expect(correlateChatKeyResponse(input)).toEqual({
      status: "matched",
      outcome: "grant-received",
    });
    // Duplicate delivery has no side effect and cannot manufacture a private key.
    expect(correlateChatKeyResponse(input)).toEqual(correlateChatKeyResponse(input));
    expect(resolveChatGenerationAccess({ groupKey: null })).toBe("metadata-only");
  });

  it.each([
    ["stream-mismatch", { ...grant, streamUuid: "other-chat" }],
    [
      "request-mismatch",
      { ...grant, payload: { ...grant.payload, requestMessageUuid: "another-request" } },
    ],
    [
      "generation-mismatch",
      { ...grant, payload: { ...grant.payload, keyUuid: "another-generation" } },
    ],
    [
      "recipient-mismatch",
      { ...grant, payload: { ...grant.payload, recipientDeviceId: "another-device" } },
    ],
  ] as const)("ignores %s", (reason, response) => {
    expect(correlateChatKeyResponse({ request, response, issuerCanGrantKey: true })).toEqual({
      status: "ignored",
      reason,
    });
  });

  it("does not trust a well-addressed response from an unauthorized issuer", () => {
    expect(
      correlateChatKeyResponse({ request, response: grant, issuerCanGrantKey: false }),
    ).toEqual({ status: "ignored", reason: "issuer-not-allowed" });
  });

  it("correlates a refusal and keeps refusals for another device separate", () => {
    const response: ChatE2eeMessage<ChatKeyResponsePayload> = {
      ...grant,
      payload: {
        kind: "key_reject",
        keyUuid: request.payload.keyUuid,
        requestMessageUuid: request.uuid,
        senderDeviceId: "issuing-device",
        recipientDeviceId: request.payload.deviceId,
      },
    };
    expect(correlateChatKeyResponse({ request, response, issuerCanGrantKey: true })).toEqual({
      status: "matched",
      outcome: "rejected",
    });
    expect(
      correlateChatKeyResponse({
        request,
        response: {
          ...response,
          payload: { ...response.payload, recipientDeviceId: "other-device" },
        },
        issuerCanGrantKey: true,
      }),
    ).toEqual({ status: "ignored", reason: "recipient-mismatch" });
  });
});

describe("resolveChatGenerationAccess", () => {
  it("keeps inaccessible old generations separate from a ready new generation", () => {
    expect(resolveChatGenerationAccess(null)).toBe("missing");
    expect(resolveChatGenerationAccess({ groupKey: null })).toBe("metadata-only");
    expect(
      resolveChatGenerationAccess({
        groupKey: { bytes: new Uint8Array(32) },
      }),
    ).toBe("ready");
    expect(resolveChatGenerationAccess(null)).toBe("missing");
  });
});
