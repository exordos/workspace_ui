import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { useUsersStore } from "~/entities/user/user.model";
import type * as ZulipClientInternal from "~/shared/api/zulip-client.internal";
import type * as ZulipMessagesApi from "~/shared/api/zulip-messages";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import type * as ZulipReadStateApi from "~/shared/api/zulip-read-state";
import type * as ZulipUploadApi from "~/shared/api/zulip-upload";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { ChatPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageInlineAlertsProps } from "./chat-page-inline-alerts.types";
import type { ChatPageMessageListSectionProps } from "./chat-page-message-list-section.types";

const captured = vi.hoisted(() => ({
  composerProps: null as ChatPageComposerSectionProps | null,
  inlineAlertsProps: null as ChatPageInlineAlertsProps | null,
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
  ChatPageInlineAlerts: (props: ChatPageInlineAlertsProps) => {
    captured.inlineAlertsProps = props;
    return null;
  },
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
  return {
    ...createMessage({
      id: MESSAGE_ID,
      stream_id: STREAM_ID,
      display_recipient: STREAM_NAME,
      subject: TOPIC,
      sender_id: 42,
      flags: [],
      type: "stream",
    }),
    ...overrides,
  };
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
    captured.inlineAlertsProps = null;
    captured.messageListProps = null;
    vi.mocked(markMessagesAsRead).mockResolvedValue(undefined);
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
  });

  afterEach(() => {
    useCurrentChatMessagesStore.setState({
      loadInitialMessagesForContext: originalLoadInitialMessagesForContext,
    });
    useCurrentChatMessagesStore.getState().setContext(null);
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    vi.restoreAllMocks();
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

  it("does not open editor from message menu when client policy says edit expired", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredMessage = streamTopicMessage({
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds - 61,
      markdown_source: "typo",
    });
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
        messages: [expiredMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    useChatListStore.getState().setFromMessages([expiredMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.id).toBe(MESSAGE_ID);
    });

    act(() => {
      captured.messageListProps?.callbacks.onMessageEdit?.(expiredMessage);
    });

    expect(zulipMocks.fetchMessageById).not.toHaveBeenCalled();
    expect(captured.composerProps?.editSession).toBeNull();
    await waitFor(() => {
      expect(captured.inlineAlertsProps?.actionError).toBe("This message can no longer be edited");
    });
  });

  it("opens the last editable own message from composer ArrowUp", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const editableOwnMessage = streamTopicMessage({
      id: 1000,
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds - 50,
      markdown_source: "older typo",
    });
    const otherUserMessage = streamTopicMessage({
      id: 2000,
      sender_id: 42,
      timestamp: nowSeconds - 30,
    });
    const expiredOwnMessage = streamTopicMessage({
      id: 3000,
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds - 61,
      markdown_source: "newer typo",
    });
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
        messages: [editableOwnMessage, otherUserMessage, expiredOwnMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    useChatListStore
      .getState()
      .setFromMessages([editableOwnMessage, otherUserMessage, expiredOwnMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.composerProps?.onEditLastMessage).toBeDefined();
    });

    act(() => {
      captured.composerProps?.onEditLastMessage();
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toEqual({
        messageId: 1000,
        initialMarkdown: "older typo",
      });
    });
  });

  it("does not call updateMessage when edit expires before saving", async () => {
    const nowSeconds = 1_781_620_000;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(nowSeconds * 1000);
    const editableMessage = streamTopicMessage({
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds - 10,
      markdown_source: "typo",
    });
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
        messages: [editableMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    useChatListStore.getState().setFromMessages([editableMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.id).toBe(MESSAGE_ID);
    });

    act(() => {
      captured.messageListProps?.callbacks.onMessageEdit?.(editableMessage);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toEqual({
        messageId: MESSAGE_ID,
        initialMarkdown: "typo",
      });
    });

    dateNow.mockReturnValue((nowSeconds + 61) * 1000);

    await expect(captured.composerProps?.onSubmitEdit(MESSAGE_ID, "fixed")).rejects.toThrow(
      "This message can no longer be edited",
    );
    expect(zulipMocks.updateMessage).not.toHaveBeenCalled();
    expect(captured.composerProps?.editSession).toEqual({
      messageId: MESSAGE_ID,
      initialMarkdown: "typo",
    });
    await waitFor(() => {
      expect(captured.inlineAlertsProps?.actionError).toBe("This message can no longer be edited");
    });
  });

  it("keeps server edit errors visible when client policy still allows saving", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const editableMessage = streamTopicMessage({
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds,
      markdown_source: "typo",
    });
    const context: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_ID,
      streamName: STREAM_NAME,
      topic: TOPIC,
      streamWideView: false,
    };
    const serverError = new Error("Server says edit is closed");
    const loadInitialMessagesForContext = vi.fn(() => {
      useCurrentChatMessagesStore.setState({
        context,
        messages: [editableMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    zulipMocks.updateMessage.mockRejectedValue(serverError);
    useChatListStore.getState().setFromMessages([editableMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.id).toBe(MESSAGE_ID);
    });

    await expect(captured.composerProps?.onSubmitEdit(MESSAGE_ID, "fixed")).rejects.toThrow(
      serverError,
    );
    expect(zulipMocks.updateMessage).toHaveBeenCalledWith(MESSAGE_ID, { content: "fixed" });
    await waitFor(() => {
      expect(captured.inlineAlertsProps?.actionError).toBe("Server says edit is closed");
    });
    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]).toEqual(
        expect.objectContaining({
          content: "fixed",
          edit_status: "failed",
          pending_edit_markdown: "fixed",
          edit_error: "Server says edit is closed",
        }),
      );
    });
  });

  it("optimistically edits message content and clears edit state after server confirmation", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const editableMessage = streamTopicMessage({
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds,
      content: "typo",
      markdown_source: "typo",
    });
    const context: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_ID,
      streamName: STREAM_NAME,
      topic: TOPIC,
      streamWideView: false,
    };
    const updateDeferred = Promise.withResolvers<void>();
    const loadInitialMessagesForContext = vi.fn(() => {
      useCurrentChatMessagesStore.setState({
        context,
        messages: [editableMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });

    zulipMocks.updateMessage.mockReturnValue(updateDeferred.promise);
    zulipMocks.fetchMessageById.mockResolvedValue({
      ...editableMessage,
      content: "<p>fixed</p>",
      markdown_source: "fixed",
    });
    useChatListStore.getState().setFromMessages([editableMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.composerProps?.onSubmitEdit).toBeDefined();
    });

    const submitPromise = captured.composerProps!.onSubmitEdit(
      MESSAGE_ID,
      "fixed",
    ) as Promise<void>;

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toBeNull();
      expect(captured.messageListProps?.messages[0]).toEqual(
        expect.objectContaining({
          content: "fixed",
          markdown_source: "fixed",
          edit_status: "saving",
          pending_edit_markdown: "fixed",
        }),
      );
    });

    await act(async () => {
      updateDeferred.resolve();
      await submitPromise;
    });

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]).toEqual(
        expect.objectContaining({
          content: "<p>fixed</p>",
          markdown_source: "fixed",
        }),
      );
      expect(captured.messageListProps?.messages[0]?.edit_status).toBeUndefined();
      expect(captured.messageListProps?.messages[0]?.pending_edit_markdown).toBeUndefined();
    });
  });

  it("retries and cancels failed optimistic message edits from message callbacks", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const editableMessage = streamTopicMessage({
      sender_id: CURRENT_USER_ID,
      timestamp: nowSeconds,
      content: "typo",
      markdown_source: "typo",
    });
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
        messages: [editableMessage],
        hasOlderMessages: false,
        hasNewerMessages: false,
        boundaryLoadFailed: false,
      });
      return Promise.resolve();
    });
    const serverError = new Error("Server says edit is closed");

    zulipMocks.updateMessage.mockRejectedValueOnce(serverError);
    zulipMocks.updateMessage.mockResolvedValueOnce(undefined);
    zulipMocks.fetchMessageById.mockResolvedValue({
      ...editableMessage,
      content: "<p>fixed</p>",
      markdown_source: "fixed",
    });
    useChatListStore.getState().setFromMessages([editableMessage], CURRENT_USER_ID);
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    });
    useCurrentChatMessagesStore.setState({ loadInitialMessagesForContext });

    renderTopicChat();

    await waitFor(() => {
      expect(captured.composerProps?.onSubmitEdit).toBeDefined();
    });

    await expect(captured.composerProps?.onSubmitEdit(MESSAGE_ID, "fixed")).rejects.toThrow(
      serverError,
    );

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.edit_status).toBe("failed");
    });

    act(() => {
      captured.messageListProps?.callbacks.onRetryFailedEdit?.(
        captured.messageListProps.messages[0]!,
      );
    });

    await waitFor(() => {
      expect(zulipMocks.updateMessage).toHaveBeenCalledTimes(2);
      expect(captured.messageListProps?.messages[0]?.edit_status).toBeUndefined();
      expect(captured.messageListProps?.messages[0]?.content).toBe("<p>fixed</p>");
    });

    useCurrentChatMessagesStore.getState().applyOptimisticMessageEdit(MESSAGE_ID, "again");
    useCurrentChatMessagesStore.getState().failOptimisticMessageEdit(MESSAGE_ID, "no");

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]?.edit_status).toBe("failed");
    });

    act(() => {
      captured.messageListProps?.callbacks.onCancelFailedEdit?.(
        captured.messageListProps.messages[0]!,
      );
    });

    await waitFor(() => {
      expect(captured.messageListProps?.messages[0]).toEqual(
        expect.objectContaining({
          content: "<p>fixed</p>",
          markdown_source: "fixed",
        }),
      );
      expect(captured.messageListProps?.messages[0]?.edit_status).toBeUndefined();
    });
  });
});
