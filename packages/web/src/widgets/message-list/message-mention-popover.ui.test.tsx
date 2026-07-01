import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { MessageMentionPopover } from "./message-mention-popover.ui";

vi.mock("~/shared/lib/realm-emojis-cache", () => ({
  getCachedRealmEmojis: () => [
    {
      id: "42",
      names: ["scam"],
      imgUrl: "https://chat.example.test/user_avatars/realm/42.png",
    },
  ],
  ensureRealmEmojisLoaded: () =>
    Promise.resolve([
      {
        id: "42",
        names: ["scam"],
        imgUrl: "https://chat.example.test/user_avatars/realm/42.png",
      },
    ]),
}));

describe("MessageMentionPopover", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
  });

  it("renders emoji-only realm custom status without falling back to presence text", () => {
    const now = Math.floor(Date.now() / 1000);
    useUsersStore.getState().mergeUser({
      user_id: 7,
      full_name: "Scam User",
      email: "scam@example.com",
      presence: { status: "active", timestamp: now },
      status: {
        text: "",
        away: false,
        emojiName: "scam",
        emojiCode: "42",
        reactionType: "realm_emoji",
      },
    });

    render(
      <MessageMentionPopover
        userId={7}
        anchorRect={new DOMRect(10, 10, 50, 20)}
        fallbackName="@scam"
        onClose={vi.fn()}
        onOpenDirectMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: ":scam:" })).toHaveAttribute(
      "src",
      "https://chat.example.test/user_avatars/realm/42.png",
    );
    expect(screen.queryByText(":scam:")).not.toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
  });
});
