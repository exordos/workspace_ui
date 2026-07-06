// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { FloatingLoadingOverlayProps } from "~/shared/ui/floating-loading-overlay.types";
import type { WorkspaceMessageListProps } from "~/widgets/workspace-message-list/workspace-message-list.types";
import { ChatPageWorkspaceMessageListSection } from "./chat-page-workspace-message-list-section.ui";

const captured = vi.hoisted(() => ({
  workspaceMessageListProps: null as WorkspaceMessageListProps | null,
  floatingLoadingOverlayProps: null as FloatingLoadingOverlayProps | null,
}));

vi.mock("~/widgets/workspace-message-list/workspace-message-list.ui", () => ({
  WorkspaceMessageList: (props: WorkspaceMessageListProps) => {
    captured.workspaceMessageListProps = props;
    return (
      <div data-testid="workspace-message-list">
        {props.messages.map((message) => (
          <article key={message.uuid} data-message-uuid={message.uuid}>
            {message.markdown}
          </article>
        ))}
      </div>
    );
  },
}));

vi.mock("~/shared/ui/floating-loading-overlay", () => ({
  FloatingLoadingOverlay: (props: FloatingLoadingOverlayProps) => {
    captured.floatingLoadingOverlayProps = props;
    return props.visible ? <div data-testid="floating-loading-overlay" /> : null;
  },
}));

function createWorkspaceMessage(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: "message-uuid-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "author-uuid-1",
    userUuid: "author-uuid-1",
    markdown: "Workspace text",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...overrides,
  };
}

