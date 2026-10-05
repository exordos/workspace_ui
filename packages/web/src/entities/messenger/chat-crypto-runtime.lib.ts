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
import { correlateChatKeyResponse } from "./chat-e2ee.lib";
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
import type {
  ChatE2eeMessage,
  ChatKeyRequestPayload,
  ChatKeyResponsePayload,
} from "./chat-e2ee.types";
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
  let metadata = { ...stream.currentEncryptionKey };
  let rotatingMetadata: typeof metadata | null = null;
  let expectedFingerprint = fingerprintBytes(metadata.keyFingerprint)!;
  const device = await ensureChatDeviceIdentity(runtimeContext, runtimeCurrent);
  let scope: ChatE2eeControllerScope = {
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
        ((known.currentEncryptionKey?.keyUuid === metadata.keyUuid &&
          known.currentEncryptionKey.keyFingerprint === metadata.keyFingerprint) ||
          (rotatingMetadata !== null &&
            known.currentEncryptionKey?.keyUuid === rotatingMetadata.keyUuid &&
            known.currentEncryptionKey.keyFingerprint === rotatingMetadata.keyFingerprint)))
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
    const catalog = useMessengerStore.getState();
    const activeStream =
      (catalog.ownerKey === owner ? catalog.streamsById[streamUuid] : undefined) ?? stream;
    const member = current() && activeStream.userUuid === runtimeContext.userUuid;
    const canManage = member && issuerAllowed(runtimeContext.userUuid);
    return {
      canRequest: member,
      canSend: member,
      canGrant: canManage,
      canReject: canManage,
      canRotate: member && activeStream.ownerUuid === runtimeContext.userUuid,
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
    let recoveredRotation = false;
    const capturedPermissions = permissionSnapshot();
    const refreshed = adaptMessengerStream(await getStream(options(), streamUuid));
    assertCurrent();
    if (
      refreshed.projectId !== runtimeContext.projectId ||
      refreshed.userUuid !== runtimeContext.userUuid ||
      !refreshed.encryption ||
      refreshed.uuid !== streamUuid
    )
      throw new Error("stale");
    if (
      refreshed.currentEncryptionKey &&
      refreshed.currentEncryptionKey.keyUuid !== metadata.keyUuid
    ) {
      const stages = await realChatKeyStorage.listStagedCreations({
        owner: runtimeContext,
        deviceId: device.deviceId,
      });
      assertCurrent();
      const stage = stages.find(
        (item) =>
          item.rotation?.streamUuid === streamUuid &&
          item.keyUuid === refreshed.currentEncryptionKey?.keyUuid &&
          btoa(String.fromCharCode(...item.fingerprint.bytes)) ===
            refreshed.currentEncryptionKey?.keyFingerprint,
      );
      if (!stage || refreshed.ownerUuid !== runtimeContext.userUuid || !rights().canRotate)
        throw new Error("stale");
      const committed = await realChatKeyStorage.finalizeCreation(
        { owner: runtimeContext, deviceId: device.deviceId },
        stage.creationId,
        streamUuid,
        { isCurrent: () => current() && rights().canRotate },
      );
      assertCurrent();
      if (!committed) throw new Error("storage-failed");
      metadata = { ...refreshed.currentEncryptionKey };
      expectedFingerprint = stage.fingerprint;
      scope = { ...scope, keyUuid: metadata.keyUuid };
      controller = createController(scope);
      generationControllers.set(scope.keyUuid, controller);
      const loaded = await controller.loadKey();
      if (!loaded.ok) throw new Error(loaded.reason);
      rotatingMetadata = null;
      recoveredRotation = true;
    }
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
    return recoveredRotation;
  };
  let lastSent: MessengerMessageActionResult | null = null;
  let sendTopic: string | null = null;
  let includeStream = true;
  const requests = new Map<string, ChatE2eeMessage<ChatKeyRequestPayload>>();
  const responses = new Map<string, ChatE2eeMessage<ChatKeyResponsePayload>>();
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
  let controller = createController(scope);
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
  const getKeyRequestOutcomes = () =>
    [...requests.values()].map((request) => {
      let status: "pending" | "granted" | "rejected" = "pending";
      for (const response of responses.values()) {
        if (
          correlateChatKeyResponse({
            request,
            response,
            issuerCanGrantKey: issuerAllowed(response.authorUuid),
          }).status === "matched"
        ) {
          status = response.payload.kind === "key_grant" ? "granted" : "rejected";
          break;
        }
      }
      return { request, status };
    });
  const pendingRequest = (uuid: string) =>
    getKeyRequestOutcomes().find((item) => item.request.uuid === uuid && item.status === "pending")
      ?.request;
  const grantRequest = async (uuid: string) => {
    const request = pendingRequest(uuid);
    if (!request) throw new Error("invalid-message");
    const activeController = await generationController(request.payload.keyUuid, true);
    if (!activeController) throw new Error("historical-key-unavailable");
    const result = await activeController.grantKey(request);
    if (!result.ok) throw new Error(result.reason);
    if (result.value.payload.kind === "key_grant")
      responses.set(result.value.uuid, { ...result.value, payload: result.value.payload });
    return result;
  };
  const session = {
    get scope() {
      return scope;
    },
    device,
    getState: () => ({
      ...controller.getState(),
      pending: sessionPending > 0 || controller.getState().pending,
    }),
    getRights: rights,
    getKeyRequestOutcomes,
    getKeyRequests: () =>
      getKeyRequestOutcomes()
        .filter((item) => item.status === "pending")
        .map((item) => item.request),
    canGrantKey: (uuid: string) => {
      const request = pendingRequest(uuid);
      return (
        rights().canGrant &&
        !!request &&
        generationControllers.get(request.payload.keyUuid)?.getState().access === "ready"
      );
    },
    canRejectKey: (uuid: string) => rights().canReject && !!pendingRequest(uuid),
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
          if (mapped.payload.kind === "key_grant" || mapped.payload.kind === "key_reject")
            responses.set(mapped.uuid, { ...mapped, payload: mapped.payload });
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
        return grantRequest(uuid);
      }),
    rejectKey: (uuid: string) =>
      run(async () => {
        await refresh();
        const request = pendingRequest(uuid);
        if (!request) throw new Error("invalid-message");
        const knownController = await generationController(request.payload.keyUuid);
        // Rejecting does not deliver a secret or need its fingerprint.
        const activeController =
          knownController ?? createController({ ...scope, keyUuid: request.payload.keyUuid });
        const result = await activeController.rejectKey(request);
        if (!knownController) activeController.invalidate();
        if (!result.ok) throw new Error(result.reason);
        if (result.value.payload.kind === "key_reject")
          responses.set(result.value.uuid, { ...result.value, payload: result.value.payload });
        return result;
      }),
    grantAllKeys: () =>
      run(async () => {
        await refresh();
        if (!rights().canGrant) throw new Error("forbidden");
        const outcomes: {
          requestMessageUuid: string;
          status: "granted" | "failed";
          reason?: string;
        }[] = [];
        for (const request of getKeyRequestOutcomes().filter((item) => item.status === "pending")) {
          try {
            await refresh();
            await grantRequest(request.request.uuid);
            outcomes.push({ requestMessageUuid: request.request.uuid, status: "granted" });
          } catch (error) {
            assertCurrent();
            outcomes.push({
              requestMessageUuid: request.request.uuid,
              status: "failed",
              reason: error instanceof Error ? error.message : "unavailable",
            });
          }
        }
        return outcomes;
      }),
    reissueKey: () =>
      run(async () => {
        if (await refresh()) return { status: "applied" as const, ownerKey: owner, message: null };
        if (!rights().canRotate) throw new Error("forbidden");
        const allowed = () => current() && rights().canRotate;
        const stages = await realChatKeyStorage.listStagedCreations({
          owner: runtimeContext,
          deviceId: device.deviceId,
        });
        assertCurrent();
        let stage = stages.find(
          (item) =>
            item.rotation?.streamUuid === streamUuid &&
            item.rotation.previousKeyUuid === metadata.keyUuid,
        );
        if (!stage) {
          const groupKey = await realChatCryptoProvider.createGroupKey();
          assertCurrent();
          if (!groupKey.ok) throw new Error(groupKey.reason);
          const keyUuid = crypto.randomUUID();
          const fingerprint = await realChatCryptoProvider.fingerprintGroupKey(
            groupKey.value,
            keyUuid,
          );
          assertCurrent();
          if (!fingerprint.ok) throw new Error(fingerprint.reason);
          const topicUuid = Object.values(useMessengerStore.getState().topicsById).find(
            (topic) =>
              topic.streamUuid === streamUuid &&
              topic.projectId === runtimeContext.projectId &&
              topic.isDefault,
          )?.uuid;
          if (!topicUuid) throw new Error("missing-topic");
          stage = {
            creationId: crypto.randomUUID(),
            keyUuid,
            fingerprint: fingerprint.value,
            groupKey: groupKey.value,
            rotation: {
              streamUuid,
              previousKeyUuid: metadata.keyUuid,
              previousFingerprint: metadata.keyFingerprint,
              previousAnnouncementUuid: crypto.randomUUID(),
              topicUuid,
            },
          };
          const persisted = await realChatKeyStorage.writeStagedCreation(
            { owner: runtimeContext, deviceId: device.deviceId },
            stage,
            { isCurrent: allowed },
          );
          assertCurrent();
          if (!persisted) throw new Error("storage-failed");
        }
        if (stage.rotation?.previousFingerprint !== metadata.keyFingerprint)
          throw new Error("invalid-key");
        const fingerprint = btoa(String.fromCharCode(...stage.fingerprint.bytes));
        rotatingMetadata = { keyUuid: stage.keyUuid, keyFingerprint: fingerprint };
        const shared = {
          runtimeContext,
          getRuntimeContext,
          signal,
          streamUuid,
          topicUuid: stage.rotation.topicUuid,
          expectedCurrentKey: metadata,
          isCurrent: allowed,
        };
        // The first generation was created in stream metadata; publish it before replacing that metadata.
        if (!announcedFingerprints.has(metadata.keyUuid)) {
          let pageMarker: string | undefined;
          const markers = new Set<string>();
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
                dto.payload.key_uuid !== metadata.keyUuid
              )
                continue;
              const mapped = domainMessage(adaptMessengerMessage(dto));
              if (mapped) rememberAnnouncement(mapped);
            }
            if (announcedFingerprints.has(metadata.keyUuid)) break;
            pageMarker = page.nextPageMarker ?? undefined;
            if (pageMarker && markers.has(pageMarker)) throw new Error("invalid-message");
            if (pageMarker) markers.add(pageMarker);
          } while (pageMarker);
        }
        const previousFingerprint = announcedFingerprints.get(metadata.keyUuid);
        if (previousFingerprint && previousFingerprint !== metadata.keyFingerprint)
          throw new Error("invalid-key");
        if (!previousFingerprint) {
          const previousResult = await sendMessengerE2eePayload({
            ...shared,
            canonicalMessageUuid: stage.rotation.previousAnnouncementUuid,
            keyFingerprint: metadata.keyFingerprint,
            payload: {
              kind: "key_announced",
              keyUuid: metadata.keyUuid,
              keyFingerprint: expectedFingerprint,
            },
          });
          assertCurrent();
          if (previousResult.status !== "applied") throw new Error("send-failed");
          announcedFingerprints.set(metadata.keyUuid, metadata.keyFingerprint);
        }
        const result = await sendMessengerE2eePayload({
          ...shared,
          rotateKey: true,
          canonicalMessageUuid: stage.creationId,
          keyFingerprint: fingerprint,
          payload: {
            kind: "key_announced",
            keyUuid: stage.keyUuid,
            keyFingerprint: stage.fingerprint,
          },
        });
        if (result.status !== "applied") throw new Error("send-failed");
        await refresh();
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
      responses.clear();
    },
  };
  return session;
}
export type RealChatSession = Awaited<ReturnType<typeof openRealChatSession>>;

