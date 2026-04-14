import { describe, expect, it } from "vitest";
import {
  workspaceOrgApiOriginFromZulipRealmRoot,
  workspaceOrgOriginFromLoginServerUrlInput,
} from "./workspace-org-origin.lib";

describe("workspaceOrgOriginFromLoginServerUrlInput", () => {
  it("returns origin from typed server URL", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("https://workspace.tokens.team")).toBe(
      "https://workspace.tokens.team",
    );
  });

  it("strips /api/v1 before taking origin", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("https://gw.example.com/api/v1")).toBe(
      "https://gw.example.com",
    );
  });

  it("adds https when scheme omitted", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("gw.example.com")).toBe("https://gw.example.com");
  });
});

describe("workspaceOrgApiOriginFromZulipRealmRoot", () => {
  it("maps zulip subdomain to workspace subdomain", () => {
    expect(workspaceOrgApiOriginFromZulipRealmRoot("https://zulip.tokens.team")).toBe(
      "https://workspace.tokens.team",
    );
  });

  it("is case-insensitive on hostname", () => {
    expect(workspaceOrgApiOriginFromZulipRealmRoot("https://ZULIP.tokens.team")).toBe(
      "https://workspace.tokens.team",
    );
  });

  it("preserves non-default port", () => {
    expect(workspaceOrgApiOriginFromZulipRealmRoot("https://zulip.tokens.team:8443")).toBe(
      "https://workspace.tokens.team:8443",
    );
  });

  it("leaves non-zulip hosts unchanged", () => {
    expect(workspaceOrgApiOriginFromZulipRealmRoot("https://chat.example.com")).toBe(
      "https://chat.example.com",
    );
  });

  it("returns trimmed input when URL cannot be parsed", () => {
    expect(workspaceOrgApiOriginFromZulipRealmRoot("https://not a host")).toBe("https://not a host");
  });
});
