import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import type * as ZulipClientInternal from "~/shared/api/zulip-client.internal";
import type * as ZulipMessagesApi from "~/shared/api/zulip-messages";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import type * as ZulipReadStateApi from "~/shared/api/zulip-read-state";
import type * as ZulipUploadApi from "~/shared/api/zulip-upload";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { ChatPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageMessageListSectionProps } from "./chat-page-message-list-section.types";

const captured = vi.hoisted(() => ({
  composerProps: null as ChatPageComposerSectionProps | null,
  messageListProps: null as ChatPageMessageListSectionProps | null,
}));

const zulipMocks = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  fetchMessageById: vi.fn(),
  getRealmBaseUrl: vi.fn(() => "https://zulip.example.com"),
  markDmAsRead: vi.fn(),
  markMessagesAsRead: vi.fn(),
  markTopicAsRead: vi.fn(),
  sendMessage: vi.fn(),
  updateMessage: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("~/shared/api/zulip-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipMessagesApi>();
  return {
    ...actual,
    deleteMessage: zulipMocks.deleteMessage,
    fetchMessageById: zulipMocks.fetchMessageById,
    sendMessage: zulipMocks.sendMessage,
    updateMessage: zulipMocks.updateMessage,
  };
});

vi.mock("~/shared/api/zulip-read-state", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipReadStateApi>();
  return {
    ...actual,
    markDmAsRead: zulipMocks.markDmAsRead,
    markMessagesAsRead: zulipMocks.markMessagesAsRead,
    markTopicAsRead: zulipMocks.markTopicAsRead,
  };
});

vi.mock("~/shared/api/zulip-client.internal", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipClientInternal>();
  return {
    ...actual,
    getRealmBaseUrl: zulipMocks.getRealmBaseUrl,
  };
});

vi.mock("~/shared/api/zulip-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipUploadApi>();
  return {
    ...actual,
    uploadFile: zulipMocks.uploadFile,
  };
});

vi.mock("~/shared/lib/shortcuts", () => ({
  useShortcut: vi.fn(),
}));

vi.mock("~/features/typing-indicator/composer-typing-controller.hook", () => ({
  useComposerTypingController: () => ({
    onComposerValueChange: vi.fn(),
    stopNow: vi.fn(),
  }),
}));

vi.mock("./chat-page-forward-hydration.hook", () => ({
  useChatForwardHydration: () => ({
    forwardMessages: [],
    setForwardMessages: vi.fn(),
    forwardSelectedText: null,
    setForwardSelectedText: vi.fn(),
  }),
}));

vi.mock("~/widgets/chat-view/chat-header.ui", () => ({
  ChatHeader: () => null,
}));

vi.mock("./chat-page-composer-section.ui", () => ({
  ChatPageComposerSection: (props: ChatPageComposerSectionProps) => {
    captured.composerProps = props;
    return null;
  },
}));

vi.mock("./chat-page-delete-confirm-bar.ui", () => ({
  ChatPageDeleteConfirmBar: () => null,
}));

vi.mock("./chat-page-floating-toast.ui", () => ({
  ChatPageFloatingToast: () => null,
}));

vi.mock("./chat-page-forward-modal.ui", () => ({
  ForwardMessageModalBody: () => null,
}));

vi.mock("./chat-page-inline-alerts.ui", () => ({
  ChatPageInlineAlerts: () => null,
}));

vi.mock("./chat-page-message-list-section.ui", () => ({
  ChatPageMessageListSection: (props: ChatPageMessageListSectionProps) => {
    captured.messageListProps = props;
    return null;
  },
}));

vi.mock("./chat-page-read-receipts-dialog.ui", () => ({
  ChatPageReadReceiptsDialog: () => null,
}));

vi.mock("./chat-page-selection-bar.ui", () => ({
  ChatPageSelectionBar: () => null,
}));

vi.mock("./chat-page-typing-line.ui", () => ({
  ChatPageTypingLine: () => null,
}));

const CURRENT_USER_ID = 7;
const STREAM_ID = 12;
const STREAM_NAME = "engineering";
const TOPIC = "события канала";
const MESSAGE_ID = 1988;

function streamTopicMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return createMessage({
    id: MESSAGE_ID,
    stream_id: STREAM_ID,
    display_recipient: STREAM_NAME,
    subject: TOPIC,
    sender_id: 42,
    flags: [],
    type: "stream",
    ...overrides,
  }) as MockMessage;
}

function renderTopicChat(): void {
  render(
    <MemoryRouter
      initialEntries={[`/stream/${STREAM_ID}-${STREAM_NAME}/topic/${encodeURIComponent(TOPIC)}`]}
    >
      <Routes>
        <Route path="/stream/:streamSlug/topic/:topicName" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSystemTopicChat(): void {
  render(
    <MemoryRouter initialEntries={[`/stream/${STREAM_ID}-${STREAM_NAME}/topic/__empty__`]}>
      <Routes>
        <Route path="/stream/:streamSlug/topic/:topicName" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChatPage mark-as-read batching", () => {
  const originalLoadInitialMessagesForContext =
    useCurrentChatMessagesStore.getState().loadInitialMessagesForContext;

  beforeEach(() => {
    captured.composerProps = null;
    captured.messageListProps = null;
    vi.mocked(markMessagesAsRead).mockResolvedValue(undefined);
    useChatListStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
  });

  afterEach(() => {
    useCurrentChatMessagesStore.setState({
      loadInitialMessagesForContext: originalLoadInitialMessagesForContext,
    });
    useCurrentChatMessagesStore.getState().setContext(null);
    useChatListStore.getState().clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("flushes visible unread ids even if messages refresh before debounce fires", async () => {
    const initialMessage = streamTopicMessage({ content: "created channel" });
    const refreshedMessage = streamTopicMessage({ content: "created channel refreshed" });
    const context: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_ID,
      streamName: STREAM_NAME,
      topic: TOPIC,
      streamWideView: false,
    };
    const loadInitialMessagesForContext = vi.fn(() => {
      useCurrentChatMessagesStore.setState({
        context,
        messages: [initialMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    useChatListStore.getState().setFromMessages([initialMessage], CURRENT_USER_ID);
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.id).toBe(MESSAGE_ID);
    });

    vi.useFakeTimers();
    act(() => {
      captured.messageListProps?.onUnreadMessagesVisible([MESSAGE_ID]);
    });
    expect(useCurrentChatMessagesStore.getState().messages[0]?.flags).toContain("read");
    expect(
      useChatListStore.getState().streamsMap.get(STREAM_ID)?.topics.get(TOPIC)?.unreadCount,
    ).toBe(0);

    act(() => {
      useCurrentChatMessagesStore.setState({ messages: [refreshedMessage] });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
  });

  it("treats /topic/__empty__ as an explicit topic view and keeps the composer enabled", async () => {
    const loadInitialMessagesForContext = vi.fn(() => Promise.resolve());

    useChatListStore.getState().setFromMessages(
      [
        streamTopicMessage({
          subject: "",
          content: "system general chat",
        }),
      ],
      CURRENT_USER_ID,
    );
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderSystemTopicChat();

    await waitFor(() => {
      expect(loadInitialMessagesForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            type: "stream",
            streamId: STREAM_ID,
            topic: "",
            streamWideView: false,
          }),
        }),
      );
    });
    expect(captured.composerProps?.activeTopic).toBe("");
    expect(captured.composerProps?.showTopicPrompt).toBe(false);
  });
});
