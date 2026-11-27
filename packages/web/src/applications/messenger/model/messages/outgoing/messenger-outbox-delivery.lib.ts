import {
  resolveWorkspaceOwnerRuntimeForRequest,
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { parseWorkspaceSecretDraft } from "~/shared/lib/workspace-secret-draft.lib";
import { getMessengerStoreForOwner } from "../../chats/messenger.model";
import { acquireChatCryptoSession } from "../../crypto/chat-crypto-session.lib";
import { buildMessengerSecretMarkdown } from "../../crypto/messenger-secret-message.lib";
import { runMessengerOwnerMutation } from "../../messenger-runtime-mutation.lib";
import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "../message.model";
import { sendMessengerMessage } from "../messenger-message-actions.lib";
import {
  isMessengerOutgoingMessageReceipt,
  settleMessengerOutgoingMessage,
  trackMessengerOutgoingReceipt,
  useMessengerOutboxStore,
} from "./messenger-outbox.model";
import type { ChatEncryptedPayload } from "../../crypto/chat-e2ee.types";
import type { MessengerMessage } from "../../messenger.types";
import type { MessengerMessageActionResult } from "../messenger-message-actions.lib";

const deliveries = new Map<string, Promise<boolean>>();

/** Delivery belongs to the runtime and outbox, so navigating away cannot discard it. */
export function deliverMessengerOutgoingMessage(
  requestContext: WorkspaceRuntimeContext | null,
  placementUuid: string,
): Promise<boolean> {
  const outgoing =
    useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[placementUuid];
  if (outgoing == null) return Promise.resolve(false);
  if (requestContext == null || workspaceRuntimeOwnerKey(requestContext) !== outgoing.ownerKey)
    return Promise.resolve(false);
  const runtimeContext = resolveWorkspaceOwnerRuntimeForRequest(requestContext);
  const selectedStore = getSelectedWorkspaceMessageStore();
  const store =
    getWorkspaceMessageStoreForOwner(outgoing.ownerKey) ??
    (selectedStore.getState().ownerKey === outgoing.ownerKey ? selectedStore : null);
  if (runtimeContext == null) return Promise.resolve(false);
  if (store == null) {
    useMessengerOutboxStore
      .getState()
      .markOutgoingMessageFailed(placementUuid, t("workspaceMessenger.runtimeUnavailable"));
    return Promise.resolve(false);
  }
  const getRuntimeContext = () =>
    useWorkspaceAuthStore.getState().getRuntimeContextForOwner(runtimeContext);
  const messengerStore = getMessengerStoreForOwner(outgoing.ownerKey) ?? undefined;
  let encryption = outgoing.encryption;
  // The validated POST may outlive a dismissed local row or be followed by an edit.
  const matchesReceipt = (message: MessengerMessage | null) =>
    message != null && isMessengerOutgoingMessageReceipt({ ...outgoing, encryption }, message);
  // Realtime or history may have confirmed delivery before the HTTP response was lost.
  const settleIfIndexed = () => {
    const state = store.getState();
    const message = state.messagesById[placementUuid];
    if (state.ownerKey !== outgoing.ownerKey || message == null || !matchesReceipt(message))
      return false;
    settleMessengerOutgoingMessage(outgoing.ownerKey, message);
    return true;
  };
  if (settleIfIndexed()) return Promise.resolve(true);
  const deliveryKeyFor = (generation: number) =>
    `${outgoing.ownerKey}:${generation}:${placementUuid}`;
  const deliveryKey = deliveryKeyFor(runtimeContext.runtimeGeneration);
  const pending = deliveries.get(deliveryKey);
  if (pending != null) return pending;
  const receipt = trackMessengerOutgoingReceipt(outgoing.ownerKey, placementUuid);
  useMessengerOutboxStore.getState().markOutgoingMessageSending(placementUuid);
  const delivery = runMessengerOwnerMutation(runtimeContext, async (signal) => {
    if (receipt.confirmed || settleIfIndexed()) return true;
    if (outgoing.markdown.trim().length === 0) throw new Error(t("message.sendFailed"));
    const routing = {
      topicUuid: outgoing.topicUuid,
      includeStreamConversation: outgoing.includeStreamConversation,
      canonicalMessageUuid: outgoing.canonicalMessageUuid,
    };
    const outgoingEncryption = outgoing.encryption;
    let result: MessengerMessageActionResult;
    if (outgoingEncryption != null) {
      const lease = acquireChatCryptoSession(runtimeContext, outgoing.streamUuid);
      signal.addEventListener("abort", lease.release, { once: true });
      try {
        const session = await lease.promise;
        if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal))
          throw new Error("stale");
        if (receipt.confirmed) return true;
        result = await session.send({
          ...routing,
          text: outgoingEncryption.mode === "fragments" ? "" : outgoing.markdown,
          ...(outgoingEncryption.mode === "fragments"
            ? {
                secretFragments: parseWorkspaceSecretDraft(outgoing.markdown).map(
                  (fragment, index) => ({
                    text: fragment.text,
                    preparedPayload: outgoingEncryption.fragments?.[index],
                  }),
                ),
                buildMarkdown: (payloads: readonly ChatEncryptedPayload[]) => {
                  const markdown =
                    outgoingEncryption.preparedMarkdown ??
                    buildMessengerSecretMarkdown(outgoing.streamUuid, outgoing.markdown, payloads);
                  useMessengerOutboxStore
                    .getState()
                    .retainEncryptedFragments(placementUuid, payloads, markdown);
                  encryption = {
                    ...outgoingEncryption,
                    fragments: payloads,
                    preparedMarkdown: markdown,
                  };
                  return markdown;
                },
              }
            : {}),
          expectedKeyUuid: outgoingEncryption.keyUuid,
          expectedDeviceId: outgoingEncryption.deviceId,
          preparedPayload: outgoingEncryption.payload,
          onEncryptedPayload: (payload) => {
            useMessengerOutboxStore.getState().retainEncryptedPayload(placementUuid, payload);
            encryption = {
              keyUuid: payload.keyUuid,
              deviceId: outgoingEncryption.deviceId,
              payload,
            };
          },
        });
      } finally {
        signal.removeEventListener("abort", lease.release);
        lease.release();
      }
    } else {
      result = await sendMessengerMessage({
        ...routing,
        runtimeContext,
        getRuntimeContext,
        signal,
        store,
        messengerStore,
        streamUuid: outgoing.streamUuid,
        markdown: outgoing.markdown,
      });
    }
    if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal))
      throw new Error("stale");
    if (
      result.status !== "applied" ||
      result.ownerKey !== outgoing.ownerKey ||
      (!receipt.confirmed && !matchesReceipt(result.message))
    )
      throw new Error(t("message.sendFailed"));
    return true;
  })
    .catch((error: unknown) => {
      if (receipt.confirmed) return true;
      const current = getRuntimeContext();
      if (
        current == null ||
        workspaceAuthSessionIncarnation(current) !== workspaceAuthSessionIncarnation(runtimeContext)
      )
        return false;
      if (!isWorkspaceRuntimeRequestInvalidated(runtimeContext, () => current) && settleIfIndexed())
        return true;
      const currentDelivery = deliveries.get(deliveryKeyFor(current.runtimeGeneration));
      // Runtime replacement may already have handed this row to a newer attempt.
      if (currentDelivery != null && currentDelivery !== delivery) return false;
      const outbox = useMessengerOutboxStore.getState();
      if (outbox.outgoingMessagesByPlacementUuid[placementUuid]?.ownerKey === outgoing.ownerKey) {
        outbox.markOutgoingMessageFailed(
          placementUuid,
          outgoing.encryption == null &&
            error instanceof Error &&
            error.name !== "AbortError" &&
            error.message.trim().length > 0
            ? error.message
            : t("message.sendFailed"),
        );
      }
      return false;
    })
    .finally(() => {
      receipt.release();
      if (deliveries.get(deliveryKey) === delivery) deliveries.delete(deliveryKey);
    });
  deliveries.set(deliveryKey, delivery);
  return delivery;
}
