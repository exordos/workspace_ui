import { useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import type { WorkspaceTopicSummaryEndpointDto } from "~/shared/api/messenger-topic-summary-management.types";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import {
  ERROR_NOTICE_CLASS,
  INPUT_CLASS,
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_HEADER_CLASS,
  endpointValidationErrorText,
  operationErrorText,
} from "./topic-summary-settings-shared.lib";
import { SectionHeading, SwitchRow } from "./topic-summary-settings-shared.ui";
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
    <div className="border-accent/30 mb-4 overflow-hidden rounded-xl border bg-bg-elevated">
      <div className="border-b border-border-subtle bg-accent-soft px-4 py-3">
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
          id={`endpoint-${mode}-max-tokens`}
          label={t("topicSummarySettings.endpoints.maxOutputTokens")}
          value={draft.maxOutputTokens}
          min={1}
          max={32_768}
          disabled={pending}
          error={endpointValidationErrorText(operation.validationErrors.maxOutputTokens, t)}
          onChange={(value) => setField("maxOutputTokens", value)}
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
        <div className="grid gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle md:col-span-2 md:grid-cols-3">
          <div className="bg-bg">
            <SwitchRow
              checked={draft.enabled}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.enabled")}
              onChange={(value) => setField("enabled", value)}
            />
          </div>
          <div className="bg-bg">
            <SwitchRow
              checked={draft.supportsVision}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.supportsVision")}
              onChange={(value) => setField("supportsVision", value)}
            />
          </div>
          <div className="bg-bg">
            <SwitchRow
              checked={draft.supportsReasoning}
              disabled={pending}
              label={t("topicSummarySettings.endpoints.supportsReasoning")}
              onChange={(value) => setField("supportsReasoning", value)}
            />
          </div>
        </div>
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
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4 md:col-span-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={cancel}>
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

function EndpointCard({
  endpoint,
  vm,
  deleteCandidate,
  onDeleteCandidateChange,
}: Readonly<{
  endpoint: WorkspaceTopicSummaryEndpointDto;
  vm: UseTopicSummaryEndpointsResult;
  deleteCandidate: string | null;
  onDeleteCandidateChange: (uuid: string | null) => void;
}>) {
  const { t } = useTranslation();
  const deleting = vm.remove.endpointUuid === endpoint.uuid && vm.remove.status === "pending";
  const confirming = deleteCandidate === endpoint.uuid;
  const endpointActionsDisabled = deleting || vm.permission !== "allowed";

  return (
    <li className="hover:border-accent/30 rounded-xl border border-border-subtle bg-bg-elevated p-4 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm text-text-primary">{endpoint.name}</strong>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                endpoint.enabled ? "bg-call-green/10 text-call-green" : "bg-bg text-text-muted"
              }`}
            >
              {endpoint.enabled
                ? t("topicSummarySettings.endpoints.enabled")
                : t("message.topicSummary.disabled")}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="rounded-md bg-bg px-2 py-1 font-medium text-text-secondary">
              {endpoint.model}
            </span>
            <span className="min-w-0 break-all">{endpoint.base_url}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
            <span className="rounded-md border border-border-subtle px-2 py-1">
              {endpoint.credential_present
                ? t("topicSummarySettings.endpoints.credentialStored")
                : t("topicSummarySettings.endpoints.credentialMissing")}
            </span>
            <span className="rounded-md border border-border-subtle px-2 py-1">
              {t("topicSummarySettings.endpoints.failures", { count: endpoint.failure_count })}
            </span>
            {endpoint.last_error_code != null ? (
              <span className="border-danger/30 bg-danger/5 rounded-md border px-2 py-1 text-danger">
                {t("topicSummarySettings.endpoints.lastError", {
                  code: endpoint.last_error_code,
                })}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={endpointActionsDisabled}
            onClick={() => vm.startEdit(endpoint.uuid)}
          >
            {t("topicSummarySettings.endpoints.edit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={endpointActionsDisabled}
            onClick={() => onDeleteCandidateChange(endpoint.uuid)}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
      {confirming ? (
        <div
          role="alertdialog"
          aria-label={t("topicSummarySettings.endpoints.delete")}
          className="border-danger/30 bg-danger/5 mt-3 rounded-lg border p-3"
        >
          <p className="text-sm text-text-primary">
            {t("topicSummarySettings.endpoints.deleteConfirm", { name: endpoint.name })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDeleteCandidateChange(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                vm.deleteEndpoint(endpoint.uuid);
                onDeleteCandidateChange(null);
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
      ) : null}
      {deleting ? (
        <p role="status" className="mt-2 text-xs text-text-muted">
          {t("topicSummarySettings.endpoints.deleting")}
        </p>
      ) : null}
    </li>
  );
}

export function EndpointsSettingsSection({ vm }: Readonly<{ vm: UseTopicSummaryEndpointsResult }>) {
  const { t } = useTranslation();
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const denied = vm.permission === "denied";
  const loadError = operationErrorText(vm.loadError, t);
  const removeError = operationErrorText(vm.remove.error, t);

  return (
    <section className={SECTION_CLASS} aria-labelledby="topic-summary-endpoints-heading">
      <div className={`${SECTION_HEADER_CLASS} flex flex-wrap items-center justify-between gap-3`}>
        <div id="topic-summary-endpoints-heading" className="min-w-0 flex-1">
          <SectionHeading
            icon="language"
            title={t("topicSummarySettings.endpoints.title")}
            description={t("topicSummarySettings.endpoints.description")}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={vm.permission !== "allowed"}
          onClick={vm.startCreate}
        >
          {t("topicSummarySettings.endpoints.add")}
        </Button>
      </div>
      <div className={SECTION_BODY_CLASS}>
        {denied ? (
          <p role="alert" className={`${ERROR_NOTICE_CLASS} mb-4`}>
            {t("topicSummarySettings.status.forbidden")}
          </p>
        ) : null}
        {vm.create.draft != null ? <EndpointEditor mode="create" vm={vm} /> : null}
        {vm.edit.draft != null ? <EndpointEditor mode="edit" vm={vm} /> : null}
        {vm.loadStatus === "idle" || vm.loadStatus === "loading" ? (
          <p role="status" className="text-sm text-text-muted">
            {t("topicSummarySettings.endpoints.loading")}
          </p>
        ) : null}
        {vm.loadStatus === "error" && !denied ? (
          <div
            className={`${ERROR_NOTICE_CLASS} flex flex-wrap items-center justify-between gap-2`}
          >
            <p role="alert">{loadError ?? t("topicSummarySettings.endpoints.loadFailed")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={vm.reload}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {vm.loadStatus === "ready" && vm.endpoints.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-text-muted">
            {t("topicSummarySettings.endpoints.empty")}
          </div>
        ) : null}
        {vm.endpoints.length > 0 ? (
          <ul className="space-y-3">
            {vm.endpoints.map((endpoint) => (
              <EndpointCard
                key={endpoint.uuid}
                endpoint={endpoint}
                vm={vm}
                deleteCandidate={deleteCandidate}
                onDeleteCandidateChange={setDeleteCandidate}
              />
            ))}
          </ul>
        ) : null}
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
