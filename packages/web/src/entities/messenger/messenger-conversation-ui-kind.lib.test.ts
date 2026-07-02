import { describe, expect, it } from "vitest";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import type { MessengerConversation, MessengerStream } from "./messenger.types";

describe("workspace conversation UI kind", () => {
  it("classifies a regular channel stream as channel", () => {
    const stream = {
      isPrivate: false,
      directUserUuid: null,
    } satisfies Pick<MessengerStream, "isPrivate" | "directUserUuid">;

    expect(selectWorkspaceStreamConversationUiKind(stream)).toBe("channel");
  });

  it("classifies a direct private stream as directPrivate", () => {
    const stream = {
      isPrivate: true,
      directUserUuid: "user-direct",
    } satisfies Pick<MessengerStream, "isPrivate" | "directUserUuid">;

    expect(selectWorkspaceStreamConversationUiKind(stream)).toBe("directPrivate");
  });

  it("classifies a private stream without direct user as channel", () => {
    const stream = {
      isPrivate: true,
      directUserUuid: null,
    } satisfies Pick<MessengerStream, "isPrivate" | "directUserUuid">;

    expect(selectWorkspaceStreamConversationUiKind(stream)).toBe("channel");
  });

  it("uses the same rule for conversation-level domain objects", () => {
    const conversation = {
      isPrivate: true,
      directUserUuid: "user-direct",
    } satisfies Pick<MessengerConversation, "isPrivate" | "directUserUuid">;

    expect(selectWorkspaceConversationUiKind(conversation)).toBe("directPrivate");
  });
});
