// Обмен OIDC desktop-flow token в Electron main process.
//
// Renderer работает из file:// и из-за этого не может надежно сохранить и отправить
// SameSite=Lax session cookies в cross-site запросах. Main process использует общий
// Chromium cookie jar и после обмена меняет нужные auth cookies на SameSite=None.
import { session } from "electron";

export interface DesktopAuthExchangeResult {
  // Говорит renderer-у, чем дальше авторизоваться: api key или cookie session.
  authType: "api_key" | "session";
  // Email нужен, чтобы сохранить новый инстанс в общем списке аккаунтов.
  email: string;
  // Заполняется только если backend вернул готовый Zulip API key.
  apiKey?: string;
}

export type DesktopAuthExchangeFailureReason =
  // Входные данные пустые, слишком длинные или realm не похож на безопасный https URL.
  | "INVALID_DESKTOP_FLOW_TOKEN"
  // До сервера не удалось достучаться или сеть оборвалась.
  | "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR"
  // Сервер ответил ошибочным HTTP статусом при обмене desktop token.
  | "DESKTOP_FLOW_EXCHANGE_HTTP_ERROR"
  // Cookie session не удалось подготовить или проверить через /json/users/me.
  | "DESKTOP_FLOW_SESSION_FAILED";

export class DesktopAuthExchangeError extends Error {
  constructor(
    // Короткий код причины возвращаем в renderer, чтобы UI не разбирал текст ошибки.
    public readonly reason: DesktopAuthExchangeFailureReason,
    // HTTP статус сохраняем отдельно: он полезен для диагностики, но не является message.
    public readonly status?: number,
    // Детали нужны только для логов, не для показа пользователю.
    public readonly details?: string,
  ) {
    super(reason);
    this.name = "DesktopAuthExchangeError";
  }
}

function stringifyNetworkError(error: unknown): string {
  // Сетевые ошибки в Electron часто несут code/cause, их удобно видеть в логах.
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; cause?: unknown };
    const parts = [error.message];
    if (typeof withCode.code === "string" && withCode.code.length > 0) {
      parts.push(`code=${withCode.code}`);
    }
    if (withCode.cause instanceof Error) {
      parts.push(`cause=${withCode.cause.message}`);
    } else if (typeof withCode.cause === "string" && withCode.cause.length > 0) {
      parts.push(`cause=${withCode.cause}`);
    }
    return parts.join("; ");
  }
  return String(error);
}

function stringifyUnknownError(error: unknown): string {
  // В catch может попасть не только Error, поэтому приводим всё к короткой строке.
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeRealm(realm: string): string {
  // Пользователь мог вставить realm с API suffix, а exchange endpoint живет на корне realm.
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "");
}

