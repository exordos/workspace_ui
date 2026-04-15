import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "./create-chat-dialog.ui";
import { createChannel } from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
}));

describe("CreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useUsersStore.getState().mergeUsers([{ user_id: 1, full_name: "Alice", email: "a@a.test" }]);
  });

  afterEach(() => {
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
  });

  it("disables channel creation and shows reason while current profile is loading", () => {
    useChatListStore.setState({ currentUserId: null });

    render(
      <CreateChatDialog
        open
        onOpenChange={vi.fn()}
        onNavigateDm={vi.fn()}
        onChannelCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Create channel" }));
    fireEvent.change(screen.getByPlaceholderText("Channel name"), {
      target: { value: "engineering" },
    });

    // Что проверяет: UI явно блокирует создание до загрузки профиля автора.
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(
      screen.getByText("Profile is still loading. Try again in a moment."),
    ).toBeInTheDocument();

    fireEvent.click(createButton);
    expect(createChannel).not.toHaveBeenCalled();
  });
});
