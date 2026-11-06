import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  completeWorkspaceProjectLogin,
  fetchWorkspaceServerSettingsForOrganization,
  prepareWorkspaceProjectLogin,
  type PreparedWorkspaceProjectLogin,
  WorkspaceAuthFlowError,
} from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { readWorkspaceOrganizationHistory } from "~/entities/workspace-auth/workspace-organization-history.lib";
import { t } from "~/i18n/i18n";
import { isWorkspaceIamOtpRequiredError } from "~/shared/api/workspace-iam-auth";
import { isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import { buildOrgRouteIdFromOrigin } from "~/shared/lib/org-route";
import { getOrganizationFallbackLogoUrl } from "~/shared/lib/organization-branding";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import {
  parseWorkspaceMessengerRoute,
  type WorkspaceMessengerRouteMatch,
} from "~/shared/lib/workspace-messenger-route.lib";
import { parseWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field";
import { Icon } from "~/shared/ui/icon";
import { InputSelector } from "~/shared/ui/input-selector";
import { resolveInitialLoginOrganization } from "./login-initial-organization.lib";
import { LoginPageCredentialsForm } from "./login-page-credentials-form.ui";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";
import { LoginPageOtpForm } from "./login-page-otp-form.ui";
import { LoginPageProjectForm } from "./login-page-project-form.ui";
import { LoginPageRealmPreview } from "./login-page-realm-preview.ui";
import {
  resolveWorkspaceLoginRedirect,
  sanitizeInternalRedirectTarget,
} from "./login-redirect.lib";
import { normalizeLoginRegistrationUrl } from "./login-registration-url.lib";

type LoginStep = "organization" | "credentials" | "otp" | "project";

interface LoginServerSettings {
  organizationOrigin: string;
  realm_name: string;
  realm_icon: string;
  registrationUrl: string | null;
}

export const LoginPage: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  const directRoute = parseWorkspaceMessengerRoute(pathname);
  const directProfile = pathname === "/" && parseWorkspaceProfileShareHash(hash) != null;
  let redirectTarget = sanitizeInternalRedirectTarget(
    new URLSearchParams(search).get("redirectTo"),
  );
  if (directRoute?.kind === "message") {
    redirectTarget = sanitizeInternalRedirectTarget(`${pathname}${search}${hash}`);
  } else if (directProfile) {
    redirectTarget = `/${hash}`;
  }
  const target =
    directRoute?.kind === "message"
      ? directRoute
      : parseWorkspaceMessengerRoute(redirectTarget?.split(/[?#]/, 1)[0] ?? "");
  const messageTarget = target?.kind === "message" ? target : null;
  const profileShare =
    redirectTarget?.startsWith("/#") === true &&
    parseWorkspaceProfileShareHash(redirectTarget.slice(1)) != null;
  const publicEntry = profileShare ? "profile" : "login";

  // A different organization must start with fresh discovery and empty credentials.
  return (
    <OrganizationLogin
      key={messageTarget ? `message:${messageTarget.orgId}` : publicEntry}
      messageTarget={messageTarget}
      profileShare={profileShare}
      redirectTarget={redirectTarget}
    />
  );
};

function OrganizationLogin({
  messageTarget,
  profileShare,
  redirectTarget,
}: {
  readonly messageTarget: Extract<WorkspaceMessengerRouteMatch, { kind: "message" }> | null;
  readonly profileShare: boolean;
  readonly redirectTarget: string | null;
}) {
  const navigate = useNavigate();
  const sessions = useWorkspaceAuthStore((s) => s.sessions);
  const isAddServer = sessions.length > 0;
  const messageOrgId = messageTarget?.orgId;
  const [initialOrganization] = useState(() =>
    resolveInitialLoginOrganization({
      browserOrigin: !isElectron() && typeof window !== "undefined" ? window.location.origin : null,
      defaultOrganizationUrl: env.DEFAULT_LOGIN_ORGANIZATION_URL,
      messageOrgId,
      sessionOrigins: sessions.map((session) => session.organizationOrigin),
      profileShare,
    }),
  );

  const [realm, setRealm] = useState(() => initialOrganization.organizationUrl);
  const [organizationOptions] = useState(() =>
    readWorkspaceOrganizationHistory().map((origin) => ({ value: origin, label: origin })),
  );
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
  const initialOrganizationFetchRef = useRef<string | null>(null);
  const realmTrim = realm.trim();
  const canContinueToAuth = realmTrim.length > 0 && isValidRealmUrl(realmTrim);
  const defaultOrganizationUrl = env.DEFAULT_LOGIN_ORGANIZATION_URL.trim();
  const defaultOrganizationName =
    env.DEFAULT_LOGIN_ORGANIZATION_NAME.trim() || t("auth.defaultOrganizationName");
  const hasDefaultOrganizationButton = defaultOrganizationUrl.length > 0;

  const fetchSettings = useCallback(
    async (nextRealm: string) => {
      if (!isValidRealmUrl(nextRealm)) {
        setServerSettings(null);
        setCheckedRealm(null);
        return false;
      }

      const organizationOrigin = new URL(nextRealm).origin;
      if (messageOrgId != null && buildOrgRouteIdFromOrigin(organizationOrigin) !== messageOrgId) {
        setError(t("messageLinkEntry.wrongAccount"));
        return false;
      }
      const id = ++fetchIdRef.current;
      setSettingsLoading(true);

      try {
        const data = await fetchWorkspaceServerSettingsForOrganization(organizationOrigin);
        if (id !== fetchIdRef.current) {
          return false;
        }
        const nextSettings = {
          organizationOrigin,
          realm_name: data.realm_name,
          realm_icon: resolveLoginIconUrl(normalizeServerBaseUrl(nextRealm), data.realm_icon),
          registrationUrl: normalizeLoginRegistrationUrl(data.registration_url),
        };

        setServerSettings(nextSettings);
        setCheckedRealm(nextRealm);

        if (pendingAuthRealmRef.current === nextRealm) {
          pendingAuthRealmRef.current = null;

          setStep("credentials");
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
    },
    [messageOrgId],
  );

  useEffect(() => {
    const initialRealm = initialOrganization.organizationUrl;
    if (initialRealm.length === 0 || realmTrim !== initialRealm) {
      return;
    }
    if (initialOrganizationFetchRef.current === initialRealm) {
      return;
    }
    initialOrganizationFetchRef.current = initialRealm;
    if (initialOrganization.autoAdvance) {
      pendingAuthRealmRef.current = initialRealm;
    }
    void fetchSettings(realmTrim);
  }, [fetchSettings, initialOrganization, realmTrim]);

  const handleRealmChange = useCallback(
    (value: string) => {
      const nextRealm = value.trim();
      setRealm(value);
      setError(null);

      if (nextRealm !== checkedRealm) {
        ++fetchIdRef.current;
        setSettingsLoading(false);
        setPassword("");
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
    ++fetchIdRef.current;
    setSettingsLoading(false);
    setPassword("");
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
    setPassword("");
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

  const enterProjectStep = (login: PreparedWorkspaceProjectLogin) => {
    setPassword("");
    setOtpCode("");
    if (
      messageTarget != null &&
      (buildOrgRouteIdFromOrigin(login.organizationOrigin) !== messageTarget.orgId ||
        !login.projects.some((project) => project.id === messageTarget.projectId))
    ) {
      setStep("organization");
      setError(t("messageLinkEntry.wrongAccount"));
      return;
    }
    setPreparedLogin(login);
    setProjectId(messageTarget?.projectId ?? login.projects[0]?.id ?? "");
    setStep("project");
  };
  const handleCredentialsSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const usernameTrim = username.trim();
    if (serverSettings == null || !usernameTrim || !password) {
      setError(t("auth.fillAllFields"));
      return;
    }
    setLoading(true);
    try {
      const nextPreparedLogin = await prepareWorkspaceProjectLogin({
        organizationUrl: serverSettings.organizationOrigin,
        login: usernameTrim,
        password,
      });
      enterProjectStep(nextPreparedLogin);
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
    if (serverSettings == null || !usernameTrim || !password || otpCode.length !== 6) {
      setError(t("auth.fillAllFields"));
      return;
    }

    setLoading(true);
    try {
      const nextPreparedLogin = await prepareWorkspaceProjectLogin({
        organizationUrl: serverSettings.organizationOrigin,
        login: usernameTrim,
        password,
        otpCode,
      });
      enterProjectStep(nextPreparedLogin);
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

    if (
      messageTarget != null &&
      (projectId !== messageTarget.projectId ||
        buildOrgRouteIdFromOrigin(preparedLogin.organizationOrigin) !== messageTarget.orgId)
    ) {
      setError(t("messageLinkEntry.wrongAccount"));
      return;
    }
    setLoading(true);
    try {
      const { session } = await completeWorkspaceProjectLogin({ preparedLogin, projectId });
      const nextRoute = resolveWorkspaceLoginRedirect({
        redirectTarget,
        organizationId: session.organizationId,
        projectId: session.projectId,
      });
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
        {(step !== "organization" || isAddServer) && (
          <button
            type="button"
            disabled={step !== "organization" && loading}
            onClick={
              step === "organization"
                ? () => navigate("/", { replace: true })
                : handleBackToOrganizationStep
            }
            className="flex items-center gap-2 self-start text-sm text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="chevron-right" size={16} className="rotate-180" />
            {step === "organization" ? t("common.back") : t("auth.organization")}
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
              <InputSelector
                id="realm"
                type="url"
                inputMode="url"
                autoComplete="url"
                required
                placeholder={t("auth.zulipServerUrlHint")}
                value={realm}
                onValueChange={handleRealmChange}
                options={organizationOptions}
                searchable
                onBlur={handleRealmBlur}
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

            {serverSettings?.registrationUrl != null && (
              <div className="flex flex-col gap-2 text-center text-sm text-text-muted">
                <p>{t("auth.registrationHint")}</p>
                <a
                  href={serverSettings.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-bg-elevated/60 inline-flex h-9 w-full items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated px-4 font-medium text-text-primary transition-colors"
                >
                  {t("auth.register")}
                </a>
              </div>
            )}
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
              variant="neutral"
              appearance="ghost"
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
              variant="neutral"
              appearance="ghost"
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
}
