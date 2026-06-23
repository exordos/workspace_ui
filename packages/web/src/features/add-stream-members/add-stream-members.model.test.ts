import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addStreamMembers } from "./add-stream-members.api";
import { useAddStreamMembersStore } from "./add-stream-members.model";

const STREAM_UUID_10 = "00000000-0000-4000-8000-000000000010";
const EXISTING_USER_UUID = "00000000-0000-0000-0000-000000000077";
const NEW_USER_UUID = "00000000-0000-0000-0000-000000000088";

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
    store.openForStream({
      streamId: "00000000-0000-4000-8000-000000000010",
      streamName: "engineering",
      existingMemberIds: [EXISTING_USER_UUID],
    });

    store.toggleSelected(NEW_USER_UUID);
    store.toggleSelected(EXISTING_USER_UUID);
    store.setQuery("bob");

    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(true);
    expect(nextState.query).toBe("bob");
    expect(nextState.selectedIds).toEqual([NEW_USER_UUID]);
  });

  it("submits selected users and closes dialog on success", async () => {
    vi.mocked(addStreamMembers).mockResolvedValue({
      ok: true,
      addedUserIds: [NEW_USER_UUID],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    const onSuccess = vi.fn();
    const store = useAddStreamMembersStore.getState();
    store.openForStream({
      streamId: STREAM_UUID_10,
      streamName: "engineering",
      existingMemberIds: [EXISTING_USER_UUID],
    });
    store.toggleSelected(NEW_USER_UUID);

    await store.submit({ onSuccess });

    expect(addStreamMembers).toHaveBeenCalledWith({
      streamUuid: STREAM_UUID_10,
      streamName: "engineering",
      userIds: [NEW_USER_UUID],
    });
    expect(onSuccess).toHaveBeenCalledWith(STREAM_UUID_10);
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
    store.openForStream({
      streamId: "00000000-0000-4000-8000-000000000010",
      streamName: "engineering",
      existingMemberIds: [],
    });
    store.toggleSelected(NEW_USER_UUID);

    await store.submit({});

    const nextState = useAddStreamMembersStore.getState();
    expect(nextState.open).toBe(true);
    expect(nextState.error).toBe("app.error");
    expect(nextState.submitting).toBe(false);
  });

  it("allows submitting current user id when selected", async () => {
    vi.mocked(addStreamMembers).mockResolvedValue({
      ok: true,
      addedUserIds: [NEW_USER_UUID],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    const store = useAddStreamMembersStore.getState();
    store.openForStream({
      streamId: "00000000-0000-4000-8000-000000000010",
      streamName: "engineering",
      existingMemberIds: [],
    });
    store.toggleSelected(NEW_USER_UUID);

    await store.submit({});

    expect(addStreamMembers).toHaveBeenCalledWith({
      streamUuid: STREAM_UUID_10,
      streamName: "engineering",
      userIds: [NEW_USER_UUID],
    });
  });
});
