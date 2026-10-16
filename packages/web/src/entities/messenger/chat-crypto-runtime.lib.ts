import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  realChatCryptoProvider,
  realChatKeyStorage,
  subscribeRealChatKeyChanges,
} from "./chat-crypto-resources.lib";
import { ChatE2eeController } from "./chat-e2ee-controller.lib";
import { decodeMessengerE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { correlateChatKeyResponse } from "./chat-e2ee.lib";
import { sendMessengerE2eePayload } from "./messenger-message-actions.lib";
import { useMessengerStore } from "./messenger.model";
import type {
  ChatE2eeControllerRights,
  ChatE2eeControllerState,
  ChatE2eeControllerScope,
} from "./chat-e2ee-controller.types";
import type {
  ChatE2eeMessage,
  ChatE2eePayload,
  ChatEncryptedPayload,
  ChatKeyRequestPayload,
  ChatKeyResponsePayload,
} from "./chat-e2ee.types";
import type { StoredChatKey } from "./chat-key-storage.types";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerMessage } from "./messenger.types";

function domainMessage(message: MessengerMessage): ChatE2eeMessage | null {
  const payload = message.payload;
  if (payload.kind === "markdown") return null;
  const decoded = decodeMessengerE2eePayload(payload);
  return decoded.ok
    ? {
        uuid: message.uuid,
        streamUuid: message.streamUuid,
        authorUuid: message.authorUuid,
        payload: decoded.value,
      }
    : null;
}

function keyMaterialChanged(before: StoredChatKey | null, after: StoredChatKey | null): boolean {
  const previous = before?.groupKey?.bytes;
  const next = after?.groupKey?.bytes;
  return (
    !!next && (previous?.length !== next.length || previous.some((byte, i) => byte !== next[i]))
  );
}

export interface OpenRealChatSessionOptions {
  readonly runtimeContext: WorkspaceRuntimeContext;
  readonly streamUuid: string;
  readonly getRuntimeContext?: WorkspaceRuntimeContextGetter;
  readonly signal?: AbortSignal;
  readonly messengerStore?: Pick<typeof useMessengerStore, "getState" | "subscribe">;
}

