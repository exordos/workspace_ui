import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { IndexedDbChatKeyStorage } from "./chat-key-storage-idb.lib";
import { createRealChatCryptoProvider } from "./chat-real-crypto-provider.lib";
import type { ChatDeviceIdentity, ChatKeyStorage } from "./chat-key-storage.types";

export const realChatKeyStorage: ChatKeyStorage = new IndexedDbChatKeyStorage();
export const realChatCryptoProvider = createRealChatCryptoProvider();

/** Metadata remains stable across refreshes; a competing tab's persisted identity wins. */
export async function ensureChatDeviceIdentity(
  runtime: WorkspaceRuntimeContext,
  isCurrent: () => boolean,
  storage: ChatKeyStorage = realChatKeyStorage,
): Promise<ChatDeviceIdentity> {
  let identity = await storage.readDeviceIdentity(runtime);
  if (!isCurrent()) throw new Error("stale");
  if (identity) return identity;
  identity = { deviceId: crypto.randomUUID(), deviceName: "Workspace browser" };
  await storage.writeDeviceIdentity(runtime, identity, { isCurrent });
  if (!isCurrent()) throw new Error("stale");
  const persisted = await storage.readDeviceIdentity(runtime);
  if (!isCurrent()) throw new Error("stale");
  if (!persisted) throw new Error("storage-failed");
  return persisted;
}

export interface RealChatKeyChange {
  readonly kind: "removed" | "updated";
  readonly ownerKey: string;
  readonly deviceId: string;
  readonly streamUuid: string;
  readonly keyUuid: string;
}

const keyListeners = new Set<(change?: RealChatKeyChange) => void>();
let keyChannel: BroadcastChannel | null = null;
function isKeyChange(value: unknown): value is RealChatKeyChange {
  if (value === null || typeof value !== "object") return false;
  const change = value as Partial<RealChatKeyChange>;
  return (
    (change.kind === "removed" || change.kind === "updated") &&
    typeof change.ownerKey === "string" &&
    typeof change.deviceId === "string" &&
    typeof change.streamUuid === "string" &&
    typeof change.keyUuid === "string"
  );
}
export function subscribeRealChatKeyChanges(
  listener: (change?: RealChatKeyChange) => void,
): () => void {
  keyListeners.add(listener);
  if (
    keyChannel === null &&
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    keyChannel = new BroadcastChannel("workspace-chat-key-changes");
    keyChannel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isKeyChange(data)) return;
      for (const subscriber of keyListeners) subscriber(data);
    };
  }
  return () => {
    keyListeners.delete(listener);
    if (keyListeners.size === 0) {
      keyChannel?.close();
      keyChannel = null;
    }
  };
}
export function notifyRealChatKeyChanges(change?: RealChatKeyChange): void {
  for (const listener of keyListeners) listener(change);
  // Only public addressing metadata crosses tabs; legacy retries stay within this tab.
  if (change) keyChannel?.postMessage(change);
}
