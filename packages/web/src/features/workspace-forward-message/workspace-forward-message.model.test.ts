import { describe, expect, it, vi } from "vitest";

const MODEL_MODULE = "./workspace-forward-message.model";

describe("workspace forward message store contract", () => {
  it("exports useWorkspaceForwardMessageStore", async () => {
    const mod = await import(MODEL_MODULE);

    expect(mod.useWorkspaceForwardMessageStore).toEqual(expect.any(Function));
  });

  it("open stores intent by message uuid and normalizes request data", async () => {
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);
    const onSuccess = vi.fn();

    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceForwardMessageStore.getState().open({
      messageUuids: ["", "message-a", "message-a", " ", "message-b"],
      selectedText: " \n selected fragment \t ",
      onSuccess,
    });

    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: true,
      messageUuids: ["message-a", "message-b"],
      selectedText: "selected fragment",
      onSuccess,
      isSubmitting: false,
      error: null,
    });
  });

  it("close does not close while submit is running", async () => {
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceForwardMessageStore.getState().open({ messageUuids: ["message-a"] });
    useWorkspaceForwardMessageStore.getState().setSubmitting(true);
    useWorkspaceForwardMessageStore.getState().close();

    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: true,
      isSubmitting: true,
      messageUuids: ["message-a"],
    });
  });

  it("reset clears forward intent, submit state, and visible error", async () => {
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: ["message-a"] });
    useWorkspaceForwardMessageStore.getState().setSubmitting(true);
    useWorkspaceForwardMessageStore.getState().setError("Send failed");
    useWorkspaceForwardMessageStore.getState().reset();

    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: false,
      messageUuids: [],
      selectedText: undefined,
      onSuccess: undefined,
      isSubmitting: false,
      error: null,
    });
  });

  it("open keeps dialog closed when request has no usable message uuid", async () => {
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceForwardMessageStore.getState().open({
      messageUuids: ["", " \t "],
      selectedText: "selected fragment",
    });

    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: false,
      messageUuids: [],
      selectedText: undefined,
      onSuccess: undefined,
      isSubmitting: false,
      error: null,
    });
  });

  it("open with empty message uuid clears stored success callback", async () => {
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceForwardMessageStore
      .getState()
      .open({ messageUuids: ["message-a"], onSuccess: vi.fn() });
    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [] });

    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: false,
      messageUuids: [],
      onSuccess: undefined,
      isSubmitting: false,
    });
  });
});
