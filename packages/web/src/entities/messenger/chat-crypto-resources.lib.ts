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

const keyListeners = new Set<() => void>();
export function subscribeRealChatKeyChanges(listener: () => void): () => void {
  keyListeners.add(listener);
  return () => {
    keyListeners.delete(listener);
  };
}
export function notifyRealChatKeyChanges(): void {
  for (const listener of keyListeners) listener();
}
