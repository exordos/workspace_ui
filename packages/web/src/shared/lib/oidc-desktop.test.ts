import { describe, expect, it } from "vitest";
import {
  buildDesktopFlowLoginUrl,
  clearDesktopFlowState,
  decryptDesktopFlowToken,
  generateDesktopFlowOtp,
  loadDesktopFlowState,
  parseDesktopFlowCredentials,
  parseDesktopFlowLoginToken,
  saveDesktopFlowState,
} from "./oidc-desktop";

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

async function encryptDesktopFlowPayload(payload: string, otpHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(otpHex)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      new TextEncoder().encode(payload),
    ),
  );
  const full = new Uint8Array(iv.length + encrypted.length);
  full.set(iv, 0);
  full.set(encrypted, iv.length);
  return bytesToHex(full);
}

describe("oidc-desktop helpers", () => {
  it("generates a 32-byte OTP as lowercase hex", () => {
    const otp = generateDesktopFlowOtp();
    expect(otp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds login url with next and desktop_flow_otp query params", () => {
    const url = buildDesktopFlowLoginUrl({
      realmBaseUrl: "https://chat.example.com",
      loginPath: "/accounts/login/google/",
      next: "/",
      desktopFlowOtp: "00112233",
    });

    expect(url).toContain("desktop_flow_otp=00112233");
    expect(url).toContain("next=%2F");
  });

  it("throws when login path points to a different origin", () => {
    expect(() =>
      buildDesktopFlowLoginUrl({
        realmBaseUrl: "https://chat.example.com",
        loginPath: "https://evil.example.com/accounts/login/google/",
        next: "/",
        desktopFlowOtp: "00112233",
      }),
    ).toThrow(/origin/i);
  });

  it("saves and loads flow state from sessionStorage", () => {
    clearDesktopFlowState();
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp: "a".repeat(64),
      createdAt: Date.now(),
    });

    expect(loadDesktopFlowState("https://chat.example.com")).toMatchObject({
      realm: "https://chat.example.com",
      otp: "a".repeat(64),
    });
  });

  it("loads flow state when expected realm differs only by case or api suffix", () => {
    clearDesktopFlowState();
    saveDesktopFlowState({
      realm: "https://SYS.Platform.Example.Com/api/v1/",
      otp: "b".repeat(64),
      createdAt: Date.now(),
    });

    expect(loadDesktopFlowState("https://sys.platform.example.com")).toMatchObject({
      realm: "https://sys.platform.example.com",
      otp: "b".repeat(64),
    });
  });

  it("decrypts pasted desktop flow payload", async () => {
    const otp = generateDesktopFlowOtp();
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: "user@example.com", api_key: "api-key" }),
      otp,
    );

    await expect(decryptDesktopFlowToken(encrypted, otp)).resolves.toContain("user@example.com");
  });

  it("parses credentials from supported payload formats", () => {
    expect(parseDesktopFlowCredentials('{"email":"user@example.com","api_key":"key-1"}')).toEqual({
      email: "user@example.com",
      apiKey: "key-1",
    });
    expect(parseDesktopFlowCredentials("email=user@example.com&api_key=key-2")).toEqual({
      email: "user@example.com",
      apiKey: "key-2",
    });
    expect(parseDesktopFlowCredentials("garbage")).toBeNull();
  });

  it("rejects malformed email and blank apiKey payloads", () => {
    expect(parseDesktopFlowCredentials('{"email":"user@example","api_key":"key-1"}')).toBeNull();
    expect(parseDesktopFlowCredentials("email=user@example.com&api_key=%20%20%20")).toBeNull();
    expect(parseDesktopFlowCredentials("user@example.com:   ")).toBeNull();
  });

  it("normalizes surrounding whitespace in parsed credentials", () => {
    expect(
      parseDesktopFlowCredentials('{"email":"  user@example.com  ","api_key":"  key-3  "}'),
    ).toEqual({
      email: "user@example.com",
      apiKey: "key-3",
    });
  });

  it("parses login token from supported payload formats", () => {
    expect(parseDesktopFlowLoginToken("token-abc-123")).toBe("token-abc-123");
    expect(parseDesktopFlowLoginToken('{"token":"desktop-flow-token"}')).toBe("desktop-flow-token");
    expect(parseDesktopFlowLoginToken("login_token=session-token-42")).toBe("session-token-42");
  });

  it("does not treat credential payload as login token", () => {
    expect(parseDesktopFlowLoginToken('{"email":"user@example.com","api_key":"key-1"}')).toBeNull();
    expect(parseDesktopFlowLoginToken("email=user@example.com&api_key=key-2")).toBeNull();
  });
});
