import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { getDeviceName } from "~/shared/lib/device-name.lib";
import { encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { correlateChatKeyResponse, resolveChatGenerationAccess } from "./chat-e2ee.lib";
import type { ChatCryptoEnvelope } from "./chat-crypto-provider.types";
import type {
  ChatE2eeControllerDependencies,
  ChatE2eeControllerFailure,
  ChatE2eeControllerResult,
  ChatE2eeControllerState,
} from "./chat-e2ee-controller.types";
import type {
  ChatE2eeMessage,
  ChatE2eePayload,
  ChatEncryptedPayload,
  ChatKeyRequestPayload,
  ChatKeyRequestContext,
  ChatKeyResponsePayload,
} from "./chat-e2ee.types";
import type { PendingChatKeyRequest, StoredChatKey } from "./chat-key-storage.types";

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

const failure = (reason: ChatE2eeControllerFailure): ChatE2eeControllerResult<never> => ({
  ok: false,
  reason,
});
const success = <T>(value: T): ChatE2eeControllerResult<T> => ({ ok: true, value });

/** One instance belongs to one live device/chat/generation; replace it when that scope changes. */
export class ChatE2eeController {
  private readonly deps: ChatE2eeControllerDependencies;
  private disposed = false;
  private pending = 0;
  private key: StoredChatKey | null = null;
  private keyRevision = 0;
  private requestStatus: ChatE2eeControllerState["requestStatus"] = "idle";
  private error: ChatE2eeControllerFailure | null = null;
  private readonly requests = new Map<string, ChatE2eeMessage<ChatKeyRequestPayload>>();
  private readonly waiting = new Map<string, ChatE2eeMessage<ChatKeyResponsePayload>>();
  private readonly processed = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private requestQueue: Promise<unknown> = Promise.resolve();

  constructor(dependencies: ChatE2eeControllerDependencies) {
    // Copy the scope so a caller mutating its routing object cannot rebind pending operations.
    this.deps = {
      ...dependencies,
      scope: { ...dependencies.scope, owner: { ...dependencies.scope.owner } },
    };
  }

  readonly isCurrent = (): boolean => {
    const current = this.deps.getCurrentScope();
    const captured = this.deps.scope;
    return (
      !this.disposed &&
      current !== null &&
      workspaceRuntimeOwnerKey(current.owner) === workspaceRuntimeOwnerKey(captured.owner) &&
      current.runtimeGeneration === captured.runtimeGeneration &&
      current.deviceId === captured.deviceId &&
      current.streamUuid === captured.streamUuid &&
      current.keyUuid === captured.keyUuid &&
      this.deps.device.deviceId === captured.deviceId
    );
  };

  invalidate(): void {
    this.disposed = true;
    this.key = null;
    this.requests.clear();
    this.waiting.clear();
    this.processed.clear();
  }

  getState(): ChatE2eeControllerState {
    if (!this.isCurrent())
      return { access: "missing", pending: false, requestStatus: "idle", error: "stale" };
    return {
      access: resolveChatGenerationAccess(this.key),
      pending: this.pending > 0,
      requestStatus: this.requestStatus,
      error: this.error,
    };
  }

  private async run<T>(
    operation: () => Promise<ChatE2eeControllerResult<T>>,
  ): Promise<ChatE2eeControllerResult<T>> {
    if (!this.isCurrent()) return failure("stale");
    this.pending++;
    try {
      const result = await operation();
      if (!this.isCurrent()) return failure("stale");
      this.error = result.ok ? null : result.reason;
      return result;
    } catch {
      if (!this.isCurrent()) return failure("stale");
      this.error = "unavailable";
      return failure("unavailable");
    } finally {
      this.pending--;
    }
  }

  private async readKey(): Promise<ChatE2eeControllerResult<StoredChatKey | null>> {
    try {
      const revision = this.keyRevision;
      const key = await this.deps.storage.readChatKey(this.deps.scope);
      if (!this.isCurrent()) return failure("stale");
      if (revision !== this.keyRevision) return success(this.key);
      this.key = key;
      return success(key);
    } catch {
      return failure("storage-failed");
    }
  }

  private async readDeletionRevision(): Promise<ChatE2eeControllerResult<number>> {
    try {
      const revision = await this.deps.storage.readChatKeyDeletionRevision(this.deps.scope);
      return this.isCurrent() ? success(revision) : failure("stale");
    } catch {
      return failure("storage-failed");
    }
  }

  private async checkDeletionRevision(revision: number): Promise<ChatE2eeControllerResult<void>> {
    const latest = await this.readDeletionRevision();
    if (!latest.ok) return latest;
    if (latest.value !== revision) {
      this.key = null;
      this.keyRevision++;
      return failure("missing-key");
    }
    return success(undefined);
  }

  private async send(
    payload: ChatE2eePayload,
    allowed: () => boolean,
    canonicalMessageUuid?: string,
  ): Promise<ChatE2eeControllerResult<ChatE2eeMessage>> {
    const guard = () => this.isCurrent() && allowed();
    if (!guard()) return failure(this.isCurrent() ? "forbidden" : "stale");
    try {
      const message = await this.deps.sendPayload(payload, guard, canonicalMessageUuid);
      if (!guard()) return failure(this.isCurrent() ? "forbidden" : "stale");
      if (
        message.streamUuid !== this.deps.scope.streamUuid ||
        message.authorUuid !== this.deps.scope.owner.userUuid ||
        message.payload.kind !== payload.kind ||
        message.payload.keyUuid !== payload.keyUuid ||
        JSON.stringify(encodeChatE2eePayload(message.payload)) !==
          JSON.stringify(encodeChatE2eePayload(payload))
      )
        return failure("invalid-message");
      return success(message);
    } catch {
      return failure("send-failed");
    }
  }

  loadKey(): Promise<ChatE2eeControllerResult<void>> {
    return this.run(async () => {
      const result = await this.readKey();
      if (!result.ok) return result;
      try {
        const pending = await this.deps.storage.listPendingRequests(this.deps.scope);
        if (!this.isCurrent()) return failure("stale");
        if (
          pending.length > 0 &&
          this.requestStatus === "idle" &&
          resolveChatGenerationAccess(this.key) !== "ready"
        )
          this.requestStatus = "requested";
      } catch {
        return failure("storage-failed");
      }
      return success(undefined);
    });
  }

  requestKey(
    recoveryEnvelope?: ChatCryptoEnvelope,
    allowUsableKey = false,
    context?: ChatKeyRequestContext,
  ): Promise<ChatE2eeControllerResult<ChatE2eeMessage>> {
    // Snapshot operation context before queued work can observe caller mutations.
    const capturedContext = context ? { ...context } : undefined;
    const next = this.requestQueue.then(() =>
      this.run(async () => {
        if (
          capturedContext &&
          (!capturedContext.targetMessageUuid || !capturedContext.expectedIssuerUuid)
        )
          return failure("invalid-message");
        const allowed = () => this.deps.getRights().canRequest;
        if (!allowed()) return failure("forbidden");
        let deletionRevision: number;
        try {
          // A deletion in another tab cancels preparation even before its broadcast arrives.
          deletionRevision = await this.deps.storage.readChatKeyDeletionRevision(this.deps.scope);
          if (!this.isCurrent()) return failure("stale");
        } catch {
          return failure("storage-failed");
        }
        let recovery: PendingChatKeyRequest["recovery"];
        if (recoveryEnvelope) {
          const stored = await this.readKey();
          if (!stored.ok) return stored;
          if (stored.value?.groupKey) {
            const checked = await this.deps.provider.decryptMessage({
              groupKey: stored.value.groupKey,
              envelope: recoveryEnvelope,
              context: this.deps.scope,
            });
            if (!this.isCurrent()) return failure("stale");
            if (checked.ok) {
              checked.value.fill(0);
              if (!allowUsableKey) return failure("invalid-message");
            } else if (checked.reason !== "invalid-ciphertext") return checked;
            if (!checked.ok)
              recovery = {
                envelope: { bytes: recoveryEnvelope.bytes.slice() },
                previousGroupKey: { bytes: stored.value.groupKey.bytes.slice() },
              };
          }
        }
        let pending: PendingChatKeyRequest;
        try {
          const existing = await this.deps.storage.listPendingRequests(this.deps.scope);
          if (!this.isCurrent()) return failure("stale");
          // Several tabs may have created requests; retry deterministically without losing their secrets.
          const oldest = existing
            .filter(
              (item) =>
                item.context?.targetMessageUuid === capturedContext?.targetMessageUuid &&
                item.context?.expectedIssuerUuid === capturedContext?.expectedIssuerUuid &&
                (!recovery ||
                  (item.recovery !== undefined &&
                    equalBytes(item.recovery.envelope.bytes, recovery.envelope.bytes) &&
                    equalBytes(
                      item.recovery.previousGroupKey.bytes,
                      recovery.previousGroupKey.bytes,
                    ))),
            )
            .sort(
              (left, right) =>
                left.createdAt - right.createdAt ||
                left.localRequestId.localeCompare(right.localRequestId),
            )[0];
          if (oldest) pending = oldest;
          else {
            const deviceName = await getDeviceName();
            if (!this.isCurrent()) return failure("stale");
            if (!allowed()) return failure("forbidden");
            const pair = await this.deps.provider.createRequestKeyPair();
            if (!this.isCurrent()) return failure("stale");
            if (!pair.ok) return pair;
            if (!allowed()) return failure("forbidden");
            const uuid = crypto.randomUUID();
            pending = {
              localRequestId: uuid,
              requestMessageUuid: null,
              deviceName,
              publicKey: pair.value.publicKey,
              privateKey: pair.value.privateKey,
              createdAt: Date.now(),
              ...(recovery ? { recovery } : {}),
              ...(capturedContext ? { context: capturedContext } : {}),
            };
            const committed = await this.deps.storage.writePendingRequest(
              this.deps.scope,
              pending,
              {
                isCurrent: () => this.isCurrent() && allowed(),
                expectedDeletionRevision: deletionRevision,
              },
            );
            if (!this.isCurrent()) return failure("stale");
            if (!allowed()) return failure("forbidden");
            if (!committed) return failure("storage-failed");
          }
        } catch {
          return failure("storage-failed");
        }
        // A lost POST response retains the same durable secret and canonical message UUID.
        const uuid = pending.localRequestId;
        const result = await this.send(
          {
            kind: "key_request",
            ...(pending.context ? { targetMessageUuid: pending.context.targetMessageUuid } : {}),
            keyUuid: this.deps.scope.keyUuid,
            deviceId: this.deps.device.deviceId,
            deviceName: pending.deviceName ?? this.deps.device.deviceName,
            publicKey: pending.publicKey,
          },
          allowed,
          uuid,
        );
        if (!result.ok || result.value.payload.kind !== "key_request") return result;
        if (
          !equalBytes(result.value.payload.publicKey.bytes, pending.publicKey.bytes) ||
          result.value.payload.deviceId !== this.deps.device.deviceId
        )
          return failure("invalid-message");
        try {
          const bound = await this.deps.storage.bindPendingRequest(
            this.deps.scope,
            pending.localRequestId,
            result.value.uuid,
            { isCurrent: () => this.isCurrent() && allowed() },
          );
          if (!this.isCurrent()) return failure("stale");
          if (!allowed()) return failure("forbidden");
          if (!bound) return failure("storage-failed");
        } catch {
          return failure("storage-failed");
        }
        const ingested = await this.ingestKeyMessage(result.value);
        if (!ingested.ok) return ingested;
        if (this.requestStatus === "idle") this.requestStatus = "requested";
        return result;
      }),
    );
    this.requestQueue = next;
    return next;
  }

  private validRequest(request: ChatE2eeMessage<ChatKeyRequestPayload>): boolean {
    return (
      request.streamUuid === this.deps.scope.streamUuid &&
      request.payload.keyUuid === this.deps.scope.keyUuid
    );
  }

  private canRespond(
    request: ChatE2eeMessage<ChatKeyRequestPayload>,
    action: "grant" | "reject",
  ): boolean {
    // A contextual request must never fall back to channel administration rights.
    if (this.deps.canRespondToRequest) return this.deps.canRespondToRequest(request, action);
    if (request.payload.targetMessageUuid !== undefined) return false;
    const rights = this.deps.getRights();
    return action === "grant" ? rights.canGrant : rights.canReject;
  }

  grantKey(
    request: ChatE2eeMessage<ChatKeyRequestPayload>,
  ): Promise<ChatE2eeControllerResult<ChatE2eeMessage>> {
    return this.run(async () => {
      if (!this.validRequest(request)) return failure("invalid-message");
      if (!this.canRespond(request, "grant")) return failure("forbidden");
      const deletionRevision = await this.readDeletionRevision();
      if (!deletionRevision.ok) return deletionRevision;
      const stored = await this.readKey();
      if (!stored.ok) return stored;
      if (stored.value?.groupKey == null) return failure("missing-key");
      if (!this.canRespond(request, "grant")) return failure("forbidden");
      const context = {
        streamUuid: this.deps.scope.streamUuid,
        keyUuid: this.deps.scope.keyUuid,
        requestMessageUuid: request.uuid,
        senderDeviceId: this.deps.device.deviceId,
        recipientDeviceId: request.payload.deviceId,
      };
      const envelope = await this.deps.provider.encryptGroupKeyGrant({
        groupKey: stored.value.groupKey,
        recipientPublicKey: request.payload.publicKey,
        context,
      });
      if (!this.isCurrent()) return failure("stale");
      if (!envelope.ok) return envelope;
      const retained = await this.checkDeletionRevision(deletionRevision.value);
      if (!retained.ok) return retained;
      return this.send(
        {
          kind: "key_grant",
          keyUuid: context.keyUuid,
          requestMessageUuid: context.requestMessageUuid,
          senderDeviceId: context.senderDeviceId,
          recipientDeviceId: context.recipientDeviceId,
          content: envelope.value,
        },
        () => this.canRespond(request, "grant"),
      );
    });
  }

  rejectKey(
    request: ChatE2eeMessage<ChatKeyRequestPayload>,
  ): Promise<ChatE2eeControllerResult<ChatE2eeMessage>> {
    return this.run(async () => {
      if (!this.validRequest(request)) return failure("invalid-message");
      return this.send(
        {
          kind: "key_reject",
          keyUuid: this.deps.scope.keyUuid,
          requestMessageUuid: request.uuid,
          senderDeviceId: this.deps.device.deviceId,
          recipientDeviceId: request.payload.deviceId,
        },
        () => this.canRespond(request, "reject"),
      );
    });
  }

  encryptMessage<T>(
    plaintext: Uint8Array,
    dispatch: (payload: ChatEncryptedPayload, isCurrent: () => boolean) => Promise<T>,
    preparedPayload?: ChatEncryptedPayload,
    verifyPreparedPlaintext = false,
  ): Promise<ChatE2eeControllerResult<T>> {
    return this.run(async () => {
      if (!this.deps.getRights().canSend) return failure("forbidden");
      const deletionRevision = await this.readDeletionRevision();
      if (!deletionRevision.ok) return deletionRevision;
      const stored = await this.readKey();
      if (!stored.ok) return stored;
      if (stored.value?.groupKey == null) return failure("missing-key");
      if (preparedPayload != null && preparedPayload.keyUuid !== this.deps.scope.keyUuid)
        return failure("invalid-key");
      if (preparedPayload && verifyPreparedPlaintext) {
        const verified = await this.deps.provider.decryptMessage({
          groupKey: stored.value.groupKey,
          envelope: preparedPayload.content,
          context: this.deps.scope,
        });
        if (!this.isCurrent()) {
          if (verified.ok) verified.value.fill(0);
          return failure("stale");
        }
        if (!verified.ok) return failure("invalid-key");
        try {
          if (
            verified.value.length !== plaintext.length ||
            verified.value.some((value, index) => value !== plaintext[index])
          )
            return failure("invalid-key");
        } finally {
          verified.value.fill(0);
        }
      }
      // An ambiguous POST retries the same envelope and UUID, after all local key checks.
      const encrypted =
        preparedPayload == null
          ? await this.deps.provider.encryptMessage({
              groupKey: stored.value.groupKey,
              plaintext,
              context: this.deps.scope,
            })
          : success(preparedPayload.content);
      if (!this.isCurrent()) return failure("stale");
      if (!encrypted.ok) return encrypted;
      const retained = await this.checkDeletionRevision(deletionRevision.value);
      if (!retained.ok) return retained;
      const guard = () => this.isCurrent() && this.deps.getRights().canSend;
      if (!guard()) return failure(this.isCurrent() ? "forbidden" : "stale");
      try {
        // The transport verifies its receipt and retains this guard through dispatch and commits.
        const sent = await dispatch(
          { kind: "e2ee", keyUuid: this.deps.scope.keyUuid, content: encrypted.value },
          guard,
        );
        if (!guard()) return failure(this.isCurrent() ? "forbidden" : "stale");
        return success(sent);
      } catch {
        return failure("send-failed");
      }
    });
  }

  ingestKeyMessage(message: ChatE2eeMessage): Promise<ChatE2eeControllerResult<void>> {
    // Serialize duplicate/history/realtime arrivals; a failed grant remains retryable.
    const next = this.queue.then(() => this.run(() => this.ingest(message)));
    this.queue = next;
    return next;
  }

  private async ingest(message: ChatE2eeMessage): Promise<ChatE2eeControllerResult<void>> {
    if (
      message.streamUuid !== this.deps.scope.streamUuid ||
      message.payload.keyUuid !== this.deps.scope.keyUuid
    )
      return failure("invalid-message");
    if (message.payload.kind === "key_request")
      return this.receiveRequest({ ...message, payload: message.payload });
    if (message.payload.kind === "key_grant" || message.payload.kind === "key_reject")
      return this.receiveResponse({ ...message, payload: message.payload });
    if (message.payload.kind !== "key_announced") return failure("invalid-message");
    const allowed = () => this.deps.isAnnouncerAllowed(message.authorUuid);
    if (!allowed()) return failure("forbidden");
    return this.drainWaiting();
  }

  private async receiveRequest(
    request: ChatE2eeMessage<ChatKeyRequestPayload>,
  ): Promise<ChatE2eeControllerResult<void>> {
    if (!this.validRequest(request)) return failure("invalid-message");
    if (
      request.authorUuid === this.deps.scope.owner.userUuid &&
      request.payload.deviceId === this.deps.scope.deviceId
    ) {
      try {
        const pending = await this.deps.storage.listPendingRequests(this.deps.scope);
        if (!this.isCurrent()) return failure("stale");
        const matchingKeys = pending.filter((item) =>
          equalBytes(item.publicKey.bytes, request.payload.publicKey.bytes),
        );
        if (
          matchingKeys.some(
            (item) => item.context?.targetMessageUuid !== request.payload.targetMessageUuid,
          )
        )
          return failure("invalid-message");
        const bound = matchingKeys.filter((item) => item.requestMessageUuid === request.uuid);
        const candidates = bound.length
          ? bound
          : matchingKeys.filter(
              (item) =>
                item.requestMessageUuid === null || item.requestMessageUuid === item.localRequestId,
            );
        if (candidates.length > 1) return failure("invalid-message");
        const candidate = candidates[0];
        if (candidate && candidate.requestMessageUuid !== request.uuid) {
          const bound = await this.deps.storage.bindPendingRequest(
            this.deps.scope,
            candidate.localRequestId,
            request.uuid,
            { isCurrent: this.isCurrent },
          );
          if (!this.isCurrent()) return failure("stale");
          if (!bound) return failure("storage-failed");
        }
      } catch {
        return failure("storage-failed");
      }
    }
    this.requests.set(request.uuid, request);
    return this.drainWaiting();
  }

  private async drainWaiting(): Promise<ChatE2eeControllerResult<void>> {
    let firstFailure: ChatE2eeControllerResult<void> | null = null;
    for (const response of this.waiting.values()) {
      const result = await this.receiveResponse(response);
      if (!result.ok) firstFailure ??= result;
      if (!this.isCurrent()) return failure("stale");
    }
    return firstFailure ?? success(undefined);
  }

  private async receiveResponse(
    response: ChatE2eeMessage<ChatKeyResponsePayload>,
  ): Promise<ChatE2eeControllerResult<void>> {
    if (this.processed.has(response.uuid)) return success(undefined);
    let requestContext: ChatKeyRequestContext | undefined;
    const allowed = () =>
      (!requestContext || response.authorUuid === requestContext.expectedIssuerUuid) &&
      this.deps.isIssuerAllowed(response.authorUuid, requestContext);
    if (response.payload.recipientDeviceId !== this.deps.scope.deviceId) {
      this.waiting.delete(response.uuid);
      return failure("invalid-message");
    }
    let pending: PendingChatKeyRequest | undefined;
    try {
      const candidates = await this.deps.storage.listPendingRequests(this.deps.scope);
      if (!this.isCurrent()) return failure("stale");
      pending = candidates.find(
        (item) => item.requestMessageUuid === response.payload.requestMessageUuid,
      );
      if (!pending) {
        const completion = await this.deps.storage.readRequestCompletionByMessageUuid(
          this.deps.scope,
          response.payload.requestMessageUuid,
        );
        if (!this.isCurrent()) return failure("stale");
        if (completion?.requestMessageUuid === response.payload.requestMessageUuid) {
          this.processed.add(response.uuid);
          this.waiting.delete(response.uuid);
          return success(undefined);
        }
      }
    } catch {
      return failure("storage-failed");
    }
    const request = this.requests.get(response.payload.requestMessageUuid) ?? null;
    if (!pending) {
      this.waiting.set(response.uuid, response);
      return success(undefined);
    }
    requestContext = pending.context;
    if (!allowed()) return failure("forbidden");
    if (request) {
      const correlation = correlateChatKeyResponse({
        request,
        response,
        issuerCanGrantKey: allowed(),
      });
      if (
        correlation.status !== "matched" ||
        request.authorUuid !== this.deps.scope.owner.userUuid ||
        request.payload.targetMessageUuid !== pending.context?.targetMessageUuid ||
        !equalBytes(request.payload.publicKey.bytes, pending.publicKey.bytes)
      ) {
        this.waiting.delete(response.uuid);
        return failure("invalid-message");
      }
    }
    const completion = {
      localRequestId: pending.localRequestId,
      requestMessageUuid: response.payload.requestMessageUuid,
      responseMessageUuid: response.uuid,
    };
    const guard = () => this.isCurrent() && allowed();
    if (response.payload.kind === "key_reject") {
      try {
        const committed = await this.deps.storage.completeReject(this.deps.scope, completion, {
          isCurrent: guard,
        });
        if (!this.isCurrent()) return failure("stale");
        if (!allowed()) return failure("forbidden");
        if (!committed) {
          const receipt = await this.deps.storage.readRequestCompletion(
            this.deps.scope,
            pending.localRequestId,
          );
          if (!this.isCurrent()) return failure("stale");
          if (!allowed()) return failure("forbidden");
          if (
            receipt?.outcome !== "rejected" ||
            receipt.requestMessageUuid !== completion.requestMessageUuid
          )
            return failure("invalid-message");
        }
      } catch {
        return failure("storage-failed");
      }
      if (resolveChatGenerationAccess(this.key) !== "ready") this.requestStatus = "rejected";
      this.processed.add(response.uuid);
      this.waiting.delete(response.uuid);
      return success(undefined);
    }
    const payload = response.payload;
    const decrypted = await this.deps.provider.decryptGroupKeyGrant({
      requestKeyPair: { publicKey: pending.publicKey, privateKey: pending.privateKey },
      envelope: payload.content,
      context: {
        streamUuid: response.streamUuid,
        keyUuid: payload.keyUuid,
        requestMessageUuid: payload.requestMessageUuid,
        senderDeviceId: payload.senderDeviceId,
        recipientDeviceId: payload.recipientDeviceId,
      },
    });
    if (!this.isCurrent()) return failure("stale");
    if (!decrypted.ok) return decrypted;
    if (!allowed()) return failure("forbidden");
    try {
      if (
        pending.recovery &&
        !equalBytes(decrypted.value.bytes, pending.recovery.previousGroupKey.bytes)
      ) {
        const checked = await this.deps.provider.decryptMessage({
          groupKey: decrypted.value,
          envelope: pending.recovery.envelope,
          context: this.deps.scope,
        });
        if (!this.isCurrent()) return failure("stale");
        if (!allowed()) return failure("forbidden");
        if (!checked.ok) {
          // Finish this attempt locally so a manual retry sends a new request to the issuer.
          const committed = await this.deps.storage.completeReject(this.deps.scope, completion, {
            isCurrent: guard,
          });
          if (!this.isCurrent()) return failure("stale");
          if (!allowed()) return failure("forbidden");
          if (!committed) return failure("storage-failed");
          this.processed.add(response.uuid);
          this.waiting.delete(response.uuid);
          this.requestStatus = "rejected";
          return checked;
        }
        checked.value.fill(0);
      }
      const committed = await this.deps.storage.completeGrant(
        this.deps.scope,
        {
          ...completion,
          groupKey: decrypted.value,
          ...(pending.recovery ? { replaceExistingKey: true } : {}),
        },
        { isCurrent: guard },
      );
      if (!this.isCurrent()) return failure("stale");
      if (!allowed()) return failure("forbidden");
      if (!committed) {
        const receipt = await this.deps.storage.readRequestCompletion(
          this.deps.scope,
          pending.localRequestId,
        );
        if (!this.isCurrent()) return failure("stale");
        if (!allowed()) return failure("forbidden");
        if (
          receipt?.outcome !== "granted" ||
          receipt.requestMessageUuid !== completion.requestMessageUuid
        )
          return failure("invalid-message");
        const key = await this.readKey();
        if (!key.ok) return key;
        if (key.value?.groupKey == null) return failure("missing-key");
      }
    } catch {
      return failure("storage-failed");
    }
    this.keyRevision++;
    const stored = await this.readKey();
    if (!stored.ok) return stored;
    if (!allowed()) return failure("forbidden");
    if (stored.value?.groupKey == null) return failure("missing-key");
    this.requestStatus = "grant-received";
    this.processed.add(response.uuid);
    this.waiting.delete(response.uuid);
    return success(undefined);
  }
}
