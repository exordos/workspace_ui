import { afterEach, describe, expect, it } from "vitest";
import { useMessageReadersStore } from "./message-readers.model";

describe("useMessageReadersStore", () => {
  afterEach(() => {
    useMessageReadersStore.getState().clear();
  });

  it("starts with idle state", () => {
    const state = useMessageReadersStore.getState();
    expect(state.loading).toBe(false);
    expect(state.userIds).toHaveLength(0);
    expect(state.error).toBeNull();
    expect(state.messageId).toBeNull();
    expect(state.unsupported).toBe(false);
  });

  it("marks read receipts as unsupported without loading users", () => {
    useMessageReadersStore.getState().showUnsupported(42);

    const state = useMessageReadersStore.getState();
    expect(state.loading).toBe(false);
    expect(state.messageId).toBe(42);
    expect(state.userIds).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.unsupported).toBe(true);
  });

  it("clears state", () => {
    useMessageReadersStore.setState({
      loading: false,
      userIds: [1, 2, 3],
      error: null,
      messageId: 42,
      unsupported: true,
    });

    useMessageReadersStore.getState().clear();

    const state = useMessageReadersStore.getState();
    expect(state.userIds).toHaveLength(0);
    expect(state.messageId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.unsupported).toBe(false);
  });

  it("replaces previous unsupported message id", () => {
    useMessageReadersStore.setState({ userIds: [10, 20], messageId: 1, unsupported: false });

    useMessageReadersStore.getState().showUnsupported(2);
    const state = useMessageReadersStore.getState();

    expect(state.loading).toBe(false);
    expect(state.userIds).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.messageId).toBe(2);
    expect(state.unsupported).toBe(true);
  });
});
