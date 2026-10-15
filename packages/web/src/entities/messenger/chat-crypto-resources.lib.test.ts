import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyRealChatKeyChanges, subscribeRealChatKeyChanges } from "./chat-crypto-resources.lib";
import type { RealChatKeyChange } from "./chat-crypto-resources.lib";

afterEach(() => vi.unstubAllGlobals());

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
