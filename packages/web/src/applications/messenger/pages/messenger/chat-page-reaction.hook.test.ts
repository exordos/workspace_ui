import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPageReaction } from "./chat-page-reaction.hook";

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

const payload = {
  emojiName: "thumbs_up",
  reactionType: "unicode_emoji" as const,
  emojiCode: "1f44d",
};

describe("useChatPageReaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports unsupported error for legacy add reaction without optimistic update", () => {
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

    expect(setActionError).toHaveBeenCalledWith("message.reactionError");
    expect(updateMessageReactionInStore).not.toHaveBeenCalled();
  });

  it("reports unsupported error for legacy remove reaction without optimistic update", () => {
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

    expect(setActionError).toHaveBeenCalledWith("message.reactionError");
    expect(updateMessageReactionInStore).not.toHaveBeenCalled();
  });
});
