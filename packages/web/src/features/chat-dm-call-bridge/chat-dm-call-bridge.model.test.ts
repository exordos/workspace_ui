import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatDmCallBridgeStore } from "./chat-dm-call-bridge.model";

describe("useChatDmCallBridgeStore", () => {
  afterEach(() => {
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    useChatDmCallBridgeStore.getState().clearPendingDmCall();
  });

  it("invokes registered handler with partner user uuid", () => {
    const handler = vi.fn();
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(handler);
    useChatDmCallBridgeStore
      .getState()
      .invokeDmCallFromProfile("a225223c-637c-4afa-918f-5f2798b9305f");
    expect(handler).toHaveBeenCalledWith("a225223c-637c-4afa-918f-5f2798b9305f");
  });

  it("no-ops invoke when handler is missing", () => {
    useChatDmCallBridgeStore
      .getState()
      .invokeDmCallFromProfile("a225223c-637c-4afa-918f-5f2798b9305f");
    expect(useChatDmCallBridgeStore.getState().invokeDmCallFromProfileHandler).toBeNull();
  });

  it("clears only the pending request acknowledged by the consumer", () => {
    const bridge = useChatDmCallBridgeStore.getState();
    const request = {
      partnerUserUuid: "b225223c-637c-4afa-918f-5f2798b9305f",
      ownerKey: "owner",
      runtimeGeneration: 1,
    };
    const replacement = { ...request };
    bridge.setPendingDmCall(request);
    bridge.setPendingDmCall(replacement);
    expect(bridge.clearPendingDmCall(request)).toBe(false);
    expect(useChatDmCallBridgeStore.getState().pendingDmCall).toBe(replacement);
    expect(bridge.clearPendingDmCall(replacement)).toBe(true);
    expect(useChatDmCallBridgeStore.getState().pendingDmCall).toBeNull();
  });
});
