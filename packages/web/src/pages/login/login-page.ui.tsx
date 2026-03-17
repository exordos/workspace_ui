import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance";
import { t } from "~/i18n";
import { fetchApiKey, fetchServerSettings, ZulipAuthError } from "~/shared/api/zulip";
import {
  buildDesktopFlowLoginUrl,
  generateDesktopFlowOtp,
  saveDesktopFlowState,
} from "~/shared/lib/oidc-desktop";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import {
  getOrganizationLogoSrc,
  ORGANIZATION_FALLBACK_LOGO_URL,
} from "~/shared/lib/organization-branding";
import { isValidRealmUrl, isValidUrl } from "~/shared/lib/validation";
import { Button, Icon } from "~/shared/ui";
import { sanitizeInternalRedirectTarget } from "./login-redirect.lib";

function resolveIconUrl(realmBase: string, icon: string): string {
  const trimmedIcon = icon.trim();
  if (trimmedIcon.length === 0) return "";

  const normalizedBase = realmBase.trim().replace(/\/+$/, "");
  if (!isValidUrl(normalizedBase)) return "";

  try {
    const baseUrl = new URL(`${normalizedBase}/`);
    const resolvedUrl = new URL(trimmedIcon, baseUrl);
    const resolved = resolvedUrl.toString();
    if (!isValidUrl(resolved)) return "";

    // Avoid native browser Basic Auth prompts: same-origin icon URLs on pre-auth
    // pages can be protected and trigger modal credential dialogs in <img src>.
    if (resolvedUrl.origin === baseUrl.origin) {
      return "";
    }

    return resolved;
  } catch {
    return "";
  }
}

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
    realm_icon: string;
    external_authentication_methods: {
      name: string;
      display_name: string;
      display_icon?: string;
      login_url: string;
    }[];
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
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
            realm_icon: resolveIconUrl(base, data.realm_icon),
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
    const realmTrim = realm.trim();
    if (!realmTrim) {
      setServerSettings(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSettings(realmTrim), 1000);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [realm, fetchSettings]);

  const handleRealmBlur = useCallback(() => {
    const realmTrim = realm.trim();
    if (realmTrim && isValidRealmUrl(realmTrim)) fetchSettings(realmTrim);
  }, [realm, fetchSettings]);

  const handleRealmLogoError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const currentSrc = e.currentTarget.getAttribute("src") ?? "";
    if (currentSrc.includes(ORGANIZATION_FALLBACK_LOGO_URL)) return;
    e.currentTarget.src = ORGANIZATION_FALLBACK_LOGO_URL;
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
      const normalizedRealm =
        realmTrim
          .replace(/\/+$/, "")
          .replace(/\/api\/v1$/, "")
          .replace(/\/api$/, "") || realmTrim;
      const realmIcon =
        serverSettings?.realm_base === normalizedRealm &&
        serverSettings.realm_icon.trim().length > 0
          ? serverSettings.realm_icon
          : undefined;
      addInstance({
        realm: normalizedRealm,
        email: result.email,
        apiKey: result.api_key,
        realmIcon,
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

        {serverSettings && (serverSettings.realm_name || serverSettings.realm_icon) && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-3">
            <img
              data-testid="realm-logo-preview"
              src={getOrganizationLogoSrc(serverSettings.realm_icon)}
              alt=""
              className="h-12 w-12 rounded-lg object-contain"
              onError={handleRealmLogoError}
            />
            {serverSettings.realm_name && (
              <span className="text-sm font-medium text-text-primary">
                {serverSettings.realm_name}
              </span>
            )}
          </div>
        )}

        {serverSettings?.external_authentication_methods &&
          serverSettings.external_authentication_methods.length > 0 && (
            <div className="flex flex-col gap-2">
              {serverSettings.external_authentication_methods.map((method) => {
                const base = serverSettings.realm_base;
                const iconUrl =
                  method.display_icon != null ? resolveIconUrl(base, method.display_icon) : "";
                return (
                  <button
                    key={method.name}
                    type="button"
                    onClick={() => handleStartOidcFlow(method.login_url)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-bg"
                  >
                    {iconUrl && <img src={iconUrl} alt="" className="h-5 w-5 object-contain" />}
                    {method.display_name}
                  </button>
                );
              })}
            </div>
          )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="realm" className="mb-1.5 block text-sm font-medium text-text-primary">
              {t("auth.zulipServerUrl")}
            </label>
            <input
              id="realm"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder={t("auth.zulipServerUrlHint")}
              value={realm}
              onChange={(e) => setRealm(e.target.value)}
              onBlur={handleRealmBlur}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              {t("auth.email")}
            </label>
            <input
              id="username"
              type="email"
              autoComplete="email"
              placeholder={t("auth.emailHint")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              {t("auth.password")}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 pr-10 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                <Icon name={showPassword ? "close" : "profile"} size={18} />
              </button>
            </div>
          </div>

          {error && (
            <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("auth.loginLoading") : t("auth.login")}
          </Button>
        </form>
      </div>
    </div>
  );
};
