import type { WorkspaceComposerDraftSubmission } from "~/applications/messenger/model/drafts/composer-draft-actions.lib";
import { resolveWorkspaceOwnerRuntimeForRequest } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createLogger } from "~/shared/lib/logger";
import { isWorkspaceMessageWithinLimit } from "~/shared/lib/workspace-message-limits.lib";
import {
  hasWorkspaceSecretDraft,
  parseWorkspaceSecretDraft,
} from "~/shared/lib/workspace-secret-draft.lib";
import { conversationIdForStream, conversationIdForTopic } from "../../messenger-ids.lib";
import { deliverMessengerOutgoingMessage } from "./messenger-outbox-delivery.lib";
import { useMessengerOutboxStore } from "./messenger-outbox.model";
import type { MessengerOutgoingEncryption } from "./messenger-outbox.types";
import type { RealChatSession } from "../../crypto/chat-crypto-runtime.lib";
import type { MessengerUuid } from "../../messenger.types";

const draftSendLog = createLogger("messages-send-draft");

// Подтверждённая цель отправки и операции криптографии для этого разговора.
export interface MessagesDraftSendOptions {
  target: {
    streamUuid: MessengerUuid; // Чат назначения.
    topicUuid: MessengerUuid; // Тема назначения, включая тему по умолчанию.
    includeStreamConversation: boolean; // Показывать исходящее в окне всего чата.
  };
  markdown: string; // Готовое тело с ответами и вложениями.
  draft?: WorkspaceComposerDraftSubmission; // Версия черновика до подготовки ключа.
  crypto: {
    encrypted: boolean; // Шифруется всё сообщение.
    keyUuid: string | null; // Выбранный ключ зашифрованного чата.
    session: Pick<RealChatSession, "device" | "prepareFragmentKey"> | null; // Операции активного чата.
    createNewKey?: boolean; // Явная смена ключа секретных фрагментов.
  };
  isIntentCurrent: () => boolean; // Навигация может отменить ещё не принятое намерение.
  onAccepted?: (canClearEditor: boolean) => void; // Передача владения после постановки, даже если визит закончился.
  beginNextDraftOnAcceptance?: boolean; // Освободить редактор, оставив запись до подтверждения.
}

// Синхронный ответ для обычного сообщения, после подготовки ключа для фрагментов.
export interface MessagesAcceptedDraft {
  clearOnAcceptance: boolean | null; // Фрагменты очищаются сразу, прочие ждут доставку.
  delivery: Promise<{ delivered: boolean; shouldClearComposer: boolean }>;
}

// Ошибки до постановки в очередь, которые UI переводит в состояние редактора.
export class MessagesDraftSendError extends Error {
  constructor(readonly reason: "too-long" | "crypto-unavailable" | "invalid-secret" | "stale") {
    super(reason);
  }
}

// Проверяет намерение, готовит криптографию и передаёт операцию существующей очереди.
export function sendMessengerDraft(
  runtimeContext: WorkspaceRuntimeContext,
  isRuntimeCurrent: () => boolean,
  {
    target,
    markdown,
    draft,
    crypto,
    isIntentCurrent,
    onAccepted,
    beginNextDraftOnAcceptance,
  }: MessagesDraftSendOptions,
): MessagesAcceptedDraft | null | Promise<MessagesAcceptedDraft> {
  const hasFragments = !crypto.encrypted && hasWorkspaceSecretDraft(markdown);
  const session = crypto.session;
  if (crypto.encrypted && (session == null || crypto.keyUuid == null))
    throw new MessagesDraftSendError("crypto-unavailable");
  if (!isWorkspaceMessageWithinLimit(markdown)) throw new MessagesDraftSendError("too-long");
  if (markdown.trim().length === 0) return null;
  const isCurrent = () => isRuntimeCurrent() && isIntentCurrent();
  if (!isCurrent()) throw new MessagesDraftSendError("stale");

  function accept(encryption?: MessengerOutgoingEncryption): MessagesAcceptedDraft {
    if (!isCurrent()) throw new MessagesDraftSendError("stale");
    const deliveryRuntime =
      resolveWorkspaceOwnerRuntimeForRequest(runtimeContext) ?? runtimeContext;
    const { streamUuid, topicUuid, includeStreamConversation } = target;
    let confirmed = false;
    const confirm = () => {
      if (confirmed) return;
      confirmed = true;
      if (encryption == null) draft?.completeOnReceipt();
    };
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage(
      {
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        conversationId: includeStreamConversation
          ? conversationIdForStream(streamUuid)
          : conversationIdForTopic(streamUuid, topicUuid),
        projectId: runtimeContext.projectId,
        authorUuid: runtimeContext.userUuid,
        streamUuid,
        topicUuid,
        markdown,
        status: "sending",
        includeStreamConversation,
        encryption,
      },
      confirm,
    );
    const delivery = confirmed
      ? Promise.resolve(true)
      : deliverMessengerOutgoingMessage(deliveryRuntime, outgoing.placementUuid);
    let clearOnAcceptance: boolean | null = hasFragments ? false : null;
    let canClearEditor = false;
    try {
      if (hasFragments) {
        clearOnAcceptance = draft?.clearPrivateOnAcceptance() ?? true;
      } else if (encryption == null && beginNextDraftOnAcceptance && isCurrent()) {
        canClearEditor = draft?.beginNextDraftOnAcceptance() ?? true;
      }
    } catch (error) {
      draftSendLog.warn("Accepted draft could not release its editor", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
    onAccepted?.(canClearEditor);
    return {
      clearOnAcceptance,
      delivery: delivery.then((delivered) => {
        // Проверенный ответ POST также действует после удаления локальной строки.
        if (delivered) {
          try {
            confirm();
          } catch (error) {
            draftSendLog.warn("Sent draft completion failed", {
              errorType: error instanceof Error ? error.name : typeof error,
            });
          }
        }
        return {
          delivered,
          shouldClearComposer: encryption != null || draft == null || draft.canCompleteComposer(),
        };
      }),
    };
  }

  if (hasFragments) {
    try {
      parseWorkspaceSecretDraft(markdown);
    } catch {
      throw new MessagesDraftSendError("invalid-secret");
    }
    if (session == null) throw new MessagesDraftSendError("crypto-unavailable");
    return session.prepareFragmentKey(crypto.createNewKey === true).then(
      (keyUuid) => {
        if (keyUuid == null) throw new MessagesDraftSendError("crypto-unavailable");
        return accept({ keyUuid, deviceId: session.device.deviceId, mode: "fragments" });
      },
      () => {
        throw new MessagesDraftSendError("crypto-unavailable");
      },
    );
  }

  return accept(
    crypto.encrypted && session != null && crypto.keyUuid != null
      ? { keyUuid: crypto.keyUuid, deviceId: session.device.deviceId }
      : undefined,
  );
}
