import * as Dialog from "@radix-ui/react-dialog";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { createUser } from "~/test/factories";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";

const USER_A_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";

function renderForwardModal(onForward = vi.fn()) {
  return {
    onForward,
    ...render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Content>
            <ForwardMessageModalBody
              streamOptions={[{ streamUuid: STREAM_UUID, name: "general" }]}
              topicOptions={[{ streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID, name: "Roadmap" }]}
              currentUserUuid={USER_A_UUID}
              onForward={onForward}
              onClose={vi.fn()}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    ),
  };
}

describe("ForwardMessageModalBody", () => {
  beforeEach(() => {
    useUsersStore.getState().clear();
  });

  afterEach(() => {
    useUsersStore.getState().clear();
  });

  it("shows Workspace users and forwards by user uuid", () => {
    useUsersStore.getState().replaceUsers([
      createUser({ uuid: USER_A_UUID, full_name: "Alice Stone", email: "alice@example.com" }),
      createUser({
        uuid: USER_B_UUID,
        full_name: "Bob Reed",
        username: "bobreed",
        email: "bob@example.com",
      }),
    ]);
    const { onForward } = renderForwardModal();

    fireEvent.click(screen.getByRole("button", { name: /^dm$/i }));
    expect(screen.queryByText("Alice Stone")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Reed")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search users…"), {
      target: { value: "bobreed" },
    });
    fireEvent.click(screen.getByText("Bob Reed"));
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(onForward).toHaveBeenCalledWith({ kind: "direct", userUuid: USER_B_UUID });
  });

  it("searches Workspace users by email", () => {
    useUsersStore
      .getState()
      .replaceUsers([
        createUser({ uuid: USER_A_UUID, full_name: "Alice Stone", email: "alice@example.com" }),
        createUser({ uuid: USER_B_UUID, full_name: "Bob Reed", email: "bob@example.com" }),
      ]);
    renderForwardModal();

    fireEvent.click(screen.getByRole("button", { name: /^dm$/i }));
    fireEvent.change(screen.getByPlaceholderText("Search users…"), {
      target: { value: "bob@example.com" },
    });

    expect(screen.getByText("Bob Reed")).toBeInTheDocument();
    expect(screen.queryByText("Alice Stone")).not.toBeInTheDocument();
  });

  it("forwards to a Workspace topic by uuid", () => {
    const { onForward } = renderForwardModal();

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: STREAM_UUID } });
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: TOPIC_UUID } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(onForward).toHaveBeenCalledWith({
      kind: "topic",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
  });
});
