import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getMessagesPage } from "~/shared/api/messenger-messages.api";
import { getStream, getStreamBindingsPage } from "~/shared/api/messenger-streams.api";
import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  realChatCryptoProvider,
  realChatKeyStorage,
} from "./chat-crypto-resources.lib";
import { ChatE2eeController } from "./chat-e2ee-controller.lib";
import { decodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import {
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
} from "./messenger-adapters.lib";
import { sendMessengerE2eePayload } from "./messenger-message-actions.lib";
import { buildMessengerRequestOptions } from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { ChatCryptoKeyFingerprint } from "./chat-crypto-provider.types";
import type {
  ChatE2eeControllerRights,
  ChatE2eeControllerScope,
} from "./chat-e2ee-controller.types";
import type { ChatE2eeMessage, ChatKeyRequestPayload } from "./chat-e2ee.types";
import type { MessengerMessageActionResult } from "./messenger-message-actions.lib";
import type { MessengerMessage, MessengerStreamBinding } from "./messenger.types";

function fingerprintBytes(value: string): ChatCryptoKeyFingerprint | null {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  try {
    const binary = atob(value);
    if (btoa(binary) !== value || binary.length !== 32) return null;
    return { bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
  } catch {
    return null;
  }
}
const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);
function domainMessage(message: MessengerMessage): ChatE2eeMessage | null {
  const payload = message.payload;
  if (payload.kind === "markdown") return null;
  const wire =
    payload.kind === "e2ee"
      ? { kind: payload.kind, key_uuid: payload.keyUuid, content: payload.content }
      : payload.kind === "key_request"
        ? {
            kind: payload.kind,
            key_uuid: payload.keyUuid,
            device_id: payload.deviceId,
            device_name: payload.deviceName,
            public_key: payload.publicKey,
          }
        : payload.kind === "key_announced"
          ? {
              kind: payload.kind,
              key_uuid: payload.keyUuid,
              key_fingerprint: payload.keyFingerprint,
            }
          : payload.kind === "key_grant"
            ? {
                kind: payload.kind,
                key_uuid: payload.keyUuid,
                request_message_uuid: payload.requestMessageUuid,
                sender_device_id: payload.senderDeviceId,
                recipient_device_id: payload.recipientDeviceId,
                content: payload.content,
              }
            : {
                kind: payload.kind,
                key_uuid: payload.keyUuid,
                request_message_uuid: payload.requestMessageUuid,
                sender_device_id: payload.senderDeviceId,
                recipient_device_id: payload.recipientDeviceId,
              };
  const decoded = decodeChatE2eePayload(wire);
  return decoded.ok
    ? {
        uuid: message.uuid,
        streamUuid: message.streamUuid,
        authorUuid: message.authorUuid,
        payload: decoded.value,
      }
    : null;
}

export interface OpenRealChatSessionOptions {
  readonly runtimeContext: WorkspaceRuntimeContext;
  readonly streamUuid: string;
  readonly getRuntimeContext?: WorkspaceRuntimeContextGetter;
  readonly signal?: AbortSignal;
}

/** One live owner/device/chat/generation. Secrets remain in dedicated storage and controller memory. */
export async function openRealChatSession({
  runtimeContext,
  streamUuid,
  getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  signal,
}: OpenRealChatSessionOptions) {
  const capture = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (capture == null) throw new Error("unavailable");
  let disposed = false;
  const runtimeCurrent = () =>
    !disposed && !isWorkspaceRuntimeRequestInvalidated(capture, getRuntimeContext, signal);
  const options = () => {
    const request = buildMessengerRequestOptions(runtimeContext, undefined, signal);
    const fetchImpl = request.fetchImpl ?? fetch;
    request.fetchImpl = (url, init) =>
      runtimeCurrent() ? fetchImpl(url, init) : Promise.reject(new Error("stale"));
    return request;
  };
  let stream = adaptMessengerStream(await getStream(options(), streamUuid));
  if (!runtimeCurrent()) throw new Error("stale");
  const owner = workspaceRuntimeOwnerKey(runtimeContext);
  if (
    stream.uuid !== streamUuid ||
    stream.projectId !== runtimeContext.projectId ||
    stream.userUuid !== runtimeContext.userUuid ||
    stream.encryption !== true ||
    !stream.currentEncryptionKey ||
    !fingerprintBytes(stream.currentEncryptionKey.keyFingerprint)
  )
    throw new Error("invalid-key");
  const metadata = { ...stream.currentEncryptionKey };
  const expectedFingerprint = fingerprintBytes(metadata.keyFingerprint)!;
  const device = await ensureChatDeviceIdentity(runtimeContext, runtimeCurrent);
  const scope: ChatE2eeControllerScope = {
    owner: runtimeContext,
    deviceId: device.deviceId,
    streamUuid,
    keyUuid: metadata.keyUuid,
    runtimeGeneration: runtimeContext.runtimeGeneration,
  };
  const listeners = new Set<() => void>();
  let bindings: readonly MessengerStreamBinding[] = [];
  let sessionPending = 0;
  const current = () => {
    if (!runtimeCurrent()) return false;
    const catalog = useMessengerStore.getState();
    const known = catalog.ownerKey === owner ? catalog.streamsById[streamUuid] : undefined;
    return (
      !known ||
      (known.encryption === true &&
        known.currentEncryptionKey?.keyUuid === metadata.keyUuid &&
        known.currentEncryptionKey.keyFingerprint === metadata.keyFingerprint)
    );
  };
  const assertCurrent = () => {
    if (!current()) throw new Error("stale");
  };
  const issuerAllowed = (author: string): boolean => {
    if (!current()) return false;
    const catalog = useMessengerStore.getState();
    const latest = catalog.ownerKey === owner ? catalog.streamsById[streamUuid] : undefined;
    const activeStream = latest ?? stream;
    if (activeStream.ownerUuid === author) return true;
    if (
      author === runtimeContext.userUuid &&
      activeStream.role !== "administrator" &&
      activeStream.role !== "owner"
    )
      return false;
    return bindings.some((binding) => {
      if (
        binding.userUuid !== author ||
        (binding.role !== "owner" && binding.role !== "administrator")
      )
        return false;
      // A live role change can revoke permissions while a provider operation is awaiting.
      const actual =
        catalog.ownerKey === owner ? catalog.streamBindingsById[binding.uuid] : undefined;
      return (
        catalog.ownerKey !== owner ||
        (actual?.userUuid === author &&
          actual.streamUuid === streamUuid &&
          actual.role === binding.role)
      );
    });
  };
  const rights = (): ChatE2eeControllerRights => {
    const member = current() && stream.userUuid === runtimeContext.userUuid;
    const canManage = member && issuerAllowed(runtimeContext.userUuid);
    return {
      canRequest: member,
      canSend: member,
      canGrant: canManage,
      canReject: canManage,
      canRotate: false,
    };
  };
  const permissionSnapshot = (): string => {
    const catalog = useMessengerStore.getState();
    if (catalog.ownerKey !== owner) return "unowned";
    const currentStream = catalog.streamsById[streamUuid];
    const currentBindings = Object.values(catalog.streamBindingsById)
      .filter(
        (binding) =>
          binding.streamUuid === streamUuid && binding.projectId === runtimeContext.projectId,
      )
      .map((binding) => [binding.uuid, binding.userUuid, binding.role])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    return JSON.stringify([
      currentStream?.ownerUuid,
      currentStream?.userUuid,
      currentStream?.role,
      currentBindings,
    ]);
  };
  const refresh = async () => {
    assertCurrent();
    const capturedPermissions = permissionSnapshot();
    const refreshed = adaptMessengerStream(await getStream(options(), streamUuid));
    assertCurrent();
    if (
      refreshed.projectId !== runtimeContext.projectId ||
      refreshed.userUuid !== runtimeContext.userUuid ||
      !refreshed.encryption ||
      refreshed.currentEncryptionKey?.keyUuid !== metadata.keyUuid ||
      refreshed.currentEncryptionKey.keyFingerprint !== metadata.keyFingerprint
    )
      throw new Error("stale");
    const members: MessengerStreamBinding[] = [];
    let pageMarker: string | undefined;
    const markers = new Set<string>();
    do {
      const page = await getStreamBindingsPage(options(), {
        streamUuid,
        pageLimit: 100,
        pageMarker,
      });
      assertCurrent();
      for (const dto of page.items)
        if (dto.stream_uuid === streamUuid && dto.project_id === runtimeContext.projectId)
          members.push(adaptMessengerStreamBinding(dto));
      pageMarker = page.nextPageMarker ?? undefined;
      if (pageMarker && markers.has(pageMarker)) throw new Error("invalid-message");
      if (pageMarker) markers.add(pageMarker);
    } while (pageMarker);
    // A delayed REST snapshot must not undo a role change received over realtime.
    if (permissionSnapshot() !== capturedPermissions) throw new Error("forbidden");
    stream = refreshed;
    bindings = members;
    const catalog = useMessengerStore.getState();
    if (catalog.ownerKey === owner) {
      catalog.upsertStream(owner, stream);
      catalog.upsertStreamBindings(owner, members);
    }
  };
  let lastSent: MessengerMessageActionResult | null = null;
  let sendTopic: string | null = null;
  let includeStream = true;
  const requests = new Map<string, ChatE2eeMessage<ChatKeyRequestPayload>>();
  const createController = (generationScope: ChatE2eeControllerScope) =>
    new ChatE2eeController({
      scope: generationScope,
      device,
      provider: realChatCryptoProvider,
      storage: realChatKeyStorage,
      getCurrentScope: () => (current() ? generationScope : null),
      getRights: () => ({
        ...rights(),
        canSend: rights().canSend && generationScope.keyUuid === metadata.keyUuid,
      }),
      isIssuerAllowed: issuerAllowed,
      isAnnouncerAllowed: issuerAllowed,
      sendPayload: async (payload, guard, canonicalMessageUuid) => {
        assertCurrent();
        const topicUuid =
          sendTopic ??
          Object.values(useMessengerStore.getState().topicsById).find(
            (topic) =>
              topic.streamUuid === streamUuid &&
              topic.projectId === runtimeContext.projectId &&
              topic.isDefault,
          )?.uuid;
        if (!topicUuid) throw new Error("missing-topic");
        const result = await sendMessengerE2eePayload({
          runtimeContext,
          getRuntimeContext,
          signal,
          streamUuid,
          topicUuid,
          payload,
          keyFingerprint: metadata.keyFingerprint,
          expectedCurrentKey: metadata,
          isCurrent: () => current() && guard(),
          canonicalMessageUuid,
          includeStreamConversation: includeStream,
        });
        assertCurrent();
        if (result.status !== "applied" || !result.message) throw new Error("send-failed");
        lastSent = result;
        const mapped = domainMessage(result.message);
        if (!mapped) throw new Error("invalid-message");
        return mapped;
      },
    });
  const controller = createController(scope);
  const generationControllers = new Map([[scope.keyUuid, controller]]);
  const announcedFingerprints = new Map<string, string>();
  const rememberAnnouncement = (message: ChatE2eeMessage): void => {
    if (message.payload.kind !== "key_announced" || !issuerAllowed(message.authorUuid)) return;
    const encoded = btoa(String.fromCharCode(...message.payload.keyFingerprint.bytes));
    if (!fingerprintBytes(encoded)) throw new Error("invalid-key");
    const previous = announcedFingerprints.get(message.payload.keyUuid);
    if (previous !== undefined && previous !== encoded) throw new Error("invalid-key");
    announcedFingerprints.set(message.payload.keyUuid, encoded);
  };
  const generationController = async (keyUuid: string, scanHistory = false) => {
    const existingController = generationControllers.get(keyUuid);
    if (existingController) return existingController;
    assertCurrent();
    const historicalScope = { ...scope, keyUuid };
    const stored = await realChatKeyStorage.readChatKey(historicalScope);
    assertCurrent();
    const storedFingerprint = stored
      ? btoa(String.fromCharCode(...stored.fingerprint.bytes))
      : undefined;
    let fingerprint = announcedFingerprints.get(keyUuid) ?? storedFingerprint;
    if (fingerprint && storedFingerprint && fingerprint !== storedFingerprint)
      throw new Error("invalid-key");
    // Only an explicit old-message request scans history. Never borrow the latest fingerprint.
    if (!fingerprint && scanHistory) {
      const markers = new Set<string>();
      let pageMarker: string | undefined;
      do {
        const page = await getMessagesPage(options(), {
          streamUuid,
          pageLimit: 100,
          pageMarker,
          sortKey: "created_at",
          sortDir: "desc",
        });
        assertCurrent();
        for (const dto of page.items) {
          if (
            dto.project_id !== runtimeContext.projectId ||
            dto.stream_uuid !== streamUuid ||
            dto.payload.kind !== "key_announced" ||
            dto.payload.key_uuid !== keyUuid
          )
            continue;
          const announcement = domainMessage(adaptMessengerMessage(dto));
          if (announcement) rememberAnnouncement(announcement);
        }
        fingerprint = announcedFingerprints.get(keyUuid);
        if (fingerprint) break;
        pageMarker = page.nextPageMarker ?? undefined;
        if (pageMarker && markers.has(pageMarker)) throw new Error("invalid-message");
        if (pageMarker) markers.add(pageMarker);
      } while (pageMarker);
    }
    if (!fingerprint) return null;
    const bytes = fingerprintBytes(fingerprint);
    if (!bytes) throw new Error("invalid-key");
    const persisted = await realChatKeyStorage.writeChatKey(
      historicalScope,
      { fingerprint: bytes, groupKey: stored?.groupKey ?? null },
      { isCurrent: current },
    );
    assertCurrent();
    if (!persisted) throw new Error("storage-failed");
    const historicalController = createController(historicalScope);
    const loaded = await historicalController.loadKey();
    assertCurrent();
    if (!loaded.ok) throw new Error(loaded.reason);
    generationControllers.set(keyUuid, historicalController);
    return historicalController;
  };
  const emit = () => {
    if (current()) {
      for (const listener of listeners) listener();
      notifyRealChatKeyChanges();
    }
  };
  let operationQueue: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = operationQueue.then(() => execute(operation));
    operationQueue = next.catch(() => undefined);
    return next;
  };
  const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertCurrent();
    sessionPending++;
    emit();
    try {
      return await operation();
    } finally {
      sessionPending--;
      emit();
    }
  };
  const recoverCreation = async () => {
    const stages = await realChatKeyStorage.listStagedCreations({
      owner: runtimeContext,
      deviceId: device.deviceId,
    });
    assertCurrent();
    for (const stage of stages) {
      if (
        stream.ownerUuid !== runtimeContext.userUuid ||
        stage.keyUuid !== metadata.keyUuid ||
        !same(stage.fingerprint.bytes, expectedFingerprint.bytes)
      )
        continue;
      const committed = await realChatKeyStorage.finalizeCreation(
        { owner: runtimeContext, deviceId: device.deviceId },
        stage.creationId,
        streamUuid,
        { isCurrent: current },
      );
      assertCurrent();
      if (!committed) throw new Error("storage-failed");
    }
  };
  const session = {
    scope,
    device,
    getState: () => ({
      ...controller.getState(),
      pending: sessionPending > 0 || controller.getState().pending,
    }),
    getRights: rights,
    isIssuerAllowed: issuerAllowed,
    getGenerationState: (keyUuid: string) => generationControllers.get(keyUuid)?.getState() ?? null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load: () =>
      run(async () => {
        await refresh();
        await recoverCreation();
        const existing = await realChatKeyStorage.readChatKey(scope);
        assertCurrent();
        if (existing && !same(existing.fingerprint.bytes, expectedFingerprint.bytes))
          throw new Error("invalid-key");
        const persisted = await realChatKeyStorage.writeChatKey(
          scope,
          { fingerprint: expectedFingerprint, groupKey: existing?.groupKey ?? null },
          { isCurrent: current },
        );
        assertCurrent();
        if (!persisted) throw new Error("storage-failed");
        const result = await controller.loadKey();
        if (!result.ok) throw new Error(result.reason);
      }),
    ingest: (messages: readonly MessengerMessage[]) =>
      run(async () => {
        await refresh();
        for (const message of messages) {
          if (
            message.projectId === runtimeContext.projectId &&
            message.streamUuid === streamUuid &&
            message.payload.kind === "key_announced"
          ) {
            const mapped = domainMessage(message);
            if (mapped) rememberAnnouncement(mapped);
          }
        }
        for (const message of messages) {
          if (
            message.projectId !== runtimeContext.projectId ||
            message.streamUuid !== streamUuid ||
            message.payload.kind === "markdown" ||
            message.payload.kind === "e2ee"
          )
            continue;
          const mapped = domainMessage(message);
          if (!mapped) continue;
          if (mapped.payload.kind === "key_request")
            requests.set(mapped.uuid, { ...mapped, payload: mapped.payload });
          const activeController = await generationController(mapped.payload.keyUuid);
          if (!activeController) continue;
          const result = await activeController.ingestKeyMessage(mapped);
          assertCurrent();
          if (!result.ok && result.reason !== "invalid-message" && result.reason !== "forbidden")
            throw new Error(result.reason);
        }
      }),
    requestKey: (keyUuid = scope.keyUuid) =>
      run(async () => {
        await refresh();
        const activeController = await generationController(keyUuid, true);
        if (!activeController) throw new Error("historical-key-unavailable");
        const result = await activeController.requestKey();
        if (!result.ok) throw new Error(result.reason);
        return result;
      }),
    grantKey: (uuid: string) =>
      run(async () => {
        await refresh();
        const request = requests.get(uuid);
        if (!request) throw new Error("invalid-message");
        const activeController = await generationController(request.payload.keyUuid, true);
        if (!activeController) throw new Error("historical-key-unavailable");
        const result = await activeController.grantKey(request);
        if (!result.ok) throw new Error(result.reason);
        return result;
      }),
    rejectKey: (uuid: string) =>
      run(async () => {
        await refresh();
        const request = requests.get(uuid);
        if (!request) throw new Error("invalid-message");
        const knownController = await generationController(request.payload.keyUuid);
        // Rejecting does not deliver a secret or need its fingerprint.
        const activeController =
          knownController ?? createController({ ...scope, keyUuid: request.payload.keyUuid });
        const result = await activeController.rejectKey(request);
        if (!knownController) activeController.invalidate();
        if (!result.ok) throw new Error(result.reason);
        return result;
      }),
    send: (input: {
      readonly text: string;
      readonly topicUuid: string;
      readonly includeStreamConversation?: boolean;
    }) =>
      run(async () => {
        await refresh();
        sendTopic = input.topicUuid;
        includeStream = input.includeStreamConversation ?? true;
        try {
          const result = await controller.encryptMessage(new TextEncoder().encode(input.text));
          if (!result.ok) throw new Error(result.reason);
          const sent = lastSent;
          if (sent?.status !== "applied" || sent.message?.uuid !== result.value.uuid)
            throw new Error("send-failed");
          return sent;
        } finally {
          sendTopic = null;
        }
      }),
    decrypt: (message: MessengerMessage) =>
      decryptRealChatMessage(runtimeContext, message, current),
    dispose() {
      disposed = true;
      for (const generation of generationControllers.values()) generation.invalidate();
      generationControllers.clear();
      announcedFingerprints.clear();
      listeners.clear();
      requests.clear();
    },
  };
  return session;
}
export type RealChatSession = Awaited<ReturnType<typeof openRealChatSession>>;

