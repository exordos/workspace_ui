import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type * as ZulipAuthModule from "~/shared/api/zulip-auth";
import { saveDesktopFlowState } from "~/shared/lib/oidc-desktop";
import { renderWithProviders } from "~/test/render";
import { PasteTokenPage } from "./paste-token-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const exchangeDesktopFlowToken = vi.hoisted(() => vi.fn());
const fetchServerSettings = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/api/zulip-auth", async () => {
  const actual = await vi.importActual<typeof ZulipAuthModule>("~/shared/api/zulip-auth");
  return {
    ...actual,
    exchangeDesktopFlowToken,
    fetchServerSettings,
  };
});

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

describe("PasteTokenPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    exchangeDesktopFlowToken.mockReset();
    fetchServerSettings.mockReset();
    useInstancesStore.setState({ instances: [], currentInstanceId: null });
    localStorage.removeItem("zulip-web-instances");
    localStorage.removeItem("zulip-web-current-instance");
    sessionStorage.clear();
  });

  it("adds instance and redirects after successful pasted token parsing", async () => {
    const otp = "0123456789abcdef".repeat(4);
    const runtimeApiKey = `oidc-runtime-${Date.now()}`;
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: "user@example.com", api_key: runtimeApiKey }),
      otp,
    );

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fchat.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(useInstancesStore.getState().instances[0]).toMatchObject({
        realm: "https://chat.example.com",
        email: "user@example.com",
        apiKey: runtimeApiKey,
      });
    });
    expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    expect(exchangeDesktopFlowToken).not.toHaveBeenCalled();
  });

  it("stores input realm and organization icon when server settings return another canonical realm", async () => {
    const otp = "abcdef0123456789".repeat(4);
    fetchServerSettings.mockResolvedValue({
      realm_name: "Canonical Org",
      realm_uri: "https://canonical.example.com",
      realm_url: "https://canonical.example.com",
      realm_icon: "/user_avatars/1/realm/icon.png",
      external_authentication_methods: [],
    });
    saveDesktopFlowState({
      realm: "https://gw.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: "user@example.com", api_key: "key-123" }),
      otp,
    );

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fgw.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(useInstancesStore.getState().instances[0]).toMatchObject({
        realm: "https://gw.example.com",
        email: "user@example.com",
        apiKey: "key-123",
        realmIcon: "/user_avatars/1/realm/icon.png",
        workspaceOrgOrigin: "https://gw.example.com",
      });
    });
  });

  it("shows validation error for invalid token payload", async () => {
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp: "0123456789abcdef".repeat(4),
      createdAt: Date.now(),
    });

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fchat.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: "deadbeef" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument();
    });
  });

  it("accepts direct login token when flow state is missing", async () => {
    const rawCode = "direct-login-token-abc12345";
    exchangeDesktopFlowToken.mockResolvedValue({
      authType: "session",
      email: "session-user@example.com",
    });

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fchat.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: rawCode },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(exchangeDesktopFlowToken).toHaveBeenCalledWith("https://chat.example.com", rawCode);
    });
    await waitFor(() => {
      expect(useInstancesStore.getState().instances[0]).toMatchObject({
        realm: "https://chat.example.com",
        email: "session-user@example.com",
        apiKey: "",
        authType: "session",
      });
    });
    expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
  });

  it("ignores external redirectTo and navigates to root", async () => {
    const otp = "fedcba9876543210".repeat(4);
    const runtimeApiKey = `oidc-runtime-${Date.now()}`;
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: "user@example.com", api_key: runtimeApiKey }),
      otp,
    );

    renderWithProviders(<PasteTokenPage />, {
      route:
        "/paste-token?realm=https%3A%2F%2Fchat.example.com&redirectTo=https%3A%2F%2Fevil.example%2Fphish",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("exchanges token payload and stores a session-auth instance", async () => {
    const otp = "a1b2c3d4e5f6".repeat(5) + "a1b2";
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload("desktop-flow-login-token", otp);
    exchangeDesktopFlowToken.mockResolvedValue({
      authType: "session",
      email: "session-user@example.com",
    });

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fchat.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(exchangeDesktopFlowToken).toHaveBeenCalledWith(
        "https://chat.example.com",
        "desktop-flow-login-token",
      );
    });
    await waitFor(() => {
      expect(useInstancesStore.getState().instances[0]).toMatchObject({
        realm: "https://chat.example.com",
        email: "session-user@example.com",
        apiKey: "",
        authType: "session",
      });
    });
    expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows duplicate account error and does not navigate after paste-token login", async () => {
    useInstancesStore.getState().addInstance({
      realm: "https://chat.example.com",
      email: "user@example.com",
      apiKey: "existing-key",
    });
    const otp = "0123456789abcdef".repeat(4);
    saveDesktopFlowState({
      realm: "https://chat.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: " USER@example.com ", api_key: "new-key" }),
      otp,
    );

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fchat.example.com%2Fapi%2Fv1",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByText(/this account has already been added/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(useInstancesStore.getState().instances).toHaveLength(1);
    expect(useInstancesStore.getState().instances[0]?.apiKey).toBe("existing-key");
  });

  it("treats OIDC gateway login as duplicate of an existing canonical realm account", async () => {
    useInstancesStore.getState().addInstance({
      realm: "https://canonical.example.com",
      email: "user@example.com",
      apiKey: "existing-key",
      workspaceOrgOrigin: "https://gw.example.com",
    });
    const otp = "abcdef0123456789".repeat(4);
    saveDesktopFlowState({
      realm: "https://gw.example.com",
      otp,
      createdAt: Date.now(),
    });
    const encrypted = await encryptDesktopFlowPayload(
      JSON.stringify({ email: "USER@example.com", api_key: "new-key" }),
      otp,
    );

    renderWithProviders(<PasteTokenPage />, {
      route: "/paste-token?realm=https%3A%2F%2Fgw.example.com",
    });

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: encrypted },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByText(/this account has already been added/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(useInstancesStore.getState().instances).toHaveLength(1);
    expect(useInstancesStore.getState().instances[0]).toMatchObject({
      realm: "https://canonical.example.com",
      email: "user@example.com",
      apiKey: "existing-key",
      workspaceOrgOrigin: "https://gw.example.com",
    });
  });
});
