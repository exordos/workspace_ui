import { useEffect, useMemo, useRef, useState } from "react";
import { mutateMessengerPoll } from "~/entities/messenger/messenger-poll-actions.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { toWorkspacePoll, visiblePollVoterQuestions } from "./workspace-message-poll-adapter.lib";
import { WorkspaceMessagePoll } from "./workspace-message-poll.ui";
import { PollCloseDialog, PollSettingsDialog } from "./workspace-poll-management-dialogs.ui";
import { usePollVoterList } from "./workspace-poll-voter-list.hook";
import { pollVoterOptionKey, usePollVoterPreviews } from "./workspace-poll-voter-previews.hook";
import type { WorkspaceMessagePollProps } from "./workspace-message-poll.types";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

export function WorkspaceMessagePollConnected({
  message,
  usersById,
  readOnly,
  settingsOpen,
  setSettingsOpen,
  closeOpen,
  setCloseOpen,
  deadlineReached,
  renderVoterAvatar,
}: Readonly<{
  message: MessengerMessage;
  usersById: UsersById;
  readOnly: boolean;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  closeOpen: boolean;
  setCloseOpen: (open: boolean) => void;
  deadlineReached: boolean;
  renderVoterAvatar?: WorkspaceMessagePollProps["renderVoterAvatar"];
}>) {
  const [pendingQuestions, setPendingQuestions] = useState<string[]>([]);
  const pendingQuestionRef = useRef(new Set<string>());
  const optionAttempts = useRef(new Map<string, { uuid: string; text: string }>());
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const enabled = !readOnly;
  const poll = useMemo(
    () => toWorkspacePoll(message.uuid, message.payload, message.pollState),
    [message.uuid, message.payload, message.pollState],
  );
  const voterQuestions = useMemo(
    () => visiblePollVoterQuestions(poll, readOnly, deadlineReached),
    [poll, readOnly, deadlineReached],
  );
  const revision = message.pollState?.revision;
  const fallbackPreviews = usePollVoterPreviews(message.uuid, revision, voterQuestions);
  const voterList = usePollVoterList(message.uuid, revision, voterQuestions);
  const toVoter = (uuid: string) => ({
    id: uuid,
    name: selectUserDisplayName(usersById[uuid], `#${uuid.slice(0, 8)}`),
    avatarUrl: usersById[uuid]?.avatarUrl ?? undefined,
  });

  if (poll == null) return <p role="status">{t("pollBubble.unavailable")}</p>;

  const run = async (
    action: Parameters<typeof mutateMessengerPoll>[0]["action"],
    questionId?: string,
  ) => {
    const context = getRuntimeContext();
    if (
      !context ||
      !enabled ||
      (questionId ? pendingQuestionRef.current.has(questionId) : pendingRef.current)
    )
      throw new Error("poll-action-unavailable");
    const guard = captureWorkspaceRuntimeRequestContext(getRuntimeContext);
    if (questionId) {
      pendingQuestionRef.current.add(questionId);
      setPendingQuestions([...pendingQuestionRef.current]);
      setQuestionErrors((old) => ({ ...old, [questionId]: "" }));
    } else {
      pendingRef.current = true;
      setPending(true);
      setError(undefined);
    }
    try {
      await mutateMessengerPoll({
        runtimeContext: context,
        getRuntimeContext,
        messageUuid: message.uuid,
        action,
      });
    } catch (err) {
      if (alive.current && !isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext)) {
        if (questionId)
          setQuestionErrors((old) => ({ ...old, [questionId]: t("pollBubble.actionError") }));
        else setError(t("pollBubble.actionError"));
      }
      throw err;
    } finally {
      if (alive.current && !isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext)) {
        if (questionId) {
          pendingQuestionRef.current.delete(questionId);
          setPendingQuestions([...pendingQuestionRef.current]);
        } else {
          pendingRef.current = false;
          setPending(false);
        }
      }
    }
  };

  return (
    <>
      <WorkspaceMessagePoll
        poll={poll}
        renderVoterAvatar={renderVoterAvatar}
        deadlineReached={deadlineReached}
        readOnly={!enabled}
        {...{ pending, pendingQuestionIds: pendingQuestions, questionErrors, error }}
        onVote={
          enabled
            ? (questionUuid, optionUuid, selected) => {
                void run({ kind: "vote", questionUuid, optionUuid, selected }, questionUuid).catch(
                  () => {},
                );
              }
            : undefined
        }
        onAddOption={
          enabled
            ? async (questionUuid, text) => {
                const previous = optionAttempts.current.get(questionUuid);
                const option =
                  previous?.text === text ? previous : { uuid: crypto.randomUUID(), text };
                optionAttempts.current.set(questionUuid, option);
                await run({ kind: "addOption", questionUuid, option }, questionUuid);
                optionAttempts.current.delete(questionUuid);
              }
            : undefined
        }
        voterList={{
          questions: voterQuestions,
          target: voterList.target,
          onSelect: voterList.select,
          onLoadPage: voterList.loadPage,
          page: voterList.page && {
            items: voterList.page.items.map(toVoter),
            loading: voterList.page.loading,
            hasMore: voterList.page.hasMore,
            error: voterList.page.failed ? t("pollBubble.votersError") : undefined,
          },
          getPreview: (questionId, option) => {
            if (option.votes === 0) return undefined;
            const uuids =
              option.previewVoterUuids ??
              fallbackPreviews?.[pollVoterOptionKey(questionId, option.id)];
            return uuids?.slice(0, 5).map(toVoter);
          },
        }}
      />
      <PollSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        closesAt={poll.closesAt ?? null}
        allowAddingOptions={poll.allowAddingOptions}
        question={poll.questions[0]?.text ?? ""}
        onSave={(settings) => run({ kind: "settings", ...settings })}
      />
      <PollCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onClose={() => run({ kind: "close" })}
      />
    </>
  );
}
