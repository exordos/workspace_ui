import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import {
  ERROR_NOTICE_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_FOOTER_CLASS,
  operationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SwitchRow } from "./topic-summary-settings-shared.ui";
import { areTopicSummaryGatesEffective } from "./topic-summary-settings.lib";
import type { UseTopicSummarySettingsResult } from "./topic-summary-settings.hook";

function GatesSettingsFooter({
  vm,
  pending,
  denied,
}: Readonly<{
  vm: UseTopicSummarySettingsResult;
  pending: boolean;
  denied: boolean;
}>) {
  const { t } = useTranslation();
  const gates = vm.gates;
  if (gates.draft == null) return null;

  return (
    <div className={SECTION_FOOTER_CLASS}>
      <div className="min-w-0 text-sm">
        {gates.dirty && !pending ? (
          <p className="flex items-center gap-2 text-indicator-yellow">
            <span className="size-2 shrink-0 rounded-full bg-indicator-yellow" aria-hidden="true" />
            {t("topicSummarySettings.status.unsaved")}
          </p>
        ) : null}
        {gates.saveStatus === "saved" ? (
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
          disabled={!gates.dirty || pending || denied}
          onClick={vm.resetGatesDraft}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-w-36"
          disabled={!gates.dirty || pending || denied}
          onClick={vm.saveGates}
        >
          {t("topicSummarySettings.gates.save")}
        </Button>
      </div>
    </div>
  );
}

export function GatesSettingsSection({ vm }: Readonly<{ vm: UseTopicSummarySettingsResult }>) {
  const { t } = useTranslation();
  const gates = vm.gates;
  const denied = gates.permission === "denied";
  const pending = gates.saveStatus === "saving";
  const error = operationErrorText(gates.error, t);

  return (
    <section className={SECTION_CLASS} aria-labelledby="topic-summary-gates-heading">
      <h3 id="topic-summary-gates-heading" className="sr-only">
        {t("topicSummarySettings.gates.title")}
      </h3>
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
            <div
              className={`rounded-xl border px-4 py-3 ${
                areTopicSummaryGatesEffective(gates.draft)
                  ? "border-call-green/25 bg-call-green/10"
                  : "border-border-subtle bg-bg-elevated"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      areTopicSummaryGatesEffective(gates.draft)
                        ? "text-call-green"
                        : "text-text-primary"
                    }`}
                  >
                    {areTopicSummaryGatesEffective(gates.draft)
                      ? t("topicSummarySettings.gates.effectiveOnTitle")
                      : t("topicSummarySettings.gates.effectiveOffTitle")}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {areTopicSummaryGatesEffective(gates.draft)
                      ? t("topicSummarySettings.gates.effectiveOn")
                      : t("topicSummarySettings.gates.effectiveOff")}
                  </p>
                </div>
                <span className="text-xs font-medium text-text-muted">
                  {t("topicSummarySettings.gates.formula")}
                </span>
              </div>
            </div>

            <div className="mt-4 divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card-bg">
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
                description={t("topicSummarySettings.gates.projectDescription")}
                onChange={vm.setProjectEnabled}
              />
            </div>

            <p className="mt-4 rounded-lg border border-border-subtle px-4 py-3 text-xs text-text-muted">
              {t("topicSummarySettings.gates.permissionNote")}
            </p>
            {error != null ? (
              <p role="alert" className={`${ERROR_NOTICE_CLASS} mt-3`}>
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <GatesSettingsFooter vm={vm} pending={pending} denied={denied} />
    </section>
  );
}
