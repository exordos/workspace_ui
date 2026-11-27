import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  useChatForwardHydration,
  type ChatForwardHydrationMessage,
} from "./chat-page-forward-hydration.hook";

interface TestForwardMessage extends ChatForwardHydrationMessage {
  sender_id: number;
  sender_full_name: string;
  sender_email: string;
  avatar_url: string | null;
  content: string;
  rendered_content: string;
  timestamp: number;
  reactions: unknown[];
  flags: string[];
  type: "stream";
  display_recipient: string;
  stream_id: number;
  subject: string;
}

const message: TestForwardMessage = {
  id: 42,
  sender_id: 5,
  sender_full_name: "Ada",
  sender_email: "ada@example.test",
  avatar_url: null,
  content: "Forward me",
  rendered_content: "<p>Forward me</p>",
  timestamp: 1,
  reactions: [],
  flags: [],
  type: "stream",
  display_recipient: "general",
  stream_id: 10,
  subject: "bugs",
};

describe("useChatForwardHydration", () => {
  it("hydrates forward message from the current loaded window", async () => {
    const { result } = renderHook(() =>
      useChatForwardHydration({
        forwardMessageId: 42,
        messages: [message],
      }),
    );

    await waitFor(() => {
      expect(result.current.forwardMessages).toEqual([message]);
    });
    expect(result.current.forwardSelectedText).toBeUndefined();
  });

  it("clears forward hydration when requested message is not in the current window", async () => {
    const { result, rerender } = renderHook(
      ({
        forwardMessageId,
        messages,
      }: {
        forwardMessageId: number | null;
        messages: TestForwardMessage[];
      }) => useChatForwardHydration({ forwardMessageId, messages }),
      {
        initialProps: { forwardMessageId: 42, messages: [message] },
      },
    );

    await waitFor(() => {
      expect(result.current.forwardMessages).toEqual([message]);
    });

    rerender({ forwardMessageId: 99, messages: [message] });

    await waitFor(() => {
      expect(result.current.forwardMessages).toEqual([]);
    });
  });
});