export type RealChatMessageDecryption =
  | { readonly status: "ready"; readonly plaintext: string }
  | { readonly status: "missing-key" }
  | { readonly status: "error" };

/** Decoded content is returned only to presentation; ciphertext in message stores remains untouched. */
export async function decryptRealChatMessage(
  runtime: WorkspaceRuntimeContext,
  message: MessengerMessage,
  isCurrent: () => boolean,
): Promise<string | null> {
  const result = await decryptRealChatMessageResult(runtime, message, isCurrent);
  return result.status === "ready" ? result.plaintext : null;
}

/** Missing material is a requestable state; invalid envelopes and storage failures are retryable errors. */
export async function decryptRealChatMessageResult(
  runtime: WorkspaceRuntimeContext,
  message: MessengerMessage,
  isCurrent: () => boolean,
): Promise<RealChatMessageDecryption> {
  if (!isCurrent() || message.projectId !== runtime.projectId || message.payload.kind !== "e2ee")
    return { status: "missing-key" };
  try {
    const device = await realChatKeyStorage.readDeviceIdentity(runtime);
    if (!isCurrent() || !device) return { status: "missing-key" };
    const key = await realChatKeyStorage.readChatKey({
      owner: runtime,
      deviceId: device.deviceId,
      streamUuid: message.streamUuid,
      keyUuid: message.payload.keyUuid,
    });
    if (!isCurrent() || !key?.groupKey) return { status: "missing-key" };
    const actual = await realChatCryptoProvider.fingerprintGroupKey(
      key.groupKey,
      message.payload.keyUuid,
    );
    if (!isCurrent()) return { status: "missing-key" };
    if (!actual.ok || !same(actual.value.bytes, key.fingerprint.bytes)) return { status: "error" };
    const mapped = domainMessage(message);
    if (mapped?.payload.kind !== "e2ee") return { status: "error" };
    const result = await realChatCryptoProvider.decryptMessage({
      groupKey: key.groupKey,
      envelope: mapped.payload.content,
      context: { streamUuid: message.streamUuid, keyUuid: message.payload.keyUuid },
    });
    if (!isCurrent()) return { status: "missing-key" };
    if (!result.ok) return { status: "error" };
    return {
      status: "ready",
      plaintext: new TextDecoder("utf-8", { fatal: true }).decode(result.value),
    };
  } catch {
    return { status: isCurrent() ? "error" : "missing-key" };
  }
}
