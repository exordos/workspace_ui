import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { parseWorkspaceSecretDraft } from "~/shared/lib/workspace-secret-draft.lib";
import { acquireChatCryptoSession } from "./chat-crypto-session.lib";
import { sendMessengerMessage } from "./messenger-message-actions.lib";
import {
  isMessengerOutgoingMessageReceipt,
  settleMessengerOutgoingMessage,
  useMessengerOutboxStore,
} from "./messenger-outbox.model";
import { runMessengerRuntimeMutation } from "./messenger-runtime-mutation.lib";
import { buildMessengerSecretMarkdown } from "./messenger-secret-message.lib";
import type { ChatEncryptedPayload } from "./chat-e2ee.types";

const deliveries = new Map<string, Promise<boolean>>();
const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

/** Delivery belongs to the runtime and outbox, so navigating away cannot discard it. */
export function deliverMessengerOutgoingMessage(
  runtimeContext: WorkspaceRuntimeContext | null,
  placementUuid: string,
): Promise<boolean> {
  const outgoing =
    useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[placementUuid];
  if (outgoing == null) return Promise.resolve(false);
  let encryption = outgoing.encryption;
  const settleIfIndexed = () => {
    const state = useWorkspaceMessageStore.getState();
    const message = state.ownerKey === outgoing.ownerKey ? state.messagesById[placementUuid] : null;
    if (message == null || !isMessengerOutgoingMessageReceipt({ ...outgoing, encryption }, message))
      return false;
    // Realtime can already have removed the row before the HTTP response is lost.
    settleMessengerOutgoingMessage(outgoing.ownerKey, message);
    return true;
  };
  if (settleIfIndexed()) return Promise.resolve(true);
  if (runtimeContext == null || workspaceRuntimeOwnerKey(runtimeContext) !== outgoing.ownerKey) {
    useMessengerOutboxStore
      .getState()
      .markOutgoingMessageFailed(placementUuid, t("workspaceMessenger.runtimeUnavailable"));
    return Promise.resolve(false);
  }
  const deliveryKey = `${outgoing.ownerKey}:${runtimeContext.runtimeGeneration}:${placementUuid}`;
  const pending = deliveries.get(deliveryKey);
  if (pending != null) return pending;
  useMessengerOutboxStore.getState().markOutgoingMessageSending(placementUuid);
  const delivery = runMessengerRuntimeMutation(runtimeContext, async (signal) => {
    if (outgoing.markdown.trim().length === 0) throw new Error(t("message.sendFailed"));
    const routing = {
      topicUuid: outgoing.topicUuid,
      includeStreamConversation: outgoing.includeStreamConversation,
      canonicalMessageUuid: outgoing.canonicalMessageUuid,
    };
    const outgoingEncryption = outgoing.encryption;
    if (outgoingEncryption != null) {
      const lease = acquireChatCryptoSession(runtimeContext, outgoing.streamUuid);
      signal.addEventListener("abort", lease.release, { once: true });
      try {
        const session = await lease.promise;
        if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal))
          throw new Error("stale");
        const result = await session.send({
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
        if (result.status !== "applied") throw new Error(t("message.sendFailed"));
      } finally {
        signal.removeEventListener("abort", lease.release);
        lease.release();
      }
    } else {
      const result = await sendMessengerMessage({
        ...routing,
        runtimeContext,
        getRuntimeContext,
        signal,
        streamUuid: outgoing.streamUuid,
        markdown: outgoing.markdown,
      });
      if (result.status !== "applied") throw new Error(t("message.sendFailed"));
    }
    if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal))
      throw new Error("stale");
    useMessengerOutboxStore.getState().removeOutgoingMessage(placementUuid);
    return true;
  })
    .catch((error: unknown) => {
      if (settleIfIndexed()) return true;
      useMessengerOutboxStore
        .getState()
        .markOutgoingMessageFailed(
          placementUuid,
          outgoing.encryption == null &&
            error instanceof Error &&
            error.name !== "AbortError" &&
            error.message.trim().length > 0
            ? error.message
            : t("message.sendFailed"),
        );
      return false;
    })
    .finally(() => {
      if (deliveries.get(deliveryKey) === delivery) deliveries.delete(deliveryKey);
    });
  deliveries.set(deliveryKey, delivery);
  return delivery;
}
