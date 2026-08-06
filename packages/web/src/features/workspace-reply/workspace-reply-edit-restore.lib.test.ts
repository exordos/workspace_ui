import { describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createWorkspaceReplyEditRestoreController,
  type WorkspaceReplyEditRestoreDependencies,
} from "./workspace-reply-edit-restore.lib";

const MESSAGE_UUID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_UUID = "22222222-2222-4222-8222-222222222222";

const RUNTIME_CONTEXT: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  organizationOrigin: "https://org-a.example.com",
  projectId: "project-a",
  userUuid: "33333333-3333-4333-8333-333333333333",
  accessToken: "token",
  runtimeGeneration: 1,
};

function createMessage(): MessengerMessage {
  return {
    uuid: MESSAGE_UUID,
    conversationId:
      "topic:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555",
    projectId: RUNTIME_CONTEXT.projectId,
    streamUuid: "44444444-4444-4444-8444-444444444444",
    topicUuid: "55555555-5555-4555-8555-555555555555",
    authorUuid: AUTHOR_UUID,
    userUuid: AUTHOR_UUID,
    payload: { kind: "markdown", content: "source body" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
  };
}

function createDependencies(
  overrides: Partial<WorkspaceReplyEditRestoreDependencies> = {},
): WorkspaceReplyEditRestoreDependencies {
  return {
    getMessage: () => null,
    loadMessage: () => Promise.resolve({ status: "unavailable" }),
    resolveAuthor: () => ({ senderUuid: AUTHOR_UUID, senderName: "Bob" }),
    getRuntimeContext: () => RUNTIME_CONTEXT,
    ...overrides,
  };
}

function createIdentity(index: number) {
  return {
    id: `tab-${index}`,
    createdAt: `2026-07-28T10:00:0${index}.000Z`,
  };
}

function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("createWorkspaceReplyEditRestoreController", () => {
  it.each([
    `See [Bob](urn:quote:${MESSAGE_UUID}) inline.`,
    `Use \`[Bob](urn:quote:${MESSAGE_UUID})\` as code.`,
    ["```md", `[Bob](urn:quote:${MESSAGE_UUID})`, "```"].join("\n"),
  ])("ignores non-structural quote references", async (markdown) => {
    const loadMessage = vi.fn(() => Promise.resolve({ status: "unavailable" as const }));
    const controller = createWorkspaceReplyEditRestoreController(
      createDependencies({ loadMessage }),
    );

    const result = await controller.restore({
      markdown,
      runtimeContext: RUNTIME_CONTEXT,
      createIdentity,
    });

    expect(result).toEqual({ status: "ready", restored: null });
    expect(loadMessage).not.toHaveBeenCalled();
  });

  it("restores a standalone structural quote from memory", async () => {
    const message = createMessage();
    const loadMessage = vi.fn(() => Promise.resolve({ status: "unavailable" as const }));
    const controller = createWorkspaceReplyEditRestoreController(
      createDependencies({
        getMessage: (messageUuid) => (messageUuid === message.uuid ? message : null),
        loadMessage,
      }),
    );

    const result = await controller.restore({
      markdown: `[Bob](urn:quote:${MESSAGE_UUID})\n\nanswer`,
      runtimeContext: RUNTIME_CONTEXT,
      createIdentity,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready restore");
    expect(result.restored?.activeAnswer).toBe("answer");
    expect(result.restored?.session.tabs[0]).toMatchObject({
      messageUuid: MESSAGE_UUID,
      senderUuid: AUTHOR_UUID,
      senderName: "Bob",
      quotedContent: "source body",
    });
    expect(loadMessage).not.toHaveBeenCalled();
  });

  it("returns an unavailable structural quote as raw-edit fallback", async () => {
    const controller = createWorkspaceReplyEditRestoreController(createDependencies());

    await expect(
      controller.restore({
        markdown: `[Bob](urn:quote:${MESSAGE_UUID})\n\nanswer`,
        runtimeContext: RUNTIME_CONTEXT,
        createIdentity,
      }),
    ).resolves.toEqual({ status: "ready", restored: null });
  });

  it("does not apply a stale loader result", async () => {
    const controller = createWorkspaceReplyEditRestoreController(
      createDependencies({
        loadMessage: () => Promise.resolve({ status: "stale" }),
      }),
    );

    await expect(
      controller.restore({
        markdown: `[Bob](urn:quote:${MESSAGE_UUID})\n\nanswer`,
        runtimeContext: RUNTIME_CONTEXT,
        createIdentity,
      }),
    ).resolves.toEqual({ status: "stale" });
  });

  it("invalidates an active restore when a newer restore starts", async () => {
    const deferredLoad = createDeferred<{
      status: "resolved";
      message: MessengerMessage;
      source: "server";
    }>();
    const loadMessage = vi.fn(() => deferredLoad.promise);
    const controller = createWorkspaceReplyEditRestoreController(
      createDependencies({ loadMessage }),
    );
    const firstRestore = controller.restore({
      markdown: `[Bob](urn:quote:${MESSAGE_UUID})\n\nfirst answer`,
      runtimeContext: RUNTIME_CONTEXT,
      createIdentity,
    });

    await expect(
      controller.restore({
        markdown: "plain second edit",
        runtimeContext: RUNTIME_CONTEXT,
        createIdentity,
      }),
    ).resolves.toEqual({ status: "ready", restored: null });

    deferredLoad.resolve({ status: "resolved", message: createMessage(), source: "server" });
    await expect(firstRestore).resolves.toEqual({ status: "stale" });
  });
});
