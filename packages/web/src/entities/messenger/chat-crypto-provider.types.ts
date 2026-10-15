// Each chat generation shares a symmetric key. Asymmetric pairs belong to access requests.
export interface ChatCryptoGroupKey {
  readonly bytes: Uint8Array;
}

export interface ChatCryptoPublicKey {
  // The API adapter encodes these bytes as Base64 in payload.public_key.
  readonly bytes: Uint8Array;
}

export interface ChatCryptoEnvelope {
  // The API adapter encodes these bytes as Base64 in payload.content.
  // Incoming payloads are decoded before calling the provider; no wire bytes field is added.
  readonly bytes: Uint8Array;
}

// Private keys may be bytes, platform handles, or library-owned objects.
export interface ChatCryptoKeyPair<TPrivateKey = Uint8Array> {
  readonly publicKey: ChatCryptoPublicKey;
  readonly privateKey: TPrivateKey;
}

export interface ChatCryptoMessageContext {
  readonly streamUuid: string;
  readonly keyUuid: string;
}

export interface ChatCryptoGrantContext extends ChatCryptoMessageContext {
  readonly requestMessageUuid: string;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
}

export type ChatCryptoFailure =
  | "unavailable"
  | "invalid-key"
  | "invalid-ciphertext"
  | "context-mismatch"
  | "key-not-transferable";

export type ChatCryptoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ChatCryptoFailure };

export interface ChatCryptoProvider<TPrivateKey = Uint8Array> {
  createRequestKeyPair(): Promise<ChatCryptoResult<ChatCryptoKeyPair<TPrivateKey>>>;
  createGroupKey(): Promise<ChatCryptoResult<ChatCryptoGroupKey>>;
  encryptMessage(input: {
    readonly groupKey: ChatCryptoGroupKey;
    readonly plaintext: Uint8Array;
    readonly context: ChatCryptoMessageContext;
  }): Promise<ChatCryptoResult<ChatCryptoEnvelope>>;

  decryptMessage(input: {
    readonly groupKey: ChatCryptoGroupKey;
    readonly envelope: ChatCryptoEnvelope;
    readonly context: ChatCryptoMessageContext;
  }): Promise<ChatCryptoResult<Uint8Array>>;

  // Only the encrypted grant leaves the provider; no raw key export is required.
  encryptGroupKeyGrant(input: {
    readonly groupKey: ChatCryptoGroupKey;
    readonly recipientPublicKey: ChatCryptoPublicKey;
    readonly context: ChatCryptoGrantContext;
  }): Promise<ChatCryptoResult<ChatCryptoEnvelope>>;

  decryptGroupKeyGrant(input: {
    readonly requestKeyPair: ChatCryptoKeyPair<TPrivateKey>;
    readonly envelope: ChatCryptoEnvelope;
    readonly context: ChatCryptoGrantContext;
  }): Promise<ChatCryptoResult<ChatCryptoGroupKey>>;
}
