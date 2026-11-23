import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveInitialLoginOrganization } from "./login-initial-organization.lib";

describe("resolveInitialLoginOrganization", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses an explicit local backend default in DEV before the Vite origin", () => {
    vi.stubEnv("DEV", true);
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "http://127.0.0.1:23190",
      }),
    ).toEqual({ organizationUrl: "http://127.0.0.1:23190", autoAdvance: true });
  });

  it("does not infer a backend from the local Vite origin in DEV", () => {
    vi.stubEnv("DEV", true);
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({ organizationUrl: "", autoAdvance: false });
  });

  it("does not auto-advance a configured HTTP loopback backend in production", () => {
    vi.stubEnv("DEV", false);
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "http://localhost:5176",
        defaultOrganizationUrl: "http://127.0.0.1:23190",
      }),
    ).toEqual({ organizationUrl: "", autoAdvance: false });
  });

  it("uses the browser origin and advances when it is a valid organization URL", () => {
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({
      organizationUrl: "https://workspace.example.com",
      autoAdvance: true,
    });
  });

  it("uses the configured default organization before a valid browser origin", () => {
    expect(
      resolveInitialLoginOrganization({
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
        browserOrigin: "http://localhost:5173",
        defaultOrganizationUrl: "",
      }),
    ).toEqual({
      organizationUrl: "",
      autoAdvance: false,
    });
  });

  it("uses the matching session origin for a message on a shared installation", () => {
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "https://workspace.example.com",
        defaultOrganizationUrl: "https://default.example.com",
        sessionOrigins: ["https://previous.example.com", "https://other.example.com:8443"],
        messageOrgId: "other.example.com-8443",
      }),
    ).toEqual({ organizationUrl: "https://other.example.com:8443", autoAdvance: true });
  });

  it("requires a manual choice when the organization ID matches two distinct origins", () => {
    expect(
      resolveInitialLoginOrganization({
        browserOrigin: "https://my-team.example.com",
        defaultOrganizationUrl: "https://my--team.example.com",
        messageOrgId: "my-team.example.com",
      }),
    ).toEqual({ organizationUrl: "", autoAdvance: false });
  });
});
