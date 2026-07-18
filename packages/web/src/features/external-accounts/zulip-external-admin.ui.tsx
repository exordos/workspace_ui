import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "~/i18n/i18n";
import { AccessibleAlertDialog } from "~/shared/ui/accessible-alert-dialog.ui";
import {
  changeExternalBridgeInstanceStatus,
  changeZulipExternalProviderSuspension,
  fetchZulipExternalBridgeInstances,
  fetchZulipExternalProviderHealth,
  fetchZulipExternalProviderPolicy,
  updateZulipExternalProviderPolicy,
} from "./external-accounts.api";
import type {
  ExternalBridgeInstance,
  ExternalProviderHealth,
  ExternalProviderLimits,
  ExternalProviderPolicy,
} from "./external-accounts.types";

function splitPemCertificates(value: string): string[] {
  const matches = value.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches?.map((certificate) => `${certificate.trim()}\n`) ?? [];
}

function countSummary(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
}

interface BridgeInstanceRowProps {
  instance: ExternalBridgeInstance;
  onChanged: (instance: ExternalBridgeInstance) => void;
  onError: () => void;
}

const BridgeInstanceRow = React.memo<BridgeInstanceRowProps>(function BridgeInstanceRow({
  instance,
  onChanged,
  onError,
}) {
  const [saving, setSaving] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState(false);
  const invoke = useCallback(
    (action: "suspend" | "resume" | "revoke") => {
      if (saving) return;
      setSaving(true);
      void changeExternalBridgeInstanceStatus(instance.uuid, action)
        .then((result) => (result.ok ? onChanged(result.value) : onError()))
        .catch(onError)
        .finally(() => setSaving(false));
    },
    [instance.uuid, onChanged, onError, saving],
  );

  return (
    <li
      className="rounded-lg border border-border-subtle bg-bg p-3"
      data-testid={`external-bridge-instance-${instance.uuid}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p
            className="text-sm font-medium text-text-primary"
            data-testid={`external-bridge-instance-status-${instance.uuid}`}
          >
            {instance.status}
          </p>
          <p className="text-xs text-text-secondary">
            {t("settings.externalBridgeGeneration", { generation: instance.identityGeneration })}
          </p>
          {instance.lastHeartbeatAt != null && (
            <p className="text-xs text-text-secondary">{instance.lastHeartbeatAt}</p>
          )}
          {instance.safeError != null && (
            <p className="text-xs text-notice-base">{instance.safeError}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {instance.status === "suspended" ? (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
              disabled={saving}
              onClick={() => invoke("resume")}
              data-testid={`external-bridge-instance-resume-${instance.uuid}`}
            >
              {t("settings.externalBridgeResume")}
            </button>
          ) : (
            instance.status !== "revoked" && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
                disabled={saving}
                onClick={() => invoke("suspend")}
                data-testid={`external-bridge-instance-suspend-${instance.uuid}`}
              >
                {t("settings.externalBridgeSuspend")}
              </button>
            )
          )}
          {instance.status !== "revoked" && (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-notice-base px-3 text-sm text-notice-base disabled:opacity-50"
              disabled={saving}
              onClick={() => setRevokeConfirmation(true)}
              data-testid={`external-bridge-instance-revoke-${instance.uuid}`}
            >
              {t("settings.externalBridgeRevoke")}
            </button>
          )}
        </div>
      </div>
      {revokeConfirmation && (
        <AccessibleAlertDialog
          className="mt-3 rounded-lg border border-notice-base bg-bg p-3"
          label={t("settings.externalBridgeRevoke")}
          onDismiss={() => setRevokeConfirmation(false)}
          data-testid={`external-bridge-instance-revoke-confirmation-${instance.uuid}`}
        >
          <p className="text-xs text-text-primary">{t("settings.externalBridgeRevokeWarning")}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-notice-base px-3 text-sm text-on-accent"
              disabled={saving}
              onClick={() => {
                setRevokeConfirmation(false);
                invoke("revoke");
              }}
              data-testid={`external-bridge-instance-revoke-confirm-${instance.uuid}`}
            >
              {t("settings.externalBridgeRevokeConfirm")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
              disabled={saving}
              onClick={() => setRevokeConfirmation(false)}
              data-testid={`external-bridge-instance-revoke-cancel-${instance.uuid}`}
            >
              {t("common.cancel")}
            </button>
          </div>
        </AccessibleAlertDialog>
      )}
    </li>
  );
});

export const ZulipExternalAdminPanel = React.memo(function ZulipExternalAdminPanel() {
  const [policy, setPolicy] = useState<ExternalProviderPolicy | null>(null);
  const [health, setHealth] = useState<ExternalProviderHealth | null>(null);
  const [instances, setInstances] = useState<ExternalBridgeInstance[] | null>(null);
  const [limits, setLimits] = useState<ExternalProviderLimits | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [customCa, setCustomCa] = useState("");
  const [removeCustomCa, setRemoveCustomCa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      fetchZulipExternalProviderPolicy(),
      fetchZulipExternalProviderHealth(),
      fetchZulipExternalBridgeInstances(),
    ])
      .then(([nextPolicy, nextHealth, nextInstances]) => {
        if (disposed) return;
        setPolicy(nextPolicy);
        setHealth(nextHealth);
        setInstances(nextInstances);
        if (nextPolicy != null) {
          setEnabled(nextPolicy.enabled);
          setLimits(nextPolicy.limits);
        }
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const authorized = policy != null || health != null || instances != null;
  const certificateReplacement = useMemo(() => splitPemCertificates(customCa), [customCa]);
  const requiresCaChoice =
    policy?.customCaBundle != null && certificateReplacement.length === 0 && !removeCustomCa;

  const replaceInstance = useCallback((nextInstance: ExternalBridgeInstance) => {
    setInstances(
      (current) =>
        current?.map((instance) =>
          instance.uuid === nextInstance.uuid ? nextInstance : instance,
        ) ?? null,
    );
  }, []);

  const handlePolicySave = useCallback(() => {
    if (policy == null || limits == null || saving || requiresCaChoice) return;
    setSaving(true);
    setError(false);
    void updateZulipExternalProviderPolicy({
      policy,
      enabled,
      limits,
      customCaCertificatesPem:
        removeCustomCa || certificateReplacement.length === 0 ? null : certificateReplacement,
    })
      .then((result) => {
        if (!result.ok) {
          setError(true);
          return;
        }
        setPolicy(result.value);
        setCustomCa("");
        setRemoveCustomCa(false);
      })
      .catch(() => setError(true))
      .finally(() => setSaving(false));
  }, [certificateReplacement, enabled, limits, policy, removeCustomCa, requiresCaChoice, saving]);

  const handleEmergencyToggle = useCallback(() => {
    if (policy == null || saving) return;
    setSaving(true);
    setError(false);
    void changeZulipExternalProviderSuspension(policy.emergencySuspended ? "resume" : "suspend")
      .then((result) => (result.ok ? setPolicy(result.value) : setError(true)))
      .catch(() => setError(true))
      .finally(() => setSaving(false));
  }, [policy, saving]);

  if (!authorized && !error) return null;

  return (
    <section
      className="mt-4 rounded-xl border border-border-subtle bg-card-bg p-4"
      data-testid="zulip-admin-panel"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        {t("settings.externalProviderAdministration")}
      </h3>
      {error && <p className="mt-2 text-xs text-notice-base">{t("settings.externalAdminError")}</p>}
      {health != null && (
        <div
          className="mt-3 rounded-lg bg-bg p-3 text-xs text-text-secondary"
          data-testid="zulip-admin-health"
        >
          <p className="font-medium text-text-primary">{health.status}</p>
          <p>{countSummary(health.accountCounts)}</p>
          <p>{countSummary(health.bridgeCounts)}</p>
          <p>{countSummary(health.operationCounts)}</p>
        </div>
      )}
      {policy != null && limits != null && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-text-primary sm:col-span-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              data-testid="zulip-admin-provider-enabled"
            />
            {t("settings.externalProviderEnabled")}
          </label>
          {(
            [
              ["maxAccounts", "externalMaxAccounts", "max-accounts"],
              ["maxSelectedChatsPerAccount", "externalMaxSelectedChats", "max-selected-chats"],
              ["maxFileBytes", "externalMaxFileBytes", "max-file-bytes"],
            ] as const
          ).map(([field, label, testId]) => (
            <label key={field} className="text-xs text-text-secondary">
              {t(`settings.${label}`)}
              <input
                type="number"
                min={0}
                value={limits[field]}
                onChange={(event) =>
                  setLimits((current) =>
                    current == null
                      ? null
                      : { ...current, [field]: Math.max(0, Number(event.target.value) || 0) },
                  )
                }
                className="mt-1 w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary"
                data-testid={`zulip-admin-limit-${testId}`}
              />
            </label>
          ))}
          <label className="text-xs text-text-secondary sm:col-span-3">
            {t("settings.externalCustomCaReplacement")}
            <textarea
              value={customCa}
              disabled={removeCustomCa}
              onChange={(event) => setCustomCa(event.target.value)}
              className="mt-1 min-h-28 w-full rounded-md border border-border-subtle bg-bg px-2 py-2 font-mono text-xs text-text-primary"
              data-testid="zulip-admin-custom-ca"
            />
          </label>
          {policy.customCaBundle != null && (
            <label className="flex items-center gap-2 text-xs text-text-secondary sm:col-span-3">
              <input
                type="checkbox"
                checked={removeCustomCa}
                onChange={(event) => setRemoveCustomCa(event.target.checked)}
                data-testid="zulip-admin-custom-ca-remove"
              />
              {t("settings.externalCustomCaRemove")}
            </label>
          )}
          {requiresCaChoice && (
            <p
              className="text-xs text-notice-base sm:col-span-3"
              data-testid="zulip-admin-custom-ca-choice-required"
            >
              {t("settings.externalCustomCaReplacementRequired")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-accent px-3 text-sm text-on-accent disabled:opacity-50"
              disabled={saving || requiresCaChoice}
              onClick={handlePolicySave}
              data-testid="zulip-admin-policy-save"
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-notice-base px-3 text-sm text-notice-base disabled:opacity-50"
              disabled={saving}
              onClick={handleEmergencyToggle}
              data-testid={
                policy.emergencySuspended
                  ? "zulip-admin-provider-resume"
                  : "zulip-admin-provider-suspend"
              }
            >
              {policy.emergencySuspended
                ? t("settings.externalProviderResume")
                : t("settings.externalProviderSuspend")}
            </button>
          </div>
        </div>
      )}
      {instances != null && instances.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="zulip-admin-bridge-instances">
          {instances.map((instance) => (
            <BridgeInstanceRow
              key={instance.uuid}
              instance={instance}
              onChanged={replaceInstance}
              onError={() => setError(true)}
            />
          ))}
        </ul>
      )}
    </section>
  );
});
