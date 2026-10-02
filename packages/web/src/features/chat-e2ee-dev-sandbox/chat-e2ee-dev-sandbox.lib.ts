import { ChatE2eeController } from "~/entities/messenger/chat-e2ee-controller.lib";
import type {
  ChatE2eeControllerScope,
  ChatE2eeControllerState,
} from "~/entities/messenger/chat-e2ee-controller.types";
import {
  decodeChatE2eePayload,
  encodeChatE2eePayload,
} from "~/entities/messenger/chat-e2ee-payload-adapters.lib";
import type {
  ChatE2eeMessage,
  ChatE2eePayload,
  ChatKeyRequestPayload,
} from "~/entities/messenger/chat-e2ee.types";
import type {
  ChatKeyStorage,
  StoredChatKey,
  PendingChatKeyRequest,
  ChatKeyRequestCompletion,
} from "~/entities/messenger/chat-key-storage.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createMessage, getMessagesPage } from "~/shared/api/messenger-messages.api";
import { createStreamWithDefaultTopic, getStream } from "~/shared/api/messenger-streams.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isAllowedDevWorkspaceProxyTargetOrigin } from "~/shared/config/dev-workspace-org-proxy";
import {
  createInsecureSandboxProvider,
  E2EE_SANDBOX_FINGERPRINT,
  E2EE_SANDBOX_GROUP_KEY,
  E2EE_SANDBOX_FIXTURE_TEXT,
} from "./chat-e2ee-dev-provider.lib";

export type SandboxDevice = "issuer" | "recipient";
export interface E2eeSandboxSnapshot {
  readonly streamUuid: string | null;
  readonly device: SandboxDevice;
  readonly state: ChatE2eeControllerState | null;
  readonly messages: readonly {
    uuid: string;
    kind: ChatE2eePayload["kind"];
    plaintext: string | null;
  }[];
}

export function isE2eeSandboxRuntimeAllowed(runtime: WorkspaceRuntimeContext | null): boolean {
  if (
    !import.meta.env.DEV ||
    runtime === null ||
    !isAllowedDevWorkspaceProxyTargetOrigin(runtime.organizationOrigin)
  )
    return false;
  try {
    const origin = new URL(runtime.organizationOrigin);
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    );
  } catch {
    return false;
  }
}

interface SandboxApi {
  createStreamWithDefaultTopic: typeof createStreamWithDefaultTopic;
  getStream: typeof getStream;
  getMessagesPage: typeof getMessagesPage;
  createMessage: typeof createMessage;
}