/** Decoded content is returned only to presentation; ciphertext in message stores remains untouched. */
export async function decryptRealChatMessage(
  runtime: WorkspaceRuntimeContext,
  message: MessengerMessage,
  isCurrent: () => boolean,
): Promise<string | null> {
  if (!isCurrent() || message.projectId !== runtime.projectId || message.payload.kind !== "e2ee")
    return null;
  try {
    const device = await realChatKeyStorage.readDeviceIdentity(runtime);
    if (!isCurrent() || !device) return null;
    const key = await realChatKeyStorage.readChatKey({
      owner: runtime,
      deviceId: device.deviceId,
      streamUuid: message.streamUuid,
      keyUuid: message.payload.keyUuid,
    });
    if (!isCurrent() || !key?.groupKey) return null;
    const actual = await realChatCryptoProvider.fingerprintGroupKey(
      key.groupKey,
      message.payload.keyUuid,
    );
    if (!isCurrent() || !actual.ok || !same(actual.value.bytes, key.fingerprint.bytes)) return null;
    const mapped = domainMessage(message);
    if (mapped?.payload.kind !== "e2ee") return null;
    const result = await realChatCryptoProvider.decryptMessage({
      groupKey: key.groupKey,
      envelope: mapped.payload.content,
      context: { streamUuid: message.streamUuid, keyUuid: message.payload.keyUuid },
    });
    if (!isCurrent() || !result.ok) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(result.value);
  } catch {
    return null;
  }
}
