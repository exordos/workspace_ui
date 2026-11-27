import type {
  ChatE2eeMessage,
  ChatGenerationAccess,
  ChatKeyRequestPayload,
  ChatKeyResponseCorrelation,
  ChatKeyResponsePayload,
} from "./chat-e2ee.types";
import type { StoredChatKey } from "./chat-key-storage.types";

export function correlateChatKeyResponse(input: {
  readonly request: ChatE2eeMessage<ChatKeyRequestPayload> | null;
  readonly response: ChatE2eeMessage<ChatKeyResponsePayload>;
  // The controller checks this response author's current chat permissions.
  readonly issuerCanGrantKey: boolean;
}): ChatKeyResponseCorrelation {
  const { request, response, issuerCanGrantKey } = input;
  // History and realtime may deliver the response before its request.
  if (request === null) return { status: "unresolved", reason: "request-not-loaded" };
  if (request.streamUuid !== response.streamUuid) {
    return { status: "ignored", reason: "stream-mismatch" };
  }
  if (request.uuid !== response.payload.requestMessageUuid) {
    return { status: "ignored", reason: "request-mismatch" };
  }
  if (request.payload.keyUuid !== response.payload.keyUuid) {
    return { status: "ignored", reason: "generation-mismatch" };
  }
  if (request.payload.deviceId !== response.payload.recipientDeviceId) {
    return { status: "ignored", reason: "recipient-mismatch" };
  }
  if (!issuerCanGrantKey) return { status: "ignored", reason: "issuer-not-allowed" };

  // A matching grant is still ciphertext; only verified key storage can establish access.
  return {
    status: "matched",
    outcome: response.payload.kind === "key_grant" ? "grant-received" : "rejected",
  };
}

// Call with the stored key for the exact owner/device/stream/generation address.
export function resolveChatGenerationAccess(key: StoredChatKey | null): ChatGenerationAccess {
  if (key === null) return "missing";
  return key.groupKey === null ? "metadata-only" : "ready";
}
