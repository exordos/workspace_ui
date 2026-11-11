import React, { useEffect, useState } from "react";
import "./workspace-message-poll.css";
import { useTranslation } from "~/i18n/i18n";
import { PollQuestion } from "./workspace-message-poll-question.ui";
import { PollVotersDialog } from "./workspace-message-poll-voters-dialog.ui";
import type { WorkspaceMessagePollProps } from "./workspace-message-poll.types";

export function WorkspaceMessagePoll({
  poll,
  readOnly = false,
  pendingQuestionIds = [],
  questionErrors = {},
  pending = false,
  error,
  voters,
  renderVoterAvatar,
  onVote,
  onAddOption,
  onLoadVoters,
  maxOptions = 20,
  deadlineReached,
}: Readonly<WorkspaceMessagePollProps>): React.ReactElement {
  const { t, locale } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const [voterTarget, setVoterTarget] = useState<{
    questionId: string;
    optionId: string;
    mode: "option" | "overview";
  } | null>(null);
  const deadline = poll.closesAt ? Date.parse(poll.closesAt) : NaN;
  useEffect(() => {
    if (deadlineReached !== undefined || !Number.isFinite(deadline)) return;
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (deadline > current)
        timer = window.setTimeout(refresh, Math.min(deadline - current, 2147483647));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [deadline, deadlineReached]);
  const closed = poll.closed || (deadlineReached ?? (Number.isFinite(deadline) && deadline <= now));
  const canAct = !readOnly && !closed && !pending;
  const visibleResults =
    poll.resultsVisibility === "always" ||
    closed ||
    poll.questions.every((q) => q.selectedOptionIds.length > 0);
  const activeVoters =
    voters?.questionId === voterTarget?.questionId && voters?.optionId === voterTarget?.optionId
      ? voters
      : undefined;
  const quiz = poll.questions.some(
    (question) => question.selectedOptionIds.length > 0 && question.correctOptionIds?.length,
  );
  const subtitle = closed
    ? t("pollBubble.closed")
    : [
        t(poll.anonymous ? "pollBubble.anonymous" : "pollBubble.public"),
        t(poll.multipleAnswers ? "pollBubble.multiple" : "pollBubble.single"),
        poll.questions.length > 1
          ? t("pollBubble.questions", { count: poll.questions.length })
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const completedAt = poll.closedAt ?? (deadline <= now ? poll.closesAt : null);
  const statusDate = closed ? completedAt : poll.closesAt;
  const formattedDate = statusDate
    ? `${new Date(statusDate).toLocaleDateString(locale, { day: "numeric", month: "long" })}, ${new Date(statusDate).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
    : null;
  const openVoters = (questionId: string, optionId: string) => {
    setVoterTarget({ questionId, optionId, mode: "overview" });
    onLoadVoters?.(questionId, optionId, false);
  };
  const firstQuestion = poll.questions[0];
  const firstOption =
    firstQuestion?.options.find((option) => firstQuestion.selectedOptionIds.includes(option.id)) ??
    firstQuestion?.options[0];
  return (
    <div
      className="workspace-poll-container relative min-w-0 max-w-full text-text-primary"
      role="group"
      aria-label={t(poll.anonymous ? "pollBubble.anonymous" : "pollBubble.public")}
      data-testid="workspace-message-poll"
    >
      {poll.questions.map((question, index) => (
        <PollQuestion
          key={question.id}
          subtitle={index === 0 ? subtitle : undefined}
          {...{
            poll,
            question,
            index,
            canAct,
            closed,
            readOnly,
            onVote,
            onAddOption,
            onLoadVoters,
            renderVoterAvatar,
            maxOptions,
          }}
          busy={pendingQuestionIds.includes(question.id)}
          error={questionErrors[question.id]}
          onOpenVoters={(questionId, optionId) =>
            setVoterTarget({ questionId, optionId, mode: "option" })
          }
        />
      ))}
      <div
        className={`workspace-poll-summary ${!formattedDate && !readOnly && !error ? "workspace-poll-final-line" : ""}`}
        role={visibleResults ? "region" : undefined}
        aria-label={visibleResults ? t("pollBubble.countsRegion") : undefined}
      >
        {visibleResults ? (
          <>
            {quiz || closed || poll.anonymous || readOnly || !onLoadVoters ? (
              <span>{t("pollBubble.participantCount", { count: poll.voterCount })}</span>
            ) : (
              <button
                type="button"
                className="workspace-poll-summary-link rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => {
                  if (firstQuestion && firstOption) openVoters(firstQuestion.id, firstOption.id);
                }}
              >
                {t("pollBubble.participantCount", { count: poll.voterCount })}
                {" · "}
                {t("pollBubble.viewVotes")}
              </button>
            )}
            {quiz && (
              <span>
                {" · "}
                {t("pollBubble.youVoted")}
              </span>
            )}
          </>
        ) : (
          <span>{t("pollBubble.resultsAfterVote")}</span>
        )}
      </div>
      {(formattedDate || readOnly || error) && (
        <div
          className="workspace-poll-status workspace-poll-final-line"
          role="region"
          aria-label={t("pollBubble.statusRegion")}
        >
          {formattedDate && (
            <time dateTime={statusDate ?? undefined}>
              {t(closed ? "pollBubble.completedAt" : "pollBubble.deadline", {
                date: formattedDate,
              })}
            </time>
          )}
          {readOnly && <span>{t("pollBubble.readOnly")}</span>}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      )}
      <PollVotersDialog
        poll={poll}
        onSelectOption={openVoters}
        enabled={!poll.anonymous && !readOnly}
        {...{ voterTarget, activeVoters, onLoadVoters }}
        onDismiss={() => setVoterTarget(null)}
      />
    </div>
  );
}
