import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { createMessage } from "~/test/factories";
import { useChatPageInitialLoad } from "./chat-page-initial-load.hook";

const STREAM_ID = "00000000-0000-4000-8000-000000000010";
const STREAM_NAME = "general";
const TOPIC_UUID = "00000000-0000-4000-8000-0000000000d0";

function streamWideOptions(overrides: Partial<Parameters<typeof useChatPageInitialLoad>[0]> = {}) {
  return {
    streamSlug: STREAM_ID,
    topicName: undefined,
    dmIdParam: undefined,
    activeStreamCanonicalName: STREAM_NAME,
    resolvedStreamId: STREAM_ID,
    streamRouteTopic: "",
    activeTopicUuid: undefined,
    focusedMessageId: null,
    currentUserId: 7,
    isFocusedMessageLoadedInCurrentRoute: false,
    setActionError: vi.fn(),
    ...overrides,
  };
}

function streamTopicOptions(overrides: Partial<Parameters<typeof useChatPageInitialLoad>[0]> = {}) {
  return streamWideOptions({
    topicName: TOPIC_UUID,
    streamRouteTopic: "incident",
    activeTopicUuid: TOPIC_UUID,
    ...overrides,
  });
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
              stream_uuid: STREAM_ID,
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

  it("does not reload messages when server topic display name changes for the same topic UUID", async () => {
    loadSpy.mockImplementation(
      (
        options: Parameters<
          ReturnType<typeof useCurrentChatMessagesStore.getState>["loadInitialMessagesForContext"]
        >[0],
      ) => {
        options.onCacheHydrated?.();
        useCurrentChatMessagesStore.setState({
          context: options.context,
          messages: [
            {
              ...createMessage({
                id: 1,
                stream_uuid: STREAM_ID,
                subject: "incident",
                type: "stream",
              }),
              topic_uuid: TOPIC_UUID,
            },
          ],
        });
        return Promise.resolve();
      },
    );

    const initialOptions = streamTopicOptions({ setActionError });
    const { rerender, unmount } = renderHook(
      (props: { options: Parameters<typeof useChatPageInitialLoad>[0] }) =>
        useChatPageInitialLoad(props.options),
      { initialProps: { options: initialOptions } },
    );

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalled();
    });
    const callCountBeforeRename = loadSpy.mock.calls.length;

    rerender({
      options: streamTopicOptions({
        setActionError,
        streamRouteTopic: "postmortem",
      }),
    });

    await waitFor(() => {
      const context = useCurrentChatMessagesStore.getState().context;
      expect(context?.type).toBe("stream");
      if (context?.type === "stream") {
        expect(context.topic).toBe("postmortem");
        expect(context.topicUuid).toBe(TOPIC_UUID);
      }
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(loadSpy).toHaveBeenCalledTimes(callCountBeforeRename);
    expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
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

  it("updates stream display context without clearing messages when route location is unchanged", async () => {
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
          stream_uuid: STREAM_ID,
          subject: "bugs",
          type: "stream",
        }),
      ],
    });

    const setContextSpy = vi.spyOn(useCurrentChatMessagesStore.getState(), "setContext");

    const options = streamWideOptions({
      setActionError,
      activeStreamCanonicalName: "platform",
    });
    const { unmount } = renderHook(() => useChatPageInitialLoad(options));

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalled();
    });

    expect(setContextSpy).toHaveBeenCalledTimes(1);
    const context = useCurrentChatMessagesStore.getState().context;
    expect(context?.type).toBe("stream");
    if (context?.type === "stream") {
      expect(context.streamName).toBe("platform");
    }
    expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    unmount();
  });
});
