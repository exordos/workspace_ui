import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { fetchApiKey, fetchServerSettings } from "~/shared/api/zulip-auth";
import { normalizeRealm } from "~/shared/api/zulip-realm.internal";
import { ZulipAuthError } from "~/shared/api/zulip.types";
import {
  buildDesktopFlowLoginUrl,
  generateDesktopFlowOtp,
  saveDesktopFlowState,
} from "~/shared/lib/oidc-desktop";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import { getOrganizationFallbackLogoUrl } from "~/shared/lib/organization-branding";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { isValidRealmUrl, isValidUrl } from "~/shared/lib/validation";
import { Icon } from "~/shared/ui/icon";
import { LoginPageCredentialsForm } from "./login-page-credentials-form.ui";
import { LoginPageExternalAuth } from "./login-page-external-auth.ui";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";
import { LoginPageRealmPreview } from "./login-page-realm-preview.ui";
import { sanitizeInternalRedirectTarget } from "./login-redirect.lib";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const instances = useInstancesStore((s) => s.instances);
  const addInstance = useInstancesStore((s) => s.addInstance);
  const isAddServer = instances.length > 0;

  const [realm, setRealm] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverSettings, setServerSettings] = useState<{
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
  } | null>(null);
  const fetchIdRef = useRef(0);
  const prefillAutoFetchRef = useRef<string | null>(null);
  const realmPrefill = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("realm");
    return raw?.trim() ? raw : null;
  }, [location.search]);
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

  useEffect(() => {
    if (realmPrefill && realm.trim().length === 0) {
      setRealm(realmPrefill);
    }
  }, [realmPrefill, realm]);

  const fetchSettings = useCallback((realmTrim: string) => {
    if (!isValidRealmUrl(realmTrim)) {
      setServerSettings(null);
      return;
    }
    const id = ++fetchIdRef.current;
    void fetchServerSettings(realmTrim)
      .then((data) => {
        if (id !== fetchIdRef.current) return;
        if (data) {
          const base = realmTrim
            .replace(/\/+$/, "")
            .replace(/\/api\/v1$/, "")
            .replace(/\/api$/, "");
          setServerSettings({
            realm_base: base,
            realm_name: data.realm_name,
            realm_icon: resolveLoginIconUrl(base, data.realm_icon),
            realm_icon_raw: (data.realm_icon ?? "").trim(),
            realm_uri: data.realm_uri,
            realm_url: data.realm_url,
            external_authentication_methods: data.external_authentication_methods,
          });
        } else {
          setServerSettings(null);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) {
          setServerSettings(null);
        }
      });
  }, []);

  useEffect(() => {
    const prefilledRealm = realmPrefill?.trim() ?? "";
    const realmTrim = realm.trim();
    if (prefilledRealm.length === 0 || realmTrim !== prefilledRealm) {
      return;
    }
    if (prefillAutoFetchRef.current === prefilledRealm) {
      return;
    }
    prefillAutoFetchRef.current = prefilledRealm;
    fetchSettings(realmTrim);
  }, [fetchSettings, realm, realmPrefill]);

  const handleRealmBlur = useCallback(() => {
    const realmTrim = realm.trim();
    if (realmTrim && isValidRealmUrl(realmTrim)) fetchSettings(realmTrim);
  }, [realm, fetchSettings]);

  const handleRealmLogoError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const currentSrc = e.currentTarget.getAttribute("src") ?? "";
    if (currentSrc.includes("organization-fallback.svg")) return;
    e.currentTarget.src = getOrganizationFallbackLogoUrl();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const realmTrim = realm.trim();
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
      const normalizedFromInput =
        realmTrim
          .replace(/\/+$/, "")
          .replace(/\/api\/v1$/, "")
          .replace(/\/api$/, "") || realmTrim;
      const canonicalFromServer =
        serverSettings?.realm_url?.trim() || serverSettings?.realm_uri?.trim() || "";
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
      addInstance({
        realm: realmToStore,
        email: result.email,
        apiKey: result.api_key,
        realmIcon,
        ...(workspaceOrgOrigin !== "" ? { workspaceOrgOrigin } : {}),
      });
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
        const normalizedRealm =
          (serverSettings?.realm_base ?? realm)
            .trim()
            .replace(/\/+$/, "")
            .replace(/\/api\/v1$/, "")
            .replace(/\/api$/, "") || realm.trim();
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
    [navigate, realm, redirectTarget, serverSettings?.realm_base],
  );

  const toggleShowPassword = useCallback(() => {
    setShowPassword((p) => !p);
  }, []);

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
          <h1 className="text-xl font-semibold text-text-primary">
            {isAddServer ? t("auth.addServerZulip") : t("auth.connectToZulip")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{t("auth.serverHint")}</p>
        </div>

        {serverSettings != null &&
          (Boolean(serverSettings.realm_name) || serverSettings.realm_icon.length > 0) && (
            <LoginPageRealmPreview
              realmName={serverSettings.realm_name ?? ""}
              realmIcon={serverSettings.realm_icon}
              onLogoError={handleRealmLogoError}
            />
          )}

        {serverSettings != null && serverSettings.external_authentication_methods.length > 0 && (
          <LoginPageExternalAuth
            realmBase={serverSettings.realm_base}
            methods={serverSettings.external_authentication_methods}
            onSelectLoginPath={handleStartOidcFlow}
          />
        )}

        <LoginPageCredentialsForm
          realm={realm}
          username={username}
          password={password}
          showPassword={showPassword}
          loading={loading}
          error={error}
          onRealmChange={setRealm}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onRealmBlur={handleRealmBlur}
          onToggleShowPassword={toggleShowPassword}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};
