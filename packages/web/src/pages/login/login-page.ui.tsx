import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { fetchApiKey, fetchServerSettings } from "~/shared/api/zulip-auth";
import { normalizeRealm } from "~/shared/api/zulip-realm.internal";
import { ZulipAuthError } from "~/shared/api/zulip.types";
import { env } from "~/shared/lib/env";
import {
  buildDesktopFlowLoginUrl,
  generateDesktopFlowOtp,
  saveDesktopFlowState,
} from "~/shared/lib/oidc-desktop";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import { getOrganizationFallbackLogoUrl } from "~/shared/lib/organization-branding";
import { isValidRealmUrl, isValidUrl } from "~/shared/lib/validation";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import { Icon } from "~/shared/ui/icon";
import { LoginPageCredentialsForm } from "./login-page-credentials-form.ui";
import { LoginPageExternalAuth } from "./login-page-external-auth.ui";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";
import { LoginPageRealmPreview } from "./login-page-realm-preview.ui";
import { sanitizeInternalRedirectTarget } from "./login-redirect.lib";

type LoginStep = "organization" | "auth";

interface LoginServerSettings {
  realm_base: string;
  realm_name: string;
  /** Resolved for login preview (may be empty when same-origin is blocked in the browser). */
  realm_icon: string;
  /** Raw `realm_icon` from Zulip server_settings (path or absolute URL). */
  realm_icon_raw: string;
  realm_uri: string;
  realm_url: string;
  external_authentication_methods: {
    name: string;
    display_name: string;
    display_icon?: string;
    login_url: string;
  }[];
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const instances = useInstancesStore((s) => s.instances);
  const addInstance = useInstancesStore((s) => s.addInstance);
  const isAddServer = instances.length > 0;
  const realmPrefill = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("realm");
    return raw?.trim() ? raw : null;
  }, [location.search]);

  const [realm, setRealm] = useState(() => realmPrefill ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<LoginStep>("organization");
  const [checkedRealm, setCheckedRealm] = useState<string | null>(null);
  const [serverSettings, setServerSettings] = useState<LoginServerSettings | null>(null);
  const fetchIdRef = useRef(0);
  const pendingAuthRealmRef = useRef<string | null>(null);
  const prefillAutoFetchRef = useRef<string | null>(null);
  const redirectTarget = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const explicit = sanitizeInternalRedirectTarget(searchParams.get("redirectTo"));
    if (explicit) {
      return explicit;
    }
    const { scopedPathname } = extractOrgRouteFromPathname(location.pathname);
    if (!scopedPathname.startsWith("/message/")) {
      return null;
    }
    return sanitizeInternalRedirectTarget(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  const realmTrim = realm.trim();
  const canContinueToAuth = realmTrim.length > 0 && isValidRealmUrl(realmTrim);
  const defaultOrganizationUrl = env.DEFAULT_LOGIN_ORGANIZATION_URL.trim();
  const defaultOrganizationName =
    env.DEFAULT_LOGIN_ORGANIZATION_NAME.trim() || t("auth.defaultOrganizationName");
  const hasDefaultOrganizationButton = defaultOrganizationUrl.length > 0;

  const fetchSettings = useCallback(async (nextRealm: string) => {
    if (!isValidRealmUrl(nextRealm)) {
      setServerSettings(null);
      setCheckedRealm(null);
      return false;
    }

    const id = ++fetchIdRef.current;
    setSettingsLoading(true);

    try {
      const data = await fetchServerSettings(nextRealm);
      if (id !== fetchIdRef.current) {
        return false;
      }
      const realmBase = normalizeRealm(nextRealm);

      const nextSettings =
        data == null
          ? null
          : {
              realm_base: realmBase,
              realm_name: data.realm_name,
              realm_icon: resolveLoginIconUrl(realmBase, data.realm_icon),
              realm_icon_raw: (data.realm_icon ?? "").trim(),
              realm_uri: data.realm_uri,
              realm_url: data.realm_url,
              external_authentication_methods: data.external_authentication_methods,
            };

      setServerSettings(nextSettings);
      setCheckedRealm(nextRealm);

      if (pendingAuthRealmRef.current === nextRealm) {
        pendingAuthRealmRef.current = null;

        if (nextSettings != null) {
          setStep("auth");
        } else {
          setError(t("auth.organizationSettingsLoadError"));
        }
      }

      return true;
    } catch {
      if (id !== fetchIdRef.current) {
        return false;
      }

      setServerSettings(null);
      setCheckedRealm(nextRealm);

      if (pendingAuthRealmRef.current === nextRealm) {
        pendingAuthRealmRef.current = null;
        setError(t("auth.organizationSettingsLoadError"));
      }

      return true;
    } finally {
      if (id === fetchIdRef.current) {
        setSettingsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const prefilledRealm = realmPrefill?.trim() ?? "";
    if (prefilledRealm.length === 0 || realmTrim !== prefilledRealm) {
      return;
    }
    if (prefillAutoFetchRef.current === prefilledRealm) {
      return;
    }
    prefillAutoFetchRef.current = prefilledRealm;
    void fetchSettings(realmTrim);
  }, [fetchSettings, realmPrefill, realmTrim]);

  const handleRealmChange = useCallback(
    (value: string) => {
      const nextRealm = value.trim();
      setRealm(value);
      setError(null);

      if (nextRealm !== checkedRealm) {
        setCheckedRealm(null);
        setServerSettings(null);
        pendingAuthRealmRef.current = null;
        setStep("organization");
      }
    },
    [checkedRealm],
  );

  const handleRealmBlur = useCallback(() => {
    if (realmTrim && isValidRealmUrl(realmTrim)) {
      void fetchSettings(realmTrim);
    }
  }, [fetchSettings, realmTrim]);

  const handleSelectDefaultOrganization = useCallback(() => {
    setRealm(defaultOrganizationUrl);
    setError(null);
    setCheckedRealm(null);
    setServerSettings(null);
    pendingAuthRealmRef.current = null;
    setStep("organization");
  }, [defaultOrganizationUrl]);

  const handleContinueToAuthStep = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      const form = e.currentTarget;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!realmTrim || !isValidRealmUrl(realmTrim)) {
        setError(t("auth.invalidServerUrl"));
        return;
      }

      pendingAuthRealmRef.current = realmTrim;

      if (checkedRealm === realmTrim) {
        pendingAuthRealmRef.current = null;

        if (serverSettings != null) {
          setStep("auth");
          return;
        }

        setError(t("auth.organizationSettingsLoadError"));
        return;
      }

      if (!settingsLoading) {
        void fetchSettings(realmTrim);
      }
    },
    [checkedRealm, fetchSettings, realmTrim, serverSettings, settingsLoading],
  );

  const handleBackToOrganizationStep = useCallback(() => {
    pendingAuthRealmRef.current = null;
    setError(null);
    setStep("organization");
  }, []);

  const handleRealmLogoError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const currentSrc = e.currentTarget.getAttribute("src") ?? "";
    if (currentSrc.includes("organization-fallback.svg")) return;
    e.currentTarget.src = getOrganizationFallbackLogoUrl();
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const usernameTrim = username.trim();
    if (!realmTrim || !usernameTrim || !password) {
      setError(t("auth.fillAllFields"));
      return;
    }
    if (!isValidRealmUrl(realmTrim)) {
      setError(t("auth.invalidServerUrl"));
      return;
    }
    setLoading(true);
    try {
      const result = await fetchApiKey(realmTrim, usernameTrim, password);
      const normalizedFromInput = normalizeRealm(realmTrim);
      const canonicalFromServer =
        [serverSettings?.realm_url?.trim(), serverSettings?.realm_uri?.trim()].find(
          (part) => (part?.length ?? 0) > 0,
        ) ?? "";
      const realmToStore =
        canonicalFromServer.length > 0 && isValidRealmUrl(canonicalFromServer)
          ? normalizeRealm(canonicalFromServer)
          : normalizedFromInput;
      const rawRealmIcon = serverSettings?.realm_icon_raw?.trim() ?? "";
      const realmIcon =
        serverSettings?.realm_base === normalizedFromInput && rawRealmIcon.length > 0
          ? rawRealmIcon
          : undefined;
      const workspaceOrgOrigin = workspaceOrgOriginFromLoginServerUrlInput(realmTrim);
      const addInstanceResult = addInstance({
        realm: realmToStore,
        email: result.email,
        apiKey: result.api_key,
        realmIcon,
        ...(workspaceOrgOrigin !== "" ? { workspaceOrgOrigin } : {}),
      });
      if (addInstanceResult.status === "duplicate") {
        setError(t("auth.duplicateAccount"));
        return;
      }
      void navigate(redirectTarget ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof ZulipAuthError ? err.message : t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const handleStartOidcFlow = useCallback(
    (loginPath: string) => {
      try {
        const normalizedRealm = normalizeRealm(serverSettings?.realm_base ?? realmTrim);
        if (!isValidRealmUrl(normalizedRealm)) {
          setError(t("auth.invalidServerUrl"));
          return;
        }

        const otp = generateDesktopFlowOtp();
        let loginUrl: string;
        try {
          loginUrl = buildDesktopFlowLoginUrl({
            realmBaseUrl: normalizedRealm,
            loginPath,
            next: "/",
            desktopFlowOtp: otp,
          });
        } catch {
          setError(t("auth.loginError"));
          return;
        }
        if (!isValidUrl(loginUrl)) {
          setError(t("auth.loginError"));
          return;
        }

        saveDesktopFlowState({
          realm: normalizedRealm,
          otp,
          createdAt: Date.now(),
        });
        window.open(loginUrl, "_blank", "noopener,noreferrer");
        const params = new URLSearchParams({ realm: normalizedRealm });
        if (redirectTarget != null) {
          params.set("redirectTo", redirectTarget);
        }
        void navigate(`/paste-token?${params.toString()}`);
      } catch {
        setError(t("auth.loginError"));
      }
    },
    [navigate, realmTrim, redirectTarget, serverSettings?.realm_base],
  );

  const toggleShowPassword = useCallback(() => {
    setShowPassword((p) => !p);
  }, []);

  const title = isAddServer ? t("auth.addServerZulip") : t("auth.connectToZulip");
  const description =
    step === "organization" ? t("auth.organizationStepHint") : t("auth.authStepHint");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        {isAddServer && (
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="flex items-center gap-2 self-start text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <Icon name="chevron-right" size={16} className="rotate-180" />
            {t("common.back")}
          </button>
        )}
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>

        {serverSettings != null &&
          (Boolean(serverSettings.realm_name) || serverSettings.realm_icon.length > 0) && (
            <LoginPageRealmPreview
              realmName={serverSettings.realm_name ?? ""}
              realmIcon={serverSettings.realm_icon}
              onLogoError={handleRealmLogoError}
            />
          )}

        {step === "organization" ? (
          <form onSubmit={handleContinueToAuthStep} className="flex flex-col gap-4">
            <FormField label={t("auth.zulipServerUrl")} htmlFor="realm">
              <input
                id="realm"
                type="url"
                inputMode="url"
                autoComplete="url"
                required
                placeholder={t("auth.zulipServerUrlHint")}
                value={realm}
                onChange={(e) => handleRealmChange(e.target.value)}
                onBlur={handleRealmBlur}
                className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>

            {hasDefaultOrganizationButton && (
              <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-3">
                <p className="text-sm text-text-muted">{t("auth.defaultOrganizationHint")}</p>
                <button
                  type="button"
                  onClick={handleSelectDefaultOrganization}
                  className="hover:bg-bg-elevated/60 flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg px-4 py-2.5 text-sm font-medium text-text-primary transition-colors"
                >
                  <img
                    src={getOrganizationFallbackLogoUrl()}
                    alt=""
                    className="h-[18px] w-[18px] rounded object-contain"
                    aria-hidden="true"
                  />
                  {defaultOrganizationName}
                </button>
              </div>
            )}

            {error != null && error.length > 0 && (
              <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
                {error}
              </div>
            )}

            <Button type="submit" disabled={!canContinueToAuth} className="w-full">
              {settingsLoading ? t("auth.organizationStepLoading") : t("common.next")}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {serverSettings != null &&
              serverSettings.external_authentication_methods.length > 0 && (
                <LoginPageExternalAuth
                  realmBase={serverSettings.realm_base}
                  methods={serverSettings.external_authentication_methods}
                  onSelectLoginPath={handleStartOidcFlow}
                />
              )}

            <LoginPageCredentialsForm
              username={username}
              password={password}
              showPassword={showPassword}
              loading={loading}
              error={error}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onToggleShowPassword={toggleShowPassword}
              onSubmit={handleSubmit}
            />

            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToOrganizationStep}
              disabled={loading}
              className="w-full"
            >
              {t("common.back")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
