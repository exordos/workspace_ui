import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { createMessage } from "~/test/factories";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";

const noop = () => {};

const baseProps = {
  messagesLoading: false,
  hasInitialPayload: true,
  isDmView: false,
  activeDmUserIds: null as number[] | null,
  activeStreamId: "00000000-0000-4000-8000-000000000010",
  activeStream: "general",
  activeTopicUuid: "00000000-0000-4000-8000-0000000000d0",
  activeTopic: "topic",
  currentUserId: 1,
  callbacks: {},
  selectionMode: false,
  selectedMessageIds: new Set<MessageId>(),
  onLoadMore: noop,
  isLoadingMore: false,
  isLoadingNewer: false,
  onLoadNewer: noop,
  hasNewerMessages: false,
  firstUnreadId: undefined as MessageId | undefined,
  unreadCount: 0,
  focusedMessageId: null as MessageId | null | undefined,
  onUnreadMessagesVisible: noop as (ids: MessageId[]) => void,
  onUnreadMessagesAtBottom: noop as (ids: MessageId[]) => void,
  messagesLoadError: null as "initial" | "refresh" | null,
  onRetryMessagesLoad: noop,
  boundaryLoadFailed: false,
  onDismissBoundaryLoadFailed: noop,
  scrollToBottomAfterSendNonce: 0,
};

describe("ChatPageMessageListSection", () => {
  it("shows initial load error card with retry when messages failed and list is empty", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ChatPageMessageListSection
        {...baseProps}
        messages={[]}
        hasInitialPayload
        messagesLoadError="initial"
        onRetryMessagesLoad={onRetry}
      />,
    );
    expect(screen.getByText(t("chat.messagesLoadError"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("chat.retryLoadMessages") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows initial load error card when stale messages remain from previous chat", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const msg = createMessage({ id: 1 }) as MockMessage;
    render(
      <ChatPageMessageListSection
        {...baseProps}
        messages={[msg]}
        hasInitialPayload
        messagesLoadError="initial"
        onRetryMessagesLoad={onRetry}
      />,
    );
    expect(screen.getByText(t("chat.messagesLoadError"))).toBeInTheDocument();
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("chat.retryLoadMessages") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows refresh error banner above list when cache existed but refresh failed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const msg = createMessage({ id: 1 }) as MockMessage;
    render(
      <ChatPageMessageListSection
        {...baseProps}
        messages={[msg]}
        messagesLoadError="refresh"
        onRetryMessagesLoad={onRetry}
      />,
    );
    expect(screen.getByText(t("chat.messagesRefreshError"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("chat.retryLoadMessages") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps existing messages visible while a refresh is pending", () => {
    const msg = createMessage({ id: 1 }) as MockMessage;
    render(
      <ChatPageMessageListSection
        {...baseProps}
        messages={[msg]}
        messagesLoading
        hasInitialPayload={false}
      />,
    );
    expect(screen.queryByLabelText(t("chat.loadingMessages"))).not.toBeInTheDocument();
    expect(screen.getByTestId("message-00000000-0000-4000-8000-000000000001")).toBeInTheDocument();
  });

  it("shows boundary pagination error with dismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const msg = createMessage({ id: 1 }) as MockMessage;
    render(
      <ChatPageMessageListSection
        {...baseProps}
        messages={[msg]}
        boundaryLoadFailed
        onDismissBoundaryLoadFailed={onDismiss}
      />,
    );
    expect(screen.getByText(t("chat.boundaryPaginationError"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
