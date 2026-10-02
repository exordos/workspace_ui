import type {
  ChatCryptoKeyPair,
  ChatCryptoPublicKey,
} from "~/entities/messenger/chat-crypto-provider.types";
import type { WorkspaceRuntimeOwner } from "~/entities/workspace-runtime/workspace-runtime.types";

export interface ChatDeviceIdentity<TPrivateKey> {
  readonly deviceId: string;
  // Display metadata for key requests; generating the name belongs outside storage and crypto.
  readonly deviceName: string;
  readonly keyPair: ChatCryptoKeyPair<TPrivateKey>;
}

export interface ChatKeyStorageScope {
  readonly owner: WorkspaceRuntimeOwner;
  readonly deviceId: string;
}

export interface ChatKeyStorageAddress extends ChatKeyStorageScope {
  readonly streamUuid: string;
  readonly keyUuid: string;
}

export interface StoredChatKey<TPrivateKey> {
  readonly publicKey: ChatCryptoPublicKey;
  readonly privateKey: TPrivateKey | null;
}

// Durable key storage is separate from the message cache and live runtime generation.
export interface ChatKeyStorage<TPrivateKey> {
  readDeviceIdentity(owner: WorkspaceRuntimeOwner): Promise<ChatDeviceIdentity<TPrivateKey> | null>;
  writeDeviceIdentity(
    owner: WorkspaceRuntimeOwner,
    identity: ChatDeviceIdentity<TPrivateKey>,
  ): Promise<void>;

  readChatKey(address: ChatKeyStorageAddress): Promise<StoredChatKey<TPrivateKey> | null>;
  // Public-key refreshes must preserve an existing private key.
  // Implementations must check isCurrent synchronously at the durable commit, after their awaits.
  // A false guard skips the write; runtime generations do not become durable address fields.
  writeChatKey(
    address: ChatKeyStorageAddress,
    key: StoredChatKey<TPrivateKey>,
    options?: { readonly isCurrent: () => boolean },
  ): Promise<void>;
  removeChatKey(address: ChatKeyStorageAddress): Promise<void>;
}
