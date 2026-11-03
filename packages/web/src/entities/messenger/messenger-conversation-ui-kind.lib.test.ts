import { describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceDirectStreamUuids,
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

it("indexes a direct catalog once when several rows share its snapshot", () => {
  const first = {
    uuid: "first",
    projectId: "project",
    userUuid: "viewer",
    isPrivate: true,
    directUserUuid: "peer",
    encryption: false,
    isArchived: false,
  } as MessengerStream;
  const second = { ...first, uuid: "second" };
  const catalog = { first, second };
  const values = vi.spyOn(Object, "values");
  try {
    expect(selectWorkspaceDirectStreamUuids(catalog, first.uuid, "viewer")).toEqual([
      "first",
      "second",
    ]);
    expect(selectWorkspaceDirectStreamUuids(catalog, second.uuid, "viewer")).toEqual([
      "first",
      "second",
    ]);
    expect(values).toHaveBeenCalledTimes(1);
  } finally {
    values.mockRestore();
  }
});
