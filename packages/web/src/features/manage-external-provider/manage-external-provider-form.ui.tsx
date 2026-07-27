import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { getLocale, t } from "~/i18n/i18n";
import type { WorkspaceExternalProviderHealthDto } from "~/shared/api/messenger-external-provider-admin.types";
import { Button } from "~/shared/ui/button";
import type { UseManageExternalProviderResult } from "./manage-external-provider.hook";

const MIB = 1024 * 1024;
const LIMITS = {
  max_accounts: 100_000,
  max_selected_chats_per_account: 1_000_000,
  max_file_bytes: 5_368_709_120,
} as const;

interface LimitFields {
  maxAccounts: string;
  maxSelectedChats: string;
  maxFileMib: string;
}

interface ParsedLimits {
  maxAccounts: number;
  maxSelectedChats: number;
  maxFileBytes: number;
}

const ACCOUNT_STATUSES = [
  "connecting",
  "backfill",
  "live",
  "degraded",
  "auth_required",
  "disconnected",
  "suspended",
] as const;
const CHAT_STATUSES = ["available", "live"] as const;
const METRIC_NAMES = [
  "queue_depth",
  "selected_chats",
  "synchronized_messages",
  "synchronized_users",
] as const;
const BRIDGE_STATUSES = [
  "enrolling",
  "active",
  "degraded",
  "incompatible",
  "suspended",
  "revoked",
] as const;
const OPERATION_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "manual_reconciliation_required",
  "discarded",
] as const;

function bytesToMibInput(bytes: number): string {
  return String(bytes / MIB);
}

function fieldsFromDraft(draft: UseManageExternalProviderResult["draft"]): LimitFields {
  return {
    maxAccounts: draft == null ? "" : String(draft.limits.max_accounts),
    maxSelectedChats: draft == null ? "" : String(draft.limits.max_selected_chats_per_account),
    maxFileMib: draft == null ? "" : bytesToMibInput(draft.limits.max_file_bytes),
  };
}

