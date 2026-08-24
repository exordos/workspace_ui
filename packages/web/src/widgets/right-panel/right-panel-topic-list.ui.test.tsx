import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessengerTopicListItem } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelTopicList } from "./right-panel-topic-list.ui";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-08-22T00:00:00Z";

function createTopic(overrides: Partial<MessengerTopicListItem> = {}): MessengerTopicListItem {
  return {
    id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    title: "Release planning",
    unreadCount: 0,
    activeUnreadCount: 0,
    passiveUnreadCount: 0,
    hasUnreadPersonalMention: false,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    color: null,
    route: `/messenger/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    preview: null,
    lastMessageCreatedAt: null,
    updatedAt: DATE,
    ...overrides,
  };
}

describe("RightPanelTopicList", () => {
  it("renders the compact topic surface with shared counters, mentions, and effective notification state", () => {
    const activeTopic = createTopic({
      title: "A very long active topic name that must stay on one line",
      unreadCount: 9,
      activeUnreadCount: 2,
      passiveUnreadCount: 7,
      hasUnreadPersonalMention: true,
      notificationMode: "follow",
    });
    const mutedTopic = createTopic({
      id: `topic:${STREAM_UUID}:muted`,
      topicUuid: "muted",
      title: "Muted topic",
      unreadCount: 5,
      passiveUnreadCount: 5,
      notificationMode: "default",
    });
    const systemTopic = createTopic({
      id: `topic:${STREAM_UUID}:system`,
      topicUuid: "system",
      title: "",
      isDefault: true,
      notificationMode: "unmute",
    });

    renderWithProviders(
      <RightPanelTopicList
        topics={[activeTopic, mutedTopic, systemTopic]}
        streamTitle="general"
        streamNotificationMode="muted"
        onOpenTopic={vi.fn()}
      />,
    );

    expect(screen.getByTestId("right-panel-topic-list")).toHaveClass(
      "divide-y",
      "rounded-lg",
      "border",
      "border-border-subtle",
    );

    const activeButton = screen.getByRole("button", { name: /A very long active topic name/ });
    const activeTitle = within(activeButton).getByTitle(
      "A very long active topic name that must stay on one line",
    );
    expect(activeTitle).toHaveClass("truncate");
    expect(within(activeButton).getByText("2")).toHaveClass("bg-sidebar-unread");
    expect(within(activeButton).queryByText("7")).not.toBeInTheDocument();
    expect(activeButton.querySelector('span[title="@"]')).not.toBeNull();
    expect(within(activeButton).getByTestId("right-panel-topic-notification")).toHaveAttribute(
      "data-muted",
      "false",
    );
    expect(within(activeButton).getByLabelText("Topic notifications: Follow")).toBeInTheDocument();

    const mutedButton = screen.getByRole("button", { name: /Muted topic/ });
    expect(mutedButton).toBeEnabled();
    expect(within(mutedButton).getByText("5")).toHaveClass("bg-notice-disable");
    expect(within(mutedButton).getByTestId("right-panel-topic-notification")).toHaveAttribute(
      "data-muted",
      "true",
    );
    expect(within(mutedButton).getByLabelText("Topic notifications: Muted")).toBeInTheDocument();

    const systemTitle = screen.getByTitle(t("chat.generalChat"));
    expect(systemTitle).toHaveClass("italic");
    expect(systemTitle).not.toHaveClass("line-through", "opacity-70");
  });

  it("keeps collapse local and navigates through the supplied callback", () => {
    const onOpenTopic = vi.fn();
    const topic = createTopic();

    renderWithProviders(
      <RightPanelTopicList
        topics={[topic]}
        streamTitle="general"
        streamNotificationMode="all_messages"
        onOpenTopic={onOpenTopic}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Release planning/ }));
    expect(onOpenTopic).toHaveBeenCalledWith(topic.route);

    const collapseButton = screen.getByRole("button", { name: t("a11y.collapseTopics") });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseButton);
    expect(screen.queryByTestId("right-panel-topic-list")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: t("a11y.expandTopics") });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expandButton);
    expect(screen.getByTestId("right-panel-topic-list")).toBeInTheDocument();
  });

  it("opens the shared topic context menu from right-click", async () => {
    renderWithProviders(
      <RightPanelTopicList
        topics={[createTopic()]}
        streamTitle="general"
        streamNotificationMode="all_messages"
        onOpenTopic={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: /Release planning/ }));

    expect(
      await screen.findByRole("radiogroup", { name: t("channel.topicNotifications") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: t("channel.renameTopic") })).toBeInTheDocument();
  });

  it("opens the shared topic context menu from Shift+F10", async () => {
    renderWithProviders(
      <RightPanelTopicList
        topics={[createTopic()]}
        streamTitle="general"
        streamNotificationMode="all_messages"
        onOpenTopic={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /Release planning/ }), {
      key: "F10",
      shiftKey: true,
    });

    expect(
      await screen.findByRole("radiogroup", { name: t("channel.topicNotifications") }),
    ).toBeInTheDocument();
  });
});
