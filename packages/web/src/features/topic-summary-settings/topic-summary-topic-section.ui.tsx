import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import {
  ERROR_NOTICE_CLASS,
  INPUT_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_FOOTER_CLASS,
  operationErrorText,
  validationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SwitchRow } from "./topic-summary-settings-shared.ui";
import { TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH } from "./topic-summary-settings.lib";
import type { UseTopicSummarySettingsResult } from "./topic-summary-settings.hook";

export function TopicSettingsSection({ vm }: Readonly<{ vm: UseTopicSummarySettingsResult }>) {
  const { t } = useTranslation();
  const draft = vm.topic.draft;
  if (draft == null) return null;
  const denied = vm.topic.permission === "denied";
  const pending = vm.topic.status === "saving";
  const dirty = vm.topic.dirtyFields.length > 0;
  const error = operationErrorText(vm.topic.error, t);
  const validationError = validationErrorText(vm.topic.validationError, t);

  return (
    <section className={SECTION_CLASS} aria-labelledby="topic-summary-topic-heading">
      <h3 id="topic-summary-topic-heading" className="sr-only">
        {t("topicSummarySettings.topic.title")}
      </h3>
      <div className={SECTION_BODY_CLASS}>
        {denied ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mb-4`}>
            {t("topicSummarySettings.status.forbidden")}
          </p>
        ) : null}

        <div className="rounded-xl border border-border-subtle bg-card-bg">
          <SwitchRow
            checked={draft.summaryEnabled}
            disabled={pending || denied}
            label={t("topicSummarySettings.topic.enabled")}
            description={t("topicSummarySettings.topic.enabledDescription")}
            onChange={vm.setTopicEnabled}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="topic-summary-system-prompt"
              className="text-sm font-semibold text-text-primary"
            >
              {t("topicSummarySettings.topic.prompt")}
            </label>
            <Button
              type="button"
              variant="neutral"
              appearance="ghost"
              size="sm"
              disabled={pending || denied || draft.summarySystemPrompt == null}
              onClick={() => vm.setTopicSystemPrompt(null)}
            >
              {t("topicSummarySettings.topic.useDefault")}
            </Button>
          </div>
          <textarea
            id="topic-summary-system-prompt"
            value={draft.summarySystemPrompt ?? ""}
            disabled={pending || denied}
            maxLength={TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH + 1}
            rows={6}
            onChange={(event) => vm.setTopicSystemPrompt(event.target.value)}
            placeholder={t("topicSummarySettings.topic.promptPlaceholder")}
            className={`${INPUT_CLASS} min-h-[9rem] resize-y leading-5`}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
            <span>
              {draft.summarySystemPrompt == null
                ? t("topicSummarySettings.topic.defaultPrompt")
                : t("topicSummarySettings.topic.customPromptHint")}
            </span>
            {draft.summarySystemPrompt != null ? (
              <span>{`${draft.summarySystemPrompt.length}/${TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH}`}</span>
            ) : null}
          </div>
          {validationError != null ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {validationError}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-card-bg px-4 py-3">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="topic-summary-reasoning"
              className="text-sm font-semibold text-text-primary"
            >
              {t("topicSummarySettings.topic.reasoning")}
            </label>
            <p className="mt-1 text-xs leading-4 text-text-muted">
              {t("topicSummarySettings.topic.reasoningHint")}
            </p>
          </div>
          <select
            id="topic-summary-reasoning"
            value={draft.summaryReasoningEffort ?? ""}
            disabled={pending || denied}
            onChange={(event) => {
              const value = event.target.value;
              vm.setTopicReasoningEffort(
                value === "" ? null : (value as NonNullable<typeof draft.summaryReasoningEffort>),
              );
            }}
            className={`${INPUT_CLASS} w-full sm:w-[21rem]`}
          >
            <option value="">{t("topicSummarySettings.topic.reasoningDefault")}</option>
            <option value="off">{t("topicSummarySettings.topic.reasoningOff")}</option>
            <option value="minimal">{t("topicSummarySettings.topic.reasoningMinimal")}</option>
            <option value="low">{t("topicSummarySettings.topic.reasoningLow")}</option>
            <option value="medium">{t("topicSummarySettings.topic.reasoningMedium")}</option>
            <option value="high">{t("topicSummarySettings.topic.reasoningHigh")}</option>
          </select>
        </div>

        {error != null ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mt-3`}>
            {error}
          </p>
        ) : null}
      </div>
      <div className={SECTION_FOOTER_CLASS}>
        <div className="min-w-0 text-sm">
          {dirty && !pending ? (
            <p className="flex items-center gap-2 text-indicator-yellow">
              <span
                className="size-2 shrink-0 rounded-full bg-indicator-yellow"
                aria-hidden="true"
              />
              {t("topicSummarySettings.status.unsaved")}
            </p>
          ) : null}
          {vm.topic.status === "saved" ? (
            <p role="status" className="text-call-green">
              {t("topicSummarySettings.status.saved")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="neutral"
            size="lg"
            className="min-w-28"
            disabled={!dirty || pending || denied}
            onClick={vm.resetTopicDraft}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-w-36"
            disabled={!dirty || pending || denied || vm.topic.validationError != null}
            onClick={vm.saveTopic}
          >
            {pending
              ? t("topicSummarySettings.status.saving")
              : t("topicSummarySettings.topic.save")}
          </Button>
        </div>
      </div>
    </section>
  );
}
