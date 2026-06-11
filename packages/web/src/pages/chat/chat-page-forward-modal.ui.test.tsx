import * as Dialog from "@radix-ui/react-dialog";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { createUser } from "~/test/factories";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";

const ensureUserStatusLoadedMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/user/api/user.api", () => ({
  ensureUserStatusLoaded: (...args: unknown[]) => ensureUserStatusLoadedMock(...args),
}));

describe("ForwardMessageModalBody", () => {
  afterEach(() => {
    ensureUserStatusLoadedMock.mockReset();
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
    expect(ensureUserStatusLoadedMock).not.toHaveBeenCalled();
  });
});
