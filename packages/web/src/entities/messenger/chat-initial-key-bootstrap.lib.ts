import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

export interface ChatInitialKeyMetadata {
  readonly keyUuid: string;
  readonly creationId?: string;
  readonly deviceId?: string;
}

/** A real implementation owns key generation/storage; creation only transports public metadata. */
export interface ChatInitialKeyBootstrap {
  prepare(input: {
    readonly runtimeContext: WorkspaceRuntimeContext;
    readonly isCurrent: () => boolean;
    readonly signal?: AbortSignal;
  }): Promise<ChatInitialKeyMetadata>;
  finalize?(input: {
    readonly runtimeContext: WorkspaceRuntimeContext;
    readonly metadata: ChatInitialKeyMetadata;
    readonly streamUuid: string;
    readonly isCurrent: () => boolean;
  }): Promise<void>;
}

export class MessengerChannelCreationError extends Error {
  constructor(
    readonly reason: "encryption-unavailable" | "encryption-mismatch" | "creation-uncertain",
  ) {
    super(reason);
    this.name = "MessengerChannelCreationError";
  }
}
