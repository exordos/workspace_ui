import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  completeWorkspaceProjectLogin,
  fetchWorkspaceServerSettingsForOrganization,
  prepareWorkspaceProjectLogin,
  type PreparedWorkspaceProjectLogin,
  WorkspaceAuthFlowError,
} from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { isWorkspaceIamOtpRequiredError } from "~/shared/api/workspace-iam-auth";
import { env } from "~/shared/lib/env";
import { getOrganizationFallbackLogoUrl } from "~/shared/lib/organization-branding";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import {
  parseWorkspaceMessengerRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import { Icon } from "~/shared/ui/icon";
import { LoginPageCredentialsForm } from "./login-page-credentials-form.ui";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";
import { LoginPageOtpForm } from "./login-page-otp-form.ui";
import { LoginPageProjectForm } from "./login-page-project-form.ui";
import { LoginPageRealmPreview } from "./login-page-realm-preview.ui";
import { sanitizeInternalRedirectTarget } from "./login-redirect.lib";

type LoginStep = "organization" | "credentials" | "otp" | "project";

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
  const sessions = useWorkspaceAuthStore((s) => s.sessions);
  const isAddServer = sessions.length > 0;
  const realmPrefill = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("realm");
    return raw?.trim() ? raw : null;
  }, [location.search]);

  const [realm, setRealm] = useState(() => realmPrefill ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [projectId, setProjectId] = useState("");
  const [preparedLogin, setPreparedLogin] = useState<PreparedWorkspaceProjectLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
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
    const workspaceRoute = parseWorkspaceMessengerRoute(location.pathname);
    if (workspaceRoute?.kind !== "message") {
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
      const data = await fetchWorkspaceServerSettingsForOrganization(nextRealm);
      if (id !== fetchIdRef.current) {
        return false;
      }
      const realmBase = normalizeServerBaseUrl(nextRealm);

      const nextSettings = {
        realm_base: realmBase,
        realm_name: data.realm_name,
        realm_icon: resolveLoginIconUrl(realmBase, data.realm_icon),
        realm_icon_raw: (data.realm_icon ?? "").trim(),
        realm_uri: data.realm_uri,
        realm_url: data.realm_url,
        external_authentication_methods: [],
      };

      setServerSettings(nextSettings);
      setCheckedRealm(nextRealm);

      if (pendingAuthRealmRef.current === nextRealm) {
        pendingAuthRealmRef.current = null;

        if (nextSettings != null) {
          setStep("credentials");
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
        setPreparedLogin(null);
        setProjectId("");
        setOtpCode("");
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
    setPreparedLogin(null);
    setProjectId("");
    setOtpCode("");
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
          setStep("credentials");
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
    setPreparedLogin(null);
    setProjectId("");
    setOtpCode("");
    setStep("organization");
  }, []);

  const handleRealmLogoError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const currentSrc = e.currentTarget.getAttribute("src") ?? "";
    if (currentSrc.includes("organization-fallback.svg")) return;
    e.currentTarget.src = getOrganizationFallbackLogoUrl();
  }, []);

  const handleCredentialsSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
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
      const nextPreparedLogin = await prepareWorkspaceProjectLogin({
        organizationUrl: realmTrim,
        login: usernameTrim,
        password,
      });
      setPreparedLogin(nextPreparedLogin);
      setPassword("");
      setOtpCode("");
      setProjectId(nextPreparedLogin.projects[0]?.id ?? "");
      setStep("project");
    } catch (err) {
      if (isWorkspaceIamOtpRequiredError(err)) {
        setOtpCode("");
        setStep("otp");
      } else {
        setError(err instanceof WorkspaceAuthFlowError ? err.message : t("auth.loginError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const usernameTrim = username.trim();
    if (!realmTrim || !usernameTrim || !password || otpCode.length !== 6) {
      setError(t("auth.fillAllFields"));
      return;
    }

    setLoading(true);
    try {
      const nextPreparedLogin = await prepareWorkspaceProjectLogin({
        organizationUrl: realmTrim,
        login: usernameTrim,
        password,
        otpCode,
      });
      setPreparedLogin(nextPreparedLogin);
      setPassword("");
      setOtpCode("");
      setProjectId(nextPreparedLogin.projects[0]?.id ?? "");
      setStep("project");
    } catch (err) {
      if (isWorkspaceIamOtpRequiredError(err)) {
        setOtpCode("");
        setError(t("auth.invalidOtp"));
      } else {
        setError(err instanceof WorkspaceAuthFlowError ? err.message : t("auth.loginError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (preparedLogin == null || projectId.length === 0) {
      setError(t("auth.selectProjectPlaceholder"));
      return;
    }

    setLoading(true);
    try {
      const { session } = await completeWorkspaceProjectLogin({ preparedLogin, projectId });
      const nextRoute =
        redirectTarget ?? workspaceMessengerRootRoute(session.organizationId, session.projectId);
      void navigate(nextRoute, { replace: true });
    } catch (err) {
      setError(err instanceof WorkspaceAuthFlowError ? err.message : t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCredentialsStep = useCallback(() => {
    setError(null);
    setPreparedLogin(null);
    setProjectId("");
    setStep("credentials");
  }, []);

  const handleBackToCredentialsFromOtp = useCallback(() => {
    setError(null);
    setOtpCode("");
    setStep("credentials");
  }, []);

  // Нейтральные ключи без бренда Zulip: «добавить сервер» / «подключение к серверу».
  const title = isAddServer ? t("auth.addServer") : t("auth.connectToZulip");
  const descriptionByStep: Record<LoginStep, string> = {
    organization: t("auth.organizationStepHint"),
    credentials: t("auth.authStepHint"),
    otp: t("auth.otpStepHint"),
    project: t("auth.projectStepHint"),
  };
  const description = descriptionByStep[step];

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

        {step === "organization" && (
          <form onSubmit={handleContinueToAuthStep} className="flex flex-col gap-4">
            <FormField label={t("auth.serverUrl")} htmlFor="realm">
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
        )}
        {step === "credentials" && (
          <div className="flex flex-col gap-4">
            <LoginPageCredentialsForm
              username={username}
              password={password}
              loading={loading}
              error={error}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onSubmit={handleCredentialsSubmit}
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
        {step === "project" && (
          <div className="flex flex-col gap-4">
            <LoginPageProjectForm
              projects={preparedLogin?.projects ?? []}
              projectId={projectId}
              loading={loading}
              error={error}
              onProjectChange={setProjectId}
              onSubmit={handleProjectSubmit}
            />

            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToCredentialsStep}
              disabled={loading}
              className="w-full"
            >
              {t("common.back")}
            </Button>
          </div>
        )}
        {step === "otp" && (
          <div className="flex flex-col gap-4">
            <LoginPageOtpForm
              otpCode={otpCode}
              loading={loading}
              error={error}
              onOtpCodeChange={setOtpCode}
              onSubmit={handleOtpSubmit}
            />

            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToCredentialsFromOtp}
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
