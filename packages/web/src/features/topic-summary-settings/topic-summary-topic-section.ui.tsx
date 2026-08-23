import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import {
  ERROR_NOTICE_CLASS,
  INPUT_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_HEADER_CLASS,
  operationErrorText,
  validationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SectionHeading, SwitchRow } from "./topic-summary-settings-shared.ui";
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
      <div id="topic-summary-topic-heading" className={SECTION_HEADER_CLASS}>
        <SectionHeading
          icon="sparkles"
          title={t("topicSummarySettings.topic.title")}
          description={t("topicSummarySettings.topic.description")}
        />
      </div>
      <div className={SECTION_BODY_CLASS}>
        {denied ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mb-4`}>
            {t("topicSummarySettings.status.forbidden")}
          </p>
        ) : null}
        <div className="space-y-5">
          <div className="bg-bg-elevated/40 rounded-lg border border-border-subtle">
            <SwitchRow
              checked={draft.summaryEnabled}
              disabled={pending || denied}
              label={t("topicSummarySettings.topic.enabled")}
              onChange={vm.setTopicEnabled}
            />
          </div>
          <FormField
            label={t("topicSummarySettings.topic.prompt")}
            htmlFor="topic-summary-system-prompt"
            error={validationError ?? undefined}
          >
            <textarea
              id="topic-summary-system-prompt"
              value={draft.summarySystemPrompt ?? ""}
              disabled={pending || denied}
              maxLength={TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH + 1}
              rows={6}
              onChange={(event) => vm.setTopicSystemPrompt(event.target.value)}
              placeholder={t("topicSummarySettings.topic.promptPlaceholder")}
              className={`${INPUT_CLASS} min-h-32 resize-y leading-6`}
            />
          </FormField>
          <div className="-mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-text-muted">
              {draft.summarySystemPrompt == null
                ? t("topicSummarySettings.topic.defaultPrompt")
                : `${draft.summarySystemPrompt.length}/${TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending || denied || draft.summarySystemPrompt == null}
              onClick={() => vm.setTopicSystemPrompt(null)}
            >
              {t("topicSummarySettings.topic.useDefault")}
            </Button>
          </div>
          <FormField
            label={t("topicSummarySettings.topic.reasoning")}
            htmlFor="topic-summary-reasoning"
          >
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
              className={INPUT_CLASS}
            >
              <option value="">{t("topicSummarySettings.topic.reasoningDefault")}</option>
              <option value="minimal">{t("topicSummarySettings.topic.reasoningMinimal")}</option>
              <option value="low">{t("topicSummarySettings.topic.reasoningLow")}</option>
              <option value="medium">{t("topicSummarySettings.topic.reasoningMedium")}</option>
              <option value="high">{t("topicSummarySettings.topic.reasoningHigh")}</option>
            </select>
          </FormField>
        </div>
        {error != null ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mt-4`}>
            {error}
          </p>
        ) : null}
        {vm.topic.status === "saved" ? (
          <p role="status" className="mt-4 text-sm text-call-green">
            {t("topicSummarySettings.status.saved")}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || pending || denied}
            onClick={vm.resetTopicDraft}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
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
