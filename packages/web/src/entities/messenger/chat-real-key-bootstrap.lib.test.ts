import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { realChatKeyStorage } from "./chat-crypto-resources.lib";
import { realChatInitialKeyBootstrap } from "./chat-real-key-bootstrap.lib";
import { createWorkspaceChannel } from "./messenger-create-chat-actions.lib";
import type { MessengerCreateChatClientDeps } from "./messenger-create-chat-actions.lib";

const PROJECT = "22222222-2222-4222-8222-222222222222";
const USER = "44444444-4444-4444-8444-444444444444";
const STREAM = "11111111-1111-4111-8111-111111111111";
const DATE = "2026-10-02T00:00:00Z";
function runtime(): WorkspaceRuntimeContext {
  return {
    accountId: crypto.randomUUID(),
    instanceId: "instance",
    organizationId: "org",
    projectId: PROJECT,
    userUuid: USER,
    organizationOrigin: "http://127.0.0.1:23190",
    accessToken: "test-access",
    runtimeGeneration: 1,
  };
}
function response(
  current: WorkspaceRuntimeContext,
  key: WorkspaceMessengerStreamDto["current_encryption_key_uuid"],
) {
  const stream: WorkspaceMessengerStreamDto = {
    uuid: STREAM,
    project_id: PROJECT,
    name: "Encrypted",
    description: "",
    owner: USER,
    user_uuid: USER,
    role: "owner",
    notification_mode: "all_messages",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    direct_user_uuid: null,
    encryption: true,
    current_encryption_key_uuid: key,
    created_at: DATE,
    updated_at: DATE,
  };
  const defaultTopic: WorkspaceMessengerTopicDto = {
    uuid: crypto.randomUUID(),
    project_id: current.projectId,
    stream_uuid: STREAM,
    user_uuid: USER,
    name: "",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    is_default: true,
    is_done: false,
    notification_mode: "default",
    created_at: DATE,
    updated_at: DATE,
  };
  return { stream, defaultTopic };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.restoreAllMocks();
});

describe("real creation key bootstrap", () => {
  it("persists the generation secret before POST and retains it when member invitation fails", async () => {
    const current = runtime();
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >(async (_options, body) => {
      const device = await realChatKeyStorage.readDeviceIdentity(current);
      if (!device) throw new Error("no identity");
      const pending = await realChatKeyStorage.listStagedCreations({
        owner: current,
        deviceId: device.deviceId,
      });
      expect(pending).toHaveLength(1);
      expect(pending[0]?.keyUuid).toBe(body.current_encryption_key_uuid);
      expect(JSON.stringify(body)).not.toContain("groupKey");
      return response(current, body.current_encryption_key_uuid);
    });
    await expect(
      createWorkspaceChannel({
        runtimeContext: current,
        name: "Encrypted",
        encryption: true,
        memberUserUuids: [crypto.randomUUID()],
        client: {
          createStreamWithDefaultTopic: create,
          addStreamUsers: () => Promise.reject(new Error("invitation failed")),
        },
      }),
    ).rejects.toThrow("invitation failed");
    const device = await realChatKeyStorage.readDeviceIdentity(current);
    if (!device) throw new Error("no identity");
    const keyUuid = create.mock.calls[0]?.[1].current_encryption_key_uuid;
    if (!keyUuid) throw new Error("no key");
    const key = await realChatKeyStorage.readChatKey({
      owner: current,
      deviceId: device.deviceId,
      streamUuid: STREAM,
      keyUuid,
    });
    expect(key?.groupKey?.bytes).toHaveLength(32);
    expect(
      await realChatKeyStorage.listStagedCreations({ owner: current, deviceId: device.deviceId }),
    ).toEqual([]);
  });

  it("keeps staged secrets recoverable when a creation response has the wrong generation", async () => {
    const current = runtime();
    await expect(
      createWorkspaceChannel({
        runtimeContext: current,
        name: "Encrypted",
        encryption: true,
        client: {
          createStreamWithDefaultTopic: () =>
            Promise.resolve(response(current, crypto.randomUUID())),
        },
      }),
    ).rejects.toThrow("encryption-mismatch");
    const device = await realChatKeyStorage.readDeviceIdentity(current);
    if (!device) throw new Error("no identity");
    expect(
      await realChatKeyStorage.listStagedCreations({ owner: current, deviceId: device.deviceId }),
    ).toHaveLength(1);
  });

  it("does not dispatch a creation without a durable secret", async () => {
    const current = runtime();
    vi.spyOn(realChatKeyStorage, "writeStagedCreation").mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
    const create =
      vi.fn<NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>>();
    await expect(
      createWorkspaceChannel({
        runtimeContext: current,
        name: "Encrypted",
        encryption: true,
        client: { createStreamWithDefaultTopic: create },
      }),
    ).rejects.toThrow("disk unavailable");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not finalize a late response after runtime invalidation", async () => {
    const current = runtime();
    let active = true;
    const finalize = vi.spyOn(realChatKeyStorage, "finalizeCreation");
    const result = await createWorkspaceChannel({
      runtimeContext: current,
      getRuntimeContext: () => (active ? current : null),
      name: "Encrypted",
      encryption: true,
      client: {
        createStreamWithDefaultTopic: (_options, body) => {
          active = false;
          return Promise.resolve(response(current, body.current_encryption_key_uuid));
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(finalize).not.toHaveBeenCalled();
    const device = await realChatKeyStorage.readDeviceIdentity(current);
    if (!device) throw new Error("no identity");
    expect(
      await realChatKeyStorage.listStagedCreations({ owner: current, deviceId: device.deviceId }),
    ).toHaveLength(1);
  });

  it("finalizes a prepared secret only after the caller validates the created stream", async () => {
    const current = runtime();
    const metadata = await realChatInitialKeyBootstrap.prepare({
      runtimeContext: current,
      isCurrent: () => true,
    });
    if (!realChatInitialKeyBootstrap.finalize || !metadata.deviceId)
      throw new Error("no finalizer");
    await expect(
      realChatInitialKeyBootstrap.finalize({
        runtimeContext: current,
        metadata,
        streamUuid: STREAM,
        isCurrent: () => false,
      }),
    ).rejects.toThrow("encryption-unavailable");
    expect(
      await realChatKeyStorage.listStagedCreations({ owner: current, deviceId: metadata.deviceId }),
    ).toHaveLength(1);
  });
});
