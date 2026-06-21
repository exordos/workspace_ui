/**
 * Tests for the Message Readers feature — "Read By" modal.
 *
 * Covers the Zustand store lifecycle (idle → loading → done/error),
 * API integration via fetchReadReceipts, input validation via guard.messageId,
 * and state cleanup.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { testMessageId } from "~/test/factories";
import { useMessageReadersStore } from "./message-readers.model";

vi.mock("~/shared/api/client", () => {
  const get = vi.fn();
  return {
    messengerApi: { get },
    workspaceApi: { get: vi.fn() },
    refreshMessengerApiBase: vi.fn(),
    refreshWorkspaceApiBase: vi.fn(),
  };
});

async function getWorkspaceMock() {
  const mod = await import("~/shared/api/client");
  return mod.messengerApi.get as ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe("useMessageReadersStore", () => {
  afterEach(async () => {
    useMessageReadersStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
    const mock = await getWorkspaceMock();
    mock.mockReset();
  });

  it("starts with idle state", () => {
    const state = useMessageReadersStore.getState();
    expect(state.loading).toBe(false);
    expect(state.userIds).toHaveLength(0);
    expect(state.error).toBeNull();
    expect(state.messageId).toBeNull();
  });

  it("sets loading state when fetching", async () => {
    const mock = await getWorkspaceMock();
    mock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_ids: [1, 2, 3] },
    });

    const messageId = testMessageId(42);
    const promise = useMessageReadersStore.getState().fetchReadReceipts(messageId);
    expect(useMessageReadersStore.getState().loading).toBe(true);
    expect(useMessageReadersStore.getState().messageId).toBe(messageId);

    await promise;

    expect(useMessageReadersStore.getState().loading).toBe(false);
    expect(useMessageReadersStore.getState().userIds).toEqual([1, 2, 3]);
    expect(useMessageReadersStore.getState().error).toBeNull();
  });

  it("handles API error gracefully", async () => {
    const mock = await getWorkspaceMock();
    mock.mockResolvedValue({
      ok: false,
      status: 404,
      data: { msg: "Message not found" },
    });

    await useMessageReadersStore.getState().fetchReadReceipts(testMessageId(999));

    expect(useMessageReadersStore.getState().loading).toBe(false);
    expect(useMessageReadersStore.getState().error).toBeTruthy();
    expect(useMessageReadersStore.getState().userIds).toHaveLength(0);
  });

  it("handles network error gracefully", async () => {
    const mock = await getWorkspaceMock();
    mock.mockRejectedValue(new Error("Network failure"));

    await useMessageReadersStore.getState().fetchReadReceipts(testMessageId(42));

    expect(useMessageReadersStore.getState().loading).toBe(false);
    expect(useMessageReadersStore.getState().error).toContain("Network failure");
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

  it("replaces previous results on new fetch", async () => {
    useMessageReadersStore.setState({ userIds: [10, 20], messageId: testMessageId(1) });

    const mock = await getWorkspaceMock();
    mock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_ids: [30, 40] },
    });

    const messageId = testMessageId(2);
    await useMessageReadersStore.getState().fetchReadReceipts(messageId);

    expect(useMessageReadersStore.getState().userIds).toEqual([30, 40]);
    expect(useMessageReadersStore.getState().messageId).toBe(messageId);
  });

  it("does not apply stale read receipts after organization switch and clear", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-a", realm: "https://a.test", login: "a@test.com", apiKey: "a-key" },
        { id: "inst-b", realm: "https://b.test", login: "b@test.com", apiKey: "b-key" },
      ],
      currentInstanceId: "inst-a",
      activeOrgEpoch: 0,
    });

    const mock = await getWorkspaceMock();
    let resolveResponse:
      | ((value: { ok: true; status: number; data: { user_ids: number[] } }) => void)
      | undefined;
    mock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const pending = useMessageReadersStore
      .getState()
      .fetchReadReceipts("00000000-0000-4000-8000-000000000042");
    useInstancesStore.getState().setCurrentInstanceId("inst-b");
    useMessageReadersStore.getState().clear();

    expect(resolveResponse).toBeTypeOf("function");
    resolveResponse!({
      ok: true,
      status: 200,
      data: { user_ids: [1, 2, 3] },
    });

    await pending;

    const state = useMessageReadersStore.getState();
    expect(state.loading).toBe(false);
    expect(state.userIds).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.messageId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

describe("fetchReadReceipts", () => {
  afterEach(async () => {
    const mock = await getWorkspaceMock();
    mock.mockReset();
  });

  it("returns user_ids on success", async () => {
    const mock = await getWorkspaceMock();
    mock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_ids: [5, 10, 15] },
    });

    const { fetchReadReceipts } = await import("./message-readers.api");
    const result = await fetchReadReceipts("00000000-0000-4000-8000-000000000100");
    expect(result).toEqual({ user_ids: [5, 10, 15] });
  });

  it("throws on non-ok response", async () => {
    const mock = await getWorkspaceMock();
    mock.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
    });

    const { fetchReadReceipts } = await import("./message-readers.api");
    await expect(fetchReadReceipts("00000000-0000-4000-8000-000000000100")).rejects.toThrow();
  });
});