describe("ChatPageWorkspaceMessageListSection", () => {
  it("passes Workspace messages to WorkspaceMessageList without legacy message shape", () => {
    const message = createWorkspaceMessage({
      uuid: "workspace-message-uuid",
      markdown: "Direct Workspace body",
    });

    render(
      <ChatPageWorkspaceMessageListSection
        messagesLoading={false}
        hasInitialPayload
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        scrollToBottomKey="topic:stream-uuid-1:topic-uuid-1"
        onLoadOlder={vi.fn()}
        isLoadingOlder={false}
        isLoadingNewer={false}
        onLoadNewer={vi.fn()}
        hasOlderMessages={false}
        hasNewerMessages={false}
        firstUnreadUuid="workspace-message-uuid"
        unreadCount={1}
        focusedMessageUuid={null}
        onUnreadMessagesVisible={vi.fn()}
        onUnreadMessagesAtBottom={vi.fn()}
        messagesLoadError={null}
        onRetryMessagesLoad={vi.fn()}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={vi.fn()}
        scrollToBottomAfterSendNonce={0}
      />,
    );

    expect(screen.getByTestId("workspace-message-list")).toBeInTheDocument();
    expect(screen.getByText("Direct Workspace body")).toBeInTheDocument();
    expect(captured.workspaceMessageListProps?.messages[0]).toBe(message);
    expect(captured.workspaceMessageListProps?.messages[0]).not.toHaveProperty("id");
    expect(captured.workspaceMessageListProps?.messages[0]).not.toHaveProperty("content");
    expect(captured.workspaceMessageListProps?.firstUnreadUuid).toBe("workspace-message-uuid");
    expect(captured.workspaceMessageListProps?.currentUserUuid).toBe("current-user-uuid");
  });

  it("forwards scroll, pagination, and unread callbacks to the Workspace list", () => {
    const onLoadOlder = vi.fn();
    const onLoadNewer = vi.fn();
    const onUnreadMessagesVisible = vi.fn();
    const onUnreadMessagesAtBottom = vi.fn();
    const resolveAuthorLabel = vi.fn(() => "Bob Reed");
    const resolveMention = vi.fn(() => ({ userUuid: "mention-user-uuid" }));

    render(
      <ChatPageWorkspaceMessageListSection
        messagesLoading={false}
        hasInitialPayload
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-props-message-uuid",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        scrollToBottomKey="scroll-key"
        onLoadOlder={onLoadOlder}
        isLoadingOlder={true}
        isLoadingNewer={true}
        onLoadNewer={onLoadNewer}
        hasOlderMessages={true}
        hasNewerMessages={true}
        firstUnreadUuid="workspace-props-message-uuid"
        unreadCount={3}
        focusedMessageUuid="focused-message-uuid"
        onUnreadMessagesVisible={onUnreadMessagesVisible}
        onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
        messagesLoadError={null}
        onRetryMessagesLoad={vi.fn()}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={vi.fn()}
        scrollToBottomAfterSendNonce={7}
        resolveAuthorLabel={resolveAuthorLabel}
        resolveMention={resolveMention}
      />,
    );

    expect(captured.workspaceMessageListProps).toMatchObject({
      scrollToBottomKey: "scroll-key",
      isLoadingOlder: true,
      isLoadingNewer: true,
      hasOlderMessages: true,
      hasNewerMessages: true,
      firstUnreadUuid: "workspace-props-message-uuid",
      unreadCount: 3,
      focusedMessageUuid: "focused-message-uuid",
      scrollToBottomAfterSendNonce: 7,
    });
    expect(captured.workspaceMessageListProps?.onLoadOlder).toBe(onLoadOlder);
    expect(captured.workspaceMessageListProps?.onLoadNewer).toBe(onLoadNewer);
    expect(captured.workspaceMessageListProps?.onUnreadMessagesVisible).toBe(
      onUnreadMessagesVisible,
    );
    expect(captured.workspaceMessageListProps?.onUnreadMessagesAtBottom).toBe(
      onUnreadMessagesAtBottom,
    );
    expect(captured.workspaceMessageListProps?.resolveAuthorLabel).toBe(resolveAuthorLabel);
    expect(captured.workspaceMessageListProps?.resolveMention).toBe(resolveMention);
  });

  it("forwards Workspace message menu actions to the Workspace list", () => {
    const onReplyMessage = vi.fn();
    const onEditMessage = vi.fn();
    const onRequestDeleteMessage = vi.fn();
    const onCopyMessageText = vi.fn();
    const onToggleMessageReaction = vi.fn();
    const onDownloadFile = vi.fn();
    const onOpenUnsupportedFilePreview = vi.fn();

    render(
      <ChatPageWorkspaceMessageListSection
        messagesLoading={false}
        hasInitialPayload
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-menu-action-message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        scrollToBottomKey="scroll-key"
        onLoadOlder={vi.fn()}
        isLoadingOlder={false}
        isLoadingNewer={false}
        onLoadNewer={vi.fn()}
        hasOlderMessages={false}
        hasNewerMessages={false}
        firstUnreadUuid={undefined}
        unreadCount={0}
        focusedMessageUuid={null}
        onUnreadMessagesVisible={vi.fn()}
        onUnreadMessagesAtBottom={vi.fn()}
        onReplyMessage={onReplyMessage}
        onEditMessage={onEditMessage}
        onRequestDeleteMessage={onRequestDeleteMessage}
        onCopyMessageText={onCopyMessageText}
        onToggleMessageReaction={onToggleMessageReaction}
        onDownloadFile={onDownloadFile}
        onOpenUnsupportedFilePreview={onOpenUnsupportedFilePreview}
        messagesLoadError={null}
        onRetryMessagesLoad={vi.fn()}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={vi.fn()}
        scrollToBottomAfterSendNonce={0}
      />,
    );

    expect(captured.workspaceMessageListProps?.actions?.onReplyMessage).toBe(onReplyMessage);
    expect(captured.workspaceMessageListProps?.actions?.onEditMessage).toBe(onEditMessage);
    expect(captured.workspaceMessageListProps?.actions?.onRequestDeleteMessage).toBe(
      onRequestDeleteMessage,
    );
    expect(captured.workspaceMessageListProps?.actions?.onCopyMessageText).toBe(onCopyMessageText);
    expect(captured.workspaceMessageListProps?.actions?.onToggleMessageReaction).toBe(
      onToggleMessageReaction,
    );
    expect(captured.workspaceMessageListProps?.actions?.onDownloadFile).toBe(onDownloadFile);
    expect(captured.workspaceMessageListProps?.actions?.onOpenUnsupportedFilePreview).toBe(
      onOpenUnsupportedFilePreview,
    );
  });

  it("keeps the background loading bubble at the top-left edge", () => {
    render(
      <ChatPageWorkspaceMessageListSection
        messagesLoading={false}
        hasInitialPayload
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-background-loading-message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        scrollToBottomKey="scroll-key"
        onLoadOlder={vi.fn()}
        isLoadingOlder={true}
        isLoadingNewer={false}
        onLoadNewer={vi.fn()}
        hasOlderMessages={true}
        hasNewerMessages={false}
        firstUnreadUuid={undefined}
        unreadCount={0}
        focusedMessageUuid={null}
        onUnreadMessagesVisible={vi.fn()}
        onUnreadMessagesAtBottom={vi.fn()}
        messagesLoadError={null}
        onRetryMessagesLoad={vi.fn()}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={vi.fn()}
        scrollToBottomAfterSendNonce={0}
      />,
    );

    expect(screen.getByTestId("floating-loading-overlay")).toBeInTheDocument();
    expect(captured.floatingLoadingOverlayProps).toMatchObject({
      visible: true,
      position: "top-left",
    });
  });
});
