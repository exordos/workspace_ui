import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createUser } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";

const buildAuthHeaderMock = vi.fn(() => ({}));

vi.mock("~/shared/lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/auth-guard")>();
  return {
    ...actual,
    buildAuthHeader: () => buildAuthHeaderMock(),
  };
});

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 201,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "plain",
    timestamp: 1710000000,
    ...overrides,
  };
}

describe("MessageBubble markdown body", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    useUsersStore.getState().clear();
    useCallParticipantsStore.setState({ participantsByUrl: {} });
    buildAuthHeaderMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders Markdown emphasis as HTML in the bubble body", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble message={createMessage({ content: "**Hello**" })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body).toBeTruthy();
    expect(body?.innerHTML).toContain("<strong>Hello</strong>");
  });

  it("still renders pre-rendered HTML bodies", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble message={createMessage({ content: "<p><em>Hi</em></p>" })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.innerHTML).toContain("<em>Hi</em>");
  });

  it("styles pre blocks to wrap long unbroken text inside the bubble", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const longToken = `https://example.com/${"segment".repeat(24)}`;
    const { container } = render(
      <MessageBubble message={createMessage({ content: `<pre>${longToken}</pre>` })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.className).toContain("[&_pre]:whitespace-pre-wrap");
    expect(body?.className).toContain("[&_pre]:[overflow-wrap:anywhere]");
    expect(body?.className).toContain("min-w-0");
    expect(body?.querySelector("pre")?.textContent).toBe(longToken);
  });
});
