import type { ChatCryptoEnvelope, ChatCryptoPublicKey } from "./chat-crypto-provider.types";

// Proposed domain payloads stay separate from the live API until backend support is available.
export interface ChatEncryptedPayload {
  readonly kind: "e2ee";
  readonly keyUuid: string;
  readonly content: ChatCryptoEnvelope;
}

export interface ChatKeyRequestPayload {
  readonly kind: "key_request";
  readonly keyUuid: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly publicKey: ChatCryptoPublicKey;
}

export interface ChatKeyGrantPayload {
  readonly kind: "key_grant";
  readonly keyUuid: string;
  readonly requestMessageUuid: string;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
  readonly content: ChatCryptoEnvelope;
}

export interface ChatKeyAnnouncedPayload {
  readonly kind: "key_announced";
  readonly keyUuid: string;
  readonly publicKey: ChatCryptoPublicKey;
}

export interface ChatKeyRejectPayload {
  readonly kind: "key_reject";
  readonly keyUuid: string;
  readonly requestMessageUuid: string;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
}

export type ChatE2eePayload =
  | ChatEncryptedPayload
  | ChatKeyRequestPayload
  | ChatKeyGrantPayload
  | ChatKeyAnnouncedPayload
  | ChatKeyRejectPayload;

export type ChatKeyResponsePayload = ChatKeyGrantPayload | ChatKeyRejectPayload;

export interface ChatE2eeMessage<TPayload extends ChatE2eePayload = ChatE2eePayload> {
  readonly uuid: string;
  readonly streamUuid: string;
  readonly authorUuid: string;
  readonly payload: TPayload;
}

export type ChatKeyResponseCorrelation =
  | { readonly status: "unresolved"; readonly reason: "request-not-loaded" }
  | {
      readonly status: "ignored";
      readonly reason:
        | "stream-mismatch"
        | "request-mismatch"
        | "generation-mismatch"
        | "recipient-mismatch"
        | "issuer-not-allowed";
    }
  | { readonly status: "matched"; readonly outcome: "grant-received" | "rejected" };

export type ChatGenerationAccess = "missing" | "public-only" | "ready";
