import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";

const noop = () => {};

const baseProps = {
  messagesLoading: false,
  hasInitialPayload: true,
  isDmView: false,
  activeDmUserIds: null as number[] | null,
  activeStream: "general",
  activeTopic: "topic",
  currentUserId: 1,
  callbacks: {},
  selectionMode: false,
  selectedMessageIds: new Set<number>(),
  onLoadMore: noop,
  isLoadingMore: false,
  isLoadingNewer: false,
  onLoadNewer: noop,
  hasNewerMessages: false,
  firstUnreadId: undefined as number | undefined,
  unreadCount: 0,
  focusedMessageId: null as number | null | undefined,
  onUnreadMessagesVisible: noop as (ids: number[]) => void,
  onUnreadMessagesAtBottom: noop as (ids: number[]) => void,
  messagesLoadError: null as "initial" | "refresh" | null,
  onRetryMessagesLoad: noop,
  boundaryLoadFailed: false,
  onDismissBoundaryLoadFailed: noop,
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