/** One live owner/device/chat session. Secrets remain in dedicated storage and controller memory. */
export async function openRealChatSession({
  runtimeContext,
  streamUuid,
  getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  signal,
  messengerStore = useMessengerStore,
}: OpenRealChatSessionOptions) {
  const capture = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (capture == null) throw new Error("unavailable");
  const owner = workspaceRuntimeOwnerKey(runtimeContext);
  let disposed = false;
  const runtimeCurrent = () =>
    !disposed && !isWorkspaceRuntimeRequestInvalidated(capture, getRuntimeContext, signal);
  const ownedStream = (catalog = messengerStore.getState()) => {
    if (!runtimeCurrent() || catalog.ownerKey !== owner) return undefined;
    const stream = catalog.streamsById[streamUuid];
    return stream?.uuid === streamUuid &&
      stream.projectId === runtimeContext.projectId &&
      stream.userUuid === runtimeContext.userUuid &&
      stream.encryption === true &&
      !!stream.currentEncryptionKey?.keyUuid
      ? stream
      : undefined;
  };
  const current = () => ownedStream() !== undefined;
  const assertCurrent = () => {
    if (!current()) throw new Error("stale");
  };
  const permissionSnapshot = (catalog = messengerStore.getState()): string => {
    if (catalog.ownerKey !== owner) return "unowned";
    const stream = catalog.streamsById[streamUuid];
    const bindings = (catalog.streamBindingIdsByStreamId[streamUuid] ?? [])
      .flatMap((uuid) => {
        const binding = catalog.streamBindingsById[uuid];
        return binding?.streamUuid === streamUuid && binding.projectId === runtimeContext.projectId
          ? [[binding.uuid, binding.userUuid, binding.role]]
          : [];
      })
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    return JSON.stringify([
      stream?.ownerUuid,
      stream?.userUuid,
      stream?.role,
      catalog.streamBindingsLoadedByStreamId[streamUuid] === true,
      bindings,
    ]);
  };
  // Catalog bootstrap and route loaders own public stream and participant hydration.
  assertCurrent();
  const device = await ensureChatDeviceIdentity(runtimeContext, current);
  assertCurrent();
  const baseScope = {
    owner: { ...runtimeContext },
    deviceId: device.deviceId,
    streamUuid,
    runtimeGeneration: runtimeContext.runtimeGeneration,
  };
  const scopeFor = (keyUuid: string): ChatE2eeControllerScope => ({
    ...baseScope,
    owner: { ...baseScope.owner },
    keyUuid,
  });
  const currentScope = (): ChatE2eeControllerScope => {
    assertCurrent();
    return scopeFor(ownedStream()!.currentEncryptionKey!.keyUuid);
  };
  const generationCurrent = (scope: ChatE2eeControllerScope) =>
    current() && ownedStream()?.currentEncryptionKey?.keyUuid === scope.keyUuid;
  const issuerAllowed = (author: string): boolean => {
    const catalog = messengerStore.getState();
    const stream = ownedStream(catalog);
    if (!stream) return false;
    if (stream.ownerUuid === author) return true;
    const bindings = (catalog.streamBindingIdsByStreamId[streamUuid] ?? []).flatMap((uuid) => {
      const binding = catalog.streamBindingsById[uuid];
      return binding?.streamUuid === streamUuid &&
        binding.projectId === runtimeContext.projectId &&
        binding.userUuid === author
        ? [binding]
        : [];
    });
    if (bindings.length > 0)
      return bindings.some(
        (binding) => binding.role === "owner" || binding.role === "administrator",
      );
    return (
      catalog.streamBindingsLoadedByStreamId[streamUuid] !== true &&
      author === runtimeContext.userUuid &&
      (stream.role === "owner" || stream.role === "administrator")
    );
  };
  const rights = (): ChatE2eeControllerRights => {
    const stream = ownedStream();
    const member = stream !== undefined;
    const canManage = member && issuerAllowed(runtimeContext.userUuid);
    return {
      canRequest: member,
      canSend: member,
      canGrant: canManage,
      canReject: canManage,
      canRotate: member && stream.ownerUuid === runtimeContext.userUuid,
    };
  };
  const listeners = new Set<() => void>();
  let sessionPending = 0;
  let reconciliationError: ChatE2eeControllerState["error"] = null;
  let reconciledKeyUuid: string | null = null;
  let rotatingKeyUuid: string | null = null;
  let recoveredRotationKeyUuid: string | null = null;
  let reconciledPermissions: string | null = null;
  let committingCatalog = false;
  let operationDispatchKeyUuid: string | null = null;
  let sendingKeyUuid: string | null = null;
  const requests = new Map<string, ChatE2eeMessage<ChatKeyRequestPayload>>();
  const responses = new Map<string, ChatE2eeMessage<ChatKeyResponsePayload>>();
  interface KeyRequestOutcome {
    request: ChatE2eeMessage<ChatKeyRequestPayload>;
    status: "pending" | "granted" | "rejected";
  }
  let requestOutcomes: Map<string, KeyRequestOutcome> | null = null;
  const recordKeyMessage = (message: ChatE2eeMessage) => {
    if (message.payload.kind === "key_request")
      requests.set(message.uuid, { ...message, payload: message.payload });
    if (message.payload.kind === "key_grant" || message.payload.kind === "key_reject")
      responses.set(message.uuid, { ...message, payload: message.payload });
    requestOutcomes = null;
  };
  let bootstrapPending = true;
  let publishingUpdate = false;
  const publishKeyUpdate = (keyUuid: string) => {
    publishingUpdate = true;
    try {
      notifyRealChatKeyChanges({
        kind: "updated",
        ownerKey: owner,
        deviceId: device.deviceId,
        streamUuid,
        keyUuid,
      });
    } finally {
      publishingUpdate = false;
    }
  };
  const keyRevisions = new Map<string, number>();
  const dispatchPayload = async (
    payload: ChatE2eePayload,
    guard: () => boolean,
    options: {
      topicUuid?: string;
      canonicalMessageUuid?: string;
      includeStreamConversation?: boolean;
    } = {},
  ) => {
    assertCurrent();
    const dispatchKey = { keyUuid: operationDispatchKeyUuid ?? currentScope().keyUuid };
    const topicUuid =
      options.topicUuid ??
      Object.values(messengerStore.getState().topicsById).find(
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
      messengerStore,
      streamUuid,
      topicUuid,
      payload,
      expectedCurrentKey: dispatchKey,
      allowHistoricalKey: payload.kind === "e2ee" && payload.keyUuid === sendingKeyUuid,
      isCurrent: () =>
        current() &&
        guard() &&
        ownedStream()?.currentEncryptionKey?.keyUuid === dispatchKey.keyUuid,
      canonicalMessageUuid: options.canonicalMessageUuid,
      includeStreamConversation: options.includeStreamConversation ?? true,
    });
    assertCurrent();
    if (result.status !== "applied" || !result.message) throw new Error("send-failed");
    return { ...result, message: result.message };
  };
  const createController = (generationScope: ChatE2eeControllerScope) => {
    const revision = keyRevisions.get(generationScope.keyUuid) ?? 0;
    return new ChatE2eeController({
      scope: generationScope,
      device,
      provider: realChatCryptoProvider,
      storage: realChatKeyStorage,
      getCurrentScope: () =>
        current() && (keyRevisions.get(generationScope.keyUuid) ?? 0) === revision
          ? generationScope
          : null,
      getRights: rights,
      isIssuerAllowed: issuerAllowed,
      isAnnouncerAllowed: issuerAllowed,
      sendPayload: async (payload, guard, canonicalMessageUuid) => {
        const result = await dispatchPayload(payload, guard, { canonicalMessageUuid });
        const mapped = domainMessage(result.message);
        if (!mapped) throw new Error("invalid-message");
        return mapped;
      },
    });
  };
  const generationControllers = new Map<string, ChatE2eeController>();
  const generationController = async (keyUuid: string, initializeMetadata = true) => {
    assertCurrent();
    const existing = generationControllers.get(keyUuid);
    if (existing && (!initializeMetadata || existing.getState().access !== "missing"))
      return existing;
    const scope = scopeFor(keyUuid);
    const revision = keyRevisions.get(keyUuid) ?? 0;
    const unchanged = () => current() && (keyRevisions.get(keyUuid) ?? 0) === revision;
    if (initializeMetadata) {
      const persisted = await realChatKeyStorage.writeChatKey(
        scope,
        { groupKey: null },
        { isCurrent: unchanged },
      );
      assertCurrent();
      if (!persisted) throw new Error("storage-failed");
    }
    const controller = existing ?? createController(scope);
    const loaded = await controller.loadKey();
    assertCurrent();
    if (!loaded.ok) throw new Error(loaded.reason);
    if (!unchanged()) {
      controller.invalidate();
      throw new Error("stale");
    }
    generationControllers.set(keyUuid, controller);
    return controller;
  };
  const ingestKeyMessage = async (message: ChatE2eeMessage) => {
    // Incoming generation UUIDs are untrusted; only explicit local actions create metadata.
    const controller = await generationController(message.payload.keyUuid, false);
    const address = scopeFor(message.payload.keyUuid);
    const before = await realChatKeyStorage.readChatKey(address);
    assertCurrent();
    const result = await controller.ingestKeyMessage(message);
    assertCurrent();
    const after = await realChatKeyStorage.readChatKey(address);
    assertCurrent();
    if (keyMaterialChanged(before, after)) publishKeyUpdate(message.payload.keyUuid);
    if (!result.ok && result.reason !== "forbidden" && result.reason !== "invalid-message")
      throw new Error(result.reason);
  };
  const selectSendingKey = async (scope = currentScope()): Promise<boolean> => {
    const key = await realChatKeyStorage.readChatKey(scope);
    assertCurrent();
    if (!generationCurrent(scope)) return false;
    const controller = await generationController(scope.keyUuid, false);
    if (!generationCurrent(scope)) return false;
    if (key?.groupKey) {
      if (controller.getState().access !== "ready") {
        const loaded = await controller.loadKey();
        assertCurrent();
        if (!loaded.ok) throw new Error(loaded.reason);
        if (!generationCurrent(scope)) return false;
      }
      if (sendingKeyUuid !== scope.keyUuid) {
        const saved = await realChatKeyStorage.writeChatKey(scope, key, {
          isCurrent: () => generationCurrent(scope),
          forSending: true,
          onlyIfPresent: true,
        });
        assertCurrent();
        if (!generationCurrent(scope)) return false;
        if (!saved) throw new Error("storage-failed");
      }
      sendingKeyUuid = scope.keyUuid;
      return true;
    }
    const previous = await realChatKeyStorage.readLastAvailableChatKey(scope);
    assertCurrent();
    if (!generationCurrent(scope)) return false;
    if (previous) {
      await generationController(previous.keyUuid);
      assertCurrent();
      if (!generationCurrent(scope)) return false;
      if (sendingKeyUuid !== previous.keyUuid) {
        const saved = await realChatKeyStorage.writeChatKey(
          scopeFor(previous.keyUuid),
          { groupKey: previous.groupKey },
          { isCurrent: () => generationCurrent(scope), forSending: true, onlyIfPresent: true },
        );
        assertCurrent();
        if (!generationCurrent(scope)) return false;
        if (!saved) throw new Error("storage-failed");
      }
    }
    sendingKeyUuid = previous?.keyUuid ?? null;
    return true;
  };
  const reconcileLocal = async (): Promise<void> => {
    for (;;) {
      const scope = currentScope();
      if (
        reconciledKeyUuid !== scope.keyUuid ||
        (rights().canRotate && permissionSnapshot() !== reconciledPermissions)
      ) {
        const preparationPermissions = permissionSnapshot();
        const stages = await realChatKeyStorage.listStagedCreations({
          owner: runtimeContext,
          deviceId: device.deviceId,
        });
        assertCurrent();
        if (!generationCurrent(scope)) continue;
        const stage = stages.find(
          (item) =>
            item.keyUuid === scope.keyUuid &&
            (!item.rotation || item.rotation.streamUuid === streamUuid),
        );
        if (stage && rights().canRotate) {
          const committed = await realChatKeyStorage.finalizeCreation(
            { owner: runtimeContext, deviceId: device.deviceId },
            stage.creationId,
            streamUuid,
            { isCurrent: () => generationCurrent(scope) && rights().canRotate },
          );
          assertCurrent();
          if (!generationCurrent(scope)) continue;
          if (!committed) throw new Error("storage-failed");
          if (stage.rotation && rotatingKeyUuid === scope.keyUuid)
            recoveredRotationKeyUuid = scope.keyUuid;
          bootstrapPending = false;
          publishKeyUpdate(scope.keyUuid);
        }
        const controller = await generationController(scope.keyUuid, reconciledKeyUuid === null);
        assertCurrent();
        if (!generationCurrent(scope)) continue;
        const loaded = await controller.loadKey();
        assertCurrent();
        if (!generationCurrent(scope)) continue;
        if (!loaded.ok) throw new Error(loaded.reason);
        // Regained ownership must retry recovery skipped before controller preparation awaited.
        if (permissionSnapshot() !== preparationPermissions) continue;
        reconciledKeyUuid = scope.keyUuid;
        if (rotatingKeyUuid === scope.keyUuid) rotatingKeyUuid = null;
      }
      const permissions = permissionSnapshot();
      if (permissions !== reconciledPermissions) {
        // A grant rejected before issuer roles arrived remains retryable without reloading history.
        for (const message of [...requests.values(), ...responses.values()])
          await ingestKeyMessage(message);
        if (permissionSnapshot() !== permissions || !generationCurrent(scope)) continue;
        reconciledPermissions = permissions;
      }
      if (!(await selectSendingKey(scope))) continue;
      reconciliationError = null;
      if (bootstrapPending) {
        bootstrapPending = false;
        if (sendingKeyUuid) publishKeyUpdate(sendingKeyUuid);
      }
      return;
    }
  };
  const emit = () => {
    for (const listener of listeners) listener();
  };
  // Both user actions and subscription reconciliation share this queue and cannot rebind each other.
  let operationQueue: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = operationQueue.then(async () => {
      assertCurrent();
      sessionPending++;
      emit();
      try {
        await reconcileLocal();
        operationDispatchKeyUuid = currentScope().keyUuid;
        return await operation();
      } finally {
        operationDispatchKeyUuid = null;
        sessionPending--;
        emit();
      }
    });
    operationQueue = next.catch(() => undefined);
    return next;
  };
  const indexedRequestOutcomes = () => {
    if (requestOutcomes) return requestOutcomes;
    requestOutcomes = new Map(
      [...requests.values()].map((request) => [request.uuid, { request, status: "pending" }]),
    );
    for (const response of responses.values()) {
      const outcome = requestOutcomes.get(response.payload.requestMessageUuid);
      if (
        outcome?.status === "pending" &&
        correlateChatKeyResponse({
          request: outcome.request,
          response,
          issuerCanGrantKey: issuerAllowed(response.authorUuid),
        }).status === "matched"
      )
        outcome.status = response.payload.kind === "key_grant" ? "granted" : "rejected";
    }
    return requestOutcomes;
  };
  const getKeyRequestOutcomes = () => [...indexedRequestOutcomes().values()];
  const pendingRequest = (uuid: string) => {
    const outcome = indexedRequestOutcomes().get(uuid);
    return outcome?.status === "pending" ? outcome.request : undefined;
  };
  const grantRequest = async (uuid: string) => {
    const request = pendingRequest(uuid);
    if (!request) throw new Error("invalid-message");
    const controller = await generationController(request.payload.keyUuid);
    const result = await controller.grantKey(request);
    if (!result.ok) throw new Error(result.reason);
    recordKeyMessage(result.value);
    return result;
  };
  let unsubscribeCatalog: (() => void) | undefined;
  let unsubscribeRuntime: (() => void) | undefined;
  let unsubscribeKeys: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribeCatalog?.();
    unsubscribeRuntime?.();
    unsubscribeKeys?.();
    signal?.removeEventListener("abort", dispose);
    for (const controller of generationControllers.values()) controller.invalidate();
    generationControllers.clear();
    requests.clear();
    responses.clear();
    requestOutcomes = null;
    emit();
    listeners.clear();
  };
  const emptyState = (): ChatE2eeControllerState => ({
    access: "missing",
    pending: false,
    requestStatus: "idle",
    error: current() ? reconciliationError : "stale",
  });
  const session = {
    get scope() {
      return currentScope();
    },
    device,
    getState: () => {
      const stream = ownedStream();
      const controller = stream?.currentEncryptionKey
        ? generationControllers.get(stream.currentEncryptionKey.keyUuid)
        : undefined;
      const state = controller?.getState() ?? emptyState();
      return {
        ...state,
        error: current() ? (reconciliationError ?? state.error) : "stale",
        sendKeyUuid: current() ? sendingKeyUuid : null,
        pending: current() && (sessionPending > 0 || state.pending),
      };
    },
    getRights: rights,
    getKeyRequestOutcomes,
    getKeyRequestOutcome: (uuid: string) => indexedRequestOutcomes().get(uuid) ?? null,
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
    listLocalKeys: async () => {
      assertCurrent();
      const keys = await realChatKeyStorage.listChatKeys(baseScope);
      assertCurrent();
      return keys;
    },
    removeLocalKey: (keyUuid: string) =>
      run(async () => {
        const removed = await realChatKeyStorage.removeChatKey(scopeFor(keyUuid), {
          isCurrent: current,
        });
        assertCurrent();
        if (!removed) throw new Error("storage-failed");
        notifyRealChatKeyChanges({
          kind: "removed",
          ownerKey: owner,
          deviceId: device.deviceId,
          streamUuid,
          keyUuid,
        });
        await reconcileLocal();
      }),
    load: () => run(() => Promise.resolve()),
    ingest: (messages: readonly MessengerMessage[]) =>
      run(async () => {
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
          recordKeyMessage(mapped);
          await ingestKeyMessage(mapped);
        }
        await reconcileLocal();
      }),
    requestKey: (keyUuid?: string, recoveryMessage?: MessengerMessage, allowUsableKey = false) =>
      run(async () => {
        const requestedKeyUuid = keyUuid ?? currentScope().keyUuid;
        const mapped = recoveryMessage ? domainMessage(recoveryMessage) : null;
        if (
          recoveryMessage &&
          (recoveryMessage.projectId !== runtimeContext.projectId ||
            mapped?.streamUuid !== streamUuid ||
            mapped.payload.kind !== "e2ee" ||
            mapped.payload.keyUuid !== requestedKeyUuid)
        )
          throw new Error("invalid-message");
        const controller = await generationController(requestedKeyUuid);
        const beforeKey = await realChatKeyStorage.readChatKey(scopeFor(requestedKeyUuid));
        assertCurrent();
        const result = await controller.requestKey(
          mapped?.payload.kind === "e2ee" ? mapped.payload.content : undefined,
          allowUsableKey,
        );
        assertCurrent();
        const afterKey = await realChatKeyStorage.readChatKey(scopeFor(requestedKeyUuid));
        assertCurrent();
        if (keyMaterialChanged(beforeKey, afterKey)) publishKeyUpdate(requestedKeyUuid);
        if (!result.ok) throw new Error(result.reason);
        return result;
      }),
    grantKey: (uuid: string) => run(() => grantRequest(uuid)),
    rejectKey: (uuid: string) =>
      run(async () => {
        const request = pendingRequest(uuid);
        if (!request) throw new Error("invalid-message");
        const controller = await generationController(request.payload.keyUuid);
        const result = await controller.rejectKey(request);
        if (!result.ok) throw new Error(result.reason);
        recordKeyMessage(result.value);
        return result;
      }),
    grantAllKeys: () =>
      run(async () => {
        if (!rights().canGrant) throw new Error("forbidden");
        const outcomes: {
          requestMessageUuid: string;
          status: "granted" | "failed";
          reason?: string;
        }[] = [];
        for (const request of getKeyRequestOutcomes().filter((item) => item.status === "pending")) {
          try {
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
        if (recoveredRotationKeyUuid === currentScope().keyUuid) {
          recoveredRotationKeyUuid = null;
          return { status: "applied" as const, ownerKey: owner, message: null };
        }
        if (!rights().canRotate) throw new Error("forbidden");
        const previousKeyUuid = currentScope().keyUuid;
        const allowed = () =>
          current() &&
          rights().canRotate &&
          (currentScope().keyUuid === previousKeyUuid ||
            currentScope().keyUuid === rotatingKeyUuid);
        const stages = await realChatKeyStorage.listStagedCreations({
          owner: runtimeContext,
          deviceId: device.deviceId,
        });
        assertCurrent();
        if (!allowed()) throw new Error("forbidden");
        let stage = stages.find(
          (item) =>
            item.rotation?.streamUuid === streamUuid &&
            item.rotation.previousKeyUuid === previousKeyUuid,
        );
        if (!stage) {
          const groupKey = await realChatCryptoProvider.createGroupKey();
          assertCurrent();
          if (!allowed()) throw new Error("forbidden");
          if (!groupKey.ok) throw new Error(groupKey.reason);
          const topicUuid = Object.values(messengerStore.getState().topicsById).find(
            (topic) =>
              topic.streamUuid === streamUuid &&
              topic.projectId === runtimeContext.projectId &&
              topic.isDefault,
          )?.uuid;
          if (!topicUuid) throw new Error("missing-topic");
          stage = {
            creationId: crypto.randomUUID(),
            keyUuid: crypto.randomUUID(),
            groupKey: groupKey.value,
            rotation: { streamUuid, previousKeyUuid, topicUuid },
          };
          const persisted = await realChatKeyStorage.writeStagedCreation(
            { owner: runtimeContext, deviceId: device.deviceId },
            stage,
            { isCurrent: allowed },
          );
          assertCurrent();
          if (!allowed()) throw new Error("forbidden");
          if (!persisted) throw new Error("storage-failed");
        }
        if (!stage.rotation) throw new Error("invalid-key");
        rotatingKeyUuid = stage.keyUuid;
        const result = await sendMessengerE2eePayload({
          runtimeContext,
          getRuntimeContext,
          signal,
          messengerStore,
          streamUuid,
          topicUuid: stage.rotation.topicUuid,
          expectedCurrentKey: { keyUuid: previousKeyUuid },
          isCurrent: allowed,
          rotateKey: true,
          canonicalMessageUuid: stage.creationId,
          payload: { kind: "key_announced", keyUuid: stage.keyUuid },
        });
        if (result.status !== "applied") throw new Error("send-failed");
        assertCurrent();
        const stream = ownedStream()!;
        const liveKeyUuid = stream.currentEncryptionKey!.keyUuid;
        if (liveKeyUuid !== previousKeyUuid && liveKeyUuid !== stage.keyUuid)
          throw new Error("stale");
        if (!rights().canRotate) throw new Error("forbidden");
        // A verified announcement receipt confirms the new key even before its stream event arrives.
        if (liveKeyUuid === previousKeyUuid) {
          committingCatalog = true;
          try {
            messengerStore.getState().upsertStream(owner, {
              ...stream,
              currentEncryptionKey: { keyUuid: stage.keyUuid },
            });
          } finally {
            committingCatalog = false;
          }
          lastCatalogSignature = catalogSignature(messengerStore.getState());
          lastObservedStream = ownedStream();
        }
        await reconcileLocal();
        recoveredRotationKeyUuid = null;
        publishKeyUpdate(stage.keyUuid);
        return result;
      }),
    send: (input: {
      readonly text: string;
      readonly topicUuid: string;
      readonly includeStreamConversation?: boolean;
      readonly canonicalMessageUuid?: string;
      readonly expectedKeyUuid?: string;
      readonly expectedDeviceId?: string;
      readonly preparedPayload?: ChatEncryptedPayload;
      readonly onEncryptedPayload?: (payload: ChatEncryptedPayload) => void;
    }) =>
      run(async () => {
        if (!sendingKeyUuid) throw new Error("missing-key");
        if (
          (input.expectedKeyUuid != null && input.expectedKeyUuid !== sendingKeyUuid) ||
          (input.expectedDeviceId != null && input.expectedDeviceId !== device.deviceId)
        )
          throw new Error("invalid-key");
        const controller = await generationController(sendingKeyUuid);
        const result = await controller.encryptMessage(
          new TextEncoder().encode(input.text),
          (payload, guard) => {
            input.onEncryptedPayload?.(payload);
            return dispatchPayload(payload, guard, input);
          },
          input.preparedPayload,
        );
        if (!result.ok) throw new Error(result.reason);
        return result.value;
      }),
    decrypt: (message: MessengerMessage) =>
      decryptRealChatMessage(runtimeContext, message, current),
    dispose,
  };
  const catalogSignature = (catalog: MessengerStoreState) => {
    const stream = ownedStream(catalog);
    return JSON.stringify([
      catalog.ownerKey,
      stream?.uuid,
      stream?.encryption,
      stream?.currentEncryptionKey?.keyUuid,
      permissionSnapshot(catalog),
    ]);
  };
  let lastCatalogSignature = catalogSignature(messengerStore.getState());
  let lastObservedStream = ownedStream();
  let reconciliationQueued = false;
  let reconciliationVersion = 0;
  const scheduleReconciliation = () => {
    if (reconciliationQueued) return;
    reconciliationQueued = true;
    const version = reconciliationVersion;
    void run(() => Promise.resolve())
      .catch(() => {
        if (current()) reconciliationError = "unavailable";
      })
      .finally(() => {
        reconciliationQueued = false;
        if (!current()) return;
        emit();
        if (reconciliationVersion !== version) scheduleReconciliation();
      })
      .catch(() => undefined);
  };
  const onCatalogChange = () => {
    if (!current()) {
      dispose();
      return;
    }
    if (committingCatalog) return;
    const stream = ownedStream();
    const signature = catalogSignature(messengerStore.getState());
    const retryFailed = reconciliationError !== null && stream !== lastObservedStream;
    lastObservedStream = stream;
    if (signature === lastCatalogSignature && !retryFailed) return;
    lastCatalogSignature = signature;
    requestOutcomes = null;
    reconciliationVersion++;
    emit();
    scheduleReconciliation();
  };
  unsubscribeKeys = subscribeRealChatKeyChanges((change) => {
    if (
      !change ||
      publishingUpdate ||
      !current() ||
      change.ownerKey !== owner ||
      change.deviceId !== device.deviceId ||
      change.streamUuid !== streamUuid
    )
      return;
    keyRevisions.set(change.keyUuid, (keyRevisions.get(change.keyUuid) ?? 0) + 1);
    generationControllers.get(change.keyUuid)?.invalidate();
    generationControllers.delete(change.keyUuid);
    if (change.keyUuid === reconciledKeyUuid) reconciledKeyUuid = null;
    if (change.keyUuid === sendingKeyUuid) sendingKeyUuid = null;
    reconciledPermissions = null;
    reconciliationVersion++;
    emit();
    scheduleReconciliation();
  });
  unsubscribeCatalog = messengerStore.subscribe(onCatalogChange);
  unsubscribeRuntime = useWorkspaceAuthStore.subscribe(() => {
    if (!runtimeCurrent()) dispose();
  });
  signal?.addEventListener("abort", dispose, { once: true });
  if (!current()) {
    dispose();
    throw new Error("stale");
  }
  return session;
}
export type RealChatSession = Awaited<ReturnType<typeof openRealChatSession>>;

