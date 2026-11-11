import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { AvatarGroup } from "~/shared/ui/avatar";
import { CheckboxIndicator } from "~/shared/ui/checkbox";
import { InlineTextField } from "~/shared/ui/inline-text-field";
import type {
  WorkspaceMessagePollProps,
  WorkspacePollQuestion,
  WorkspacePollOption,
} from "./workspace-message-poll.types";
type QuestionProps = Readonly<
  Pick<
    WorkspaceMessagePollProps,
    "poll" | "readOnly" | "onVote" | "onLoadVoters" | "onAddOption" | "renderVoterAvatar"
  > & {
    subtitle?: string;
    question: WorkspacePollQuestion;
    index: number;
    canAct: boolean;
    closed: boolean;
    busy: boolean;
    error?: string;
    maxOptions: number;
    onOpenVoters: (questionId: string, optionId: string) => void;
  }
>;
type OptionProps = Readonly<
  Omit<QuestionProps, "index" | "closed" | "error" | "maxOptions"> & {
    option: WorkspacePollOption;
    results: boolean;
  }
>;
function canSelectPollOption(
  question: WorkspacePollQuestion,
  optionId: string,
  allowRevote: boolean,
  multipleAnswers: boolean,
): boolean {
  if (allowRevote || question.selectedOptionIds.length === 0) return true;
  return multipleAnswers && !question.selectedOptionIds.includes(optionId);
}

function PollAddOption({
  questionId,
  onAdd,
  disabled,
}: Readonly<{
  questionId: string;
  onAdd: (questionId: string, text: string) => Promise<void>;
  disabled: boolean;
}>): React.ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = failed ? `${inputId}-error` : undefined;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (pending || disabled || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body || document.activeElement === inputRef.current)
      inputRef.current?.focus();
  }, [pending, disabled]);
  return (
    <form
      className="workspace-poll-add-option"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim() || inFlight.current || disabled) return;
        inFlight.current = true;
        restoreFocus.current = document.activeElement === inputRef.current;
        setPending(true);
        setFailed(false);
        void onAdd(questionId, text.trim())
          .then(() => {
            setText("");
          })
          .catch(() => setFailed(true))
          .finally(() => {
            inFlight.current = false;
            setPending(false);
          });
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        {t("pollBubble.newOption")}
      </label>
      <InlineTextField
        ref={inputRef}
        id={inputId}
        value={text}
        maxLength={200}
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        aria-invalid={failed || undefined}
        aria-describedby={errorId ? `${hintId} ${errorId}` : hintId}
        placeholder={t("pollBubble.addOptionPlaceholder")}
        enterKeyHint="done"
        leading={<CheckboxIndicator checked={false} className="workspace-poll-add-marker" />}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.defaultPrevented ||
            event.nativeEvent.isComposing ||
            // eslint-disable-next-line sonarjs/deprecation -- Safari can omit isComposing on IME confirmation.
            event.keyCode === 229
          )
            return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <span id={hintId} className="sr-only">
        {t("pollBubble.addOptionHint")}
      </span>
      {pending && (
        <span role="status" className="sr-only">
          {t("pollBubble.saving")}
        </span>
      )}
      {failed && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {t("pollBubble.addError")}
        </p>
      )}
    </form>
  );
}