/** Only this factory-created test stream can be mutated. No existing stream UUID is accepted. */
export function createDevChatE2eeSandbox(input: {
  readonly runtime: WorkspaceRuntimeContext;
  readonly getCurrentRuntime: () => WorkspaceRuntimeContext | null;
  readonly api?: SandboxApi;
}) {
  if (!isE2eeSandboxRuntimeAllowed(input.runtime))
    throw new Error("E2EE sandbox requires development and a loopback backend");
  const runtime = { ...input.runtime };
  const api = input.api ?? {
    createStreamWithDefaultTopic,
    getStream,
    getMessagesPage,
    createMessage,
  };
  const abort = new AbortController();
  const provider = createInsecureSandboxProvider();
  const keys = new Map<string, StoredChatKey>();
  const pendingRequests = new Map<string, PendingChatKeyRequest>();
  const completions = new Map<string, ChatKeyRequestCompletion>();
  const messages = new Map<string, ChatE2eeMessage>();
  const plaintext = new Map<string, string>();
  const keyUuid = crypto.randomUUID();
  const streamName = `INSECURE E2EE TEST ${crypto.randomUUID()}`;
  let streamUuid: string | null = null;
  let topicUuid: string | null = null;
  let device: SandboxDevice = "issuer";
  let controller: ChatE2eeController | null = null;
  let disposed = false;
  let initializing = false;

  const current = () => {
    const next = input.getCurrentRuntime();
    return (
      !disposed &&
      next !== null &&
      workspaceRuntimeOwnerKey(next) === workspaceRuntimeOwnerKey(runtime) &&
      next.runtimeGeneration === runtime.runtimeGeneration &&
      next.organizationOrigin === runtime.organizationOrigin
    );
  };
  const ensureCurrent = () => {
    if (!current()) throw new Error("stale");
  };
  const options = (guard: () => boolean = current) =>
    buildMessengerRequestOptions(
      runtime,
      {
        // Fix both the proxy path and explicit target; invalid targets must never fall back to env.
        baseUrl: "/api/workspace/v1/messenger",
        devTargetOrigin: new URL(runtime.organizationOrigin).origin,
        fetchImpl: (request, init) => {
          if (!guard()) return Promise.reject(new Error("stale"));
          return fetch(request, init);
        },
      },
      abort.signal,
    );
  const addressKey = (
    address: ChatE2eeControllerScope | Parameters<ChatKeyStorage["readChatKey"]>[0],
  ) =>
    `${workspaceRuntimeOwnerKey(address.owner)}:${address.deviceId}:${address.streamUuid}:${address.keyUuid}`;
  const storage: ChatKeyStorage = {
    readDeviceIdentity: () => Promise.resolve(null),
    writeDeviceIdentity: () =>
      Promise.reject(new Error("Sandbox identities are ephemeral fixtures")),
    readChatKey: (address) => Promise.resolve(keys.get(addressKey(address)) ?? null),
    writeChatKey: (address, key, writeOptions) => {
      if (!current() || writeOptions?.isCurrent?.() === false) return Promise.resolve(false);
      const existing = keys.get(addressKey(address));
      keys.set(addressKey(address), {
        fingerprint: key.fingerprint,
        groupKey: key.groupKey ?? existing?.groupKey ?? null,
      });
      return Promise.resolve(true);
    },
    removeChatKey: () => Promise.reject(new Error("Sandbox does not delete keys")),
    readPendingRequest: (address, id) =>
      Promise.resolve(pendingRequests.get(`${addressKey(address)}:${id}`) ?? null),
    listPendingRequests: (address) =>
      Promise.resolve(
        [...pendingRequests.entries()]
          .filter(([id]) => id.startsWith(`${addressKey(address)}:`))
          .map(([, value]) => value),
      ),
    writePendingRequest: (address, request, writeOptions) => {
      if (!current() || writeOptions?.isCurrent?.() === false) return Promise.resolve(false);
      pendingRequests.set(`${addressKey(address)}:${request.localRequestId}`, request);
      return Promise.resolve(true);
    },
    bindPendingRequest: (address, id, uuid, writeOptions) => {
      if (!current() || writeOptions?.isCurrent?.() === false) return Promise.resolve(false);
      const key = `${addressKey(address)}:${id}`;
      const request = pendingRequests.get(key);
      if (!request || (request.requestMessageUuid !== null && request.requestMessageUuid !== uuid))
        return Promise.resolve(false);
      pendingRequests.set(key, { ...request, requestMessageUuid: uuid });
      return Promise.resolve(true);
    },
    readRequestCompletion: (address, id) =>
      Promise.resolve(completions.get(`${addressKey(address)}:${id}`) ?? null),
    readRequestCompletionByMessageUuid: (address, uuid) =>
      Promise.resolve(
        [...completions.entries()].find(
          ([id, receipt]) =>
            id.startsWith(`${addressKey(address)}:`) && receipt.requestMessageUuid === uuid,
        )?.[1] ?? null,
      ),
    completeGrant: (address, grant, writeOptions) => {
      const id = `${addressKey(address)}:${grant.localRequestId}`;
      if (
        !current() ||
        writeOptions?.isCurrent?.() === false ||
        !pendingRequests.has(id) ||
        completions.has(id)
      )
        return Promise.resolve(false);
      keys.set(addressKey(address), { fingerprint: grant.fingerprint, groupKey: grant.groupKey });
      pendingRequests.delete(id);
      completions.set(id, {
        localRequestId: grant.localRequestId,
        requestMessageUuid: grant.requestMessageUuid,
        responseMessageUuid: grant.responseMessageUuid,
        outcome: "granted",
      });
      return Promise.resolve(true);
    },
    completeReject: (address, reject, writeOptions) => {
      const id = `${addressKey(address)}:${reject.localRequestId}`;
      if (
        !current() ||
        writeOptions?.isCurrent?.() === false ||
        !pendingRequests.has(id) ||
        completions.has(id)
      )
        return Promise.resolve(false);
      pendingRequests.delete(id);
      completions.set(id, { ...reject, outcome: "rejected" });
      return Promise.resolve(true);
    },
    listStagedCreations: () => Promise.resolve([]),
    readStagedCreation: () => Promise.resolve(null),
    writeStagedCreation: () => Promise.reject(new Error("Sandbox creation is ephemeral")),
    finalizeCreation: () => Promise.reject(new Error("Sandbox creation is ephemeral")),
  };
  const scope = (): ChatE2eeControllerScope | null =>
    streamUuid === null
      ? null
      : {
          owner: runtime,
          runtimeGeneration: runtime.runtimeGeneration,
          deviceId: `sandbox-${device}`,
          streamUuid,
          keyUuid,
        };

  function decode(message: WorkspaceMessengerMessageDto): ChatE2eeMessage {
    if (
      message.stream_uuid !== streamUuid ||
      message.topic_uuid !== topicUuid ||
      message.author_uuid !== runtime.userUuid ||
      message.payload.kind === "markdown"
    )
      throw new Error("Unexpected sandbox message");
    const result = decodeChatE2eePayload(message.payload);
    if (!result.ok || result.value.keyUuid !== keyUuid) throw new Error("Invalid sandbox payload");
    return {
      uuid: message.uuid,
      streamUuid: message.stream_uuid,
      authorUuid: message.author_uuid,
      payload: result.value,
    };
  }

  async function post(
    payload: ChatE2eePayload,
    guard: () => boolean,
    canonicalMessageUuid?: string,
  ): Promise<ChatE2eeMessage> {
    if (!guard() || streamUuid === null || topicUuid === null) throw new Error("stale");
    const dto = await api.createMessage(options(guard), {
      ...(canonicalMessageUuid ? { uuid: canonicalMessageUuid } : {}),
      stream_uuid: streamUuid,
      topic_uuid: topicUuid,
      payload: encodeChatE2eePayload(payload),
    });
    if (!guard()) throw new Error("stale");
    const message = decode(dto);
    messages.set(message.uuid, message);
    return message;
  }

  async function activate(): Promise<void> {
    ensureCurrent();
    controller?.invalidate();
    plaintext.clear();
    const selected = scope();
    if (selected === null) throw new Error("Create the sandbox stream first");
    const activeDevice = device;
    const next = new ChatE2eeController({
      scope: selected,
      device: {
        deviceId: selected.deviceId,
        deviceName: `Sandbox ${activeDevice}`,
      },
      provider,
      storage,
      getCurrentScope: () => (current() ? scope() : null),
      // Fixture capabilities deliberately do not define the product's role policy.
      getRights: () => ({
        canRequest: true,
        canSend: true,
        canGrant: activeDevice === "issuer",
        canReject: activeDevice === "issuer",
        canRotate: false,
      }),
      isIssuerAllowed: (author) => author === runtime.userUuid,
      isAnnouncerAllowed: (author) => author === runtime.userUuid,
      sendPayload: post,
    });
    controller = next;
    const loaded = await next.loadKey();
    if (!loaded.ok) throw new Error(loaded.reason);
    for (const message of messages.values()) {
      if (!next.isCurrent()) throw new Error("stale");
      if (message.payload.kind !== "e2ee") await next.ingestKeyMessage(message);
    }
    for (const message of messages.values()) {
      if (!next.isCurrent()) throw new Error("stale");
      if (message.payload.kind === "e2ee") {
        const result = await next.decryptMessage({ ...message, payload: message.payload });
        if (result.ok && next.isCurrent()) {
          const text = new TextDecoder().decode(result.value);
          if (text !== E2EE_SANDBOX_FIXTURE_TEXT)
            throw new Error("Unexpected nonfixture plaintext");
          plaintext.set(message.uuid, text);
        }
      }
    }
  }

  async function initialize(): Promise<void> {
    ensureCurrent();
    if (streamUuid !== null || initializing) throw new Error("Sandbox already initialized");
    initializing = true;
    try {
      const announcement = encodeChatE2eePayload({
        kind: "key_announced",
        keyUuid,
        publicKey: E2EE_SANDBOX_FINGERPRINT,
      });
      if (announcement.kind !== "key_announced") throw new Error("Invalid fixture");
      const created = await api.createStreamWithDefaultTopic(options(), {
        name: streamName,
        description: "Development fixture. Not real encryption. Do not send secrets.",
        source_name: "native",
        source: { kind: "native" },
        invite_only: true,
        encryption: true,
        current_encryption_key: { key_uuid: keyUuid, public_key: announcement.public_key },
      });
      ensureCurrent();
      const stream = await api.getStream(options(), created.stream.uuid);
      ensureCurrent();
      if (
        stream.name !== streamName ||
        stream.project_id !== runtime.projectId ||
        stream.owner !== runtime.userUuid ||
        !stream.encryption ||
        stream.current_encryption_key?.key_uuid !== keyUuid ||
        stream.current_encryption_key.public_key !== announcement.public_key ||
        created.defaultTopic.stream_uuid !== stream.uuid
      )
        throw new Error("Backend did not create the sandbox encrypted stream");
      // initialize owns the only stream assignment; its flag excludes concurrent initializers.
      // eslint-disable-next-line require-atomic-updates
      streamUuid = stream.uuid;
      topicUuid = created.defaultTopic.uuid;
      for (const selected of ["issuer", "recipient"] as const) {
        keys.set(
          addressKey({ owner: runtime, deviceId: `sandbox-${selected}`, streamUuid, keyUuid }),
          {
            fingerprint: E2EE_SANDBOX_FINGERPRINT,
            groupKey: selected === "issuer" ? E2EE_SANDBOX_GROUP_KEY : null,
          },
        );
      }
      await activate();
      await post({ kind: "key_announced", keyUuid, publicKey: E2EE_SANDBOX_FINGERPRINT }, current);
    } finally {
      // Only this initializer can reset its lock.
      // eslint-disable-next-line require-atomic-updates
      initializing = false;
    }
  }

  async function reload(): Promise<void> {
    ensureCurrent();
    if (streamUuid === null) throw new Error("Create the sandbox stream first");
    const ownedStream = streamUuid;
    const stream = await api.getStream(options(), ownedStream);
    ensureCurrent();
    if (stream.uuid !== ownedStream || stream.current_encryption_key?.key_uuid !== keyUuid)
      throw new Error("Sandbox stream generation changed");
    const history = new Map<string, ChatE2eeMessage>();
    let pageMarker: string | undefined;
    const seenMarkers = new Set<string>();
    do {
      const page = await api.getMessagesPage(options(), {
        streamUuid: ownedStream,
        sortDir: "asc",
        pageLimit: 100,
        pageMarker,
      });
      ensureCurrent();
      for (const dto of page.items) {
        const message = decode(dto);
        history.set(message.uuid, message);
      }
      pageMarker = page.nextPageMarker ?? undefined;
      if (pageMarker && seenMarkers.has(pageMarker))
        throw new Error("Repeated sandbox history page");
      if (pageMarker) seenMarkers.add(pageMarker);
    } while (pageMarker);
    messages.clear();
    for (const [uuid, message] of history) messages.set(uuid, message);
    await activate();
  }

  function active(): ChatE2eeController {
    ensureCurrent();
    if (controller === null) throw new Error("Create the sandbox stream first");
    return controller;
  }
  async function requestKey(): Promise<void> {
    const result = await active().requestKey();
    if (!result.ok) throw new Error(result.reason);
  }
  async function respondToRequest(reject: boolean): Promise<void> {
    const next = active();
    const requests = [...messages.values()].filter(
      (message): message is ChatE2eeMessage<ChatKeyRequestPayload> =>
        message.payload.kind === "key_request" && message.payload.deviceId === "sandbox-recipient",
    );
    const request = requests.at(-1);
    if (!request) throw new Error("No recipient fixture request");
    const result = await (reject ? next.rejectKey(request) : next.grantKey(request));
    if (!result.ok) throw new Error(result.reason);
  }
  async function sendFixture(): Promise<void> {
    const result = await active().encryptMessage(
      new TextEncoder().encode(E2EE_SANDBOX_FIXTURE_TEXT),
    );
    if (!result.ok) throw new Error(result.reason);
    await activate();
  }
  async function switchDevice(next: SandboxDevice): Promise<void> {
    ensureCurrent();
    device = next;
    await activate();
  }
  function getSnapshot(): E2eeSandboxSnapshot {
    return {
      streamUuid,
      device,
      state: current() ? (controller?.getState() ?? null) : null,
      messages: current()
        ? [...messages.values()].map((message) => ({
            uuid: message.uuid,
            kind: message.payload.kind,
            plaintext: plaintext.get(message.uuid) ?? null,
          }))
        : [],
    };
  }
  function dispose(): void {
    disposed = true;
    abort.abort();
    controller?.invalidate();
    keys.clear();
    pendingRequests.clear();
    completions.clear();
    messages.clear();
    plaintext.clear();
  }
  return {
    initialize,
    reload,
    requestKey,
    respondToRequest,
    sendFixture,
    switchDevice,
    getSnapshot,
    dispose,
    isCurrent: current,
  };
}

export type DevChatE2eeSandbox = ReturnType<typeof createDevChatE2eeSandbox>;
