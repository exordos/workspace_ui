/**
 * Zulip auth and server discovery (no active instance required for server_settings).
 */
import { t } from "~/i18n/i18n";
import { getElectronAPI, isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import { createLogger } from "~/shared/lib/logger";
import { isValidEmail, isValidRealmUrl } from "~/shared/lib/validation";
import { normalizeRealm } from "./zulip-realm.internal";
import { ZulipAuthError } from "./zulip.types";
import type { DesktopFlowExchangeResult, ZulipServerSettings } from "./zulip.types";

const log = createLogger("zulip-auth");

interface FetchApiKeyResult {
  // Zulip возвращает snake_case, поэтому оставляем имя поля как в API.
  api_key: string;
  // Email нужен для сохранения инстанса после логина.
  email: string;
  // user_id может не прийти от старого backend, тогда ниже ставим 0.
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
  // Desktop exchange может вернуть не JSON с credentials, а HTML/редирект для cookie session.
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  // Поддерживаем api_key и apiKey, чтобы не зависеть от формы ответа сервера.
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
    // Проверяем, что cookie session уже работает, прежде чем сохранять новый инстанс.
    const response = await fetch(`${baseRealm}/json/users/me`, {
      method: "GET",
      // Для cookie auth браузер должен отправить cookies явно.
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
  // Web/PWA путь: renderer сам ходит в Zulip, потому что там нет Electron main process.
  const base = normalizeRealm(realm);
  const normalizedToken = token.trim();
  if (!base || normalizedToken.length === 0) {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }
  const encodedToken = encodeURIComponent(normalizedToken);

  let response: Response;
  try {
    // В browser режиме не следуем редиректу автоматически, чтобы сначала разобрать ответ exchange.
    response = await fetch(`${base}/accounts/login/subdomain/${encodedToken}`, {
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
    // JSON с api_key — быстрый путь, отсутствие JSON означает cookie fallback.
    exchangePayload = await response.json();
  } catch {
    exchangePayload = null;
  }

  const apiCredentials = normalizeExchangeCredentials(exchangePayload);
  if (apiCredentials) {
    // Если API key пришел сразу, session cookies дальше не нужны.
    return {
      authType: "api_key",
      email: apiCredentials.email,
      apiKey: apiCredentials.apiKey,
    };
  }

  const sessionEmail = await fetchSessionUserEmail(base);
  if (sessionEmail == null) {
    // Без подтвержденного email не сохраняем session auth инстанс.
    log.error("Renderer desktop token exchange failed during session verification");
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
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
  // В Electron отдаём обмен в main process, чтобы cookies сохранились в хранилище Chromium.
  const exchange = getElectronAPI()?.auth?.exchangeDesktopFlowToken;
  if (exchange == null) {
    log.error("Electron desktop auth bridge is unavailable");
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"), "DESKTOP_FLOW_BRIDGE_MISSING");
  }
  const result = await exchange({ realm, token });
  if (!result.ok) {
    // Main process уже классифицировал ошибку, здесь просто превращаем её в общий ZulipAuthError.
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
 * Завершает десктопный OIDC flow: обменивает расшифрованный токен входа
 * через /accounts/login/subdomain/<token>.
 *
 * Сервер может сразу вернуть API-учётные данные или установить cookie-сессию.
 */
export async function exchangeDesktopFlowToken(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  if (isElectron()) {
    // Десктопной оболочке нужен отдельный путь из-за file:// renderer и политики cookies.
    return exchangeDesktopFlowTokenInElectron(realm, token);
  }
  // В обычном web режиме оставляем старое поведение через браузерный fetch.
  return exchangeDesktopFlowTokenInRenderer(realm, token);
}
