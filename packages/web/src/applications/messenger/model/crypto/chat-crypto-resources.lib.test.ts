import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getDeviceName } from "~/shared/lib/device-name.lib";
import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  subscribeRealChatKeyChanges,
} from "./chat-crypto-resources.lib";
import { IndexedDbChatKeyStorage } from "./chat-key-storage-idb.lib";
import type { RealChatKeyChange } from "./chat-crypto-resources.lib";

vi.mock("~/shared/lib/device-name.lib", () => ({ getDeviceName: vi.fn() }));

const runtime: WorkspaceRuntimeContext = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "org",
  projectId: "project",
  userUuid: "user",
  organizationOrigin: "https://workspace.example",
  accessToken: "test-access",
  runtimeGeneration: 1,
};
const stores: IndexedDbChatKeyStorage[] = [];
const databases: string[] = [];
function openStorage(name = `device-identity-${crypto.randomUUID()}`) {
  if (!databases.includes(name)) databases.push(name);
  const storage = new IndexedDbChatKeyStorage(name);
  stores.push(storage);
  return { storage, name };
}

beforeEach(() => {
  vi.mocked(getDeviceName).mockReset();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
  for (const name of databases.splice(0))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("delete failed"));
    });
});

describe("local device identity", () => {
  it("persists the resolved device name when creating an identity", async () => {
    const { storage } = openStorage();
    vi.mocked(getDeviceName).mockResolvedValue("Pixel 8 · Chrome — Web");

    const identity = await ensureChatDeviceIdentity(runtime, () => true, storage);

    expect(identity).toEqual({
      deviceId: expect.any(String),
      deviceName: "Pixel 8 · Chrome — Web",
    });
    expect(identity.deviceId).toMatch(/^[\da-f-]{36}$/);
    expect(await storage.readDeviceIdentity(runtime)).toEqual(identity);
    expect(getDeviceName).toHaveBeenCalledOnce();
  });

  it("preserves an existing name and ID without querying the device", async () => {
    const { storage } = openStorage();
    const existing = { deviceId: "existing-device", deviceName: "Workspace browser" };
    await storage.writeDeviceIdentity(runtime, existing);
    const write = vi.spyOn(storage, "writeDeviceIdentity");

    expect(await ensureChatDeviceIdentity(runtime, () => true, storage)).toEqual(existing);
    expect(getDeviceName).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not generate or persist an identity if the runtime changes during name retrieval", async () => {
    const { storage } = openStorage();
    let isCurrent = true;
    let resolveName!: (name: string) => void;
    let signalRetrieval!: () => void;
    const retrievalStarted = new Promise<void>((resolve) => {
      signalRetrieval = resolve;
    });
    vi.mocked(getDeviceName).mockImplementation(() => {
      signalRetrieval();
      return new Promise<string>((resolve) => {
        resolveName = resolve;
      });
    });
    const generateId = vi.spyOn(crypto, "randomUUID");
    const write = vi.spyOn(storage, "writeDeviceIdentity");
    const identity = ensureChatDeviceIdentity(runtime, () => isCurrent, storage);
    await retrievalStarted;
    isCurrent = false;
    resolveName("Mac · Safari — Web");

    await expect(identity).rejects.toThrow("stale");
    expect(generateId).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await storage.readDeviceIdentity(runtime)).toBeNull();
  });

  it("uses a competing tab's identity persisted while retrieving the name", async () => {
    const { storage, name } = openStorage();
    const otherTab = openStorage(name).storage;
    const competing = { deviceId: "other-device", deviceName: "Mac · Safari — Web" };
    vi.mocked(getDeviceName).mockImplementation(async () => {
      await otherTab.writeDeviceIdentity(runtime, competing);
      return "Windows · Chrome — Web";
    });

    expect(await ensureChatDeviceIdentity(runtime, () => true, storage)).toEqual(competing);
    expect(await storage.readDeviceIdentity(runtime)).toEqual(competing);
  });
});

describe("local key change notifications", () => {
  it("broadcasts scoped metadata, receives changes once, and ignores malformed remote messages", () => {
    const channels: TestChannel[] = [];
    class TestChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor(readonly name: string) {
        channels.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const listener = vi.fn();
    const stop = subscribeRealChatKeyChanges(listener);
    try {
      const channel = channels[0];
      if (!channel) throw new Error("Missing channel");
      notifyRealChatKeyChanges();
      expect(listener).toHaveBeenLastCalledWith(undefined);
      expect(channel.postMessage).not.toHaveBeenCalled();
      const change: RealChatKeyChange = {
        kind: "removed",
        ownerKey: "owner",
        deviceId: "device",
        streamUuid: "chat",
        keyUuid: "key",
      };
      notifyRealChatKeyChanges(change);
      expect(listener).toHaveBeenLastCalledWith(change);
      expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith(change);
      channel.onmessage?.(new MessageEvent("message", { data: change }));
      expect(listener).toHaveBeenCalledTimes(3);
      expect(channel.postMessage).toHaveBeenCalledOnce();
      channel.onmessage?.(
        new MessageEvent("message", { data: { kind: "removed", keyUuid: "key" } }),
      );
      expect(listener).toHaveBeenCalledTimes(3);
      stop();
      expect(channel.close).toHaveBeenCalledOnce();
    } finally {
      stop();
    }
  });
});
