/**
 * Tests for the Message Readers feature with no backend read-receipts endpoint.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { testMessageId } from "~/test/factories";
import { fetchReadReceipts } from "./message-readers.api";
import { useMessageReadersStore } from "./message-readers.model";

describe("useMessageReadersStore", () => {
  afterEach(() => {
    useMessageReadersStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
  });

  it("starts with idle state", () => {
    const state = useMessageReadersStore.getState();
    expect(state.loading).toBe(false);
    expect(state.userIds).toHaveLength(0);
    expect(state.error).toBeNull();
    expect(state.messageId).toBeNull();
  });

  it("finishes with an empty reader list without transport", async () => {
    const messageId = testMessageId(42);
    const promise = useMessageReadersStore.getState().fetchReadReceipts(messageId);
    expect(useMessageReadersStore.getState().loading).toBe(true);
    expect(useMessageReadersStore.getState().messageId).toBe(messageId);

    await promise;

    expect(useMessageReadersStore.getState().loading).toBe(false);
    expect(useMessageReadersStore.getState().userIds).toEqual([]);
    expect(useMessageReadersStore.getState().error).toBeNull();
  });

  it("clears state", () => {
    useMessageReadersStore.setState({
      loading: false,
      userIds: [1, 2, 3],
      error: null,
      messageId: testMessageId(42),
    });

    useMessageReadersStore.getState().clear();

    const state = useMessageReadersStore.getState();
    expect(state.userIds).toHaveLength(0);
    expect(state.messageId).toBeNull();
    expect(state.error).toBeNull();
  });
});

describe("fetchReadReceipts", () => {
  it("returns an empty unsupported reader list", async () => {
    await expect(fetchReadReceipts(testMessageId(100))).resolves.toEqual({ user_ids: [] });
  });

  it("still validates message ids", async () => {
    await expect(fetchReadReceipts(0 as never)).rejects.toThrow(/Invalid messageId/);
  });
});
