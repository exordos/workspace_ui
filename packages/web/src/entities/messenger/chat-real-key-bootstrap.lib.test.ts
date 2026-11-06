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
import * as messengerRequestOptions from "./messenger-request-options.lib";
import type {
  EncryptedChannelCreationAttempt,
  MessengerCreateChatClientDeps,
} from "./messenger-create-chat-actions.lib";

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
function newCreationAttempt(): EncryptedChannelCreationAttempt {
  return { ownerKey: null, state: { phase: "idle" }, pending: false };
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

  it("keeps owner binding after a local prepare failure while allowing that owner to edit and retry", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    const prepare = vi
      .spyOn(realChatInitialKeyBootstrap, "prepare")
      .mockRejectedValueOnce(new Error("local storage unavailable"));
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >((_options, body) => Promise.resolve(response(current, body.current_encryption_key_uuid)));
    const options = {
      runtimeContext: current,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      client: { createStreamWithDefaultTopic: create },
    };
    await expect(createWorkspaceChannel(options)).rejects.toThrow("local storage unavailable");
    expect(creationAttempt.state.phase).toBe("idle");
    expect(creationAttempt.pending).toBe(false);
    expect(creationAttempt.ownerKey).not.toBeNull();
    await expect(createWorkspaceChannel({ ...options, runtimeContext: runtime() })).rejects.toThrow(
      "creation-uncertain",
    );
    expect(prepare).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    const result = await createWorkspaceChannel({ ...options, name: "Edited", description: "New" });
    expect(result.status).toBe("applied");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ name: "Edited", description: "New" }),
    );
  });

  it("recovers a committed POST with a lost response across stream and topic pages without creating twice", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    let committed: ReturnType<typeof response> | undefined;
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >((_options, body) => {
      committed = response(current, body.current_encryption_key_uuid);
      return Promise.reject(new Error("response lost"));
    });
    const getStreamsPage = vi.fn<NonNullable<MessengerCreateChatClientDeps["getStreamsPage"]>>(
      (_options, query) =>
        Promise.resolve({
          items: committed
            ? query.pageMarker === "next"
              ? [{ ...committed.stream, direct_user_uuid: undefined }]
              : [{ ...committed.stream, uuid: crypto.randomUUID(), owner: crypto.randomUUID() }]
            : [],
          nextPageMarker: query.pageMarker === "next" ? null : "next",
          pageLimit: 1,
        }),
    );
    const getStreamTopicsPage = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["getStreamTopicsPage"]>
    >((_options, query) =>
      Promise.resolve({
        items: committed && query.pageMarker === "topics-next" ? [committed.defaultTopic] : [],
        nextPageMarker: query.pageMarker === "topics-next" ? null : "topics-next",
        pageLimit: 1,
      }),
    );
    const addStreamUsers = vi
      .fn<NonNullable<MessengerCreateChatClientDeps["addStreamUsers"]>>()
      .mockResolvedValue([]);
    const options = {
      runtimeContext: current,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      memberUserUuids: [crypto.randomUUID()],
      client: {
        createStreamWithDefaultTopic: create,
        getStreamsPage,
        getStreamTopicsPage,
        addStreamUsers,
      },
    };
    await expect(createWorkspaceChannel(options)).rejects.toThrow("response lost");
    if (creationAttempt.state.phase !== "dispatched")
      throw new Error("expected dispatched attempt");
    const initialMetadata = creationAttempt.state.metadata;
    const result = await createWorkspaceChannel(options);
    expect(result.status).toBe("applied");
    expect(create).toHaveBeenCalledOnce();
    expect(getStreamsPage).toHaveBeenCalledTimes(2);
    expect(getStreamTopicsPage).toHaveBeenCalledTimes(2);
    expect(addStreamUsers).toHaveBeenCalledWith(expect.any(Object), STREAM, {
      member: options.memberUserUuids,
    });
    expect(creationAttempt.state).toMatchObject({ phase: "resolved", metadata: initialMetadata });
    const metadata = creationAttempt.state.metadata;
    if (!metadata?.deviceId) throw new Error("missing metadata");
    expect(
      (
        await realChatKeyStorage.readChatKey({
          owner: current,
          deviceId: metadata.deviceId,
          streamUuid: STREAM,
          keyUuid: metadata.keyUuid,
        })
      )?.groupKey?.bytes,
    ).toHaveLength(32);
  });

  it("never replays an ambiguous POST when no committed stream is visible or the form changes", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    const create = vi
      .fn<NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>>()
      .mockRejectedValue(new Error("offline"));
    const getStreamsPage = vi
      .fn<NonNullable<MessengerCreateChatClientDeps["getStreamsPage"]>>()
      .mockResolvedValue({ items: [], nextPageMarker: null, pageLimit: 100 });
    const options = {
      runtimeContext: current,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      client: { createStreamWithDefaultTopic: create, getStreamsPage },
    };
    await expect(createWorkspaceChannel(options)).rejects.toThrow("offline");
    await expect(createWorkspaceChannel(options)).rejects.toThrow("creation-uncertain");
    await expect(createWorkspaceChannel({ ...options, name: "Edited" })).rejects.toThrow(
      "creation-uncertain",
    );
    expect(create).toHaveBeenCalledOnce();
    expect(getStreamsPage).toHaveBeenCalledOnce();
  });

  it("retries finalization and invitations on the accepted bundle without another POST", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >((_options, body) => Promise.resolve(response(current, body.current_encryption_key_uuid)));
    const finalize = vi
      .spyOn(realChatKeyStorage, "finalizeCreation")
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const addStreamUsers = vi
      .fn<NonNullable<MessengerCreateChatClientDeps["addStreamUsers"]>>()
      .mockRejectedValueOnce(new Error("invite unavailable"))
      .mockResolvedValue([]);
    const options = {
      runtimeContext: current,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      memberUserUuids: [crypto.randomUUID()],
      client: { createStreamWithDefaultTopic: create, addStreamUsers },
    };
    await expect(createWorkspaceChannel(options)).rejects.toThrow("storage unavailable");
    await expect(createWorkspaceChannel(options)).rejects.toThrow("invite unavailable");
    expect((await createWorkspaceChannel(options)).status).toBe("applied");
    expect(create).toHaveBeenCalledOnce();
    expect(addStreamUsers).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(3);
  });

  it("recovers a failed default-topic fetch and fences a late recovery page after owner invalidation", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    let committed: ReturnType<typeof response> | undefined;
    let active = true;
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >((_options, body) => {
      committed = response(current, body.current_encryption_key_uuid);
      return Promise.reject(new Error("topic GET failed"));
    });
    const getStreamsPage = vi.fn<NonNullable<MessengerCreateChatClientDeps["getStreamsPage"]>>(
      () => {
        active = false;
        return Promise.resolve({
          items: committed ? [committed.stream] : [],
          nextPageMarker: null,
          pageLimit: 100,
        });
      },
    );
    const finalize = vi.spyOn(realChatKeyStorage, "finalizeCreation");
    const options = {
      runtimeContext: current,
      getRuntimeContext: () => (active ? current : null),
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      client: { createStreamWithDefaultTopic: create, getStreamsPage },
    };
    await expect(createWorkspaceChannel(options)).rejects.toThrow("topic GET failed");
    await expect(createWorkspaceChannel(options)).rejects.toThrow("stale-owner");
    expect(create).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
    expect(creationAttempt.state.phase).toBe("dispatched");
  });

  it("reuses the prepared key after session refresh invalidates creation before POST dispatch", async () => {
    const current = runtime();
    let active = current;
    const creationAttempt = newCreationAttempt();
    let finishToken: ((token: string) => void) | undefined;
    const pendingToken = new Promise<string>((resolve) => {
      finishToken = resolve;
    });
    const getAccessToken = vi
      .fn()
      .mockReturnValueOnce(pendingToken)
      .mockResolvedValue(current.accessToken);
    const buildOptions = messengerRequestOptions.buildMessengerRequestOptions;
    vi.spyOn(messengerRequestOptions, "buildMessengerRequestOptions").mockImplementation(
      (...args) => ({ ...buildOptions(...args), getAccessToken }),
    );
    const fetchImpl = vi.fn<typeof fetch>((_request, init) => {
      if (creationAttempt.state.phase === "idle") throw new Error("no prepared metadata");
      const metadata = creationAttempt.state.metadata;
      const bundle = response(active, metadata.keyUuid);
      if (init?.method === "POST") {
        if (typeof init.body !== "string") throw new Error("expected JSON body");
        expect(JSON.parse(init.body)).toMatchObject({
          current_encryption_key_uuid: metadata.keyUuid,
        });
        return Promise.resolve(new Response(JSON.stringify(bundle.stream), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify([bundle.defaultTopic]), { status: 200 }));
    });
    const options = {
      runtimeContext: current,
      getRuntimeContext: () => active,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      clientOptions: { fetchImpl },
    };
    const first = createWorkspaceChannel(options);
    await vi.waitFor(() => expect(getAccessToken).toHaveBeenCalledOnce());
    if (creationAttempt.state.phase !== "prepared") throw new Error("expected prepared attempt");
    const prepared = creationAttempt.state.metadata;
    active = { ...current, runtimeGeneration: current.runtimeGeneration + 1 };
    finishToken?.(current.accessToken);
    await expect(first).rejects.toThrow("stale-owner");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(creationAttempt.state.phase).toBe("prepared");
    expect((await createWorkspaceChannel({ ...options, runtimeContext: active })).status).toBe(
      "applied",
    );
    expect(creationAttempt.state).toMatchObject({ phase: "resolved", metadata: prepared });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("serializes one intent and keeps separate intentional creations distinct", async () => {
    const current = runtime();
    const creationAttempt = newCreationAttempt();
    let complete: (() => void) | undefined;
    const create = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >(async (_options, body) => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      return response(current, body.current_encryption_key_uuid);
    });
    const options = {
      runtimeContext: current,
      name: "Encrypted",
      encryption: true,
      creationAttempt,
      client: { createStreamWithDefaultTopic: create },
    };
    const first = createWorkspaceChannel(options);
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    await expect(createWorkspaceChannel(options)).rejects.toThrow("creation-uncertain");
    complete?.();
    expect((await first).status).toBe("applied");
    const nextCreate = vi.fn<
      NonNullable<MessengerCreateChatClientDeps["createStreamWithDefaultTopic"]>
    >((_options, body) => Promise.resolve(response(current, body.current_encryption_key_uuid)));
    const secondAttempt = newCreationAttempt();
    await createWorkspaceChannel({
      ...options,
      creationAttempt: secondAttempt,
      client: { createStreamWithDefaultTopic: nextCreate },
    });
    if (secondAttempt.state.phase !== "resolved" || creationAttempt.state.phase !== "resolved")
      throw new Error("expected resolved attempts");
    expect(secondAttempt.state.metadata.keyUuid).not.toBe(creationAttempt.state.metadata.keyUuid);
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
