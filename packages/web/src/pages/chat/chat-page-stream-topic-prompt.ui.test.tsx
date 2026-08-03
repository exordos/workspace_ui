import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessengerSidebarTopicItem } from "~/entities/messenger/messenger.types";
import { ChatPageStreamTopicPrompt } from "./chat-page-stream-topic-prompt.ui";

function createTopic(
  overrides: Partial<MessengerSidebarTopicItem> = {},
): MessengerSidebarTopicItem {
  return {
    id: "topic:stream-1:topic-1",
    streamUuid: "stream-1",
    topicUuid: "topic-1",
    title: "Planning",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    color: null,
    route: "/stream/stream-1/topic/topic-1",
    preview: null,
    lastMessageCreatedAt: null,
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("ChatPageStreamTopicPrompt", () => {
  it("does not paint its own surface so the chat underlay shows through", () => {
    render(<ChatPageStreamTopicPrompt topics={[]} onSelectTopic={vi.fn()} />);

    const prompt = screen.getByTestId("stream-topic-prompt");
    expect(prompt).not.toHaveClass("bg-bg-elevated");
    expect(prompt).not.toHaveClass("bg-card-bg");
    expect(prompt).not.toHaveClass("bg-bg");
  });

  it("renders a scrollable topic rail and selects a topic", () => {
    const onSelectTopic = vi.fn();
    render(
      <ChatPageStreamTopicPrompt
        topics={[
          createTopic(),
          createTopic({ topicUuid: "topic-2", title: "Releases", unreadCount: 3 }),
        ]}
        onSelectTopic={onSelectTopic}
      />,
    );

    expect(screen.getByTestId("stream-topic-rail")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: /# Releases.*3/ })).toBeInTheDocument();
    expect(screen.getByText("3")).toHaveClass("bg-sidebar-unread");

    fireEvent.click(screen.getByRole("button", { name: "# Planning" }));
    expect(onSelectTopic).toHaveBeenCalledWith("topic-1");
  });
});
