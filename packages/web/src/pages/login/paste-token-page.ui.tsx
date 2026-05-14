import React, { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { exchangeDesktopFlowToken } from "~/shared/api/zulip-auth";
import { readText } from "~/shared/lib/clipboard";
import {
  clearDesktopFlowState,
  decryptDesktopFlowToken,
  loadDesktopFlowState,
  parseDesktopFlowCredentials,
  parseDesktopFlowLoginToken,
} from "~/shared/lib/oidc-desktop";
import { isValidRealmUrl } from "~/shared/lib/validation";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { sanitizeInternalRedirectTarget } from "./login-redirect.lib";

function normalizeRealm(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "");
}

export const PasteTokenPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const addInstance = useInstancesStore((s) => s.addInstance);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const realm = useMemo(() => normalizeRealm(searchParams.get("realm") ?? ""), [searchParams]);
  const redirectTarget = useMemo(() => {
    return sanitizeInternalRedirectTarget(searchParams.get("redirectTo")) ?? "/";
  }, [searchParams]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await readText();
      const trimmed = text?.trim();
      if (trimmed != null && trimmed.length > 0) {
        setCode(trimmed);
      }
    } catch {
      /* clipboard permissions may be denied */
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!realm || !isValidRealmUrl(realm)) {
      setError(t("auth.invalidServerUrl"));
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError(t("auth.fillAllFields"));
      return;
    }

    setLoading(true);
    try {
      const flowState = loadDesktopFlowState(realm) ?? loadDesktopFlowState();
      let payload = trimmedCode;
      if (flowState) {
        try {
          payload = await decryptDesktopFlowToken(trimmedCode, flowState.otp);
        } catch {
          payload = trimmedCode;
        }
      }

      const credentials = parseDesktopFlowCredentials(payload);
      const workspaceOrgOrigin = workspaceOrgOriginFromLoginServerUrlInput(realm);
      const orgFields = workspaceOrgOrigin !== "" ? { workspaceOrgOrigin } : {};
      if (credentials) {
        addInstance({
          realm,
          email: credentials.email,
          apiKey: credentials.apiKey,
          authType: "api_key",
          ...orgFields,
        });
      } else {
        const loginToken = parseDesktopFlowLoginToken(payload);
        if (!loginToken) {
          if (!flowState) {
            setError(t("auth.pasteTokenMissingFlow"));
            return;
          }
          setError(t("auth.pasteTokenUnsupported"));
          return;
        }
        const exchanged = await exchangeDesktopFlowToken(realm, loginToken);
        addInstance({
          realm,
          email: exchanged.email,
          apiKey: exchanged.authType === "api_key" ? (exchanged.apiKey ?? "") : "",
          authType: exchanged.authType,
          ...orgFields,
        });
      }
      clearDesktopFlowState();
      void navigate(redirectTarget, { replace: true });
    } catch {
      setError(t("auth.pasteTokenInvalid"));
    } finally {
      setLoading(false);
    }
  }, [addInstance, code, navigate, realm, redirectTarget]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <button
          type="button"
          onClick={() => void navigate(`/login?realm=${encodeURIComponent(realm)}`)}
          className="flex items-center gap-2 self-start text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon name="chevron-right" size={16} className="rotate-180" />
          {t("common.back")}
        </button>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">{t("auth.pasteTokenTitle")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("auth.pasteTokenHint")}</p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-elevated p-4">
          <label htmlFor="auth-code" className="text-sm font-medium text-text-primary">
            {t("auth.pasteTokenLabel")}
          </label>
          <textarea
            id="auth-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("auth.pasteTokenPlaceholder")}
            className="min-h-[120px] w-full rounded-lg border border-border-subtle bg-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handlePaste}
              className="text-sm text-text-muted transition-colors hover:text-text-primary"
              disabled={loading}
            >
              {t("auth.pasteTokenPaste")}
            </button>
          </div>
        </div>

        {error && (
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {error}
          </div>
        )}

        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || !code.trim()}
        >
          {loading ? t("auth.loginLoading") : t("auth.login")}
        </Button>
      </div>
    </div>
  );
};
