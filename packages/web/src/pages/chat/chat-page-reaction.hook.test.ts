import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPageReaction } from "./chat-page-reaction.hook";

vi.mock("~/shared/api/zulip-messages", () => ({
  addReaction: vi.fn().mockResolvedValue(undefined),
  removeReaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

import { addReaction, removeReaction } from "~/shared/api/zulip-messages";

const payload = {
  emojiName: "thumbs_up",
  reactionType: "unicode_emoji" as const,
  emojiCode: "1f44d",
};

describe("useChatPageReaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addReaction).mockResolvedValue(undefined);
    vi.mocked(removeReaction).mockResolvedValue(undefined);
  });

  it("adds reaction via API and updates store", async () => {
    const setActionError = vi.fn();
    const updateMessageReactionInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: 5,
        setActionError,
        updateMessageReactionInStore,
      }),
    );

    act(() => {
      result.current.onMessageAddReaction(10, payload);
    });

    await waitFor(() => {
      expect(addReaction).toHaveBeenCalledWith(10, "thumbs_up", {
        reactionType: "unicode_emoji",
        emojiCode: "1f44d",
      });
      expect(updateMessageReactionInStore).toHaveBeenCalledWith(
        10,
        {
          emoji_name: "thumbs_up",
          emoji_code: "1f44d",
          reaction_type: "unicode_emoji",
          user_id: 5,
        },
        "add",
      );
    });
    expect(setActionError).toHaveBeenCalledWith(null);
  });

  it("removes reaction via API and updates store", async () => {
    const setActionError = vi.fn();
    const updateMessageReactionInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: 5,
        setActionError,
        updateMessageReactionInStore,
      }),
    );

    act(() => {
      result.current.onMessageRemoveReaction(11, payload);
    });

    await waitFor(() => {
      expect(removeReaction).toHaveBeenCalledWith(11, "thumbs_up", {
        reactionType: "unicode_emoji",
        emojiCode: "1f44d",
      });
      expect(updateMessageReactionInStore).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ user_id: 5 }),
        "remove",
      );
    });
  });

  it("sets action error when addReaction fails", async () => {
    vi.mocked(addReaction).mockRejectedValueOnce(new Error("forbidden"));
    const setActionError = vi.fn();
    const { result } = renderHook(() =>
      useChatPageReaction({
        currentUserId: 1,
        setActionError,
        updateMessageReactionInStore: vi.fn(),
      }),
    );

    act(() => {
      result.current.onMessageAddReaction(12, payload);
    });

    await waitFor(() => {
      expect(setActionError).toHaveBeenCalledWith("forbidden");
    });
  });
});
