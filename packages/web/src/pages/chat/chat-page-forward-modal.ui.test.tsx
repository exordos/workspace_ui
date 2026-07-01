import * as Dialog from "@radix-ui/react-dialog";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { createUser } from "~/test/factories";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";

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

describe("ForwardMessageModalBody", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
  });

  it("does not load user statuses when opening the DM forward tab", () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 7, full_name: "Alice", email: "alice@example.com" }),
        createUser({ user_id: 8, full_name: "Bob", email: "bob@example.com" }),
      ]);

    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Content>
            <ForwardMessageModalBody streams={[]} onForward={vi.fn()} onClose={vi.fn()} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^dm$/i }));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders emoji-only realm custom status in DM recipients without falling back to email", () => {
    useUsersStore.getState().mergeUser({
      ...createUser({ user_id: 9, full_name: "Scam User", email: "scam@example.com" }),
      status: {
        text: "",
        away: false,
        emojiName: "scam",
        emojiCode: "42",
        reactionType: "realm_emoji",
      },
    });

    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Content>
            <ForwardMessageModalBody streams={[]} onForward={vi.fn()} onClose={vi.fn()} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^dm$/i }));

    expect(screen.getByRole("img", { name: ":scam:" })).toHaveAttribute(
      "src",
      "https://chat.example.test/user_avatars/realm/42.png",
    );
    expect(screen.queryByText("scam@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(":scam:")).not.toBeInTheDocument();
  });
});
