import { describe, expect, it, vi } from "vitest";
import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  getEncryptedChatServiceActions,
  getEncryptedChatServiceState,
} from "./encrypted-chat-service-actions.lib";

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
  return {
    message: message({
      kind: "key_request",
      keyUuid: "historical",
      deviceId: "other-device",
      deviceName: "Laptop",
      publicKey: "public",
    }),
    currentUserUuid: "admin",
    streamUuid: "stream",
    projectId: "project",
    pending: false,
    onRequestKey: vi.fn(),
    onGrantKey: vi.fn(),
    onRejectKey: vi.fn(),
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
      canRespondToKeyRequest: vi.fn((_uuid: string) => true),
      canGrantKey: vi.fn((_uuid: string) => true),
      canRejectKey: vi.fn((_uuid: string) => true),
      getKeyRequestOutcome: vi.fn<RealChatSession["getKeyRequestOutcome"]>(() => null),
    },
  };
}

describe("encrypted service actions", () => {
  it("uses original-message authorization for member request presentation", () => {
    const opts = setup();
    if (opts.message.payload.kind !== "key_request") throw new Error("Expected request");
    opts.message.payload = { ...opts.message.payload, targetMessageUuid: "original" };
    const state = getEncryptedChatServiceState({
      ...opts,
      session: {
        ...opts.session,
        getRights: () => ({ ...opts.session.getRights(), canGrant: false, canReject: false }),
      },
    });
    expect(state?.canManageKeys).toBe(true);
    expect(opts.session.canRespondToKeyRequest).toHaveBeenCalledWith("request");
  });

  it("reads device, rights and the exact requested generation from the scoped session", () => {
    const opts = setup();
    const generation = vi.spyOn(opts.session, "getGenerationState");
    expect(getEncryptedChatServiceState(opts)).toEqual({
      deviceId: "local-device",
      canManageKeys: true,
      hasKey: true,
      requestStatus: null,
    });
    expect(generation).toHaveBeenCalledWith("historical");
    expect(
      getEncryptedChatServiceState({
        ...opts,
        session: {
          ...opts.session,
          getRights: () => ({ ...opts.session.getRights(), canGrant: false, canReject: false }),
          canRespondToKeyRequest: () => false,
          getGenerationState: () => null,
        },
      }),
    ).toMatchObject({ canManageKeys: false, hasKey: false });
    generation.mockRestore();
  });
  it("does not read device or key state for another project, stream or missing session", () => {
    const opts = setup();
    expect(getEncryptedChatServiceState({ ...opts, projectId: "another" })).toBeNull();
    expect(getEncryptedChatServiceState({ ...opts, streamUuid: "another" })).toBeNull();
    expect(getEncryptedChatServiceState({ ...opts, session: null })).toBeNull();
    expect(opts.session.getKeyRequestOutcome).not.toHaveBeenCalled();
  });
  it.each(["granted", "rejected"] as const)(
    "reads the %s outcome for the exact request",
    (status) => {
      const opts = setup();
      opts.session.getKeyRequestOutcome.mockImplementation((uuid) =>
        uuid === "request"
          ? {
              status,
              request: {
                uuid: "request",
                streamUuid: "stream",
                authorUuid: "member",
                payload: {
                  kind: "key_request",
                  keyUuid: "historical",
                  deviceId: "other-device",
                  deviceName: "Laptop",
                  publicKey: { bytes: new Uint8Array(32) },
                },
              },
            }
          : null,
      );
      expect(getEncryptedChatServiceState(opts)?.requestStatus).toBe(status);
      expect(
        getEncryptedChatServiceState({ ...opts, message: { ...opts.message, uuid: "unrelated" } })
          ?.requestStatus,
      ).toBeNull();
    },
  );
  it("uses domain eligibility and grants the exact request", () => {
    const opts = setup();
    const actions = getEncryptedChatServiceActions(opts);
    expect(actions).toHaveLength(2);
    expect(opts.session.canGrantKey).toHaveBeenCalledWith("request");
    expect(opts.session.canRejectKey).toHaveBeenCalledWith("request");
    actions[0]?.onClick();
    expect(opts.onGrantKey).toHaveBeenCalledWith("request");
    actions[1]?.onClick();
    expect(opts.onRejectKey).toHaveBeenCalledWith("request");
    opts.session.canGrantKey.mockReturnValue(false);
    opts.session.canRejectKey.mockReturnValue(false);
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
        ...opts.session.getGenerationState(),
        access: "missing" as const,
      }),
    };
    const announcement = {
      ...opts,
      session,
      message: message({ kind: "key_announced", keyUuid: "historical" }, "admin"),
    };
    const actions = getEncryptedChatServiceActions(announcement);
    actions[0]?.onClick();
    expect(opts.onRequestKey).toHaveBeenCalledWith("historical");
    const pending = getEncryptedChatServiceActions({ ...announcement, pending: true });
    expect(pending[0]?.disabled).toBe(true);
  });
  it("keeps rejection available without a group key and refuses another project", () => {
    const opts = setup();
    const session = { ...opts.session, canGrantKey: () => false };
    expect(getEncryptedChatServiceActions({ ...opts, session })).toHaveLength(1);
    opts.session.canGrantKey.mockClear();
    opts.session.canRejectKey.mockClear();
    expect(getEncryptedChatServiceActions({ ...opts, streamUuid: "another" })).toEqual([]);
    expect(getEncryptedChatServiceActions({ ...opts, projectId: "another" })).toEqual([]);
    expect(opts.session.canGrantKey).not.toHaveBeenCalled();
    expect(opts.session.canRejectKey).not.toHaveBeenCalled();
  });
});
