// Exchanges the OIDC desktop-flow token in the Electron main process.
//
// The renderer runs from file://, so it cannot reliably store and send
// SameSite=Lax session cookies in cross-site requests. The main process uses
// the shared Chromium cookie jar and changes the needed auth cookies to SameSite=None.
import { session } from "electron";

export interface DesktopAuthExchangeResult {
  // Tells the renderer what to use next: an API key or a cookie session.
  authType: "api_key" | "session";
  // Email is needed to save the new instance in the account list.
  email: string;
  // Set only when the backend returned a ready Zulip API key.
  apiKey?: string;
}

export type DesktopAuthExchangeFailureReason =
  // Input is empty, too long, or the realm is not a safe HTTPS URL.
  | "INVALID_DESKTOP_FLOW_TOKEN"
  // The server could not be reached, or the network failed.
  | "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR"
  // The server returned a bad HTTP status while exchanging the desktop token.
  | "DESKTOP_FLOW_EXCHANGE_HTTP_ERROR"
  // The cookie session could not be prepared or checked with /json/users/me.
  | "DESKTOP_FLOW_SESSION_FAILED";

export class DesktopAuthExchangeError extends Error {
  constructor(
    // Return a short reason code so the UI does not parse error text.
    public readonly reason: DesktopAuthExchangeFailureReason,
    // Keep the HTTP status separate: it helps debugging but is not the message.
    public readonly status?: number,
    // Details are only for logs, not for user-facing text.
    public readonly details?: string,
  ) {
    super(reason);
    this.name = "DesktopAuthExchangeError";
  }
}

function stringifyNetworkError(error: unknown): string {
  // Electron network errors often have code/cause, which is useful in logs.
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
  // Catch can receive non-Error values, so convert everything to a short string.
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeRealm(realm: string): string {
  // The user may paste a realm with an API suffix, but the exchange endpoint is at the realm root.
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "");
}

function isValidHttpsRealmUrl(realm: string): boolean {
  try {
    // If no protocol was entered, treat the realm as HTTPS because auth cookies need Secure.
    const parsed = new URL(/^https?:\/\//i.test(realm) ? realm : `https://${realm}`);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  // A light check is enough: the email comes from the backend and is only used to save the account.
  return email.includes("@") && email.length > 3;
}

function normalizeApiCredentials(payload: unknown): { email: string; apiKey: string } | null {
  // The backend can return ready API credentials instead of a cookie session.
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  // Support both field names so we do not depend on snake/camel response shape.
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const apiKeyRaw = record.api_key ?? record.apiKey;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
  if (!isValidEmail(email) || apiKey.length === 0) {
    return null;
  }
  return { email, apiKey };
}

// Closed list of Zulip cookies that really need cross-site sending in Electron.
const ZULIP_AUTH_COOKIES_TO_RELAX = new Set([
  "sessionid",
  "__Host-sessionid",
  "csrftoken",
  "__Host-csrftoken",
  "csrf",
]);

function shouldRelaxZulipAuthCookieSameSite(name: string): boolean {
  // Do not match by substring: analytics_session and similar cookies must not be relaxed by accident.
  return ZULIP_AUTH_COOKIES_TO_RELAX.has(name);
}

async function relaxSessionCookieSameSite(originUrl: string): Promise<void> {
  // Read only cookies for this realm origin, not the whole Chromium jar.
  const cookies = await session.defaultSession.cookies.get({ url: originUrl });
  for (const cookie of cookies) {
    // Leave unknown cookies as they are: they stay in the jar, but their SameSite is not changed.
    if (!shouldRelaxZulipAuthCookieSameSite(cookie.name)) {
      continue;
    }
    // If the cookie already works for the Electron renderer, do not touch it again.
    if (cookie.sameSite === "no_restriction") {
      continue;
    }
    // Chromium does not accept SameSite=None without Secure, so do not rewrite insecure cookies.
    if (!cookie.secure) {
      continue;
    }

    // __Host- cookies must have no domain and must use path=/, or Chromium rejects them.
    const isHostPrefixedCookie = cookie.name.startsWith("__Host-");
    const cookiePath = isHostPrefixedCookie ? "/" : (cookie.path ?? "/");
    const cookieUrl = new URL(cookiePath, originUrl).toString();
    // Rewrite the same cookie with a better SameSite value for the desktop file:// renderer.
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
  // Check the session with an endpoint that needs an already stored cookie.
  const response = await session.defaultSession.fetch(`${baseRealm}/json/users/me`, {
    method: "GET",
    // Ask Chromium to send cookies explicitly; do not rely on the fetch default.
    credentials: "include",
  });
  if (!response.ok) {
    // Return the status so logs can separate 401 from other problems.
    return { email: null, status: response.status };
  }
  let data: { email?: unknown };
  try {
    data = (await response.json()) as { email?: unknown };
  } catch {
    return { email: null, status: response.status };
  }
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
  // Normalize input to one base URL so we do not build different endpoint forms below.
  const base = normalizeRealm(realmInput);
  const token = tokenInput.trim();
  if (!isValidHttpsRealmUrl(base) || token.length === 0 || token.length > 512) {
    throw new DesktopAuthExchangeError("INVALID_DESKTOP_FLOW_TOKEN");
  }

  const exchangeUrl = `${base}/accounts/login/subdomain/${encodeURIComponent(token)}`;
  let response: Response;
  try {
    // The main process exchanges the token because the renderer runs from file://.
    response = await session.defaultSession.fetch(exchangeUrl, {
      method: "GET",
      redirect: "follow",
      // Without include, Set-Cookie and later cookies may depend on the Electron default.
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
      // If the server returned an API key, cookie fallback is not needed.
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
    // Zulip session cookies are usually SameSite=Lax; desktop file:// needs them relaxed explicitly.
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
    // After changing cookies, check right away that the session really works.
    sessionCheck = await fetchSessionUserEmail(base);
  } catch (error) {
    throw new DesktopAuthExchangeError(
      "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR",
      undefined,
      `Session verification failed: ${stringifyNetworkError(error)}`,
    );
  }
  if (sessionCheck.email == null) {
    // If email is missing, treat the cookie session as broken and do not save the instance.
    throw new DesktopAuthExchangeError("DESKTOP_FLOW_SESSION_FAILED", sessionCheck.status);
  }

  return {
    authType: "session",
    email: sessionCheck.email,
  };
}
