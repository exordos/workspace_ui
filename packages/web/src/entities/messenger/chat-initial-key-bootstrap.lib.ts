import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isAllowedDevWorkspaceProxyTargetOrigin } from "~/shared/config/dev-workspace-org-proxy";
import type { ChatCryptoPublicKey } from "./chat-crypto-provider.types";

export interface ChatInitialKeyMetadata {
  readonly keyUuid: string;
  readonly publicKey: ChatCryptoPublicKey;
  readonly source: "provider" | "development-fixture";
}

/** A real implementation owns key generation/storage; creation only transports public metadata. */
export interface ChatInitialKeyBootstrap {
  prepare(input: {
    readonly runtimeContext: WorkspaceRuntimeContext;
    readonly isCurrent: () => boolean;
    readonly signal?: AbortSignal;
  }): Promise<ChatInitialKeyMetadata>;
}

export class MessengerChannelCreationError extends Error {
  constructor(readonly reason: "encryption-unavailable" | "encryption-mismatch") {
    super(reason);
    this.name = "MessengerChannelCreationError";
  }
}

export function isDevChatInitialKeyAllowed(runtime: WorkspaceRuntimeContext): boolean {
  if (!import.meta.env.DEV || !isAllowedDevWorkspaceProxyTargetOrigin(runtime.organizationOrigin))
    return false;
  const url = new URL(runtime.organizationOrigin);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** Only satisfies the local API's required initial-key field. It provides no encryption or access. */
export const devChatInitialKeyBootstrap: ChatInitialKeyBootstrap = {
  prepare: ({ runtimeContext, isCurrent, signal }) => {
    if (!isDevChatInitialKeyAllowed(runtimeContext) || !isCurrent() || signal?.aborted)
      return Promise.reject(new MessengerChannelCreationError("encryption-unavailable"));
    return Promise.resolve({
      keyUuid: crypto.randomUUID(),
      publicKey: { bytes: new TextEncoder().encode("DEV_ONLY_NO_CRYPTO_PUBLIC_KEY") },
      source: "development-fixture",
    });
  },
};
