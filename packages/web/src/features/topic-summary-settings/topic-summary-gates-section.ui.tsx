import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import {
  ERROR_NOTICE_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_HEADER_CLASS,
  operationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SectionHeading, SwitchRow } from "./topic-summary-settings-shared.ui";
import { areTopicSummaryGatesEffective } from "./topic-summary-settings.lib";
import type { UseTopicSummarySettingsResult } from "./topic-summary-settings.hook";

export function GatesSettingsSection({ vm }: Readonly<{ vm: UseTopicSummarySettingsResult }>) {
  const { t } = useTranslation();
  const gates = vm.gates;
  const denied = gates.permission === "denied";
  const pending = gates.saveStatus === "saving";
  const error = operationErrorText(gates.error, t);

  return (
    <section className={SECTION_CLASS} aria-labelledby="topic-summary-gates-heading">
      <div id="topic-summary-gates-heading" className={SECTION_HEADER_CLASS}>
        <SectionHeading
          icon="settings"
          title={t("topicSummarySettings.gates.title")}
          description={t("topicSummarySettings.gates.description")}
        />
      </div>
      <div className={SECTION_BODY_CLASS}>
        {gates.loadStatus === "loading" ? (
          <p role="status" className="text-sm text-text-muted">
            {t("topicSummarySettings.gates.loading")}
          </p>
        ) : null}
        {gates.loadStatus === "error" && gates.draft == null ? (
          <div
            className={`${ERROR_NOTICE_CLASS} flex flex-wrap items-center justify-between gap-2`}
          >
            <p role="alert">{t("topicSummarySettings.gates.loadFailed")}</p>
            <Button
              type="button"
              variant="neutral"
              appearance="ghost"
              size="sm"
              onClick={vm.loadGates}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {denied ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mb-4`}>
            {t("topicSummarySettings.status.forbidden")}
          </p>
        ) : null}
        {gates.draft != null ? (
          <>
            <div className="bg-bg-elevated/40 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
              <SwitchRow
                checked={gates.draft.globalEnabled}
                disabled={pending || denied}
                label={t("topicSummarySettings.gates.global")}
                description={t("topicSummarySettings.gates.globalWarning")}
                onChange={vm.setGlobalEnabled}
              />
              <SwitchRow
                checked={gates.draft.projectEnabled}
                disabled={pending || denied}
                label={t("topicSummarySettings.gates.project")}
                onChange={vm.setProjectEnabled}
              />
            </div>
            <p
              className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
                areTopicSummaryGatesEffective(gates.draft)
                  ? "border-call-green/25 bg-call-green/10 text-call-green"
                  : "border-border-subtle bg-bg-elevated text-text-muted"
              }`}
            >
              {areTopicSummaryGatesEffective(gates.draft)
                ? t("topicSummarySettings.gates.effectiveOn")
                : t("topicSummarySettings.gates.effectiveOff")}
            </p>
            {error != null ? (
              <p role="alert" className={`${ERROR_NOTICE_CLASS} mt-4`}>
                {error}
              </p>
            ) : null}
            {gates.saveStatus === "saved" ? (
              <p role="status" className="mt-4 text-sm text-call-green">
                {t("topicSummarySettings.status.saved")}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
              <Button
                type="button"
                variant="neutral"
                appearance="ghost"
                disabled={!gates.dirty || pending || denied}
                onClick={vm.resetGatesDraft}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!gates.dirty || pending || denied}
                onClick={vm.saveGates}
              >
                {t("topicSummarySettings.gates.save")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
