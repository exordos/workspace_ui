/**
 * OIDC desktop-flow token exchange in the Electron main process.
 *
 * Renderer fetch from `file://` cannot store or send `SameSite=Lax` session cookies
 * on cross-site requests. Main process reads Set-Cookie from the exchange response
 * and persists cookies with `sameSite: no_restriction` in the shared session jar.
 */
import { session } from "electron";
import { collectSetCookieHeaders, parseSetCookieHeader } from "./set-cookie.lib";

export interface DesktopAuthExchangeResult {
  authType: "api_key" | "session";
  email: string;
  apiKey?: string;
}

function normalizeRealm(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "");
}

function isValidHttpsRealmUrl(realm: string): boolean {
  try {
    const parsed = new URL(/^https?:\/\//i.test(realm) ? realm : `https://${realm}`);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.length > 3;
}

function normalizeApiCredentials(payload: unknown): { email: string; apiKey: string } | null {
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

async function persistCrossSiteSessionCookies(
  response: Response,
  cookieUrl: string,
): Promise<void> {
  for (const header of collectSetCookieHeaders(response.headers)) {
    const parsed = parseSetCookieHeader(header);
    if (parsed == null) {
      continue;
    }
    const expirationDate =
      parsed.maxAge != null && parsed.maxAge > 0
        ? Math.floor(Date.now() / 1000) + parsed.maxAge
        : undefined;
    await session.defaultSession.cookies.set({
      url: cookieUrl,
      name: parsed.name,
      value: parsed.value,
      path: parsed.path ?? "/",
      secure: parsed.secure ?? true,
      httpOnly: parsed.httpOnly ?? false,
      sameSite: "no_restriction",
      expirationDate,
    });
  }
}

async function fetchSessionUserEmail(baseRealm: string): Promise<string | null> {
  const response = await session.defaultSession.fetch(`${baseRealm}/json/users/me`, {
    method: "GET",
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { email?: unknown };
  const email = typeof data.email === "string" ? data.email.trim() : "";
  return isValidEmail(email) ? email : null;
}

/**
 * Exchanges desktop-flow login token and stores session cookies for renderer API calls.
 */
export async function exchangeDesktopFlowToken(
  realmInput: string,
  tokenInput: string,
): Promise<DesktopAuthExchangeResult> {
  const base = normalizeRealm(realmInput);
  const token = tokenInput.trim();
  if (!isValidHttpsRealmUrl(base) || token.length === 0 || token.length > 512) {
    throw new Error("INVALID_DESKTOP_FLOW_TOKEN");
  }

  const exchangeUrl = `${base}/accounts/login/subdomain/${encodeURIComponent(token)}`;
  const response = await session.defaultSession.fetch(exchangeUrl, {
    method: "GET",
    redirect: "manual",
  });

  if (response.status >= 400) {
    throw new Error("DESKTOP_FLOW_EXCHANGE_FAILED");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
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

  const cookieUrl = `${new URL(base).origin}/`;
  await persistCrossSiteSessionCookies(response, cookieUrl);

  const sessionEmail = await fetchSessionUserEmail(base);
  if (sessionEmail == null) {
    throw new Error("DESKTOP_FLOW_SESSION_FAILED");
  }

  return {
    authType: "session",
    email: sessionEmail,
  };
}
