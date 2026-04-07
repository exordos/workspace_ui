/**
 * OIDC desktop continuation helpers for Zulip external auth flow.
 *
 * This module handles:
 * - OTP generation for desktop_flow_otp
 * - Temporary flow state persistence in sessionStorage
 * - AES-GCM decryption of pasted code payload
 * - Best-effort parsing of credential payloads from decrypted text
 */
import { createLogger } from "~/shared/lib/logger";
import { isValidEmail } from "~/shared/lib/validation";

const log = createLogger("oidc-desktop");

const FLOW_STORAGE_KEY = "zulip-web-oidc-desktop-flow";
const FLOW_TTL_MS = 10 * 60 * 1000;
const OTP_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const TAG_BYTE_LENGTH = 16;

export interface OidcDesktopFlowState {
  realm: string;
  otp: string;
  createdAt: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex length");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(pair, 16);
    if (Number.isNaN(value)) {
      throw new Error("Invalid hex value");
    }
    out[i] = value;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function isHexString(value: string, expectedLength?: number): boolean {
  if (expectedLength != null && value.length !== expectedLength) {
    return false;
  }
  return /^[a-f0-9]+$/i.test(value);
}

function normalizeRealm(realm: string): string {
  const trimmedRealm = realm.trim();
  if (trimmedRealm.length === 0) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmedRealm)
      ? trimmedRealm
      : `https://${trimmedRealm}`;
    const parsed = new URL(withProtocol);
    const normalizedPath = parsed.pathname
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/i, "")
      .replace(/\/api$/i, "");
    const port = parsed.port.length > 0 ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}${normalizedPath}`.replace(
      /\/+$/,
      "",
    );
  } catch {
    return trimmedRealm
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/i, "")
      .replace(/\/api$/i, "");
  }
}

export function generateDesktopFlowOtp(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(OTP_BYTE_LENGTH));
  return bytesToHex(bytes);
}

export function buildDesktopFlowLoginUrl({
  realmBaseUrl,
  loginPath,
  next,
  desktopFlowOtp,
}: {
  realmBaseUrl: string;
  loginPath: string;
  next: string;
  desktopFlowOtp: string;
}): string {
  const realmBase = normalizeRealm(realmBaseUrl);
  const realmUrl = new URL(`${realmBase}/`);
  const url = new URL(loginPath, realmUrl);
  if (url.origin !== realmUrl.origin) {
    throw new Error("OIDC login URL must stay on the realm origin");
  }
  url.searchParams.set("next", next);
  url.searchParams.set("desktop_flow_otp", desktopFlowOtp);
  return url.toString();
}

export function saveDesktopFlowState(state: OidcDesktopFlowState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      FLOW_STORAGE_KEY,
      JSON.stringify({
        realm: normalizeRealm(state.realm),
        otp: state.otp,
        createdAt: state.createdAt,
      } satisfies OidcDesktopFlowState),
    );
  } catch {
    log.warn("Failed to persist desktop flow state");
  }
}

export function clearDesktopFlowState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FLOW_STORAGE_KEY);
  } catch {
    log.warn("Failed to clear desktop flow state");
  }
}

export function loadDesktopFlowState(expectedRealm?: string): OidcDesktopFlowState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OidcDesktopFlowState>;
    if (
      typeof parsed.realm !== "string" ||
      typeof parsed.otp !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      clearDesktopFlowState();
      return null;
    }
    const realm = normalizeRealm(parsed.realm);
    const otp = parsed.otp.toLowerCase();
    if (!isHexString(otp, OTP_BYTE_LENGTH * 2)) {
      clearDesktopFlowState();
      return null;
    }
    if (Date.now() - parsed.createdAt > FLOW_TTL_MS) {
      clearDesktopFlowState();
      return null;
    }
    const normalizedExpectedRealm = expectedRealm ? normalizeRealm(expectedRealm) : null;
    if (normalizedExpectedRealm && realm !== normalizedExpectedRealm) {
      return null;
    }
    return { realm, otp, createdAt: parsed.createdAt };
  } catch {
    clearDesktopFlowState();
    return null;
  }
}

export async function decryptDesktopFlowToken(pastedText: string, otpHex: string): Promise<string> {
  const normalizedPayload = pastedText.trim().toLowerCase();
  const normalizedOtp = otpHex.trim().toLowerCase();
  if (!isHexString(normalizedOtp, OTP_BYTE_LENGTH * 2)) {
    throw new Error("Invalid desktop flow OTP");
  }
  if (!isHexString(normalizedPayload)) {
    throw new Error("Invalid pasted payload");
  }

  const payloadBytes = hexToBytes(normalizedPayload);
  if (payloadBytes.length < IV_BYTE_LENGTH + TAG_BYTE_LENGTH) {
    throw new Error("Pasted payload is too short");
  }

  const iv = payloadBytes.slice(0, IV_BYTE_LENGTH);
  const encrypted = payloadBytes.slice(IV_BYTE_LENGTH);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(normalizedOtp)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
    key,
    toArrayBuffer(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function normalizeCredentials(
  email: unknown,
  apiKey: unknown,
): { email: string; apiKey: string } | null {
  if (typeof email !== "string" || typeof apiKey !== "string") {
    return null;
  }

  const normalizedEmail = email.trim();
  const normalizedApiKey = apiKey.trim();
  if (!isValidEmail(normalizedEmail) || normalizedApiKey.length === 0) {
    return null;
  }

  return { email: normalizedEmail, apiKey: normalizedApiKey };
}

function normalizeTokenValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const token = value.trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}

function isLikelyRawDesktopToken(value: string): boolean {
  return /^[a-z0-9._-]{8,}$/i.test(value);
}

/**
 * Attempts to parse credentials from a decrypted desktop-flow payload.
 * Supported formats:
 * - JSON: { "email": "...", "api_key": "..." } or { "email": "...", "apiKey": "..." }
 * - Query string: email=...&api_key=...
 * - Colon pair: email:apiKey
 */
export function parseDesktopFlowCredentials(
  payload: string,
): { email: string; apiKey: string } | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const email = parsed.email;
    const apiKey = parsed.api_key ?? parsed.apiKey;
    const normalized = normalizeCredentials(email, apiKey);
    if (normalized) {
      return normalized;
    }
  } catch {
    /* not JSON */
  }

  const params = new URLSearchParams(trimmed);
  const queryEmail = params.get("email");
  const queryApiKey = params.get("api_key") ?? params.get("apiKey");
  const normalizedQueryCredentials = normalizeCredentials(queryEmail, queryApiKey);
  if (normalizedQueryCredentials) {
    return normalizedQueryCredentials;
  }

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    const email = trimmed.slice(0, colonIndex).trim();
    const apiKey = trimmed.slice(colonIndex + 1).trim();
    const normalizedColonCredentials = normalizeCredentials(email, apiKey);
    if (normalizedColonCredentials) {
      return normalizedColonCredentials;
    }
  }

  return null;
}

/**
 * Attempts to parse desktop-flow login token from decrypted payload.
 * Supported formats:
 * - Raw token string
 * - JSON: { "token": "..." } or { "login_token": "..." }
 * - Query string: token=... or login_token=...
 */
export function parseDesktopFlowLoginToken(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const tokenFromJson = normalizeTokenValue(
      parsed.token ?? parsed.login_token ?? parsed.desktop_login_token ?? parsed.value,
    );
    if (tokenFromJson) {
      return tokenFromJson;
    }
    if (parsed.email != null || parsed.api_key != null || parsed.apiKey != null) {
      return null;
    }
  } catch {
    /* not JSON */
  }

  const params = new URLSearchParams(trimmed);
  const tokenFromQuery = normalizeTokenValue(
    params.get("token") ?? params.get("login_token") ?? params.get("desktop_login_token"),
  );
  if (tokenFromQuery) {
    return tokenFromQuery;
  }
  if (params.has("email") || params.has("api_key") || params.has("apiKey")) {
    return null;
  }

  if (isLikelyRawDesktopToken(trimmed)) {
    return trimmed;
  }

  return null;
}
