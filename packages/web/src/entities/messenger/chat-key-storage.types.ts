import type { WorkspaceRuntimeOwner } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  ChatCryptoGroupKey,
  ChatCryptoKeyFingerprint,
  ChatCryptoPublicKey,
} from "./chat-crypto-provider.types";

export interface ChatDeviceIdentity {
  readonly deviceId: string;
  readonly deviceName: string;
}

export interface ChatKeyStorageScope {
  readonly owner: WorkspaceRuntimeOwner;
  readonly deviceId: string;
}

export interface ChatKeyStorageAddress extends ChatKeyStorageScope {
  readonly streamUuid: string;
  readonly keyUuid: string;
}

export interface StoredChatKey {
  readonly fingerprint: ChatCryptoKeyFingerprint;
  readonly groupKey: ChatCryptoGroupKey | null;
}

export interface PendingChatKeyRequest {
  readonly localRequestId: string;
  readonly requestMessageUuid: string | null;
  readonly publicKey: ChatCryptoPublicKey;
  readonly privateKey: Uint8Array;
  readonly createdAt: number;
}

export interface ChatKeyRequestCompletion {
  readonly localRequestId: string;
  readonly requestMessageUuid: string;
  readonly responseMessageUuid: string;
  readonly outcome: "granted" | "rejected";
}

export interface StagedChatCreation extends StoredChatKey {
  readonly creationId: string;
  readonly keyUuid: string;
  readonly groupKey: ChatCryptoGroupKey;
  // Rotation retries reuse both announcement UUIDs and never overwrite an old secret.
  readonly rotation?: {
    readonly streamUuid: string;
    readonly previousKeyUuid: string;
    readonly previousFingerprint: string;
    readonly previousAnnouncementUuid: string;
    readonly topicUuid: string;
  };
}

export interface ChatKeyStorageWriteOptions {
  readonly isCurrent?: () => boolean;
}

export interface CompleteChatKeyGrant {
  readonly localRequestId: string;
  readonly requestMessageUuid: string;
  readonly responseMessageUuid: string;
  readonly groupKey: ChatCryptoGroupKey;
  readonly fingerprint: ChatCryptoKeyFingerprint;
}

export type CompleteChatKeyReject = Omit<CompleteChatKeyGrant, "groupKey" | "fingerprint">;

// Secrets have a dedicated durable store. False means a guarded write was skipped.
export interface ChatKeyStorage {
  readDeviceIdentity(owner: WorkspaceRuntimeOwner): Promise<ChatDeviceIdentity | null>;
  writeDeviceIdentity(
    owner: WorkspaceRuntimeOwner,
    identity: ChatDeviceIdentity,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  readChatKey(address: ChatKeyStorageAddress): Promise<StoredChatKey | null>;
  writeChatKey(
    address: ChatKeyStorageAddress,
    key: StoredChatKey,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  removeChatKey(
    address: ChatKeyStorageAddress,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  readPendingRequest(
    address: ChatKeyStorageAddress,
    localRequestId: string,
  ): Promise<PendingChatKeyRequest | null>;
  listPendingRequests(address: ChatKeyStorageAddress): Promise<readonly PendingChatKeyRequest[]>;
  writePendingRequest(
    address: ChatKeyStorageAddress,
    request: PendingChatKeyRequest,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  bindPendingRequest(
    address: ChatKeyStorageAddress,
    localRequestId: string,
    requestMessageUuid: string,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  readRequestCompletion(
    address: ChatKeyStorageAddress,
    localRequestId: string,
  ): Promise<ChatKeyRequestCompletion | null>;
  readRequestCompletionByMessageUuid(
    address: ChatKeyStorageAddress,
    requestMessageUuid: string,
  ): Promise<ChatKeyRequestCompletion | null>;
  completeGrant(
    address: ChatKeyStorageAddress,
    grant: CompleteChatKeyGrant,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  completeReject(
    address: ChatKeyStorageAddress,
    rejection: CompleteChatKeyReject,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  readStagedCreation(
    scope: ChatKeyStorageScope,
    creationId: string,
  ): Promise<StagedChatCreation | null>;
  listStagedCreations(scope: ChatKeyStorageScope): Promise<readonly StagedChatCreation[]>;
  writeStagedCreation(
    scope: ChatKeyStorageScope,
    creation: StagedChatCreation,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
  finalizeCreation(
    scope: ChatKeyStorageScope,
    creationId: string,
    streamUuid: string,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean>;
}
