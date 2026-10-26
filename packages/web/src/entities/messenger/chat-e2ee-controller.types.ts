import type { ChatCryptoFailure, ChatCryptoProvider } from "./chat-crypto-provider.types";
import type {
  ChatE2eeMessage,
  ChatE2eePayload,
  ChatGenerationAccess,
  ChatKeyRequestContext,
  ChatKeyRequestPayload,
} from "./chat-e2ee.types";
import type {
  ChatDeviceIdentity,
  ChatKeyStorage,
  ChatKeyStorageAddress,
} from "./chat-key-storage.types";

export interface ChatE2eeControllerScope extends ChatKeyStorageAddress {
  readonly runtimeGeneration: number;
}

export interface ChatE2eeControllerRights {
  readonly canRequest: boolean;
  readonly canGrant: boolean;
  readonly canReject: boolean;
  readonly canRotate: boolean;
  readonly canSend: boolean;
}

export type ChatE2eeControllerFailure =
  | ChatCryptoFailure
  | "stale"
  | "forbidden"
  | "missing-key"
  | "storage-failed"
  | "send-failed"
  | "invalid-message";
export type ChatE2eeControllerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ChatE2eeControllerFailure };

export interface ChatE2eeControllerState {
  readonly access: ChatGenerationAccess;
  readonly pending: boolean;
  readonly requestStatus: "idle" | "requested" | "grant-received" | "rejected";
  readonly error: ChatE2eeControllerFailure | null;
}

export interface ChatE2eeControllerDependencies {
  readonly scope: ChatE2eeControllerScope;
  readonly device: ChatDeviceIdentity;
  readonly provider: ChatCryptoProvider;
  readonly storage: ChatKeyStorage;
  readonly getCurrentScope: () => ChatE2eeControllerScope | null;
  readonly getRights: () => ChatE2eeControllerRights;
  readonly isIssuerAllowed: (authorUuid: string, context?: ChatKeyRequestContext) => boolean;
  readonly canRespondToRequest?: (
    request: ChatE2eeMessage<ChatKeyRequestPayload>,
    action: "grant" | "reject",
  ) => boolean;
  readonly isAnnouncerAllowed: (authorUuid: string) => boolean;
  // The adapter validates public placement identity and guards network/store commits.
  // Request retries reuse the canonical UUID; returned messages carry a different public UUID.
  readonly sendPayload: (
    payload: ChatE2eePayload,
    isCurrent: () => boolean,
    canonicalMessageUuid?: string,
  ) => Promise<ChatE2eeMessage>;
}