export type RealChatMessageDecryption =
  | { readonly status: "ready"; readonly plaintext: string }
  | { readonly status: "missing-key" }
  | { readonly status: "error"; readonly canRequestKey?: boolean };

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
    const address = {
      owner: runtime,
      deviceId: device.deviceId,
      streamUuid: message.streamUuid,
      keyUuid: message.payload.keyUuid,
    };
    const deletionRevision = await realChatKeyStorage.readChatKeyDeletionRevision(address);
    if (!isCurrent()) return { status: "missing-key" };
    const key = await realChatKeyStorage.readChatKey(address);
    if (!isCurrent() || !key?.groupKey) return { status: "missing-key" };
    const mapped = domainMessage(message);
    if (mapped?.payload.kind !== "e2ee") return { status: "error" };
    const result = await realChatCryptoProvider.decryptMessage({
      groupKey: key.groupKey,
      envelope: mapped.payload.content,
      context: { streamUuid: message.streamUuid, keyUuid: message.payload.keyUuid },
    });
    try {
      if (!isCurrent()) return { status: "missing-key" };
      const latestRevision = await realChatKeyStorage.readChatKeyDeletionRevision(address);
      if (!isCurrent() || latestRevision !== deletionRevision) return { status: "missing-key" };
      if (!result.ok)
        return { status: "error", canRequestKey: result.reason === "invalid-ciphertext" };
      return {
        status: "ready",
        plaintext: new TextDecoder("utf-8", { fatal: true }).decode(result.value),
      };
    } finally {
      if (result.ok) result.value.fill(0);
    }
  } catch {
    return { status: isCurrent() ? "error" : "missing-key" };
  }
}
