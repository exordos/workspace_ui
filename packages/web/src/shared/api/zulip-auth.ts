/**
 * Zulip auth and server discovery (no active instance required for server_settings).
 */
import { t } from "~/i18n/i18n";
import { getElectronAPI, isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import { loggedFetch } from "~/shared/lib/logged-fetch.lib";
import { createLogger, logAction } from "~/shared/lib/logger";
import { isValidEmail, isValidRealmUrl } from "~/shared/lib/validation";
import { normalizeRealm } from "./zulip-realm.internal";
import {
  readSessionCsrfTokenFromDocument,
  refreshWebSessionCsrfTokenFromLegacy,
  setCachedSessionCsrfToken,
} from "./zulip-session-csrf.internal";
import { ZulipAuthError } from "./zulip.types";
import type { DesktopFlowExchangeResult, ZulipServerSettings } from "./zulip.types";

const log = createLogger("zulip-auth");

interface FetchApiKeyResult {
  // Zulip returns snake_case, so keep the field name as the API uses it.
  api_key: string;
  // Email is needed to save the instance after login.
  email: string;
  // Older backends may skip user_id, so we use 0 below.
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
    const res = await loggedFetch(url);
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
    let realmUrlRaw = "";
    if (typeof data.realm_url === "string" && data.realm_url.trim() !== "") {
      realmUrlRaw = data.realm_url.trim();
    } else if (typeof data.realm_uri === "string") {
      realmUrlRaw = data.realm_uri.trim();
    }
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
    res = await loggedFetch(url, {
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
    const realmHost = (() => {
      try {
        return new URL(base).hostname;
      } catch {
        return "unknown";
      }
    })();
    logAction("login_success", { realmHost, userId: data.user_id ?? 0 });
    return {
      api_key: data.api_key,
      email: data.email,
      user_id: data.user_id ?? 0,
    };
  }

  const msg =
    data.msg ??
    (res.ok ? t("app.unknownError") : t("app.errorStatus", { status: String(res.status) }));
  logAction("login_failed", { status: res.status, code: data.code ?? null });
  throw new ZulipAuthError(msg || t("auth.invalidLogin"), data.code, data);
}

function normalizeExchangeCredentials(payload: unknown): { email: string; apiKey: string } | null {
  // Desktop exchange may return HTML or a redirect for cookie session, not JSON credentials.
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  // Support api_key and apiKey so we do not depend on the server response shape.
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
    // Check that the cookie session already works before saving the new instance.
    const response = await loggedFetch(`${baseRealm}/json/users/me`, {
      method: "GET",
      // For cookie auth, the browser must send cookies explicitly.
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

async function exchangeDesktopFlowTokenInRenderer(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  // Web/PWA path: the renderer calls Zulip itself because there is no Electron main process.
  const base = normalizeRealm(realm);
  const normalizedToken = token.trim();
  if (!base || normalizedToken.length === 0) {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }
  const encodedToken = encodeURIComponent(normalizedToken);

  let response: Response;
  try {
    // In browser mode, do not follow the redirect automatically, so we can read the exchange response first.
    response = await loggedFetch(`${base}/accounts/login/subdomain/${encodedToken}`, {
      method: "GET",
      redirect: "manual",
      credentials: "include",
    });
  } catch {
    log.error("Renderer desktop token exchange network error");
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }

  if (response.status >= 400) {
    log.error("Renderer desktop token exchange returned HTTP error", {
      status: response.status,
    });
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
    // JSON with api_key is the fast path; no JSON means cookie fallback.
    exchangePayload = await response.json();
  } catch {
    exchangePayload = null;
  }

  const apiCredentials = normalizeExchangeCredentials(exchangePayload);
  if (apiCredentials) {
    // If the API key came right away, session cookies are not needed.
    return {
      authType: "api_key",
      email: apiCredentials.email,
      apiKey: apiCredentials.apiKey,
    };
  }

  const sessionEmail = await fetchSessionUserEmail(base);
  if (sessionEmail == null) {
    // Without a confirmed email, do not save a session auth instance.
    log.error("Renderer desktop token exchange failed during session verification");
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }
  const csrfToken =
    (await refreshWebSessionCsrfTokenFromLegacy(base)) ?? readSessionCsrfTokenFromDocument();
  if (csrfToken != null) {
    setCachedSessionCsrfToken(base, csrfToken);
  }
  return {
    authType: "session",
    email: sessionEmail,
  };
}

async function exchangeDesktopFlowTokenInElectron(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  // In Electron, send the exchange to the main process so cookies are saved in Chromium storage.
  const exchange = getElectronAPI()?.auth?.exchangeDesktopFlowToken;
  if (exchange == null) {
    log.error("Electron desktop auth bridge is unavailable");
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"), "DESKTOP_FLOW_BRIDGE_MISSING");
  }
  const result = await exchange({ realm, token });
  if (!result.ok) {
    // The main process already classified the error; here we convert it to a common ZulipAuthError.
    log.error("Electron desktop auth exchange failed", {
      reason: result.reason,
      status: result.status ?? null,
    });
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"), result.reason, result);
  }
  return {
    authType: result.data.authType,
    email: result.data.email,
    ...(result.data.apiKey != null ? { apiKey: result.data.apiKey } : {}),
  };
}

/**
 * Completes the desktop OIDC flow: exchanges the decrypted login token
 * through /accounts/login/subdomain/<token>.
 *
 * The server can return API credentials right away or create a cookie session.
 */
export async function exchangeDesktopFlowToken(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  if (isElectron()) {
    // The desktop shell needs a separate path because of file:// renderer and cookie policy.
    return exchangeDesktopFlowTokenInElectron(realm, token);
  }
  // In normal web mode, keep the old behavior with browser fetch.
  return exchangeDesktopFlowTokenInRenderer(realm, token);
}
