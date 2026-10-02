import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveInitialLoginOrganization } from "./login-initial-organization.lib";

describe("resolveInitialLoginOrganization", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses an explicit local backend default in DEV before the Vite origin", () => {
    vi.stubEnv("DEV", true);
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "http://127.0.0.1:23190",
      }),
    ).toEqual({ organizationUrl: "http://127.0.0.1:23190", autoAdvance: true });
  });

  it("uses an explicitly provided local realm in DEV", () => {
    vi.stubEnv("DEV", true);
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: "http://localhost:23190",
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({ organizationUrl: "http://localhost:23190", autoAdvance: true });
  });

  it("does not infer a backend from the local Vite origin in DEV", () => {
    vi.stubEnv("DEV", true);
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({ organizationUrl: "", autoAdvance: false });
  });

  it("does not auto-advance a configured HTTP loopback backend in production", () => {
    vi.stubEnv("DEV", false);
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "http://127.0.0.1:23190",
      }),
    ).toEqual({ organizationUrl: "", autoAdvance: false });
  });

  it("uses the browser origin and advances when it is a valid organization URL", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({
      organizationUrl: "https://workspace.example.com",
      autoAdvance: true,
    });
  });

  it("uses an explicit browser realm before the current origin", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: "https://other.example.com",
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "https://default.example.com",
      }),
    ).toEqual({
      organizationUrl: "https://other.example.com",
      autoAdvance: true,
    });
  });

  it("uses the configured default organization before a valid browser origin", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "https://default.example.com",
      }),
    ).toEqual({
      organizationUrl: "https://default.example.com",
      autoAdvance: true,
    });
  });

  it("uses the browser origin when the configured default is invalid", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "not-a-url",
      }),
    ).toEqual({
      organizationUrl: "https://workspace.example.com",
      autoAdvance: true,
    });
  });

  it("keeps the organization step empty when neither source is valid", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: null,
        browserOrigin: "http://localhost:5173",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({
      organizationUrl: "",
      autoAdvance: false,
    });
  });

  it("does not advance an Electron realm prefill", () => {
    expect(
      resolveInitialLoginOrganization({
        realmPrefill: "https://workspace.example.com",
        browserOrigin: null,
        defaultOrganizationUrl: "https://default.example.com",
      }),
    ).toEqual({
      organizationUrl: "https://workspace.example.com",
      autoAdvance: false,
    });
  });
});