function isValidHttpsRealmUrl(realm: string): boolean {
  try {
    // Если протокол не ввели, считаем realm https-only, потому что auth cookies требуют Secure.
    const parsed = new URL(/^https?:\/\//i.test(realm) ? realm : `https://${realm}`);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  // Тут достаточно легкой проверки: email приходит от backend и нужен только для сохранения аккаунта.
  return email.includes("@") && email.length > 3;
}

function normalizeApiCredentials(payload: unknown): { email: string; apiKey: string } | null {
  // Backend иногда отдает готовые API credentials вместо cookie session.
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  // Поддерживаем оба имени поля, чтобы не зависеть от snake/camel формы ответа.
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const apiKeyRaw = record.api_key ?? record.apiKey;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
  if (!isValidEmail(email) || apiKey.length === 0) {
    return null;
  }
  return { email, apiKey };
}

// Это закрытый список Zulip cookies, которым правда нужна cross-site отправка в Electron.
const ZULIP_AUTH_COOKIES_TO_RELAX = new Set([
  "sessionid",
  "__Host-sessionid",
  "csrftoken",
  "__Host-csrftoken",
  "csrf",
]);

function shouldRelaxZulipAuthCookieSameSite(name: string): boolean {
  // Не ищем по подстроке: analytics_session и похожие cookies не должны слабеть случайно.
  return ZULIP_AUTH_COOKIES_TO_RELAX.has(name);
}

async function relaxSessionCookieSameSite(originUrl: string): Promise<void> {
  // Берем только cookies этого realm origin, чтобы не смотреть весь Chromium jar.
  const cookies = await session.defaultSession.cookies.get({ url: originUrl });
  for (const cookie of cookies) {
    // Неизвестные cookies оставляем как есть: они остаются в jar, но их SameSite не меняется.
    if (!shouldRelaxZulipAuthCookieSameSite(cookie.name)) {
      continue;
    }
    // Если cookie уже подходит для Electron renderer, не трогаем ее повторно.
    if (cookie.sameSite === "no_restriction") {
      continue;
    }
    // SameSite=None без Secure Chromium не принимает, поэтому insecure cookies не переписываем.
    if (!cookie.secure) {
      continue;
    }

    // __Host- cookies должны быть без domain и только на path=/, иначе Chromium их отклонит.
    const isHostPrefixedCookie = cookie.name.startsWith("__Host-");
    const cookiePath = isHostPrefixedCookie ? "/" : (cookie.path ?? "/");
    const cookieUrl = new URL(cookiePath, originUrl).toString();
    // Перезаписываем ту же cookie с более подходящим SameSite для desktop file:// renderer.
    const nextCookie = {
      url: cookieUrl,
      name: cookie.name,
      value: cookie.value,
      path: cookiePath,
      secure: true,
      httpOnly: cookie.httpOnly,
      sameSite: "no_restriction",
      ...(!isHostPrefixedCookie && cookie.domain != null ? { domain: cookie.domain } : {}),
      ...(cookie.expirationDate != null ? { expirationDate: cookie.expirationDate } : {}),
    } satisfies Parameters<typeof session.defaultSession.cookies.set>[0];

    try {
      await session.defaultSession.cookies.set(nextCookie);
    } catch (error) {
      throw new Error(`Failed to normalize cookie ${cookie.name}: ${stringifyUnknownError(error)}`);
    }
  }
}

async function fetchSessionUserEmail(
  baseRealm: string,
): Promise<{ email: string | null; status: number }> {
  // Проверяем session через endpoint, который требует уже установленную cookie.
  const response = await session.defaultSession.fetch(`${baseRealm}/json/users/me`, {
    method: "GET",
    // Явно просим Chromium отправить cookies; не полагаемся на дефолт fetch.
    credentials: "include",
  });
  if (!response.ok) {
    // Статус возвращаем наверх, чтобы отличить 401 от других проблем в логах.
    return { email: null, status: response.status };
  }
  const data = (await response.json()) as { email?: unknown };
  const email = typeof data.email === "string" ? data.email.trim() : "";
  return {
    email: isValidEmail(email) ? email : null,
    status: response.status,
  };
}

/**
 * Exchanges a desktop-flow login token and stores session cookies for renderer API calls.
 */
export async function exchangeDesktopFlowToken(
  realmInput: string,
  tokenInput: string,
): Promise<DesktopAuthExchangeResult> {
  // Нормализуем ввод до одного базового URL, чтобы ниже не собирать разные варианты endpoint.
  const base = normalizeRealm(realmInput);
  const token = tokenInput.trim();
  if (!isValidHttpsRealmUrl(base) || token.length === 0 || token.length > 512) {
    throw new DesktopAuthExchangeError("INVALID_DESKTOP_FLOW_TOKEN");
  }

  const exchangeUrl = `${base}/accounts/login/subdomain/${encodeURIComponent(token)}`;
  let response: Response;
  try {
    // Main process делает exchange вместо renderer, потому что renderer запущен из file://.
    response = await session.defaultSession.fetch(exchangeUrl, {
      method: "GET",
      redirect: "follow",
      // Без include Set-Cookie и последующие cookies могут зависеть от дефолта Electron.
      credentials: "include",
    });
  } catch (error) {
    throw new DesktopAuthExchangeError(
      "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR",
      undefined,
      stringifyNetworkError(error),
    );
  }

  if (response.status >= 400) {
    throw new DesktopAuthExchangeError("DESKTOP_FLOW_EXCHANGE_HTTP_ERROR", response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      // Если сервер вернул API key, cookie fallback уже не нужен.
      const payload: unknown = await response.json();
      const apiCredentials = normalizeApiCredentials(payload);
      if (apiCredentials) {
        return {
          authType: "api_key",
          email: apiCredentials.email,
          apiKey: apiCredentials.apiKey,
        };
      }
    } catch {
      // Fall through to cookie-based session auth.
    }
  }

  const originUrl = `${new URL(base).origin}/`;
  try {
    // Cookie session из Zulip обычно SameSite=Lax; для desktop file:// ее нужно ослабить явно.
    await relaxSessionCookieSameSite(originUrl);
  } catch (error) {
    throw new DesktopAuthExchangeError(
      "DESKTOP_FLOW_SESSION_FAILED",
      undefined,
      `Cookie normalization failed: ${stringifyUnknownError(error)}`,
    );
  }

  let sessionCheck: { email: string | null; status: number };
  try {
    // После правки cookies сразу проверяем, что session реально работает.
    sessionCheck = await fetchSessionUserEmail(base);
  } catch (error) {
    throw new DesktopAuthExchangeError(
      "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR",
      undefined,
      `Session verification failed: ${stringifyNetworkError(error)}`,
    );
  }
  if (sessionCheck.email == null) {
    // Если email не пришел, считаем cookie session нерабочей и не сохраняем инстанс.
    throw new DesktopAuthExchangeError("DESKTOP_FLOW_SESSION_FAILED", sessionCheck.status);
  }

  return {
    authType: "session",
    email: sessionCheck.email,
  };
}
