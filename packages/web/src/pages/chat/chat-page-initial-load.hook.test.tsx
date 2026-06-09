import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { createMessage } from "~/test/factories";
import { useChatPageInitialLoad } from "./chat-page-initial-load.hook";

const STREAM_ID = 10;
const STREAM_NAME = "general";

function streamWideOptions(overrides: Partial<Parameters<typeof useChatPageInitialLoad>[0]> = {}) {
  return {
    streamSlug: `${STREAM_ID}-${STREAM_NAME}`,
    topicName: undefined,
    dmIdParam: undefined,
    activeStreamCanonicalName: STREAM_NAME,
    resolvedStreamId: STREAM_ID,
    streamRouteTopic: "",
    focusedMessageId: null,
    currentUserId: 7,
    isFocusedMessageLoadedInCurrentRoute: false,
    setActionError: vi.fn(),
    ...overrides,
  };
}

describe("useChatPageInitialLoad", () => {
  const setActionError = vi.fn();
  let loadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActionError.mockReset();
    useCurrentChatMessagesStore.getState().setContext(null);
    loadSpy = vi.spyOn(useCurrentChatMessagesStore.getState(), "loadInitialMessagesForContext");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not reload stream-wide when pagination flags oscillate after cache hydrate and API", async () => {
    loadSpy.mockImplementation(
      (
        options: Parameters<
          ReturnType<typeof useCurrentChatMessagesStore.getState>["loadInitialMessagesForContext"]
        >[0],
      ) => {
        options.onCacheHydrated?.();
        useCurrentChatMessagesStore.setState({
          hasOlderMessages: false,
          hasNewerMessages: false,
          messages: [
            createMessage({
              id: 1,
              stream_id: STREAM_ID,
              subject: "bugs",
              type: "stream",
            }),
          ],
        });
        useCurrentChatMessagesStore.setState({
          hasOlderMessages: true,
          hasNewerMessages: false,
        });
        return Promise.resolve();
      },
    );

    const options = streamWideOptions({ setActionError });
    const { unmount } = renderHook(() => useChatPageInitialLoad(options));

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalled();
    });

    const callCountAfterInitialLoad = loadSpy.mock.calls.length;

    useCurrentChatMessagesStore.setState({ hasOlderMessages: false, hasNewerMessages: false });
    useCurrentChatMessagesStore.setState({ hasOlderMessages: true, hasNewerMessages: false });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 50);
    });
    expect(loadSpy.mock.calls.length).toBe(callCountAfterInitialLoad);
    unmount();
  });
});

describe("useChatPageInitialLoad setContext guard", () => {
  const setActionError = vi.fn();
  let loadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActionError.mockReset();
    loadSpy = vi
      .spyOn(useCurrentChatMessagesStore.getState(), "loadInitialMessagesForContext")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useCurrentChatMessagesStore.getState().setContext(null);
  });

  it("does not call setContext again when stream-wide route context is unchanged", async () => {
    const streamWideContext: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_ID,
      streamName: STREAM_NAME,
      topic: "",
      streamWideView: true,
    };
    useCurrentChatMessagesStore.setState({
      context: streamWideContext,
      messages: [
        createMessage({
          id: 42,
          stream_id: STREAM_ID,
          subject: "bugs",
          type: "stream",
        }),
      ],
    });

    const setContextSpy = vi.spyOn(useCurrentChatMessagesStore.getState(), "setContext");

    const options = streamWideOptions({ setActionError });
    const { unmount } = renderHook(() => useChatPageInitialLoad(options));

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalled();
    });

    expect(setContextSpy).not.toHaveBeenCalled();
    expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    unmount();
  });
});
