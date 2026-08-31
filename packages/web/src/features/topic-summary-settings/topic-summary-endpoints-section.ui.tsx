import { type ReactNode, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import type { WorkspaceTopicSummaryEndpointDto } from "~/shared/api/messenger-topic-summary-management.types";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import {
  ERROR_NOTICE_CLASS,
  INPUT_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  endpointValidationErrorText,
  operationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SwitchRow } from "./topic-summary-settings-shared.ui";
import type { UseTopicSummaryEndpointsResult } from "./topic-summary-endpoints.hook";

type EndpointDraft = NonNullable<UseTopicSummaryEndpointsResult["create"]["draft"]>;

function EndpointEditor({
  mode,
  vm,
}: Readonly<{
  mode: "create" | "edit";
  vm: UseTopicSummaryEndpointsResult;
}>) {
  const { t } = useTranslation();
  const operation = mode === "create" ? vm.create : vm.edit;
  const draft = operation.draft;
  const pending = operation.status === "pending";
  const error = operationErrorText(operation.error, t);
  if (draft == null) return null;

  const setField = <Key extends keyof EndpointDraft>(field: Key, value: EndpointDraft[Key]) => {
    if (mode === "create") vm.setCreateField(field, value);
    else vm.setEditField(field, value);
  };
  const hasValidationErrors = Object.keys(operation.validationErrors).length > 0;
  const cancel = mode === "create" ? vm.cancelCreate : vm.cancelEdit;
  const submit = mode === "create" ? vm.createEndpoint : vm.updateEndpoint;

  return (
    <div className="min-h-0 bg-card-bg">
      <div className="border-b border-border-subtle px-4 py-3">
        <h4 className="text-sm font-semibold text-text-primary">
          {t(
            mode === "create"
              ? "topicSummarySettings.endpoints.createTitle"
              : "topicSummarySettings.endpoints.editTitle",
          )}
        </h4>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <FormField
          label={t("topicSummarySettings.endpoints.name")}
          htmlFor={`endpoint-${mode}-name`}
          error={endpointValidationErrorText(operation.validationErrors.name, t)}
        >
          <input
            id={`endpoint-${mode}-name`}
            value={draft.name}
            required
            maxLength={255}
            disabled={pending}
            onChange={(event) => setField("name", event.target.value)}
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField
          label={t("topicSummarySettings.endpoints.model")}
          htmlFor={`endpoint-${mode}-model`}
          error={endpointValidationErrorText(operation.validationErrors.model, t)}
        >
          <input
            id={`endpoint-${mode}-model`}
            value={draft.model}
            required
            maxLength={255}
            disabled={pending}
            onChange={(event) => setField("model", event.target.value)}
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField
          label={t("topicSummarySettings.endpoints.baseUrl")}
          htmlFor={`endpoint-${mode}-base-url`}
          className="md:col-span-2"
          error={endpointValidationErrorText(operation.validationErrors.baseUrl, t)}
        >
          <input
            id={`endpoint-${mode}-base-url`}
            type="url"
            required
            maxLength={2048}
            value={draft.baseUrl}
            disabled={pending}
            onChange={(event) => setField("baseUrl", event.target.value)}
            className={INPUT_CLASS}
            placeholder="https://llm.example.com/v1"
          />
        </FormField>
        <FormField
          label={t("topicSummarySettings.endpoints.apiKey")}
          htmlFor={`endpoint-${mode}-api-key`}
          className="md:col-span-2"
          error={endpointValidationErrorText(operation.validationErrors.apiKey, t)}
        >
          <input
            id={`endpoint-${mode}-api-key`}
            type="password"
            autoComplete="new-password"
            required={mode === "create"}
            maxLength={8192}
            value={draft.apiKey}
            disabled={pending}
            onChange={(event) => setField("apiKey", event.target.value)}
            className={INPUT_CLASS}
          />
          <span className="mt-1 block text-xs text-text-muted">
            {t(
              mode === "create"
                ? "topicSummarySettings.endpoints.apiKeyCreateHint"
                : "topicSummarySettings.endpoints.apiKeyEditHint",
            )}
          </span>
        </FormField>
        <NumberField
          id={`endpoint-${mode}-priority`}
          label={t("topicSummarySettings.endpoints.priority")}
          value={draft.priority}
          min={0}
          max={1_000_000}
          disabled={pending}
          error={endpointValidationErrorText(operation.validationErrors.priority, t)}
          onChange={(value) => setField("priority", value)}
        />
        <NumberField
          id={`endpoint-${mode}-max-tokens`}
          label={t("topicSummarySettings.endpoints.maxOutputTokens")}
          value={draft.maxOutputTokens}
          min={1}
          max={32_768}
          disabled={pending}
          error={endpointValidationErrorText(operation.validationErrors.maxOutputTokens, t)}
          onChange={(value) => setField("maxOutputTokens", value)}
        />
        <div className="grid gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle md:col-span-2 md:grid-cols-3">
          <div className="bg-card-bg">
            <SwitchRow
              checked={draft.enabled}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.enabled")}
              onChange={(value) => setField("enabled", value)}
            />
          </div>
          <div className="bg-card-bg">
            <SwitchRow
              checked={draft.supportsVision}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.supportsVision")}
              onChange={(value) => setField("supportsVision", value)}
            />
          </div>
          <div className="bg-card-bg">
            <SwitchRow
              checked={draft.supportsReasoning}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.supportsReasoning")}
              onChange={(value) => setField("supportsReasoning", value)}
            />
          </div>
        </div>
        <details className="group rounded-lg border border-border-subtle bg-card-bg md:col-span-2">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
            {t("topicSummarySettings.endpoints.advanced")}
          </summary>
          <div className="grid gap-3 border-t border-border-subtle p-3 md:grid-cols-2">
            <NumberField
              id={`endpoint-${mode}-temperature`}
              label={t("topicSummarySettings.endpoints.temperature")}
              value={draft.temperature}
              min={0}
              max={2}
              step={0.1}
              disabled={pending}
              error={endpointValidationErrorText(operation.validationErrors.temperature, t)}
              onChange={(value) => setField("temperature", value)}
            />
            <NumberField
              id={`endpoint-${mode}-top-p`}
              label={t("topicSummarySettings.endpoints.topP")}
              value={draft.topP}
              min={0}
              max={1}
              step={0.1}
              disabled={pending}
              error={endpointValidationErrorText(operation.validationErrors.topP, t)}
              onChange={(value) => setField("topP", value)}
            />
            <NumberField
              id={`endpoint-${mode}-presence-penalty`}
              label={t("topicSummarySettings.endpoints.presencePenalty")}
              value={draft.presencePenalty}
              min={-2}
              max={2}
              step={0.1}
              disabled={pending}
              error={endpointValidationErrorText(operation.validationErrors.presencePenalty, t)}
              onChange={(value) => setField("presencePenalty", value)}
            />
            <NumberField
              id={`endpoint-${mode}-frequency-penalty`}
              label={t("topicSummarySettings.endpoints.frequencyPenalty")}
              value={draft.frequencyPenalty}
              min={-2}
              max={2}
              step={0.1}
              disabled={pending}
              error={endpointValidationErrorText(operation.validationErrors.frequencyPenalty, t)}
              onChange={(value) => setField("frequencyPenalty", value)}
            />
          </div>
        </details>
        {hasValidationErrors ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} md:col-span-2`}>
            {t("topicSummarySettings.status.invalid")}
          </p>
        ) : null}
        {error != null ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} md:col-span-2`}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-3 md:col-span-2">
          <Button
            type="button"
            variant="neutral"
            appearance="ghost"
            disabled={pending}
            onClick={cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={pending || hasValidationErrors} onClick={submit}>
            {t(
              mode === "create"
                ? "topicSummarySettings.endpoints.create"
                : "topicSummarySettings.endpoints.update",
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  error,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  error?: string;
  onChange: (value: number) => void;
}>) {
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className={INPUT_CLASS}
      />
    </FormField>
  );
}

function EndpointListItem({
  endpoint,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  endpoint: WorkspaceTopicSummaryEndpointDto;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}>) {
  let statusClassName = "bg-text-muted";
  if (endpoint.enabled) {
    statusClassName = endpoint.last_error_code == null ? "bg-call-green" : "bg-danger";
  }

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          selected
            ? "border-accent/60 bg-accent/10"
            : "border-transparent hover:border-border-subtle hover:bg-bg-elevated"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${statusClassName}`} aria-hidden="true" />
          <strong className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {endpoint.name}
          </strong>
        </span>
        <span className="mt-1 block truncate pl-4 text-xs text-text-secondary">
          {`${endpoint.model} · ${endpoint.priority}`}
        </span>
        <span className="mt-1 block truncate pl-4 text-[11px] text-text-muted">
          {endpoint.base_url.replace(/^https?:\/\//, "")}
        </span>
        {endpoint.last_error_code != null ? (
          <span className="mt-1 block truncate pl-4 text-[11px] text-danger">
            {endpoint.last_error_code}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function EndpointProperty({
  label,
  children,
  wide = false,
}: Readonly<{ label: string; children: ReactNode; wide?: boolean }>) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function formatEndpointDate(value: string | null): string | null {
  if (value == null) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EndpointDetails({
  endpoint,
  vm,
  confirmingDelete,
  onConfirmingDeleteChange,
}: Readonly<{
  endpoint: WorkspaceTopicSummaryEndpointDto;
  vm: UseTopicSummaryEndpointsResult;
  confirmingDelete: boolean;
  onConfirmingDeleteChange: (confirming: boolean) => void;
}>) {
  const { t } = useTranslation();
  const deleting = vm.remove.endpointUuid === endpoint.uuid && vm.remove.status === "pending";
  const actionsDisabled = deleting || vm.permission !== "allowed";
  const lastSuccess = formatEndpointDate(endpoint.last_success_at);
  const lastFailure = formatEndpointDate(endpoint.last_failure_at);

  return (
    <div className="min-h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{endpoint.name}</h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                endpoint.enabled
                  ? "bg-call-green/10 text-call-green"
                  : "bg-bg-elevated text-text-muted"
              }`}
            >
              {endpoint.enabled
                ? t("topicSummarySettings.endpoints.statusEnabled")
                : t("topicSummarySettings.endpoints.statusDisabled")}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">{endpoint.model}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="neutral"
            appearance="ghost"
            size="sm"
            disabled={actionsDisabled}
            onClick={() => vm.startEdit(endpoint.uuid)}
          >
            {t("topicSummarySettings.endpoints.edit")}
          </Button>
          <Button
            type="button"
            variant="neutral"
            appearance="ghost"
            size="sm"
            disabled={actionsDisabled}
            onClick={() => onConfirmingDeleteChange(true)}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <dl className="grid gap-x-5 gap-y-3 rounded-lg border border-border-subtle bg-card-bg p-3 sm:grid-cols-2">
          <EndpointProperty label={t("topicSummarySettings.endpoints.baseUrl")} wide>
            <span className="break-all">{endpoint.base_url}</span>
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.priority")}>
            {endpoint.priority}
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.maxOutputTokens")}>
            {endpoint.max_output_tokens}
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.temperature")}>
            {endpoint.temperature}
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.topP")}>
            {endpoint.top_p}
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.presencePenalty")}>
            {endpoint.presence_penalty}
          </EndpointProperty>
          <EndpointProperty label={t("topicSummarySettings.endpoints.frequencyPenalty")}>
            {endpoint.frequency_penalty}
          </EndpointProperty>
        </dl>

        <div>
          <h5 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("topicSummarySettings.endpoints.capabilities")}
          </h5>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-border-subtle px-2 py-1 text-text-secondary">
              {endpoint.supports_vision
                ? t("topicSummarySettings.endpoints.supportsVision")
                : t("topicSummarySettings.endpoints.noVision")}
            </span>
            <span className="rounded-md border border-border-subtle px-2 py-1 text-text-secondary">
              {endpoint.supports_reasoning
                ? t("topicSummarySettings.endpoints.supportsReasoning")
                : t("topicSummarySettings.endpoints.noReasoningControl")}
            </span>
            <span className="rounded-md border border-border-subtle px-2 py-1 text-text-secondary">
              {endpoint.credential_present
                ? t("topicSummarySettings.endpoints.credentialStored")
                : t("topicSummarySettings.endpoints.credentialMissing")}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle p-3">
          <h5 className="text-sm font-medium text-text-primary">
            {t("topicSummarySettings.endpoints.connectionStatus")}
          </h5>
          <div className="mt-2 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
            <span>
              {t("topicSummarySettings.endpoints.failures", { count: endpoint.failure_count })}
            </span>
            {lastSuccess != null ? (
              <span>{t("topicSummarySettings.endpoints.lastSuccess", { date: lastSuccess })}</span>
            ) : null}
            {lastFailure != null ? (
              <span>{t("topicSummarySettings.endpoints.lastFailure", { date: lastFailure })}</span>
            ) : null}
          </div>
          {endpoint.last_error_code != null ? (
            <p className="border-danger/30 bg-danger/5 mt-2 rounded-md border px-2 py-1.5 text-xs text-danger">
              {t("topicSummarySettings.endpoints.lastError", { code: endpoint.last_error_code })}
            </p>
          ) : null}
        </div>
      </div>

      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-label={t("topicSummarySettings.endpoints.delete")}
          className="border-danger/30 bg-danger/5 m-4 rounded-lg border p-3"
        >
          <p className="text-sm text-text-primary">
            {t("topicSummarySettings.endpoints.deleteConfirm", { name: endpoint.name })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="neutral"
              appearance="ghost"
              size="sm"
              onClick={() => onConfirmingDeleteChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                vm.deleteEndpoint(endpoint.uuid);
                onConfirmingDeleteChange(false);
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
      ) : null}
      {deleting ? (
        <p role="status" className="px-4 pb-4 text-xs text-text-muted">
          {t("topicSummarySettings.endpoints.deleting")}
        </p>
      ) : null}
    </div>
  );
}

