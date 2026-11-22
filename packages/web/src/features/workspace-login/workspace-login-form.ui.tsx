import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  completeWorkspaceProjectLogin,
  fetchWorkspaceServerSettingsForOrganization,
  prepareWorkspaceProjectLogin,
  reauthorizeWorkspaceAccount,
  type PreparedWorkspaceProjectLogin,
  WorkspaceAuthFlowError,
} from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
  type WorkspaceReauthRequiredAccount,
} from "~/entities/workspace-auth/workspace-auth.model";
import { readWorkspaceOrganizationHistory } from "~/entities/workspace-auth/workspace-organization-history.lib";
import { t } from "~/i18n/i18n";
import { isWorkspaceIamOtpRequiredError } from "~/shared/api/workspace-iam-auth";
import { isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import { buildOrgRouteIdFromOrigin } from "~/shared/lib/org-route";
import { getOrganizationFallbackLogoUrl } from "~/shared/lib/organization-branding";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field";
import { Icon } from "~/shared/ui/icon";
import { InputSelector } from "~/shared/ui/input-selector";
import { resolveInitialLoginOrganization } from "./login-initial-organization.lib";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";
import { LoginPageProjectForm } from "./login-page-project-form.ui";
import { LoginPageRealmPreview } from "./login-page-realm-preview.ui";
import { normalizeLoginRegistrationUrl } from "./login-registration-url.lib";
import { WorkspaceCredentialsForm } from "./workspace-credentials-form.ui";
import { WorkspaceOtpForm } from "./workspace-otp-form.ui";

type LoginStep = "organization" | "credentials" | "otp" | "project";

interface LoginServerSettings {
  organizationOrigin: string;
  realm_name: string;
  realm_icon: string;
  registrationUrl: string | null;
}

interface WorkspaceLoginFormProps {
  readonly messageTarget?: Extract<WorkspaceMessengerRouteMatch, { kind: "message" }> | null;
  readonly profileShare?: boolean;
  readonly reauthAccount?: WorkspaceReauthRequiredAccount;
  readonly embedded?: boolean;
  readonly onBackToWorkspace?: () => void;
  readonly onSuccess?: (session: WorkspaceAuthSession) => void;
}

export function WorkspaceLoginForm(props: WorkspaceLoginFormProps) {
  const { messageTarget, profileShare, reauthAccount } = props;
  // A different saved identity or organization must start with fresh credentials.
  let key = profileShare ? "profile" : "login";
  if (reauthAccount != null) key = `reauth:${reauthAccount.accountId}:${reauthAccount.instanceId}`;
  else if (messageTarget != null) key = `message:${messageTarget.orgId}`;

  return <OrganizationLogin key={key} {...props} />;
}

function getAccountErrorKey(error: unknown): string | null {
  if (!(error instanceof WorkspaceAuthFlowError)) return null;
  switch (error.code) {
    case "owner-mismatch":
      return "auth.reauthDifferentUser";
    case "missing-project":
    case "project-mismatch":
      return "auth.reauthProjectUnavailable";
    default:
      return null;
  }
}

function OrganizationLogin({
  messageTarget,
  profileShare,
  reauthAccount,
  embedded = false,
  onBackToWorkspace,
  onSuccess,
}: WorkspaceLoginFormProps) {
  const formId = useId();
  const fieldIdPrefix = reauthAccount != null ? formId : undefined;
  const sessions = useWorkspaceAuthStore((s) => s.sessions);
  const hasReauthRequiredAccounts = useWorkspaceAuthStore(
    (state) => state.reauthRequiredAccounts.length > 0,
  );
  const isAddServer = sessions.length > 0 || hasReauthRequiredAccounts;
  const messageOrgId = messageTarget?.orgId;
  const [initialOrganization] = useState(() =>
    reauthAccount != null
      ? {
          organizationUrl: reauthAccount.organizationOrigin,
          autoAdvance: false,
        }
      : resolveInitialLoginOrganization({
          browserOrigin:
            !isElectron() && typeof window !== "undefined" ? window.location.origin : null,
          defaultOrganizationUrl: env.DEFAULT_LOGIN_ORGANIZATION_URL,
          messageOrgId,
          sessionOrigins: sessions.map((session) => session.organizationOrigin),
          profileShare,
        }),
  );

  const [realm, setRealm] = useState(() => initialOrganization.organizationUrl);
  const [organizationOptions] = useState(() =>
    readWorkspaceOrganizationHistory().map((origin) => ({
      value: origin,
      label: origin,
    })),
  );
  const [username, setUsername] = useState(reauthAccount?.login ?? "");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [projectId, setProjectId] = useState("");
  const [preparedLogin, setPreparedLogin] = useState<PreparedWorkspaceProjectLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>(
    reauthAccount != null ? "credentials" : "organization",
  );
  const [checkedRealm, setCheckedRealm] = useState<string | null>(null);
  const [serverSettings, setServerSettings] = useState<LoginServerSettings | null>(null);
  const fetchIdRef = useRef(0);
  const pendingAuthRealmRef = useRef<string | null>(null);
  const initialOrganizationFetchRef = useRef<string | null>(null);
  const credentialsRequest = useRef<AbortController | null>(null);
  const realmTrim = realm.trim();
  const canContinueToAuth = realmTrim.length > 0 && isValidRealmUrl(realmTrim);
  const defaultOrganizationUrl = env.DEFAULT_LOGIN_ORGANIZATION_URL.trim();
  const defaultOrganizationName =
    env.DEFAULT_LOGIN_ORGANIZATION_NAME.trim() || t("auth.defaultOrganizationName");
  const hasDefaultOrganizationButton = defaultOrganizationUrl.length > 0;

  useLayoutEffect(() => {
    return () => {
      credentialsRequest.current?.abort();
      credentialsRequest.current = null;
    };
  }, []);

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
  const handleCredentialsError = (error: unknown, needsOtp: boolean) => {
    if (isWorkspaceIamOtpRequiredError(error)) {
      setOtpCode("");
      if (needsOtp) setError(t("auth.invalidOtp"));
      else setStep("otp");
      return;
    }
    if (reauthAccount == null) {
      setError(error instanceof WorkspaceAuthFlowError ? error.message : t("auth.loginError"));
      return;
    }
    const accountErrorKey = getAccountErrorKey(error);
    if (accountErrorKey != null) {
      setPassword("");
      setOtpCode("");
      setStep("credentials");
    }
    setError(t(accountErrorKey ?? "auth.reauthFailed"));
  };

  const handleCredentialsSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (credentialsRequest.current != null) return;

    setError(null);
    const login = username.trim();
    const organizationUrl = reauthAccount?.organizationOrigin ?? serverSettings?.organizationOrigin;
    const needsOtp = step === "otp";
    if (organizationUrl == null || !login || !password || (needsOtp && otpCode.length !== 6)) {
      setError(t("auth.fillAllFields"));
      return;
    }

    const request = new AbortController();
    credentialsRequest.current = request;
    setLoading(true);
    const credentials = {
      login,
      password,
      ...(needsOtp ? { otpCode } : {}),
    };

    let reauthorizedSession: WorkspaceAuthSession | undefined;
    try {
      if (reauthAccount != null) {
        reauthorizedSession = await reauthorizeWorkspaceAccount({
          accountId: reauthAccount.accountId,
          ...credentials,
          signal: request.signal,
        });
      } else {
        const prepared = await prepareWorkspaceProjectLogin({ organizationUrl, ...credentials });
        if (!request.signal.aborted) enterProjectStep(prepared);
      }
    } catch (error) {
      if (request.signal.aborted) return;
      handleCredentialsError(error, needsOtp);
    } finally {
      if (credentialsRequest.current === request) {
        credentialsRequest.current = null;
        setLoading(false);
      }
    }
    if (reauthorizedSession != null && !request.signal.aborted) {
      setPassword("");
      setOtpCode("");
      onSuccess?.(reauthorizedSession);
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
      const { session } = await completeWorkspaceProjectLogin({
        preparedLogin,
        projectId,
      });
      onSuccess?.(session);
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
  let title = isAddServer ? t("auth.addServer") : t("auth.connectToZulip");
  if (reauthAccount != null) title = t("auth.reauthTitle");
  const descriptionByStep: Record<LoginStep, string> = {
    organization: t("auth.organizationStepHint"),
    credentials: t(reauthAccount == null ? "auth.authStepHint" : "auth.reauthSessionEnded"),
    otp: t("auth.otpStepHint"),
    project: t("auth.projectStepHint"),
  };
  const description = descriptionByStep[step];
  const resolvedRealmName = serverSettings?.realm_name.trim();
  const realmName =
    resolvedRealmName == null || resolvedRealmName.length === 0
      ? (reauthAccount?.organizationOrigin ?? "")
      : resolvedRealmName;
  const realmIcon = serverSettings?.realm_icon ?? "";
  const projectName = reauthAccount?.projectName ?? reauthAccount?.projectId;
  const heightClass = reauthAccount == null ? "min-h-screen" : "min-h-full";

  return (
    <div
      className={
        embedded
          ? "flex w-full justify-center"
          : `flex ${heightClass} flex-col items-center justify-center bg-bg p-4`
      }
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        {reauthAccount == null && (step !== "organization" || isAddServer) && (
          <button
            type="button"
            disabled={step !== "organization" && loading}
            onClick={step === "organization" ? onBackToWorkspace : handleBackToOrganizationStep}
            className="flex items-center gap-2 self-start text-sm text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="chevron-right" size={16} className="rotate-180" />
            {step === "organization" ? t("common.back") : t("auth.organization")}
          </button>
        )}
        {!embedded && (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            <p className="mt-1 text-sm text-text-muted">{description}</p>
          </div>
        )}

        {(realmName.length > 0 || realmIcon.length > 0) && (
          <LoginPageRealmPreview
            realmName={realmName}
            realmIcon={realmIcon}
            projectName={projectName}
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
            <WorkspaceCredentialsForm
              fieldIdPrefix={fieldIdPrefix}
              focusPassword={reauthAccount != null}
              submitLabel={reauthAccount != null ? title : undefined}
              submitDisabled={reauthAccount != null && (!username.trim() || !password)}
              username={username}
              password={password}
              loading={loading}
              error={error}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onSubmit={handleCredentialsSubmit}
            />

            {reauthAccount == null && serverSettings?.registrationUrl != null && (
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
            {embedded && <p className="text-sm text-text-muted">{description}</p>}
            <WorkspaceOtpForm
              fieldId={fieldIdPrefix == null ? undefined : `${fieldIdPrefix}-otp`}
              otpCode={otpCode}
              loading={loading}
              error={error}
              onOtpCodeChange={setOtpCode}
              onSubmit={handleCredentialsSubmit}
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
