import { describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { getEncryptedChatServiceActions } from "./encrypted-chat-service-actions.lib";

function message(
  payload: MessengerMessage["payload"],
  authorUuid = "member",
  uuid = "request",
): MessengerMessage {
  return {
    uuid,
    authorUuid,
    projectId: "project",
    streamUuid: "stream",
    topicUuid: "topic",
    userUuid: authorUuid,
    conversationId: "stream:stream",
    payload,
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-10-03T10:00:00Z",
    updatedAt: "2026-10-03T10:00:00Z",
  };
}
function setup() {
  const request = message({
    kind: "key_request",
    keyUuid: "historical",
    deviceId: "other-device",
    deviceName: "Laptop",
    publicKey: "public",
  });
  const onRequestKey = vi.fn(),
    onGrantKey = vi.fn(),
    onRejectKey = vi.fn();
  return {
    message: request,
    messages: [] as MessengerMessage[],
    currentUserUuid: "admin",
    streamUuid: "stream",
    projectId: "project",
    pending: false,
    onRequestKey,
    onGrantKey,
    onRejectKey,
    session: {
      device: { deviceId: "local-device", deviceName: "Local" },
      getRights: () => ({
        canRequest: true,
        canGrant: true,
        canReject: true,
        canRotate: false,
        canSend: true,
      }),
      getGenerationState: () => ({
        access: "ready" as const,
        pending: false,
        requestStatus: "idle" as const,
        error: null,
      }),
      isIssuerAllowed: (uuid: string) => uuid === "admin",
    },
  };
}

describe("encrypted service actions", () => {
  it("ignores unauthorized or wrong-generation answers and grants the exact request", () => {
    const opts = setup();
    opts.messages.push(
      message(
        {
          kind: "key_reject",
          keyUuid: "historical",
          requestMessageUuid: "request",
          senderDeviceId: "member-device",
          recipientDeviceId: "other-device",
        },
        "member",
        "spoof",
      ),
    );
    opts.messages.push(
      message(
        {
          kind: "key_reject",
          keyUuid: "latest",
          requestMessageUuid: "request",
          senderDeviceId: "issuer",
          recipientDeviceId: "other-device",
        },
        "admin",
        "wrong-epoch",
      ),
    );
    const actions = getEncryptedChatServiceActions(opts);
    expect(actions).toHaveLength(2);
    actions[0]?.onClick();
    expect(opts.onGrantKey).toHaveBeenCalledWith("request");
    opts.messages.push(
      message(
        {
          kind: "key_reject",
          keyUuid: "historical",
          requestMessageUuid: "request",
          senderDeviceId: "issuer",
          recipientDeviceId: "other-device",
        },
        "admin",
        "answer",
      ),
    );
    expect(getEncryptedChatServiceActions(opts)).toHaveLength(0);
  });
  it("allows manual approval for the same account on another device", () => {
    const opts = setup();
    opts.message = { ...opts.message, authorUuid: "admin" };
    expect(getEncryptedChatServiceActions(opts)).toHaveLength(2);
    opts.message = message(
      {
        kind: "key_request",
        keyUuid: "historical",
        deviceId: "local-device",
        deviceName: "Local",
        publicKey: "public",
      },
      "admin",
    );
    expect(getEncryptedChatServiceActions(opts)).toHaveLength(0);
  });
  it("requests the announced historical key and disables repeated pending requests", () => {
    const opts = setup();
    const session = {
      ...opts.session,
      getGenerationState: () => ({
        access: "missing" as const,
        pending: false,
        requestStatus: "idle" as const,
        error: null,
      }),
    };
    const actions = getEncryptedChatServiceActions({
      ...opts,
      session,
      message: message({ kind: "key_announced", keyUuid: "historical" }, "admin"),
    });
    actions[0]?.onClick();
    expect(opts.onRequestKey).toHaveBeenCalledWith("historical");
    const pending = getEncryptedChatServiceActions({
      ...opts,
      pending: true,
      session,
      message: message({ kind: "key_announced", keyUuid: "historical" }, "admin"),
    });
    expect(pending[0]?.disabled).toBe(true);
  });
  it("keeps rejection available without a group key and refuses another project", () => {
    const opts = setup();
    const session = { ...opts.session, getGenerationState: () => null };
    expect(getEncryptedChatServiceActions({ ...opts, session })).toHaveLength(1);
    expect(getEncryptedChatServiceActions({ ...opts, projectId: "another" })).toHaveLength(0);
  });
});
