import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testMessageId } from "~/test/factories";
import { useChatPageReaction } from "./chat-page-reaction.hook";

const { ownReaction } = vi.hoisted(() => ({
  ownReaction: {
    uuid: "33333333-3333-4333-8333-333333333333",
    user_uuid: "44444444-4444-4444-8444-444444444444",
    message_uuid: "00000000-0000-4000-8000-000000000011",
    emoji_name: "thumbs_up",
  },
}));

vi.mock("~/shared/api/messenger-messages", () => ({
  addReaction: vi.fn().mockResolvedValue({ reaction: ownReaction, created: true }),
  fetchMessageReactions: vi.fn().mockResolvedValue([ownReaction]),
  removeReaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

import {
  addReaction,
  fetchMessageReactions,
  removeReaction,
} from "~/shared/api/messenger-messages";

const payload = {
  emojiName: "thumbs_up",
};

const CURRENT_USER_UUID = "44444444-4444-4444-8444-444444444444";

describe("useChatPageReaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addReaction).mockResolvedValue({ reaction: ownReaction, created: true });
    vi.mocked(fetchMessageReactions).mockResolvedValue([ownReaction]);
    vi.mocked(removeReaction).mockResolvedValue(undefined);
  });

  it("adds reaction via API and waits for the server event snapshot", async () => {
    const setActionError = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: CURRENT_USER_UUID,
        setActionError,
      }),
    );

    act(() => {
      result.current.onMessageAddReaction(testMessageId(10), payload);
    });

    await waitFor(() => {
      expect(addReaction).toHaveBeenCalledWith(testMessageId(10), "thumbs_up", {
        currentUserUuid: CURRENT_USER_UUID,
      });
    });
    expect(setActionError).toHaveBeenCalledWith(null);
  });

  it("does not patch aggregate counters when backend reports an existing reaction", async () => {
    vi.mocked(addReaction).mockResolvedValueOnce({ reaction: ownReaction, created: false });
    const setActionError = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: CURRENT_USER_UUID,
        setActionError,
      }),
    );

    act(() => {
      result.current.onMessageAddReaction(testMessageId(10), payload);
    });

    await waitFor(() => {
      expect(addReaction).toHaveBeenCalledWith(testMessageId(10), "thumbs_up", {
        currentUserUuid: CURRENT_USER_UUID,
      });
    });
  });

  it("fetches own reaction uuid and removes it via API without patching aggregate counters", async () => {
    const setActionError = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: CURRENT_USER_UUID,
        setActionError,
      }),
    );

    act(() => {
      result.current.onMessageRemoveReaction(testMessageId(11), payload);
    });

    await waitFor(() => {
      expect(fetchMessageReactions).toHaveBeenCalledWith(testMessageId(11), {
        userUuid: CURRENT_USER_UUID,
      });
      expect(removeReaction).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
    });
  });

  it("sets action error when addReaction fails", async () => {
    vi.mocked(addReaction).mockRejectedValueOnce(new Error("forbidden"));
    const setActionError = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: CURRENT_USER_UUID,
        setActionError,
      }),
    );

    act(() => {
      result.current.onMessageAddReaction("00000000-0000-4000-8000-000000000012", payload);
    });

    await waitFor(() => {
      expect(setActionError).toHaveBeenCalledWith("forbidden");
    });
  });
});
