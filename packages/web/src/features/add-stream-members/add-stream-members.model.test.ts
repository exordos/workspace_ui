import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addStreamMembers } from "./add-stream-members.api";
import { useAddStreamMembersStore } from "./add-stream-members.model";

vi.mock("./add-stream-members.api", () => ({
  addStreamMembers: vi.fn(),
}));

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
    vi.clearAllMocks();
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

  it("submits selected users and closes dialog on success", async () => {
    vi.mocked(addStreamMembers).mockResolvedValue({
      ok: true,
      addedUserIds: [88],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    const onSuccess = vi.fn();
    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [77] });
    store.toggleSelected(88);

    await store.submit({ onSuccess });

    expect(addStreamMembers).toHaveBeenCalledWith({
      streamName: "engineering",
      userIds: [88],
    });
    expect(onSuccess).toHaveBeenCalledWith(10);
    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(false);
    expect(nextState.selectedIds).toEqual([]);
    expect(nextState.error).toBeNull();
  });

  it("keeps dialog open and stores error on submit failure", async () => {
    vi.mocked(addStreamMembers).mockResolvedValue({
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "http_403",
    });

    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [] });
    store.toggleSelected(88);

    await store.submit({});

    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(true);
    expect(nextState.error).toBe("app.error");
    expect(nextState.submitting).toBe(false);
  });

  it("allows submitting current user id when selected", async () => {
    vi.mocked(addStreamMembers).mockResolvedValue({
      ok: true,
      addedUserIds: [42],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    const store = useAddStreamMembersStore.getState();
    store.openForStream({ streamId: 10, streamName: "engineering", existingMemberIds: [] });
    store.toggleSelected(42);

    await store.submit({});

    expect(addStreamMembers).toHaveBeenCalledWith({
      streamName: "engineering",
      userIds: [42],
    });
  });
});
