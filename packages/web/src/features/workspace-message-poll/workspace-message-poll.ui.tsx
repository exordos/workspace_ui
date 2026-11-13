import React from "react";
import "./workspace-message-poll.css";
import { useTranslation } from "~/i18n/i18n";
import { PollQuestion } from "./workspace-message-poll-question.ui";
import { PollVotersDialog } from "./workspace-message-poll-voters-dialog.ui";
import { usePollDeadline } from "./workspace-poll-deadline.hook";
import type { WorkspaceMessagePollProps } from "./workspace-message-poll.types";

export function WorkspaceMessagePoll({
  poll,
  readOnly = false,
  pendingQuestionIds = [],
  questionErrors = {},
  pending = false,
  error,
  voterList,
  renderVoterAvatar,
  onVote,
  onAddOption,
  maxOptions = 20,
  deadlineReached,
}: Readonly<WorkspaceMessagePollProps>): React.ReactElement {
  const { t, locale } = useTranslation();
  const expired = usePollDeadline(poll.closesAt, deadlineReached);
  const closed = poll.closed || expired;
  const canAct = !readOnly && !closed && !pending;
  const visibleResults =
    poll.resultsVisibility === "always" ||
    closed ||
    poll.questions.every((q) => q.selectedOptionIds.length > 0);
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
  const completedAt = poll.closedAt ?? (expired ? poll.closesAt : null);
  const statusDate = closed ? completedAt : poll.closesAt;
  const formattedDate = statusDate
    ? `${new Date(statusDate).toLocaleDateString(locale, { day: "numeric", month: "long" })}, ${new Date(statusDate).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
    : null;
  const firstQuestion = voterList?.questions[0];
  const firstOption =
    firstQuestion?.options.find((option) => firstQuestion.selectedOptionIds.includes(option.id)) ??
    firstQuestion?.options[0];
  const canOpenOverview =
    visibleResults && !quiz && !closed && voterList && firstQuestion && firstOption;
  const countRegion = visibleResults
    ? { role: "region", "aria-label": t("pollBubble.countsRegion") }
    : undefined;
  const countLabel = t("pollBubble.participantCount", { count: poll.voterCount });
  let summary = <span>{t("pollBubble.resultsAfterVote")}</span>;
  if (visibleResults) summary = <span>{countLabel}</span>;
  if (canOpenOverview) {
    summary = (
      <button
        type="button"
        className="workspace-poll-summary-link rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() =>
          voterList.onSelect({
            questionId: firstQuestion.id,
            optionId: firstOption.id,
            mode: "overview",
          })
        }
      >
        {countLabel}
        {" · "}
        {t("pollBubble.viewVotes")}
      </button>
    );
  }
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
            renderVoterAvatar,
            maxOptions,
          }}
          busy={pendingQuestionIds.includes(question.id)}
          error={questionErrors[question.id]}
          voterList={voterList?.questions.includes(question) ? voterList : undefined}
        />
      ))}
      <div
        className={`workspace-poll-summary ${!formattedDate && !readOnly && !error ? "workspace-poll-final-line" : ""}`}
        {...countRegion}
      >
        {summary}
        {visibleResults && quiz && (
          <span>
            {" · "}
            {t("pollBubble.youVoted")}
          </span>
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
      {voterList && (
        <PollVotersDialog
          multipleQuestions={poll.questions.length > 1}
          voterList={voterList}
          renderVoterAvatar={renderVoterAvatar}
        />
      )}
    </div>
  );
}