function PollOption({
  option,
  question,
  poll,
  canAct,
  busy,
  results,
  readOnly,
  onVote,
  onLoadVoters,
  onOpenVoters,
  renderVoterAvatar,
}: OptionProps): React.ReactElement {
  const { t } = useTranslation();
  const answered = question.selectedOptionIds.length > 0;
  const selected = question.selectedOptionIds.includes(option.id);
  const correct = answered && question.correctOptionIds?.includes(option.id);
  const wrong =
    answered &&
    selected &&
    question.correctOptionIds != null &&
    question.correctOptionIds.length > 0 &&
    !correct;
  const percent =
    question.voterCount > 0 ? Math.round((option.votes / question.voterCount) * 100) : 0;
  const showVoters = !poll.anonymous && !readOnly;
  const previewVoters = showVoters ? option.previewVoters : undefined;
  const optionTone = correct ? "workspace-poll-option-correct" : "";
  const selectedTone = selected && !wrong ? "workspace-poll-option-selected" : "";
  const avatars = previewVoters?.length ? (
    <AvatarGroup
      items={previewVoters}
      className="[&_.avatar-group-item>*]:border-bg-elevated"
      max={5}
      size={28}
      overlap={8}
      getAvatarSrc={(voter) => voter.avatarUrl}
      renderAvatar={renderVoterAvatar}
    />
  ) : null;
  return (
    <div className={`workspace-poll-option min-w-0 ${optionTone || selectedTone}`}>
      <div className="workspace-poll-option-row">
        <button
          type="button"
          aria-pressed={selected}
          aria-label={[
            option.text,
            correct ? t("pollBubble.correct") : null,
            wrong ? t("pollBubble.incorrect") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          disabled={
            !canAct ||
            busy ||
            !onVote ||
            !canSelectPollOption(question, option.id, poll.allowRevote, poll.multipleAnswers)
          }
          onClick={() => onVote?.(question.id, option.id, !selected)}
          className="workspace-poll-option-choice rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CheckboxIndicator
            checked={selected || Boolean(correct)}
            tone={correct ? "success" : "accent"}
          />
          <span className="min-w-0 break-words">{option.text}</span>
          <span className="workspace-poll-option-aggregate" aria-hidden={!results}>
            {results && (
              <>
                <span>{percent}%</span>
                {" · "}
                {option.votes}
              </>
            )}
          </span>
        </button>
        {showVoters && (
          <span className="workspace-poll-voter-slot">
            {results && onLoadVoters && (
              <button
                type="button"
                className="workspace-poll-voters-button rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t("pollBubble.showVoters", { option: option.text })}
                onClick={() => {
                  onOpenVoters(question.id, option.id);
                  onLoadVoters(question.id, option.id, false);
                }}
              >
                {avatars}
              </button>
            )}
            {results && !onLoadVoters && avatars}
          </span>
        )}
      </div>
      <span aria-hidden="true" className="workspace-poll-result-bar">
        {results && (
          <span
            className={`block h-full rounded ${correct || (selected && !wrong) ? "bg-accent" : "bg-text-secondary"}`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        )}
      </span>
    </div>
  );
}

export function PollQuestion({
  question,
  subtitle,
  index,
  poll,
  canAct,
  closed,
  busy,
  error,
  maxOptions,
  readOnly,
  onVote,
  onAddOption,
  onLoadVoters,
  onOpenVoters,
  renderVoterAvatar,
}: QuestionProps): React.ReactElement {
  const { t } = useTranslation();
  const answered = question.selectedOptionIds.length > 0;
  const results = poll.resultsVisibility === "always" || answered || closed;
  return (
    <fieldset
      className={index > 0 ? "mt-3 min-w-0 border-t border-border-subtle pt-3" : "min-w-0"}
      aria-busy={busy}
    >
      <legend className="workspace-poll-question-title">{question.text}</legend>
      {subtitle && <p className="workspace-poll-subtitle">{subtitle}</p>}
      <div className="workspace-poll-options">
        {question.options.map((option) => (
          <PollOption
            key={option.id}
            {...{
              option,
              question,
              poll,
              canAct,
              busy,
              results,
              readOnly,
              onVote,
              onLoadVoters,
              onOpenVoters,
              renderVoterAvatar,
            }}
          />
        ))}
      </div>
      {question.correctOptionIds?.length ? (
        <p className="workspace-poll-correct-answer" aria-hidden={!answered}>
          {answered ? (
            <>
              <span aria-hidden="true">✓ </span>
              {t("pollBubble.correctAnswer", {
                options: question.options
                  .filter((option) => question.correctOptionIds?.includes(option.id))
                  .map((option) => option.text)
                  .join(", "),
              })}
            </>
          ) : null}
        </p>
      ) : null}
      {busy && (
        <p role="status" className="sr-only">
          {t("pollBubble.saving")}
        </p>
      )}
      {(error || (poll.questions.length > 1 && results)) && (
        <div
          className="workspace-poll-question-status"
          role={error ? "region" : undefined}
          aria-label={error ? t("pollBubble.answerStatusRegion") : undefined}
          tabIndex={error ? 0 : undefined}
        >
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {poll.questions.length > 1 && results && (
            <p>{t("pollBubble.participants", { count: question.voterCount })}</p>
          )}
        </div>
      )}
      {poll.allowAddingOptions && onAddOption && question.options.length < maxOptions && (
        <div>
          {canAct && (
            <PollAddOption
              key={`${poll.id}:${question.id}`}
              questionId={question.id}
              onAdd={onAddOption}
              disabled={busy}
            />
          )}
        </div>
      )}
    </fieldset>
  );
}
