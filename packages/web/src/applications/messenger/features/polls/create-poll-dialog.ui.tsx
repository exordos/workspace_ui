import { useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { MessengerApiError } from "~/shared/api/messenger-client";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog";
import { Checkbox } from "~/shared/ui/checkbox";
import { CompactTextField, CompactTextFieldInput } from "~/shared/ui/compact-text-field";
import { Select } from "~/shared/ui/select";
import { PollDeadline, PollToggle } from "./poll-form-controls.ui";

export interface PollDraft {
  questions: {
    text: string;
    options: { text: string; correct: boolean }[];
  }[];
  multipleAnswers: boolean;
  anonymous: boolean;
  allowRevote: boolean;
  allowAddingOptions: boolean;
  resultsVisibility: "after_vote" | "always";
  closesAt: string | null;
}
interface Option {
  id: number;
  text: string;
  correct: boolean;
}
interface Question {
  id: number;
  text: string;
  options: Option[];
}
let nextId = 0;
const newOption = (): Option => ({ id: ++nextId, text: "", correct: false });
const newQuestion = (): Question => ({
  id: ++nextId,
  text: "",
  options: [newOption()],
});
const actionClass = "text-sm text-accent hover:underline disabled:opacity-40";

export function CreatePollDialog({
  open,
  onOpenChange,
  onCreate,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: PollDraft) => void | Promise<void>;
}>) {
  const [questions, setQuestions] = useState<Question[]>(() => [newQuestion()]);
  const [settings, setSettings] = useState(false);
  const [multipleAnswers, setMultipleAnswers] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [allowRevote, setAllowRevote] = useState(false);
  const [allowAddingOptions, setAllowAddingOptions] = useState(false);
  const [resultsVisibility, setResultsVisibility] =
    useState<PollDraft["resultsVisibility"]>("after_vote");
  const [closesAt, setClosesAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [failedDraft, setFailedDraft] = useState<PollDraft | null>(null);
  const [validationFailed, setValidationFailed] = useState(false);
  const [creationUnavailable, setCreationUnavailable] = useState(false);
  const pendingRef = useRef(false);
  const releasePending = () => {
    pendingRef.current = false;
  };
  const updateQuestion = (id: number, change: (question: Question) => Question) =>
    setQuestions((previous) =>
      previous.map((question) => (question.id === id ? change(question) : question)),
    );
  const removeQuestion = (id: number) =>
    setQuestions((previous) => previous.filter((item) => item.id !== id));
  const moveQuestion = (index: number, offset: number) =>
    setQuestions((previous) => move(previous, index, index + offset));
  const valid =
    questions.every(
      (question) =>
        question.text.trim() && question.options.filter((option) => option.text.trim()).length >= 2,
    ) &&
    (!showDatePicker || (closesAt != null && !dateInvalid));
  const reset = () => {
    setQuestions([newQuestion()]);
    setSettings(false);
    setMultipleAnswers(false);
    setAnonymous(false);
    setAllowRevote(false);
    setAllowAddingOptions(false);
    setResultsVisibility("after_vote");
    setClosesAt(null);
    setShowDatePicker(false);
    setDateInvalid(false);
    setFailedDraft(null);
    setValidationFailed(false);
    setCreationUnavailable(false);
  };
  const close = (value: boolean) => {
    if (pendingRef.current) return;
    if (!value) reset();
    onOpenChange(value);
  };
  const submit = async () => {
    if (pendingRef.current) return;
    if (!failedDraft && showDatePicker && (closesAt == null || closesAt.getTime() <= Date.now())) {
      setDateInvalid(true);
      return;
    }
    if (!valid) return;
    const draft = failedDraft ?? {
      questions: questions.map((question) => ({
        text: question.text.trim(),
        options: question.options
          .filter((option) => option.text.trim())
          .map((option) => ({ text: option.text.trim(), correct: option.correct })),
      })),
      multipleAnswers,
      anonymous,
      allowRevote,
      allowAddingOptions,
      resultsVisibility,
      closesAt: showDatePicker && closesAt ? closesAt.toISOString() : null,
    };
    pendingRef.current = true;
    setPending(true);
    setValidationFailed(false);
    try {
      await onCreate(draft);
      releasePending();
      close(false);
    } catch (error) {
      const data = error instanceof MessengerApiError ? error.data : null;
      const disabled =
        error instanceof MessengerApiError &&
        error.status === 409 &&
        (data === "Poll creation is not enabled" ||
          (data != null &&
            typeof data === "object" &&
            "message" in data &&
            data.message === "Poll creation is not enabled"));
      if (disabled) {
        setCreationUnavailable(true);
      } else if (
        error instanceof MessengerApiError &&
        (error.status === 400 || error.status === 422)
      ) {
        setFailedDraft(null);
        setValidationFailed(true);
      } else {
        setFailedDraft(draft);
      }
    } finally {
      releasePending();
      setPending(false);
    }
  };
  return (
    <AppDialog
      open={open}
      onOpenChange={close}
      title={t("pollForm.title")}
      maxWidthClassName="max-w-[600px]"
      positionClassName="top-1/2 -translate-y-1/2"
      scrollBody
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.create")}
          onCancel={() => close(false)}
          onSubmit={submit}
          submitDisabled={!valid || pending || creationUnavailable}
          isSubmitting={pending}
        />
      }
    >
      {failedDraft && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {t("pollForm.sendFailed")}
        </p>
      )}
      {validationFailed && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {t("pollForm.validationFailed")}
        </p>
      )}
      {creationUnavailable && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {t("pollForm.creationUnavailable")}
        </p>
      )}
      <fieldset disabled={pending || failedDraft != null} className="space-y-3">
        <p className="text-xs text-text-secondary">{t("pollForm.defaultLimits")}</p>
        {questions.map((question, questionIndex) => (
          <QuestionEditor
            key={question.id}
            question={question}
            questionIndex={questionIndex}
            questionCount={questions.length}
            updateQuestion={(change) => updateQuestion(question.id, change)}
            moveQuestion={moveQuestion}
            onRemove={() => removeQuestion(question.id)}
          />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className={actionClass}
            onClick={() => setQuestions((previous) => [...previous, newQuestion()])}
          >
            ＋ {t("pollForm.addQuestion")}
          </button>
          <button
            type="button"
            className={actionClass}
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            {t("pollForm.settings")} {settings ? "⌃" : "›"}
          </button>
        </div>
        {settings && (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <PollToggle
              label={t("pollForm.multiple")}
              hint={t("pollForm.multipleHint")}
              checked={multipleAnswers}
              onChange={setMultipleAnswers}
            />
            <PollToggle
              label={t("pollForm.anonymous")}
              hint={t("pollForm.anonymousHint")}
              checked={anonymous}
              onChange={setAnonymous}
            />
            <PollToggle
              label={t("pollForm.revote")}
              hint={t("pollForm.revoteHint")}
              checked={allowRevote}
              onChange={setAllowRevote}
            />
            <PollToggle
              label={t("pollForm.addOptions")}
              hint={t("pollForm.addOptionsHint")}
              checked={allowAddingOptions}
              onChange={setAllowAddingOptions}
            />
            <div className="flex items-center justify-between gap-4 text-sm text-text-primary">
              <span className="font-semibold">{t("pollForm.results")}</span>
              <Select
                aria-label={t("pollForm.results")}
                size="compact"
                className="max-w-[220px] !border-transparent !bg-compact-field-bg text-xs"
                value={resultsVisibility}
                onValueChange={(value) =>
                  setResultsVisibility(value as PollDraft["resultsVisibility"])
                }
                options={[
                  { value: "after_vote", label: t("pollForm.afterVote") },
                  { value: "always", label: t("pollForm.always") },
                ]}
              />
            </div>
            <PollDeadline
              compact
              value={closesAt}
              enabled={showDatePicker}
              invalid={dateInvalid}
              onValueChange={(value) => {
                setClosesAt(value);
                setDateInvalid(value.getTime() <= Date.now());
              }}
              onEnabledChange={(enabled) => {
                setShowDatePicker(enabled);
                if (!enabled) {
                  setClosesAt(null);
                  setDateInvalid(false);
                }
              }}
            />
          </div>
        )}
      </fieldset>
    </AppDialog>
  );
}
function QuestionEditor({
  question,
  questionIndex,
  questionCount,
  updateQuestion,
  moveQuestion,
  onRemove,
}: Readonly<{
  question: Question;
  questionIndex: number;
  questionCount: number;
  updateQuestion: (change: (question: Question) => Question) => void;
  moveQuestion: (index: number, offset: number) => void;
  onRemove: () => void;
}>) {
  const [dragged, setDragged] = useState<{ question: number; option: number } | null>(null);
  return (
    <section
      aria-label={t("pollForm.questionNumber", { number: questionIndex + 1 })}
      className="space-y-2 border-b border-border-subtle pb-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-text-muted">
          {t("pollForm.questionNumber", { number: questionIndex + 1 })}
        </span>
        {questionCount > 1 && (
          <div className="flex gap-2 text-text-muted">
            <button
              type="button"
              aria-label={t("pollForm.moveQuestionUp")}
              disabled={questionIndex === 0}
              onClick={() => moveQuestion(questionIndex, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t("pollForm.moveQuestionDown")}
              disabled={questionIndex === questionCount - 1}
              onClick={() => moveQuestion(questionIndex, 1)}
            >
              ↓
            </button>
            <button type="button" aria-label={t("pollForm.removeQuestion")} onClick={onRemove}>
              ×
            </button>
          </div>
        )}
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-text-primary">{t("pollForm.question")}</span>
        <CompactTextField>
          <CompactTextFieldInput
            maxLength={1000}
            value={question.text}
            onChange={(event) => updateQuestion((item) => ({ ...item, text: event.target.value }))}
            placeholder={t("pollForm.questionPlaceholder")}
          />
        </CompactTextField>
      </label>

      <div>
        <div className="text-sm font-semibold text-text-primary">{t("pollForm.answers")}</div>
        <div className="text-xs text-text-secondary">{t("pollForm.correctHint")}</div>
      </div>
      <div className="space-y-2">
        {question.options.map((option, index) => (
          <OptionEditor
            key={option.id}
            option={option}
            index={index}
            question={question}
            questionIndex={questionIndex}
            dragged={dragged}
            setDragged={setDragged}
            updateQuestion={updateQuestion}
          />
        ))}
      </div>
    </section>
  );
}

function OptionEditor({
  option,
  index,
  question,
  questionIndex,
  dragged,
  setDragged,
  updateQuestion,
}: Readonly<{
  option: Option;
  index: number;
  question: Question;
  questionIndex: number;
  dragged: { question: number; option: number } | null;
  setDragged: (value: { question: number; option: number } | null) => void;
  updateQuestion: (change: (question: Question) => Question) => void;
}>) {
  return (
    <CompactTextField
      role="presentation"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (dragged?.question === question.id)
          updateQuestion((item) => ({
            ...item,
            options: move(item.options, dragged.option, option.text.trim() ? index : index - 1),
          }));
        setDragged(null);
      }}
    >
      {option.text.trim() && (
        <>
          <button
            type="button"
            draggable
            onDragStart={() => setDragged({ question: question.id, option: index })}
            aria-label={t("pollForm.dragAnswer")}
            className="cursor-grab text-text-muted"
          >
            ⋮⋮
          </button>
          <Checkbox
            checked={option.correct}
            aria-label={`${t("pollForm.correctAnswer")}: ${option.text}`}
            onChange={() =>
              updateQuestion((item) => ({
                ...item,
                options: item.options.map((entry) => ({
                  ...entry,
                  correct: entry.id === option.id ? !entry.correct : entry.correct,
                })),
              }))
            }
          />
        </>
      )}
      <CompactTextFieldInput
        value={option.text}
        maxLength={200}
        aria-label={`${t("pollForm.answerPlaceholder")} ${index + 1} · ${t("pollForm.questionNumber", { number: questionIndex + 1 })}`}
        placeholder={t("pollForm.answerPlaceholder")}
        onChange={(event) =>
          updateQuestion((item) => {
            const options = item.options.map((entry) =>
              entry.id === option.id ? { ...entry, text: event.target.value } : entry,
            );
            if (options.every((entry) => entry.text.trim())) options.push(newOption());
            return { ...item, options };
          })
        }
      />
      {option.text.trim() && (
        <>
          <button
            type="button"
            aria-label={t("pollForm.moveAnswerUp")}
            disabled={index === 0}
            onClick={() =>
              updateQuestion((item) => ({
                ...item,
                options: move(item.options, index, index - 1),
              }))
            }
            className="text-text-muted disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t("pollForm.moveAnswerDown")}
            disabled={
              index >= question.options.length - 1 || !question.options[index + 1]?.text.trim()
            }
            onClick={() =>
              updateQuestion((item) => ({
                ...item,
                options: move(item.options, index, index + 1),
              }))
            }
            className="text-text-muted disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={t("pollForm.removeAnswer")}
            className="text-text-muted"
            onClick={() =>
              updateQuestion((item) => {
                const options = item.options.filter((entry) => entry.id !== option.id);
                if (options.every((entry) => entry.text.trim())) options.push(newOption());
                return { ...item, options };
              })
            }
          >
            ×
          </button>
        </>
      )}
    </CompactTextField>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  if (item === undefined) return items;
  copy.splice(to, 0, item);
  return copy;
}
