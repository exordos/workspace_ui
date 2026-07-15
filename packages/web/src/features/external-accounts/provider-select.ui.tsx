import React from "react";
import { t } from "~/i18n/i18n";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import type { WorkspaceProvider } from "./external-accounts.types";

export interface ProviderSelectProps {
  providers: WorkspaceProvider[];
  value: string;
  disabled?: boolean;
  failed?: boolean;
  onChange: (providerUuid: string) => void;
}

export const ProviderSelect: React.FC<ProviderSelectProps> = ({
  providers,
  value,
  disabled = false,
  failed = false,
  onChange,
}) => (
  <label className="block min-w-0">
    <SectionLabel className="mb-1">{t("settings.externalAccountProvider")}</SectionLabel>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      aria-label={t("settings.externalAccountProvider")}
      className="w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">
        {failed
          ? t("settings.externalAccountProviderLoadError")
          : t("settings.externalAccountProviderPlaceholder")}
      </option>
      {providers.map((provider) => (
        <option key={provider.uuid} value={provider.uuid}>
          {provider.name}
        </option>
      ))}
    </select>
  </label>
);