function parseInteger(value: string, maximum: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function parseMib(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const bytes = Math.round(parsed * MIB);
  return Number.isSafeInteger(bytes) && bytes <= LIMITS.max_file_bytes ? bytes : null;
}

function parseLimits(fields: LimitFields): ParsedLimits | null {
  const maxAccounts = parseInteger(fields.maxAccounts, LIMITS.max_accounts);
  const maxSelectedChats = parseInteger(
    fields.maxSelectedChats,
    LIMITS.max_selected_chats_per_account,
  );
  const maxFileBytes = parseMib(fields.maxFileMib);
  if (maxAccounts == null || maxSelectedChats == null || maxFileBytes == null) return null;
  return { maxAccounts, maxSelectedChats, maxFileBytes };
}

function formatUpdatedAt(value: string | null): string {
  if (value == null) return t("manageExternalProvider.common.notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("manageExternalProvider.common.notAvailable");
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const Section = React.memo<{
  title: string;
  description?: string;
  headerMeta?: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}>(({ title, description, headerMeta, children, danger = false }) => (
  <section
    className={`rounded-xl border p-4 ${
      danger ? "border-danger/30 bg-danger/5" : "border-border-subtle bg-bg"
    }`}
    aria-label={title}
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className={`text-sm font-semibold ${danger ? "text-danger" : "text-text-primary"}`}>
        {title}
      </h3>
      {headerMeta}
    </div>
    {description == null ? null : <p className="mt-1 text-xs text-text-muted">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
));

const Notice = React.memo<{
  children: React.ReactNode;
  kind?: "error" | "warning";
}>(({ children, kind = "error" }) => (
  <div
    role="alert"
    className={
      kind === "error"
        ? "border-danger/30 bg-danger/10 rounded-lg border px-3 py-2 text-sm text-danger"
        : "border-notice-base/30 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
    }
  >
    {children}
  </div>
));

const Field = React.memo<{
  id: string;
  label: string;
  value: string;
  maximum: string;
  error: boolean;
  disabled: boolean;
  suffix?: string;
  onChange: (value: string) => void;
}>(({ id, label, value, maximum, error, disabled, suffix, onChange }) => (
  <label htmlFor={id} className="block">
    <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        min="0"
        max={maximum}
        step={suffix == null ? "1" : "any"}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary"
      />
      {suffix == null ? null : <span className="shrink-0 text-xs text-text-muted">{suffix}</span>}
    </div>
    {error ? (
      <span id={`${id}-error`} className="mt-1 block text-xs text-danger">
        {t("manageExternalProvider.validation.range", { maximum })}
      </span>
    ) : null}
  </label>
));

function renderKnownCounts<Status extends string>(
  counts: Partial<Record<Status, number>>,
  statuses: readonly Status[],
  namespace: string,
): React.ReactNode {
  const known = statuses.filter((status) => counts[status] != null);
  if (known.length === 0) {
    return <p className="text-xs text-text-muted">{t("manageExternalProvider.health.noData")}</p>;
  }
  return (
    <dl className="space-y-1.5">
      {known.map((status) => (
        <div key={status} className="flex items-center justify-between gap-4 text-xs">
          <dt className="text-text-secondary">
            {t(`manageExternalProvider.health.status.${namespace}.${status}`)}
          </dt>
          <dd className="font-medium tabular-nums text-text-primary">{counts[status]}</dd>
        </div>
      ))}
    </dl>
  );
}

const HealthAggregates = React.memo<{
  health: WorkspaceExternalProviderHealthDto;
}>(({ health }) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
    <div>
      <h4 className="mb-2 text-xs font-semibold text-text-primary">
        {t("manageExternalProvider.health.accounts")}
      </h4>
      {renderKnownCounts(health.account_counts, ACCOUNT_STATUSES, "account")}
    </div>
    <div>
      <h4 className="mb-2 text-xs font-semibold text-text-primary">
        {t("manageExternalProvider.health.chats")}
      </h4>
      {renderKnownCounts(health.chat_counts, CHAT_STATUSES, "chat")}
    </div>
    <div>
      <h4 className="mb-2 text-xs font-semibold text-text-primary">
        {t("manageExternalProvider.health.bridges")}
      </h4>
      {renderKnownCounts(health.bridge_counts, BRIDGE_STATUSES, "bridge")}
    </div>
    <div>
      <h4 className="mb-2 text-xs font-semibold text-text-primary">
        {t("manageExternalProvider.health.operations")}
      </h4>
      {renderKnownCounts(health.operation_counts, OPERATION_STATUSES, "operation")}
    </div>
    <div>
      <h4 className="mb-2 text-xs font-semibold text-text-primary">
        {t("manageExternalProvider.health.metrics")}
      </h4>
      {renderKnownCounts(health.metrics, METRIC_NAMES, "metric")}
    </div>
  </div>
));

const HealthHeaderMeta = React.memo<{
  health: WorkspaceExternalProviderHealthDto | null;
}>(({ health }) => {
  if (health == null) return null;
  const healthy = health.status === "healthy";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-text-muted">
        {t("manageExternalProvider.provider")}:{" "}
        <span className="font-medium text-text-secondary">
          {health.provider === "zulip" ? "Zulip" : health.provider}
        </span>
      </span>
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 ${
          healthy ? "bg-call-green/10 text-call-green" : "bg-danger/10 text-danger"
        }`}
      >
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {t(`manageExternalProvider.health.${health.status}`)}
      </span>
    </div>
  );
});

const HealthSectionContent = React.memo<{
  vm: UseManageExternalProviderResult;
}>(({ vm }) => {
  if (vm.healthStatus === "loading" && vm.health == null) {
    return (
      <p role="status" className="text-sm text-text-muted">
        {t("manageExternalProvider.health.loading")}
      </p>
    );
  }
  if (vm.healthStatus === "error" && vm.health == null) {
    return (
      <Notice>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("manageExternalProvider.health.loadError")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={vm.refreshHealth}>
            {t("common.retry")}
          </Button>
        </div>
      </Notice>
    );
  }
  if (vm.health == null) {
    return (
      <p className="text-sm text-text-muted">{t("manageExternalProvider.common.notAvailable")}</p>
    );
  }
  return (
    <>
      {vm.healthStatus === "error" ? (
        <div className="mb-3">
          <Notice>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("manageExternalProvider.health.refreshError")}</span>
              <Button type="button" variant="ghost" size="sm" onClick={vm.refreshHealth}>
                {t("common.retry")}
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}
      <HealthAggregates health={vm.health} />
      <p className="mt-3 text-xs text-text-muted">
        {t("manageExternalProvider.updatedAt", {
          value: formatUpdatedAt(vm.health.updated_at),
        })}
      </p>
    </>
  );
});

const DangerActions = React.memo<{
  vm: UseManageExternalProviderResult;
}>(({ vm }) => {
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();
  const confirmPanelRef = useRef<HTMLDivElement>(null);
  const policySaving = vm.saveStatus === "saving";
  const policyRefreshing = vm.policyStatus === "loading";
  const actionLocked = policySaving || policyRefreshing;

  useEffect(() => {
    if (!vm.policy?.emergency_suspended) return;
    setConfirmSuspend(false);
  }, [vm.policy?.emergency_suspended]);

  useEffect(() => {
    if (!confirmSuspend) return;
    confirmPanelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [confirmSuspend]);

  if (vm.policy?.emergency_suspended) {
    const label =
      vm.actionStatus === "resuming"
        ? t("manageExternalProvider.danger.resuming")
        : t("manageExternalProvider.danger.resume");
    return (
      <Button
        type="button"
        disabled={actionLocked || vm.actionStatus === "resuming"}
        onClick={vm.resume}
      >
        {label}
      </Button>
    );
  }

  if (!confirmSuspend) {
    return (
      <Button
        type="button"
        className="border-danger/30 hover:bg-danger/10 border bg-transparent text-danger"
        disabled={actionLocked}
        onClick={() => setConfirmSuspend(true)}
      >
        {t("manageExternalProvider.danger.suspend")}
      </Button>
    );
  }

  const confirmLabel =
    vm.actionStatus === "suspending"
      ? t("manageExternalProvider.danger.suspending")
      : t("manageExternalProvider.danger.confirmSuspend");
  return (
    <div
      ref={confirmPanelRef}
      role="alertdialog"
      aria-labelledby={confirmTitleId}
      aria-describedby={confirmDescriptionId}
      className="border-danger/30 rounded-lg border bg-bg-elevated p-3"
    >
      <p id={confirmTitleId} className="text-sm font-medium text-text-primary">
        {t("manageExternalProvider.danger.confirmTitle")}
      </p>
      <p id={confirmDescriptionId} className="mt-1 text-xs text-text-muted">
        {t("manageExternalProvider.danger.confirmDescription")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          className="hover:bg-danger/90 bg-danger text-white"
          disabled={actionLocked || vm.actionStatus === "suspending"}
          onClick={vm.suspend}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={actionLocked || vm.actionStatus === "suspending"}
          onClick={() => setConfirmSuspend(false)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
});

export interface ManageExternalProviderFormProps {
  vm: UseManageExternalProviderResult;
  formId?: string;
  showSubmitButton?: boolean;
  onSaveDisabledChange?: (disabled: boolean) => void;
}

export const ManageExternalProviderForm = React.memo<ManageExternalProviderFormProps>(
  function ManageExternalProviderForm({
    vm,
    formId,
    showSubmitButton = true,
    onSaveDisabledChange,
  }) {
    const [fields, setFields] = useState<LimitFields>(() => fieldsFromDraft(vm.draft));

    useEffect(() => {
      setFields(fieldsFromDraft(vm.draft));
    }, [vm.draft]);

    const parsedLimits = useMemo(() => parseLimits(fields), [fields]);
    const maxAccountsError = parseInteger(fields.maxAccounts, LIMITS.max_accounts) == null;
    const maxSelectedChatsError =
      parseInteger(fields.maxSelectedChats, LIMITS.max_selected_chats_per_account) == null;
    const maxFileError = parseMib(fields.maxFileMib) == null;
    const changed =
      vm.policy != null &&
      vm.draft != null &&
      (vm.draft.enabled !== vm.policy.enabled ||
        vm.draft.limits.max_accounts !== vm.policy.limits.max_accounts ||
        vm.draft.limits.max_selected_chats_per_account !==
          vm.policy.limits.max_selected_chats_per_account ||
        vm.draft.limits.max_file_bytes !== vm.policy.limits.max_file_bytes);
    const saveBlockedByCa = vm.policy?.custom_ca_bundle != null;
    const actionPending = vm.actionStatus === "suspending" || vm.actionStatus === "resuming";
    const policyRefreshing = vm.policyStatus === "loading";
    const mutationPending = vm.saveStatus === "saving" || actionPending;
    const controlsBusy = policyRefreshing || mutationPending;
    const saveDisabled =
      parsedLimits == null || !changed || controlsBusy || vm.policyEtag == null || saveBlockedByCa;

    useEffect(() => {
      onSaveDisabledChange?.(saveDisabled);
    }, [onSaveDisabledChange, saveDisabled]);

    const setField = (field: keyof LimitFields, value: string) => {
      setFields((current) => ({ ...current, [field]: value }));
      if (field === "maxAccounts") {
        const parsed = parseInteger(value, LIMITS.max_accounts);
        if (parsed != null) vm.setLimit("max_accounts", parsed);
      } else if (field === "maxSelectedChats") {
        const parsed = parseInteger(value, LIMITS.max_selected_chats_per_account);
        if (parsed != null) vm.setLimit("max_selected_chats_per_account", parsed);
      } else {
        const parsed = parseMib(value);
        if (parsed != null) vm.setLimit("max_file_bytes", parsed);
      }
    };

    if (vm.policyStatus === "loading" && vm.policy == null) {
      return (
        <p role="status" className="py-12 text-center text-sm text-text-muted">
          {t("manageExternalProvider.loadingPolicy")}
        </p>
      );
    }

    if (vm.policy == null || vm.draft == null) {
      return (
        <div role="alert" className="py-10 text-center">
          <p className="text-sm text-danger">{t("manageExternalProvider.policyLoadError")}</p>
          <Button type="button" variant="ghost" className="mt-3" onClick={vm.refreshPolicy}>
            {t("common.retry")}
          </Button>
        </div>
      );
    }

    return (
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveDisabled) vm.save();
        }}
      >
        <Section title={t("manageExternalProvider.overview.title")}>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">{t("manageExternalProvider.provider")}</p>
              <p className="font-medium text-text-primary">Zulip</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">
                {t("manageExternalProvider.overview.health")}
              </p>
              <p className="font-medium text-text-primary">
                {vm.health == null
                  ? t("manageExternalProvider.common.notAvailable")
                  : t(`manageExternalProvider.health.${vm.health.status}`)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">
                {t("manageExternalProvider.overview.policy")}
              </p>
              <p className="font-medium text-text-primary">
                {t(
                  vm.policy.enabled
                    ? "manageExternalProvider.policy.enabled"
                    : "manageExternalProvider.policy.disabled",
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">
                {t("manageExternalProvider.overview.emergency")}
              </p>
              <p className="font-medium text-text-primary">
                {t(
                  vm.policy.emergency_suspended
                    ? "manageExternalProvider.emergency.suspended"
                    : "manageExternalProvider.emergency.active",
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <span className="text-xs text-text-muted">
              {t("manageExternalProvider.updatedAt", {
                value: formatUpdatedAt(vm.health?.updated_at ?? vm.policy.updated_at),
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={policyRefreshing || vm.healthStatus === "loading" || mutationPending}
              onClick={() => {
                vm.refreshPolicy();
                vm.refreshHealth();
              }}
            >
              {t("manageExternalProvider.refresh")}
            </Button>
          </div>
          {vm.policyStatus === "error" ? (
            <div className="mt-3">
              <Notice>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("manageExternalProvider.policyRefreshError")}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={vm.refreshPolicy}>
                    {t("common.retry")}
                  </Button>
                </div>
              </Notice>
            </div>
          ) : null}
        </Section>

        {vm.saveStatus === "conflict" ? (
          <Notice kind="warning">
            <p>{t("manageExternalProvider.conflict.message")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  vm.resetDraft();
                  vm.resetOperationState();
                }}
              >
                {t("manageExternalProvider.conflict.loadCurrent")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={vm.resetOperationState}>
                {t("manageExternalProvider.conflict.keepDraft")}
              </Button>
            </div>
          </Notice>
        ) : null}

        <Section
          title={t("manageExternalProvider.limits.title")}
          description={t("manageExternalProvider.limits.description")}
        >
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-text-primary">
                {t("manageExternalProvider.enabled.label")}
              </span>
              <span className="mt-1 block text-xs text-text-muted">
                {t("manageExternalProvider.enabled.description")}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={vm.draft.enabled}
              disabled={controlsBusy}
              onChange={(event) => vm.setEnabled(event.target.checked)}
              aria-label={t("manageExternalProvider.enabled.label")}
              className="mt-1 h-4 w-4 shrink-0 accent-accent"
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="external-provider-max-accounts"
              label={t("manageExternalProvider.limits.maxAccounts")}
              value={fields.maxAccounts}
              maximum={String(LIMITS.max_accounts)}
              error={maxAccountsError}
              disabled={controlsBusy}
              onChange={(value) => setField("maxAccounts", value)}
            />
            <Field
              id="external-provider-max-chats"
              label={t("manageExternalProvider.limits.maxSelectedChats")}
              value={fields.maxSelectedChats}
              maximum={String(LIMITS.max_selected_chats_per_account)}
              error={maxSelectedChatsError}
              disabled={controlsBusy}
              onChange={(value) => setField("maxSelectedChats", value)}
            />
            <Field
              id="external-provider-max-file"
              label={t("manageExternalProvider.limits.maxFileSize")}
              value={fields.maxFileMib}
              maximum={String(LIMITS.max_file_bytes / MIB)}
              error={maxFileError}
              disabled={controlsBusy}
              suffix={t("manageExternalProvider.units.mib")}
              onChange={(value) => setField("maxFileMib", value)}
            />
          </div>
          <p className="mt-3 text-xs text-text-muted">
            {t("manageExternalProvider.limits.reductionHint")}
          </p>
        </Section>

        <Section title={t("manageExternalProvider.ca.title")}>
          {vm.policy.custom_ca_bundle == null ? (
            <p className="text-sm text-text-muted">{t("manageExternalProvider.ca.notInstalled")}</p>
          ) : (
            <>
              <Notice kind="warning">{t("manageExternalProvider.ca.saveBlocked")}</Notice>
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-text-muted">{t("manageExternalProvider.ca.certificates")}</dt>
                  <dd className="font-medium text-text-primary">
                    {vm.policy.custom_ca_bundle.certificate_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("manageExternalProvider.ca.generation")}</dt>
                  <dd className="font-medium text-text-primary">
                    {vm.policy.custom_ca_bundle.generation}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-text-muted">{t("manageExternalProvider.ca.sha256")}</dt>
                  <dd className="break-all font-mono text-text-primary">
                    {vm.policy.custom_ca_bundle.sha256}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </Section>

        <Section
          title={t("manageExternalProvider.health.title")}
          headerMeta={<HealthHeaderMeta health={vm.health} />}
        >
          <HealthSectionContent vm={vm} />
        </Section>

        <Section
          danger
          title={t("manageExternalProvider.danger.title")}
          description={t("manageExternalProvider.danger.description")}
        >
          {vm.actionStatus === "error" ? (
            <div className="mb-3">
              <Notice>{t("manageExternalProvider.danger.actionError")}</Notice>
            </div>
          ) : null}
          <DangerActions vm={vm} />
        </Section>

        {vm.saveStatus === "error" || vm.saveStatus === "blocked" ? (
          <Notice>
            {t(
              vm.saveStatus === "blocked"
                ? "manageExternalProvider.ca.saveBlocked"
                : "manageExternalProvider.saveError",
            )}
          </Notice>
        ) : null}

        {showSubmitButton ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
            <Button type="submit" disabled={saveDisabled} aria-disabled={saveDisabled}>
              {vm.saveStatus === "saving" ? t("manageExternalProvider.saving") : t("common.save")}
            </Button>
          </div>
        ) : null}
      </form>
    );
  },
);
