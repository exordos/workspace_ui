// This contract assumes a shared key pair per chat generation.
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
export interface ChatCryptoKeyPair<TPrivateKey> {
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

export interface ChatCryptoProvider<TPrivateKey> {
  createDeviceKeyPair(): Promise<ChatCryptoResult<ChatCryptoKeyPair<TPrivateKey>>>;
  createChatKeyPair(): Promise<ChatCryptoResult<ChatCryptoKeyPair<TPrivateKey>>>;

  encryptMessage(input: {
    readonly publicKey: ChatCryptoPublicKey;
    readonly plaintext: Uint8Array;
    readonly context: ChatCryptoMessageContext;
  }): Promise<ChatCryptoResult<ChatCryptoEnvelope>>;

  decryptMessage(input: {
    readonly keyPair: ChatCryptoKeyPair<TPrivateKey>;
    readonly envelope: ChatCryptoEnvelope;
    readonly context: ChatCryptoMessageContext;
  }): Promise<ChatCryptoResult<Uint8Array>>;

  // Only the encrypted grant leaves the provider; no raw key export is required.
  encryptChatKeyGrant(input: {
    readonly chatKeyPair: ChatCryptoKeyPair<TPrivateKey>;
    readonly recipientPublicKey: ChatCryptoPublicKey;
    readonly context: ChatCryptoGrantContext;
  }): Promise<ChatCryptoResult<ChatCryptoEnvelope>>;

  decryptChatKeyGrant(input: {
    readonly deviceKeyPair: ChatCryptoKeyPair<TPrivateKey>;
    readonly expectedChatPublicKey: ChatCryptoPublicKey;
    readonly envelope: ChatCryptoEnvelope;
    readonly context: ChatCryptoGrantContext;
  }): Promise<ChatCryptoResult<ChatCryptoKeyPair<TPrivateKey>>>;
}
