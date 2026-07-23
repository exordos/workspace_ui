import React from "react";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { useExternalIntegrationAdmin } from "./external-integration-admin.hook";

export interface ExternalIntegrationAdminPanelProps {
  runtimeContext: WorkspaceRuntimeContext;
}

const INPUT_CLASS =
  "min-h-10 w-full rounded-lg border border-border-subtle bg-bg px-3 text-sm text-text-primary outline-none focus:border-accent";

function countSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "0";
  return entries.map(([key, count]) => `${key}: ${count}`).join(" · ");
}

export const ExternalIntegrationAdminPanel = React.memo<ExternalIntegrationAdminPanelProps>(
  function ExternalIntegrationAdminPanel({ runtimeContext }) {
    const vm = useExternalIntegrationAdmin(runtimeContext);

    if (vm.status === "denied") return null;
    if (vm.status === "loading") {
      return (
        <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
          <p className="text-sm text-text-muted">{t("externalIntegrationAdmin.loading")}</p>
        </section>
      );
    }
    if (vm.status === "error" || vm.policy == null || vm.draft == null) {
      return (
        <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
          <p role="alert" className="text-sm text-notice-base">
            {t("externalIntegrationAdmin.errors.load")}
          </p>
          <button
            type="button"
            onClick={vm.reload}
            className="mt-3 min-h-9 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary"
          >
            {t("common.retry")}
          </button>
        </section>
      );
    }

    return (
      <section
        className="rounded-xl border border-border-subtle bg-card-bg p-4"
        data-testid="external-integration-admin-panel"
      >
        <header className="flex items-start gap-3 border-b border-border-subtle pb-3">
          <Icon name="grid" size={20} className="mt-0.5 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">
              {t("externalIntegrationAdmin.title")}
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              {t("externalIntegrationAdmin.description")}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[11px] ${
              vm.health?.status === "healthy"
                ? "bg-call-green/10 text-call-green"
                : "bg-notice-base/10 text-notice-base"
            }`}
          >
            {vm.health?.status ?? t("externalIntegrationAdmin.healthUnknown")}
          </span>
        </header>

        <div className="mt-4 flex items-start gap-3 rounded-lg bg-bg-elevated px-3 py-3">
          <input
            id="external-integration-enabled"
            type="checkbox"
            aria-labelledby="external-integration-enabled-label"
            checked={vm.draft.enabled}
            onChange={(event) => vm.updateDraft({ enabled: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            <span
              id="external-integration-enabled-label"
              className="block text-sm font-medium text-text-primary"
            >
              {t("externalIntegrationAdmin.enabled")}
            </span>
            <span className="block text-xs text-text-muted">
              {t("externalIntegrationAdmin.enabledHint")}
            </span>
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-text-secondary">
            <span className="mb-1 block">{t("externalIntegrationAdmin.maxAccounts")}</span>
            <input
              type="number"
              min={0}
              max={100000}
              step={1}
              value={vm.draft.maxAccounts}
              onChange={(event) => vm.updateDraft({ maxAccounts: event.target.valueAsNumber })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-text-secondary">
            <span className="mb-1 block">{t("externalIntegrationAdmin.maxChats")}</span>
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={vm.draft.maxSelectedChatsPerAccount}
              onChange={(event) =>
                vm.updateDraft({ maxSelectedChatsPerAccount: event.target.valueAsNumber })
              }
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-text-secondary">
            <span className="mb-1 block">{t("externalIntegrationAdmin.maxFileMib")}</span>
            <input
              type="number"
              min={0}
              max={5120}
              step={1}
              value={vm.draft.maxFileMib}
              onChange={(event) => vm.updateDraft({ maxFileMib: event.target.valueAsNumber })}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        {vm.policy.custom_ca_bundle != null && (
          <p className="mt-3 rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-secondary">
            {t("externalIntegrationAdmin.customCaManaged", {
              count: vm.policy.custom_ca_bundle.certificate_count,
            })}
          </p>
        )}

        {vm.health != null && (
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.accounts")}</dt>
              <dd className="mt-1 break-words text-text-primary">
                {countSummary(vm.health.account_counts)}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.bridges")}</dt>
              <dd className="mt-1 break-words text-text-primary">
                {countSummary(vm.health.bridge_counts)}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.chats")}</dt>
              <dd className="mt-1 break-words text-text-primary">
                {countSummary(vm.health.chat_counts)}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.selectedChats")}</dt>
              <dd className="mt-1 text-text-primary">{vm.health.metrics.selected_chats ?? 0}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">
                {t("externalIntegrationAdmin.synchronizedMessages")}
              </dt>
              <dd className="mt-1 text-text-primary">
                {vm.health.metrics.synchronized_messages ?? 0}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.synchronizedUsers")}</dt>
              <dd className="mt-1 text-text-primary">
                {vm.health.metrics.synchronized_users ?? 0}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.operations")}</dt>
              <dd className="mt-1 break-words text-text-primary">
                {countSummary(vm.health.operation_counts)}
              </dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-3 py-2">
              <dt className="text-text-muted">{t("externalIntegrationAdmin.queueDepth")}</dt>
              <dd className="mt-1 text-text-primary">{vm.health.metrics.queue_depth ?? 0}</dd>
            </div>
          </dl>
        )}

        {vm.policy.emergency_suspended && (
          <p role="status" className="mt-3 text-xs font-medium text-notice-base">
            {t("externalIntegrationAdmin.suspended")}
          </p>
        )}
        {vm.error != null && (
          <p role="alert" className="mt-3 text-xs text-notice-base">
            {t(`externalIntegrationAdmin.errors.${vm.error}`)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={vm.save}
            disabled={vm.saving || vm.policy.custom_ca_bundle != null}
            className="min-h-10 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {vm.saving ? t("externalIntegrationAdmin.saving") : t("common.save")}
          </button>
          <button
            type="button"
            onClick={vm.changeSuspension}
            disabled={vm.changingSuspension}
            className="border-notice-base/40 min-h-10 rounded-lg border px-3 text-sm font-medium text-notice-base disabled:opacity-50"
          >
            {vm.policy.emergency_suspended
              ? t("externalIntegrationAdmin.resume")
              : t("externalIntegrationAdmin.suspend")}
          </button>
          <button
            type="button"
            onClick={vm.reload}
            className="min-h-10 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary"
          >
            {t("externalIntegrationAdmin.refresh")}
          </button>
          {vm.saved && (
            <span role="status" className="text-xs text-accent">
              {t("externalIntegrationAdmin.saved")}
            </span>
          )}
        </div>
      </section>
    );
  },
);
