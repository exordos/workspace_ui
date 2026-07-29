import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatDmCallBridgeStore } from "./chat-dm-call-bridge.model";

describe("useChatDmCallBridgeStore", () => {
  afterEach(() => {
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
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

  it("stores and clears pending partner uuid", () => {
    useChatDmCallBridgeStore
      .getState()
      .setPendingDmCallPartnerUserUuid("b225223c-637c-4afa-918f-5f2798b9305f");
    expect(useChatDmCallBridgeStore.getState().pendingDmCallPartnerUserUuid).toBe(
      "b225223c-637c-4afa-918f-5f2798b9305f",
    );
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    expect(useChatDmCallBridgeStore.getState().pendingDmCallPartnerUserUuid).toBeNull();
  });
});
