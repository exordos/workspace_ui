import { describe, expect, it } from "vitest";
import {
  workspaceOrgApiOriginFromRealmRoot,
  workspaceOrgOriginFromLoginServerUrlInput,
} from "./workspace-org-origin.lib";

describe("workspaceOrgOriginFromLoginServerUrlInput", () => {
  it("returns origin from typed server URL", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("https://workspace.genesis-core.team")).toBe(
      "https://workspace.genesis-core.team",
    );
  });

  it("strips /api/v1 before taking origin", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("https://gw.example.com/api/v1")).toBe(
      "https://gw.example.com",
    );
  });

  it("adds https when scheme omitted", () => {
    expect(workspaceOrgOriginFromLoginServerUrlInput("gw.example.com")).toBe(
      "https://gw.example.com",
    );
  });
});

describe("workspaceOrgApiOriginFromRealmRoot", () => {
  it("keeps messenger subdomain on the original realm origin", () => {
    expect(workspaceOrgApiOriginFromRealmRoot("https://messenger.genesis-core.team")).toBe(
      "https://messenger.genesis-core.team",
    );
  });

  it("normalizes hostname case without changing the host", () => {
    expect(workspaceOrgApiOriginFromRealmRoot("https://WORKSPACE.genesis-core.team")).toBe(
      "https://workspace.genesis-core.team",
    );
  });

  it("preserves non-default port on the original realm origin", () => {
    expect(workspaceOrgApiOriginFromRealmRoot("https://messenger.genesis-core.team:8443")).toBe(
      "https://messenger.genesis-core.team:8443",
    );
  });

  it("leaves non-messenger hosts unchanged", () => {
    expect(workspaceOrgApiOriginFromRealmRoot("https://chat.example.com")).toBe(
      "https://chat.example.com",
    );
  });

  it("returns trimmed input when URL cannot be parsed", () => {
    expect(workspaceOrgApiOriginFromRealmRoot("https://not a host")).toBe("https://not a host");
  });
});
