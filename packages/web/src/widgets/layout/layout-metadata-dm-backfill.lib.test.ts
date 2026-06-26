import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMetadataDmBackfillLoop } from "./layout-metadata-dm-backfill.lib";

const addMessagesMock = vi.hoisted(() => vi.fn());
const mergeFromMessageMock = vi.hoisted(() => vi.fn());
const fetchDirectMessagesPageMock = vi.hoisted(() => vi.fn());
const upsertDmIndexFromMessagesMock = vi.hoisted(() => vi.fn());
const isActiveOrgRequestInvalidatedMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 7,
      dmsMap: new Map(),
      addMessages: addMessagesMock,
    }),
  },
}));

vi.mock("~/entities/user/user.model", () => ({
  useUsersStore: {
    getState: () => ({
      mergeFromMessage: mergeFromMessageMock,
    }),
  },
}));

vi.mock("~/shared/api/zulip-sidebar-preview.lib", () => ({
  fetchDirectMessagesPage: fetchDirectMessagesPageMock,
}));

vi.mock("~/shared/lib/dm-index", () => ({
  upsertDmIndexFromMessages: upsertDmIndexFromMessagesMock,
}));

vi.mock("~/entities/instance/instance.model", () => ({
  isActiveOrgRequestInvalidated: isActiveOrgRequestInvalidatedMock,
}));

describe("runMetadataDmBackfillLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isActiveOrgRequestInvalidatedMock.mockReturnValue(false);
    fetchDirectMessagesPageMock.mockResolvedValue({
      foundOldest: true,
      messages: [
        {
          id: 42,
          sender_id: 20,
          type: "private",
          content: "dm",
          timestamp: 1,
          display_recipient: [],
        },
      ],
    });
  });

  it("skips store and index writes when active org becomes stale after fetch", async () => {
    const controller = new AbortController();
    isActiveOrgRequestInvalidatedMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    await runMetadataDmBackfillLoop({
      instanceId: "inst-1",
      initialUserId: 7,
      maxBatches: 1,
      pageSize: 100,
      stagnationLimit: 1,
      orgContext: { instanceId: "inst-1", epoch: 1 },
      signal: controller.signal,
      isCancelled: () => false,
    });

    expect(fetchDirectMessagesPageMock).toHaveBeenCalledWith("newest", 100, controller.signal);
    expect(addMessagesMock).not.toHaveBeenCalled();
    expect(upsertDmIndexFromMessagesMock).not.toHaveBeenCalled();
    expect(mergeFromMessageMock).not.toHaveBeenCalled();
  });
});
