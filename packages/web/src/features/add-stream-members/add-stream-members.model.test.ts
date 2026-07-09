import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAddStreamMembersStore } from "./add-stream-members.model";

function resetStore(): void {
  useAddStreamMembersStore.setState({
    open: false,
    streamId: null,
    streamName: "",
    existingMemberIds: [],
    query: "",
    selectedIds: [],
    submitting: false,
    error: null,
    lastResult: null,
  });
}

describe("useAddStreamMembersStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it("tracks open/query/selection state and excludes already subscribed users", () => {
    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [77] });

    store.toggleSelected(88);
    store.toggleSelected(77);
    store.setQuery("bob");

    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(true);
    expect(nextState.query).toBe("bob");
    expect(nextState.selectedIds).toEqual([88]);
  });

  it("keeps legacy numeric submit in unsupported state without closing dialog", async () => {
    const onSuccess = vi.fn();
    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [77] });
    store.toggleSelected(88);

    const result = await store.submit({ onSuccess });

    expect(result).toMatchObject({ ok: false, errorCode: "unsupported" });
    expect(onSuccess).not.toHaveBeenCalled();
    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(true);
    expect(nextState.selectedIds).toEqual([88]);
    expect(nextState.error).toBe("app.error");
  });

  it("returns success only when every selected user is already excluded locally", async () => {
    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [88] });
    store.toggleSelected(88);

    const result = await store.submit({});

    const nextState = useAddStreamMembersStore.getState();
    expect(result).toEqual({
      ok: true,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });
    expect(nextState.open).toBe(true);
    expect(nextState.error).toBeNull();
    expect(nextState.submitting).toBe(false);
  });

  it("does not bridge numeric selected users to Workspace API from the legacy fallback", async () => {
    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [] });
    store.toggleSelected(42);

    const result = await store.submit({});

    expect(result).toMatchObject({ ok: false, errorCode: "unsupported" });
    expect(useAddStreamMembersStore.getState().error).toBe("app.error");
  });
});
