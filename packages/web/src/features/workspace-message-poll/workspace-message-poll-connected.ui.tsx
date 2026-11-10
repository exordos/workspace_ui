import { useEffect, useRef, useState } from "react";
import {
  mutateMessengerPoll,
  getMessengerPollVoters,
} from "~/entities/messenger/messenger-poll-actions.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { toWorkspacePoll } from "./workspace-message-poll-adapter.lib";
import { WorkspaceMessagePoll } from "./workspace-message-poll.ui";
import { PollCloseDialog, PollSettingsDialog } from "./workspace-poll-management-dialogs.ui";
import { usePollRecentVoters } from "./workspace-poll-recent-voters.hook";
import type {
  WorkspaceMessagePollProps,
  WorkspacePollVoters,
} from "./workspace-message-poll.types";

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
  deadlineReached?: boolean;
  renderVoterAvatar?: WorkspaceMessagePollProps["renderVoterAvatar"];
}>) {
  const [pendingQuestions, setPendingQuestions] = useState<string[]>([]);
  const pendingQuestionRef = useRef(new Set<string>());
  const optionAttempts = useRef(new Map<string, { uuid: string; text: string }>());
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string>();
  const [voters, setVoters] = useState<WorkspacePollVoters>();
  const voterRequest = useRef(0);
  const voterMarker = useRef<string | undefined>(undefined);
  const failedMore = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      voterRequest.current += 1;
    };
  }, []);
  const enabled = !readOnly;
  const recentVoters = usePollRecentVoters(message, enabled, deadlineReached);
  const snapshot = toWorkspacePoll(message);
  const poll = snapshot && {
    ...snapshot,
    questions: snapshot.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({
        ...option,
        recentVoters: recentVoters?.[option.id]?.map((uuid) => ({
          id: uuid,
          name: selectUserDisplayName(usersById[uuid], `#${uuid.slice(0, 8)}`),
          avatarUrl: usersById[uuid]?.avatarUrl ?? undefined,
        })),
      })),
    })),
  };

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

  const loadVoters = async (questionId: string, optionId: string, more: boolean) => {
    const context = getRuntimeContext();
    if (!context || !enabled) return;
    const guard = captureWorkspaceRuntimeRequestContext(getRuntimeContext);
    const request = ++voterRequest.current;
    const loadMore =
      voters?.error && voters.questionId === questionId && voters.optionId === optionId
        ? failedMore.current
        : more;
    const pageMarker = loadMore ? voterMarker.current : undefined;
    if (!loadMore) voterMarker.current = undefined;
    setVoters((old) => ({
      questionId,
      optionId,
      items:
        loadMore && old?.questionId === questionId && old.optionId === optionId ? old.items : [],
      loading: true,
    }));
    try {
      const result = await getMessengerPollVoters({
        runtimeContext: context,
        getRuntimeContext,
        messageUuid: message.uuid,
        questionUuid: questionId,
        optionUuid: optionId,
        pageMarker,
      });
      if (
        !alive.current ||
        request !== voterRequest.current ||
        isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext)
      )
        return;
      voterMarker.current = result.nextPageMarker ?? undefined;
      setVoters((old) => ({
        questionId,
        optionId,
        items: [
          ...(loadMore ? (old?.items ?? []) : []),
          ...result.items.map(({ uuid }) => ({
            id: uuid,
            name: selectUserDisplayName(usersById[uuid], `#${uuid.slice(0, 8)}`),
            avatarUrl: usersById[uuid]?.avatarUrl ?? undefined,
          })),
        ],
        hasMore: Boolean(result.nextPageMarker),
      }));
    } catch {
      if (
        !alive.current ||
        request !== voterRequest.current ||
        isWorkspaceRuntimeRequestInvalidated(guard, getRuntimeContext)
      )
        return;
      failedMore.current = loadMore;
      setVoters((old) => ({
        questionId,
        optionId,
        items: old?.items ?? [],
        error: t("pollBubble.votersError"),
        hasMore: loadMore,
      }));
    }
  };
  return (
    <>
      <WorkspaceMessagePoll
        poll={poll}
        renderVoterAvatar={renderVoterAvatar}
        deadlineReached={deadlineReached}
        readOnly={!enabled}
        {...{ pending, pendingQuestionIds: pendingQuestions, questionErrors, error, voters }}
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
        onLoadVoters={
          enabled
            ? (questionId, optionId, more) => {
                void loadVoters(questionId, optionId, more);
              }
            : undefined
        }
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
