import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import { createWorkspaceDirectStream } from "~/entities/messenger/messenger-create-chat-actions.lib";
import { sendMessengerMessage } from "~/entities/messenger/messenger-message-actions.lib";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { getMessagesByUuids } from "~/shared/api/messenger-client";
import { createLogger } from "~/shared/lib/logger";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import {
  AppDialogShell,
  APP_DIALOG_CONTENT_BASE_CLASS,
  DialogPrimaryButton,
} from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import {
  buildWorkspaceForwardMarkdown,
  buildWorkspaceForwardStreamOptions,
  buildWorkspaceForwardTopicOptions,
  resolveWorkspaceForwardMessages,
  resolveWorkspaceForwardTarget,
} from "./workspace-forward-message.lib";
import { useWorkspaceForwardMessageStore } from "./workspace-forward-message.model";
import type { WorkspaceForwardTarget } from "./workspace-forward-message.types";

const CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[70vh] max-w-md -translate-y-1/2 flex-col p-0`;
const log = createLogger("workspace-forward-message");
type ForwardTab = "channel" | "direct";

function isStream(value: MessengerStream | undefined): value is MessengerStream {
  return value != null;
}

function isTopic(value: MessengerTopic | undefined): value is MessengerTopic {
  return value != null;
}

function isUser(value: User | undefined): value is User {
  return value != null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t("app.error");
}

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function isRuntimeStillCurrent(ownerKey: string, runtimeGeneration: number): boolean {
  const runtimeContext = currentRuntimeContext();
  return (
    runtimeContext != null &&
    workspaceRuntimeOwnerKey(runtimeContext) === ownerKey &&
    runtimeContext.runtimeGeneration === runtimeGeneration
  );
}

function useWorkspaceForwardRuntime(): WorkspaceRuntimeContext | null {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  return useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
}

interface WorkspaceForwardTargetPickerProps {
  currentUserUuid: MessengerUuid;
  isSubmitting: boolean;
  error: string | null;
  streams: readonly MessengerStream[];
  topics: readonly MessengerTopic[];
  onForward: (target: WorkspaceForwardTarget) => void;
  onClose: () => void;
}

const WorkspaceForwardTargetPicker = React.memo<WorkspaceForwardTargetPickerProps>(
  function WorkspaceForwardTargetPicker({
    currentUserUuid,
    isSubmitting,
    error,
    streams,
    topics,
    onForward,
    onClose,
  }) {
    const [tab, setTab] = useState<ForwardTab>("channel");
    const [selectedStream, setSelectedStream] = useState("");
    const [selectedTopic, setSelectedTopic] = useState("");
    const [selectedUserUuid, setSelectedUserUuid] = useState("");
    const [directSearch, setDirectSearch] = useState("");
    const usersById = useUsersStore((state) => state.usersById);
    const userIds = useUsersStore((state) => state.userIds);

    const streamOptions = useMemo(() => buildWorkspaceForwardStreamOptions(streams), [streams]);
    const topicOptions = useMemo(
      () => buildWorkspaceForwardTopicOptions({ streamUuid: selectedStream, topics }),
      [selectedStream, topics],
    );
    const userOptions = useMemo(() => {
      const normalizedSearch = directSearch.trim().toLowerCase();
      return userIds
        .map((userUuid) => usersById[userUuid])
        .filter(isUser)
        .filter((user) => user.uuid !== currentUserUuid)
        .map((user) => ({
          userUuid: user.uuid,
          displayName: selectUserDisplayName(user, user.uuid),
          username: user.username,
          email: user.email ?? "",
        }))
        .filter((user) => {
          if (normalizedSearch.length === 0) return true;
          return [user.displayName, user.username, user.email].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          );
        });
    }, [currentUserUuid, directSearch, userIds, usersById]);

    const submitDisabled =
      tab === "channel"
        ? selectedStream.length === 0 || selectedTopic.length === 0
        : selectedUserUuid.length === 0;

    return (
      <>
        <div className="flex border-b border-border-subtle">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === "channel"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            disabled={isSubmitting}
            onClick={() => setTab("channel")}
          >
            {t("message.channel")}
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === "direct"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            disabled={isSubmitting}
            onClick={() => setTab("direct")}
          >
            {t("message.directMessage")}
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-hidden p-4">
          {tab === "channel" ? (
            <>
              <label className="text-sm text-text-muted">{t("channel.name")}</label>
              <select
                value={selectedStream}
                onChange={(event) => {
                  setSelectedStream(event.target.value);
                  setSelectedTopic("");
                }}
                aria-label={t("channel.name")}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none"
                disabled={isSubmitting}
              >
                <option value="">{t("channel.selectChannel")}</option>
                {streamOptions.map((streamOption) => (
                  <option key={streamOption.streamUuid} value={streamOption.streamUuid}>
                    #{streamOption.label}
                  </option>
                ))}
              </select>
              <label className="text-sm text-text-muted">{t("channel.topicName")}</label>
              <select
                value={selectedTopic}
                onChange={(event) => setSelectedTopic(event.target.value)}
                aria-label={t("channel.topicName")}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                disabled={selectedStream.length === 0 || isSubmitting}
              >
                <option value="">{t("chat.selectTopic")}</option>
                {topicOptions.map((topicOption) => {
                  const topicDisplay = resolveTopicDisplayInfo(topicOption.label);
                  return (
                    <option key={topicOption.topicUuid} value={topicOption.topicUuid}>
                      {topicDisplay.label}
                    </option>
                  );
                })}
              </select>
            </>
          ) : (
            <>
              <input
                type="text"
                value={directSearch}
                onChange={(event) => setDirectSearch(event.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder={t("message.searchUsers")}
                disabled={isSubmitting}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border-subtle">
                {userOptions.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-text-muted">
                    {t("search.noResults")}
                  </p>
                ) : (
                  userOptions.map((user) => (
                    <button
                      type="button"
                      key={user.userUuid}
                      aria-label={user.displayName}
                      disabled={isSubmitting}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        selectedUserUuid === user.userUuid
                          ? "bg-accent/20 text-text-primary"
                          : "text-text-primary hover:bg-bg-elevated"
                      }`}
                      onClick={() => setSelectedUserUuid(user.userUuid)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{user.displayName}</span>
                        {user.email.length > 0 ? (
                          <span className="block truncate text-[11px] text-text-secondary">
                            {user.email}
                          </span>
                        ) : null}
                      </span>
                      {selectedUserUuid === user.userUuid ? (
                        <Icon name="check" size={14} className="ml-auto text-accent" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          {error != null ? (
            <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
              >
                {t("common.cancel")}
              </button>
            </Dialog.Close>
            <DialogPrimaryButton
              disabled={submitDisabled}
              isSubmitting={isSubmitting}
              onClick={() => {
                if (isSubmitting) return;
                if (tab === "direct") {
                  onForward({ kind: "direct", userUuid: selectedUserUuid });
                  return;
                }
                onForward({ kind: "topic", streamUuid: selectedStream, topicUuid: selectedTopic });
              }}
              className="px-3 py-1.5"
            >
              {t("message.forwardTo")}
            </DialogPrimaryButton>
          </div>
        </div>
      </>
    );
  },
);

export const WorkspaceForwardMessageDialog: React.FC = () => {
  const isOpen = useWorkspaceForwardMessageStore((state) => state.isOpen);
  const messageUuids = useWorkspaceForwardMessageStore((state) => state.messageUuids);
  const selectedText = useWorkspaceForwardMessageStore((state) => state.selectedText);
  const isSubmitting = useWorkspaceForwardMessageStore((state) => state.isSubmitting);
  const error = useWorkspaceForwardMessageStore((state) => state.error);
  const runtimeContext = useWorkspaceForwardRuntime();
  const messagesById = useWorkspaceMessageStore((state) => state.messagesById);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const streamIds = useMessengerStore((state) => state.streamIds);
  const topicsById = useMessengerStore((state) => state.topicsById);
  const topicIds = useMessengerStore((state) => state.topicIds);
  const submitAbortControllerRef = useRef<AbortController | null>(null);

  const streams = useMemo(
    () => streamIds.map((streamUuid) => streamsById[streamUuid]).filter(isStream),
    [streamIds, streamsById],
  );
  const topics = useMemo(
    () => topicIds.map((topicUuid) => topicsById[topicUuid]).filter(isTopic),
    [topicIds, topicsById],
  );
  useEffect(() => {
    if (!isOpen || runtimeContext == null) return;

    const missingMessageUuids = messageUuids.filter(
      (messageUuid) => messagesById[messageUuid] == null,
    );
    if (missingMessageUuids.length === 0) return;

    const loadRuntimeContext = runtimeContext;
    const abortController = new AbortController();
    const ownerKey = workspaceRuntimeOwnerKey(loadRuntimeContext);
    const runtimeGeneration = loadRuntimeContext.runtimeGeneration;

    async function loadMissingMessages() {
      try {
        useWorkspaceForwardMessageStore.getState().setError(null);
        // Forward хранит только UUID, поэтому полные тексты догружаем из нового Workspace API.
        const dtos = await getMessagesByUuids(
          buildMessengerRequestOptions(loadRuntimeContext, undefined, abortController.signal),
          missingMessageUuids,
        );
        if (abortController.signal.aborted || !isRuntimeStillCurrent(ownerKey, runtimeGeneration)) {
          return;
        }
        const messages = dtos.map(adaptMessengerMessage);
        for (const message of messages) {
          useWorkspaceMessageStore.getState().upsertMessage(message);
        }
      } catch (loadError) {
        if (abortController.signal.aborted || !isRuntimeStillCurrent(ownerKey, runtimeGeneration)) {
          return;
        }
        useWorkspaceForwardMessageStore.getState().setError(errorMessage(loadError));
      }
    }

    void loadMissingMessages();

    return () => abortController.abort();
  }, [isOpen, messageUuids, messagesById, runtimeContext]);

  const handleClose = useCallback(() => {
    if (useWorkspaceForwardMessageStore.getState().isSubmitting) return;
    useWorkspaceForwardMessageStore.getState().close();
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleClose();
    },
    [handleClose],
  );

  const handleForward = useCallback(
    (target: WorkspaceForwardTarget) => {
      if (runtimeContext == null || isSubmitting) return;

      const submitRuntimeContext = runtimeContext;
      const ownerKey = workspaceRuntimeOwnerKey(submitRuntimeContext);
      const runtimeGeneration = submitRuntimeContext.runtimeGeneration;
      const abortController = new AbortController();
      submitAbortControllerRef.current?.abort();
      submitAbortControllerRef.current = abortController;

      async function submitForward() {
        try {
          useWorkspaceForwardMessageStore.getState().setSubmitting(true);
          useWorkspaceForwardMessageStore.getState().setError(null);
          const messages = resolveWorkspaceForwardMessages({
            messageUuids,
            messages: useWorkspaceMessageStore.getState().messagesById,
          });
          if (messages.length === 0) {
            throw new Error(t("message.forwardError"));
          }
          const markdown = buildWorkspaceForwardMarkdown({
            messages,
            selectedText,
            wroteLabel: t("message.replyQuoteWrote"),
            resolveAuthorLabel: (authorUuid) => {
              const user = useUsersStore.getState().usersById[authorUuid];
              return user == null ? authorUuid : selectUserDisplayName(user, authorUuid);
            },
          });
          const messengerState = useMessengerStore.getState();
          const resolvedTarget = await resolveWorkspaceForwardTarget({
            target,
            runtimeContext: submitRuntimeContext,
            streams: messengerState.streamIds
              .map((streamUuid) => messengerState.streamsById[streamUuid])
              .filter(isStream),
            topics: messengerState.topicIds
              .map((topicUuid) => messengerState.topicsById[topicUuid])
              .filter(isTopic),
            // Direct в Workspace - это private stream с default topic, а не старый numeric route.
            createWorkspaceDirectStream: (options) =>
              createWorkspaceDirectStream({
                ...options,
                getRuntimeContext: currentRuntimeContext,
                signal: abortController.signal,
              }),
          });
          if (
            abortController.signal.aborted ||
            !isRuntimeStillCurrent(ownerKey, runtimeGeneration)
          ) {
            return;
          }
          await sendMessengerMessage({
            runtimeContext: submitRuntimeContext,
            getRuntimeContext: currentRuntimeContext,
            signal: abortController.signal,
            streamUuid: resolvedTarget.streamUuid,
            topicUuid: resolvedTarget.topicUuid,
            markdown,
            includeStreamConversation: false,
          });
          if (
            abortController.signal.aborted ||
            !isRuntimeStillCurrent(ownerKey, runtimeGeneration)
          ) {
            return;
          }
          const successCallback = useWorkspaceForwardMessageStore.getState().onSuccess;
          useWorkspaceForwardMessageStore.getState().reset();
          try {
            successCallback?.();
          } catch (callbackError) {
            log.warn("Workspace forward success callback failed", {
              error: String(callbackError),
            });
          }
        } catch (submitError) {
          if (
            abortController.signal.aborted ||
            !isRuntimeStillCurrent(ownerKey, runtimeGeneration)
          ) {
            return;
          }
          useWorkspaceForwardMessageStore.getState().setError(errorMessage(submitError));
        } finally {
          if (submitAbortControllerRef.current === abortController) {
            useWorkspaceForwardMessageStore.getState().setSubmitting(false);
            submitAbortControllerRef.current = null;
          }
        }
      }

      void submitForward();
    },
    [isSubmitting, messageUuids, runtimeContext, selectedText],
  );

  useEffect(() => {
    return () => submitAbortControllerRef.current?.abort();
  }, []);

  return (
    <AppDialogShell open={isOpen} onOpenChange={handleOpenChange} contentClassName={CONTENT_CLASS}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <Dialog.Title className="text-sm font-semibold text-text-primary">
          {t("message.forwardToChannel")}
        </Dialog.Title>
        <Dialog.Description className="sr-only">{t("message.forwardTo")}</Dialog.Description>
        <Dialog.Close asChild>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="hover:bg-bg/50 rounded p-1 text-text-muted"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </div>
      {runtimeContext == null ? (
        <div className="p-4">
          <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
            {t("app.noInstance")}
          </p>
        </div>
      ) : (
        <WorkspaceForwardTargetPicker
          currentUserUuid={runtimeContext.userUuid}
          isSubmitting={isSubmitting}
          error={error}
          streams={streams}
          topics={topics}
          onForward={handleForward}
          onClose={handleClose}
        />
      )}
    </AppDialogShell>
  );
};
