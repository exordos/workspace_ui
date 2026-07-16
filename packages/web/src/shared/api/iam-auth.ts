/**
 * IAM-backed login for Workspace UI.
 *
 * Password grant against Exordos Core IAM (same contract as exordos_ecosystem/web).
 * Returns the IAM access token for Bearer auth, without an API-key exchange.
 */
import { t } from "~/i18n/i18n";
import { MessengerAuthError } from "~/shared/api/messenger.types";
import { WORKSPACE_IAM_PROJECT_SCOPE } from "~/shared/config/workspace-project";
import {
  resolveEmailFromAccessToken,
  resolveUserUuidFromAccessToken,
} from "~/shared/lib/access-token-claims.lib";
import { resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { loggedFetch } from "~/shared/lib/logged-fetch.lib";
import { logAction } from "~/shared/lib/logger";

const IAM_DEFAULT_CLIENT = "default";
const IAM_GRANT_TYPE_PASSWORD_LOGIN = "login+password";
const IAM_GRANT_TYPE_REFRESH_TOKEN = "refresh_token";
const IAM_TOKEN_SCOPE = `openid email profile ${WORKSPACE_IAM_PROJECT_SCOPE}`;
const IAM_TOKEN_TTL_SECONDS = 60 * 60;
const IAM_REFRESH_TOKEN_TTL_SECONDS = 2 * 24 * 60 * 60;
const IAM_OTP_HEADER = "X-OTP";

const OTP_CHALLENGE_MESSAGE_RE = /\b(?:otp|totp|one[-\s]?time|2fa|mfa)\b/i;
const OAUTH_INVALID_CLIENT_ERROR = "invalid_client";

interface IamTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface IamLoginResult {
  access_token: string;
  email: string;
  user_id: string;
  refresh_token?: string;
}

export interface IamRefreshedTokenResult {
  accessToken: string;
  refreshToken?: string;
}

export interface IamLoginOptions {
  otpCode?: string;
  signal?: AbortSignal;
}

export class IamOtpRequiredError extends Error {
  name = "IamOtpRequiredError";
}

function resolveIamOrigin(serverUrlInput: string): string {
  return resolveIamApiOrigin({ realm: serverUrlInput });
}

function buildIamTokenUrl(iamOrigin: string): string {
  const base = iamOrigin.replace(/\/+$/, "");
  return `${base}/api/core/v1/iam/clients/${IAM_DEFAULT_CLIENT}/actions/get_token/invoke`;
}

function createPasswordLoginGrantPayload(login: string, password: string): string {
  const payload = new URLSearchParams();
  payload.set("grant_type", IAM_GRANT_TYPE_PASSWORD_LOGIN);
  payload.set("login", login.trim());
  payload.set("password", password);
  payload.set("scope", IAM_TOKEN_SCOPE);
  payload.set("ttl", String(IAM_TOKEN_TTL_SECONDS));
  payload.set("refresh_ttl", String(IAM_REFRESH_TOKEN_TTL_SECONDS));
  return payload.toString();
}

function createRefreshGrantPayload(refreshToken: string): string {
  const payload = new URLSearchParams();
  payload.set("grant_type", IAM_GRANT_TYPE_REFRESH_TOKEN);
  payload.set("refresh_token", refreshToken.trim());
  payload.set("scope", IAM_TOKEN_SCOPE);
  return payload.toString();
}

function normalizeErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof data !== "object" || data == null) {
    return fallback;
  }
  const record = data as Record<string, unknown>;
  for (const key of ["message", "detail", "description", "error_description", "error", "msg"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function extractErrorMessages(data: unknown): string[] {
  if (typeof data === "string") {
    const direct = normalizeErrorMessage(data, "");
    return direct.length > 0 ? [direct] : [];
  }
  if (typeof data !== "object" || data == null) {
    return [];
  }
  const record = data as Record<string, unknown>;
  const messages: string[] = [];
  for (const key of ["message", "detail", "description", "error_description", "error", "msg"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      messages.push(value.trim());
    }
  }
  return messages;
}

function isOtpChallengeResponse(
  status: number,
  data: unknown,
  allowInvalidClientFallback: boolean,
): boolean {
  if (status !== 401) {
    return false;
  }
  const messages = extractErrorMessages(data);
  if (messages.some((message) => OTP_CHALLENGE_MESSAGE_RE.test(message))) {
    return true;
  }
  return (
    allowInvalidClientFallback &&
    messages.length === 1 &&
    messages[0] === OAUTH_INVALID_CLIENT_ERROR
  );
}

function resolveEmailFromIamToken(accessToken: string, loginFallback: string): string {
  const email = resolveEmailFromAccessToken(accessToken);
  if (email != null) {
    return email;
  }
  const login = loginFallback.trim();
  if (login.length > 0) {
    return login;
  }
  throw new MessengerAuthError(t("auth.loginError"));
}

async function loginViaIam(
  iamOrigin: string,
  login: string,
  password: string,
  options: IamLoginOptions = {},
): Promise<IamTokenResponse> {
  const url = buildIamTokenUrl(iamOrigin);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const otpCode = options.otpCode?.trim();
  if (otpCode != null && otpCode.length > 0) {
    headers[IAM_OTP_HEADER] = otpCode;
  }

  let res: Response;
  try {
    res = await loggedFetch(url, {
      method: "POST",
      headers,
      body: createPasswordLoginGrantPayload(login, password),
      signal: options.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("app.networkError");
    throw new MessengerAuthError(t("app.connectFailed", { message }));
  }

  let data: IamTokenResponse & Record<string, unknown>;
  try {
    data = (await res.json()) as IamTokenResponse & Record<string, unknown>;
  } catch {
    throw new MessengerAuthError(t("app.invalidResponse"));
  }

  if (res.ok && typeof data.access_token === "string" && data.access_token.trim().length > 0) {
    return data;
  }

  if (isOtpChallengeResponse(res.status, data, !options.otpCode?.trim())) {
    throw new IamOtpRequiredError(normalizeErrorMessage(data, t("auth.otpRequired")));
  }

  const msg = normalizeErrorMessage(
    data,
    res.ok ? t("app.unknownError") : t("app.errorStatus", { status: String(res.status) }),
  );
  logAction("iam_login_failed", { status: res.status });
  throw new MessengerAuthError(msg || t("auth.invalidLogin"));
}

/**
 * Authenticates via IAM password grant and returns the access token for Bearer auth.
 */
export async function loginWithIamCredentials(
  realm: string,
  login: string,
  password: string,
  options: IamLoginOptions = {},
): Promise<IamLoginResult> {
  const iamOrigin = resolveIamOrigin(realm);
  if (iamOrigin === "") {
    throw new MessengerAuthError(t("auth.invalidServerUrl"));
  }

  const tokenResponse = await loginViaIam(iamOrigin, login, password, options);
  if (options.signal?.aborted) {
    throw new MessengerAuthError(t("auth.loginError"));
  }

  const accessToken = tokenResponse.access_token?.trim() ?? "";
  if (accessToken.length === 0) {
    throw new MessengerAuthError(t("auth.loginError"));
  }
  const userUuid = resolveUserUuidFromAccessToken(accessToken);
  if (userUuid == null) {
    throw new MessengerAuthError(t("auth.loginError"));
  }

  logAction("iam_login_success", { realmHost: new URL(iamOrigin).hostname });

  return {
    access_token: accessToken,
    email: resolveEmailFromIamToken(accessToken, login),
    user_id: userUuid,
    ...(typeof tokenResponse.refresh_token === "string" && tokenResponse.refresh_token.trim() !== ""
      ? { refresh_token: tokenResponse.refresh_token.trim() }
      : {}),
  };
}

export function isIamOtpRequiredError(err: unknown): err is IamOtpRequiredError {
  return err instanceof IamOtpRequiredError;
}

/** Exchanges a refresh token for a new IAM access token (same contract as exordos_ecosystem/web). */
export async function refreshIamAccessToken(
  iamOrigin: string,
  refreshToken: string,
): Promise<IamRefreshedTokenResult> {
  const normalizedOrigin = iamOrigin.trim().replace(/\/+$/, "");
  const normalizedRefreshToken = refreshToken.trim();
  if (normalizedOrigin === "" || normalizedRefreshToken.length === 0) {
    throw new MessengerAuthError(t("auth.loginError"));
  }

  const url = buildIamTokenUrl(normalizedOrigin);
  let res: Response;
  try {
    res = await loggedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: createRefreshGrantPayload(normalizedRefreshToken),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("app.networkError");
    throw new MessengerAuthError(t("app.connectFailed", { message }));
  }

  let data: IamTokenResponse & Record<string, unknown>;
  try {
    data = (await res.json()) as IamTokenResponse & Record<string, unknown>;
  } catch {
    throw new MessengerAuthError(t("app.invalidResponse"));
  }

  const accessToken = data.access_token?.trim() ?? "";
  if (res.ok && accessToken.length > 0) {
    logAction("iam_token_refreshed", { realmHost: new URL(normalizedOrigin).hostname });
    return {
      accessToken,
      ...(typeof data.refresh_token === "string" && data.refresh_token.trim() !== ""
        ? { refreshToken: data.refresh_token.trim() }
        : {}),
    };
  }

  const msg = normalizeErrorMessage(
    data,
    res.ok ? t("app.unknownError") : t("app.errorStatus", { status: String(res.status) }),
  );
  logAction("iam_token_refresh_failed", { status: res.status });
  throw new MessengerAuthError(msg || t("auth.loginError"));
}
