import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatDmCallBridgeStore } from "./chat-dm-call-bridge.model";

describe("chatDmCallBridge", () => {
  afterEach(() => {
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
  });

  it("invoke delegates to registered handler", () => {
    const handler = vi.fn();
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(handler);
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(42);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it("invoke is no-op when handler is not registered", () => {
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(42);
    expect(useChatDmCallBridgeStore.getState().invokeDmCallFromProfileHandler).toBeNull();
  });

  it("clears pending partner id", () => {
    useChatDmCallBridgeStore.getState().setPendingDmCallPartnerUserId(99);
    expect(useChatDmCallBridgeStore.getState().pendingDmCallPartnerUserId).toBe(99);
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    expect(useChatDmCallBridgeStore.getState().pendingDmCallPartnerUserId).toBeNull();
  });
});