export function EndpointsSettingsSection({ vm }: Readonly<{ vm: UseTopicSummaryEndpointsResult }>) {
  const { t } = useTranslation();
  const [selectedEndpointUuid, setSelectedEndpointUuid] = useState<string | null>(
    vm.endpoints[0]?.uuid ?? null,
  );
  const [deleteCandidateUuid, setDeleteCandidateUuid] = useState<string | null>(null);
  const denied = vm.permission === "denied";
  const loadError = operationErrorText(vm.loadError, t);
  const removeError = operationErrorText(vm.remove.error, t);
  const editorOpen = vm.create.draft != null || vm.edit.draft != null;
  const effectiveSelectedUuid = vm.endpoints.some(
    (endpoint) => endpoint.uuid === selectedEndpointUuid,
  )
    ? selectedEndpointUuid
    : (vm.endpoints[0]?.uuid ?? null);
  const selectedEndpoint =
    vm.endpoints.find((endpoint) => endpoint.uuid === effectiveSelectedUuid) ??
    vm.endpoints[0] ??
    null;

  return (
    <section
      className={`${SECTION_CLASS} flex flex-col`}
      aria-labelledby="topic-summary-endpoints-heading"
    >
      <h3 id="topic-summary-endpoints-heading" className="sr-only">
        {t("topicSummarySettings.endpoints.title")}
      </h3>
      <div className={`${SECTION_BODY_CLASS} min-h-0 flex-1`}>
        {denied ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mb-4`}>
            {t("topicSummarySettings.status.forbidden")}
          </p>
        ) : null}
        {vm.loadStatus === "error" && !denied ? (
          <div
            className={`${ERROR_NOTICE_CLASS} flex flex-wrap items-center justify-between gap-2`}
          >
            <p role="alert">{loadError ?? t("topicSummarySettings.endpoints.loadFailed")}</p>
            <Button
              type="button"
              variant="neutral"
              appearance="ghost"
              size="sm"
              onClick={vm.reload}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <div className="grid min-h-[31rem] gap-5 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-card-bg p-4">
            <div className="flex items-center justify-between gap-2 pb-3">
              <span className="text-sm font-semibold text-text-primary">
                {t("topicSummarySettings.endpoints.configuredCount", {
                  count: vm.endpoints.length,
                })}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={vm.permission !== "allowed" || editorOpen}
                onClick={vm.startCreate}
              >
                {t("topicSummarySettings.endpoints.addShort")}
              </Button>
            </div>
            {vm.loadStatus === "idle" || vm.loadStatus === "loading" ? (
              <p role="status" className="px-2 py-3 text-sm text-text-muted">
                {t("topicSummarySettings.endpoints.loading")}
              </p>
            ) : null}
            {vm.loadStatus === "ready" && vm.endpoints.length === 0 ? (
              <p className="px-2 py-5 text-center text-sm text-text-muted">
                {t("topicSummarySettings.endpoints.empty")}
              </p>
            ) : null}
            {vm.endpoints.length > 0 ? (
              <ul className="space-y-3">
                {vm.endpoints.map((endpoint) => (
                  <EndpointListItem
                    key={endpoint.uuid}
                    endpoint={endpoint}
                    selected={selectedEndpoint?.uuid === endpoint.uuid}
                    disabled={editorOpen}
                    onSelect={() => {
                      setSelectedEndpointUuid(endpoint.uuid);
                      setDeleteCandidateUuid(null);
                    }}
                  />
                ))}
              </ul>
            ) : null}
            <p className="mt-auto pt-3 text-[11px] text-text-muted">
              {t("topicSummarySettings.endpoints.listHint")}
            </p>
          </aside>
          <div className="min-h-0 overflow-y-auto rounded-xl border border-border-subtle bg-card-bg">
            {vm.create.draft != null ? <EndpointEditor mode="create" vm={vm} /> : null}
            {vm.edit.draft != null ? <EndpointEditor mode="edit" vm={vm} /> : null}
            {!editorOpen && selectedEndpoint != null ? (
              <EndpointDetails
                endpoint={selectedEndpoint}
                vm={vm}
                confirmingDelete={deleteCandidateUuid === selectedEndpoint.uuid}
                onConfirmingDeleteChange={(confirming) =>
                  setDeleteCandidateUuid(confirming ? selectedEndpoint.uuid : null)
                }
              />
            ) : null}
            {!editorOpen && selectedEndpoint == null && vm.loadStatus === "ready" ? (
              <div className="flex min-h-[28rem] items-center justify-center p-6 text-center text-sm text-text-muted">
                {t("topicSummarySettings.endpoints.emptyHint")}
              </div>
            ) : null}
          </div>
        </div>
        {removeError != null ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mt-4`}>
            {removeError}
          </p>
        ) : null}
        {vm.create.status === "success" ||
        vm.edit.status === "success" ||
        vm.remove.status === "success" ? (
          <p role="status" className="mt-4 text-sm text-call-green">
            {t("topicSummarySettings.status.saved")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
