import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import licensesData from "~/generated/licenses.json";
import { t } from "~/i18n/i18n";
import { DEFAULT_MESSENGER_STREAM_SLUG } from "~/shared/config/constants";
import { brand } from "~/shared/lib/brand";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { useNavigationHistory } from "~/shared/lib/navigation-history";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { Icon } from "~/shared/ui/icon";
import type { LicenseEntry } from "./licenses-page.types";

const licenses = licensesData as LicenseEntry[];

export const LicensesPage: React.FC = () => {
  const navigate = useNavigate();
  const { goBack, canGoBack } = useNavigationHistory();
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const [search, setSearch] = useState("");
  const [filterLicense, setFilterLicense] = useState("");

  const handleClose = useCallback(() => {
    if (canGoBack) {
      goBack();
      return;
    }
    const fallbackPath = withCurrentOrgRoute(
      resolveMessengerNavigationPath(currentInstanceId, DEFAULT_MESSENGER_STREAM_SLUG),
    );
    void navigate(fallbackPath);
  }, [canGoBack, currentInstanceId, goBack, navigate]);

  const licenseTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of licenses) {
      counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return licenses.filter((e) => {
      if (filterLicense && e.license !== filterLicense) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.publisher.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [search, filterLicense]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-6 py-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-text-primary">{t("licenses.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("licenses.subtitle", { appName: brand.appName, count: licenses.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
          aria-label={t("common.close")}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {licenseTypes.slice(0, 8).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setFilterLicense(filterLicense === type ? "" : type)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterLicense === type
                ? "bg-accent text-on-accent"
                : "bg-card-bg text-text-secondary hover:bg-card-bg-active"
            }`}
          >
            {type} ({count})
          </button>
        ))}
        {filterLicense && (
          <button
            onClick={() => setFilterLicense("")}
            className="rounded-full bg-card-bg px-3 py-1 text-xs text-text-muted hover:bg-card-bg-active"
          >
            {t("licenses.reset")}
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder={t("licenses.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-md rounded-lg bg-text-field-bg px-4 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
      />

      <p className="mb-2 text-xs text-text-muted">
        {t("licenses.packagesOf", { filtered: filtered.length, total: licenses.length })}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-bg text-xs text-text-muted">
            <tr>
              <th className="pb-2 pr-4 font-medium">{t("licenses.package")}</th>
              <th className="pb-2 pr-4 font-medium">{t("licenses.version")}</th>
              <th className="pb-2 pr-4 font-medium">{t("licenses.license")}</th>
              <th className="pb-2 font-medium">{t("licenses.author")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={`${entry.name}@${entry.version}`} className="border-t border-border-subtle">
                <td className="py-2 pr-4">
                  {entry.repository ? (
                    <a
                      href={entry.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {entry.name}
                    </a>
                  ) : (
                    <span className="text-text-primary">{entry.name}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-text-muted">{entry.version}</td>
                <td className="py-2 pr-4">
                  <span className="rounded bg-card-bg px-2 py-0.5 text-xs text-text-secondary">
                    {entry.license}
                  </span>
                </td>
                <td className="py-2 text-text-muted">{entry.publisher}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
