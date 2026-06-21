import { describe, expect, it, vi } from "vitest";
import { refreshActiveChatMessagesFromApi } from "./layout-active-chat-refresh.lib";

const loadInitialMessagesForContextMock = vi.fn();

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 42,
    }),
  },
}));

const streamContext = {
  type: "stream" as const,
  streamId: 10,
  streamName: "general",
  topic: "hello",
};

vi.mock("~/entities/message/message.model", () => ({
  useCurrentChatMessagesStore: {
    getState: () => ({
      context: streamContext,
      loadInitialMessagesForContext: (...args: unknown[]) =>
        loadInitialMessagesForContextMock(...args),
    }),
  },
}));

describe("refreshActiveChatMessagesFromApi", () => {
  it("reloads the open chat context from the API", () => {
    loadInitialMessagesForContextMock.mockResolvedValue(undefined);

    refreshActiveChatMessagesFromApi({ focusedMessageId: "00000000-0000-4000-8000-000000000077" });

    expect(loadInitialMessagesForContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: streamContext,
        focusedMessageId: "00000000-0000-4000-8000-000000000077",
        currentUserId: 42,
        onStreamMessagesApplied: expect.any(Function),
        onDmMessagesApplied: expect.any(Function),
      }),
    );
  });
});
