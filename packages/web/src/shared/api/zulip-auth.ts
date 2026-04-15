/**
 * Zulip auth and server discovery (no active instance required for server_settings).
 */
import { t } from "~/i18n/i18n";
import { env } from "~/shared/lib/env";
import { isValidEmail, isValidRealmUrl } from "~/shared/lib/validation";
import { normalizeRealm } from "./zulip-realm.internal";
import { ZulipAuthError } from "./zulip.types";
import type { DesktopFlowExchangeResult, ZulipServerSettings } from "./zulip.types";

interface FetchApiKeyResult {
  api_key: string;
  email: string;
  user_id: number;
}

/**
 * Fetches server settings (GET /api/v1/server_settings). No auth required.
 * Used on login page to show realm icon, name, and auth methods.
 */
export async function fetchServerSettings(realmUrl: string): Promise<ZulipServerSettings | null> {
  try {
    if (!isValidRealmUrl(realmUrl)) {
      return null;
    }
    const parsedRealm = new URL(realmUrl.trim());
    const normalizedPath = parsedRealm.pathname
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/, "")
      .replace(/\/api$/, "");
    const base = `${parsedRealm.origin}${normalizedPath}`.replace(/\/+$/, "");
    if (!base) return null;
    const url = `${base}${env.ZULIP_API_PATH}/server_settings`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      realm_name?: string;
      realm_icon?: string;
      realm_uri?: string;
      realm_url?: string;
      external_authentication_methods?: {
        name?: string;
        display_name?: string;
        display_icon?: string;
        login_url?: string;
      }[];
    };
    const realmUrlRaw =
      typeof data.realm_url === "string" && data.realm_url.trim() !== ""
        ? data.realm_url.trim()
        : typeof data.realm_uri === "string"
          ? data.realm_uri.trim()
          : "";
    return {
      realm_name: data.realm_name ?? "",
      realm_icon: data.realm_icon ?? "",
      realm_uri: realmUrlRaw,
      realm_url: realmUrlRaw,
      external_authentication_methods: Array.isArray(data.external_authentication_methods)
        ? data.external_authentication_methods.map((m) => ({
            name: m.name ?? "",
            display_name: m.display_name ?? "",
            display_icon: m.display_icon,
            login_url: m.login_url ?? "",
          }))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Exchanges credentials for an API key (POST /api/v1/fetch_api_key).
 * Used at login; password is never persisted.
 * @throws ZulipAuthError on auth or network failure
 */
export async function fetchApiKey(
  realm: string,
  username: string,
  password: string,
): Promise<FetchApiKeyResult> {
  const base = normalizeRealm(realm);
  const url = `${base}${env.ZULIP_API_PATH}/fetch_api_key`;
  const body = new URLSearchParams({
    username: username.trim(),
    password,
  }).toString();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("app.networkError");
    throw new ZulipAuthError(t("app.connectFailed", { message }));
  }

  let data: {
    result?: string;
    msg?: string;
    code?: string;
    api_key?: string;
    email?: string;
    user_id?: number;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new ZulipAuthError(t("app.invalidResponse"));
  }

  if (data.result === "success" && data.api_key && data.email != null) {
    return {
      api_key: data.api_key,
      email: data.email,
      user_id: data.user_id ?? 0,
    };
  }

  const msg =
    data.msg ??
    (res.ok ? t("app.unknownError") : t("app.errorStatus", { status: String(res.status) }));
  throw new ZulipAuthError(msg || t("auth.invalidLogin"), data.code, data);
}

function normalizeExchangeCredentials(payload: unknown): { email: string; apiKey: string } | null {
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const apiKeyRaw = record.api_key ?? record.apiKey;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
  if (!isValidEmail(email) || apiKey.length === 0) {
    return null;
  }
  return { email, apiKey };
}

async function fetchSessionUserEmail(baseRealm: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseRealm}/json/users/me`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { email?: unknown };
    const email = typeof data.email === "string" ? data.email.trim() : "";
    return isValidEmail(email) ? email : null;
  } catch {
    return null;
  }
}

function buildSessionFallbackEmail(baseRealm: string): string {
  try {
    return `session@${new URL(baseRealm).hostname}`;
  } catch {
    return "session@unknown.local";
  }
}

/**
 * Completes OIDC desktop flow by exchanging decrypted login token
 * against /accounts/login/subdomain/<token>.
 *
 * Backend may return API credentials directly or establish cookie-based session auth.
 */
export async function exchangeDesktopFlowToken(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  const base = normalizeRealm(realm);
  const normalizedToken = token.trim();
  if (!base || normalizedToken.length === 0) {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }
  const encodedToken = encodeURIComponent(normalizedToken);

  let response: Response;
  try {
    response = await fetch(`${base}/accounts/login/subdomain/${encodedToken}`, {
      method: "GET",
      redirect: "manual",
      credentials: "include",
    });
  } catch {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }

  if (response.status >= 400) {
    let message: string | null;
    try {
      const data = (await response.json()) as { msg?: unknown };
      message = typeof data.msg === "string" ? data.msg : null;
    } catch {
      message = null;
    }
    throw new ZulipAuthError(message ?? t("auth.pasteTokenInvalid"));
  }

  let exchangePayload: unknown;
  try {
    exchangePayload = await response.json();
  } catch {
    exchangePayload = null;
  }

  const apiCredentials = normalizeExchangeCredentials(exchangePayload);
  if (apiCredentials) {
    return {
      authType: "api_key",
      email: apiCredentials.email,
      apiKey: apiCredentials.apiKey,
    };
  }

  const sessionEmail = await fetchSessionUserEmail(base);
  return {
    authType: "session",
    email: sessionEmail ?? buildSessionFallbackEmail(base),
  };
}
