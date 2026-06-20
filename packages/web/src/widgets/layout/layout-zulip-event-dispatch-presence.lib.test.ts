import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { handleUserStatus } from "./layout-zulip-event-dispatch-presence.lib";

const getCurrentInstanceMock = vi.hoisted(() => vi.fn());
const putUserStatusCacheRowMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: getCurrentInstanceMock,
}));

vi.mock("~/shared/lib/user-status-cache-db", () => ({
  putUserStatusCacheRow: putUserStatusCacheRowMock,
}));

describe("handleUserStatus", () => {
  beforeEach(() => {
    useUsersStore.getState().clear();
    putUserStatusCacheRowMock.mockClear();
    getCurrentInstanceMock.mockReset();
    getCurrentInstanceMock.mockReturnValue({ id: "instance-1" });
  });

  it("updates store and cache from realtime user_status event", () => {
    useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob" });

    handleUserStatus(
      {
        id: 1,
        type: "user_status",
        user_id: 20,
        status_text: "Deep work",
        emoji_name: "speech_balloon",
        emoji_code: "1f4ac",
        reaction_type: "unicode_emoji",
        away: true,
      },
      {} as never,
    );

    expect(useUsersStore.getState().getUser(20)?.status).toEqual({
      text: "Deep work",
      emojiName: "speech_balloon",
      emojiCode: "1f4ac",
      reactionType: "unicode_emoji",
      away: true,
    });
    expect(putUserStatusCacheRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "instance-1",
        userId: 20,
        status: {
          text: "Deep work",
          emojiName: "speech_balloon",
          emojiCode: "1f4ac",
          reactionType: "unicode_emoji",
          away: true,
        },
      }),
    );
  });

  it("clears status from store and cache when realtime event removes it", () => {
    useUsersStore.getState().mergeUser({ user_id: 21, full_name: "Alice" });
    useUsersStore.getState().setStatus(21, { text: "Old", away: false }, 100);

    handleUserStatus(
      {
        id: 2,
        type: "user_status",
        user_id: 21,
        status_text: "",
        emoji_name: "",
        away: false,
      },
      {} as never,
    );

    expect(useUsersStore.getState().getUser(21)?.status).toBeUndefined();
    expect(putUserStatusCacheRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "instance-1",
        userId: 21,
        status: null,
      }),
    );
  });
});
