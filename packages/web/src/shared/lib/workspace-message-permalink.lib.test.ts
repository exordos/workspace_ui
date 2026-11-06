import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceMessageDesktopLink,
  buildWorkspaceMessagePermalink,
  parseWorkspaceMessagePermalink,
  resolveWorkspaceMessageWebOrigin,
} from "./workspace-message-permalink.lib";

const scope = {
  orgId: "org-1",
  projectId: "project-1",
  messageUuid: "11111111-1111-4111-8111-111111111111",
};
const path = "/org/org-1/project/project-1/message/11111111-1111-4111-8111-111111111111";
describe("message permalink contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds explicit web and desktop URLs for the same target", () => {
    expect(buildWorkspaceMessagePermalink("https://chat.example", scope)).toBe(
      `https://chat.example${path}`,
    );
    expect(buildWorkspaceMessageDesktopLink(scope)).toBe(`ew://open${path}`);
    expect(buildWorkspaceMessagePermalink(undefined, scope)).toBeNull();
    expect(buildWorkspaceMessageDesktopLink({ ...scope, messageUuid: "" })).toBeNull();
  });
  it("rejects unsafe origins and incomplete or ambiguous targets", () => {
    for (const origin of [
      "file:///tmp/app",
      "http://chat.example",
      "https://user:pass@chat.example",
      "https://chat.example/api",
    ]) {
      expect(buildWorkspaceMessagePermalink(origin, scope)).toBeNull();
    }
    expect(buildWorkspaceMessagePermalink("http://localhost:5173", scope)).toBe(
      `http://localhost:5173${path}`,
    );
    for (const messageUuid of ["not-a-uuid", "..", "a/b", "a\\b", "a%2fb", " a "]) {
      expect(buildWorkspaceMessageDesktopLink({ ...scope, messageUuid })).toBeNull();
    }
  });
  it("keeps the original origin until trust is checked", () => {
    expect(
      parseWorkspaceMessagePermalink(`https://chat.example${path}`, ["https://chat.example"]),
    ).toEqual({ ...scope, path });
    expect(parseWorkspaceMessagePermalink(path, [])).toEqual({ ...scope, path });
    for (const value of [
      `https://evil.example${path}`,
      `//evil.example${path}`,
      `https://user@chat.example${path}`,
      `${path}?token=secret`,
      `${path}/extra`,
      `${path}%2fextra`,
      `ew://open${path}`,
    ]) {
      expect(parseWorkspaceMessagePermalink(value, ["https://chat.example"])).toBeNull();
    }
  });
  it.each([
    ["https://public.example", "https://default.example", "https://public.example"],
    ["", "https://default.example", "https://default.example"],
    ["", "https://default.example:8443/api/v1", "https://default.example:8443"],
    ["", "", "https://org.example"],
    ["", "file:///bad", "https://org.example"],
  ])(
    "copies an Electron link from public=%j and default=%j using %s",
    (publicUrl, defaultUrl, expectedOrigin) => {
      vi.stubGlobal("electronAPI", {});
      vi.stubEnv("VITE_WORKSPACE_WEB_ORIGIN", publicUrl);
      vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", defaultUrl);
      const origin = resolveWorkspaceMessageWebOrigin({
        organizationOrigin: "https://org.example",
      });
      const url = buildWorkspaceMessagePermalink(origin, { ...scope, orgId: "org.example" });
      expect(url).toBe(
        `${expectedOrigin}/org/org.example/project/${scope.projectId}/message/${scope.messageUuid}`,
      );
    },
  );

  it("keeps the Electron window out of copied links when no organization origin is available", () => {
    vi.stubGlobal("electronAPI", {});
    vi.stubEnv("VITE_WORKSPACE_WEB_ORIGIN", "");
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "");
    expect(resolveWorkspaceMessageWebOrigin()).toBeNull();
  });
  it("prefers an explicit public installation origin", () => {
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://default.example");
    vi.stubEnv("VITE_WORKSPACE_WEB_ORIGIN", "");
    expect(
      resolveWorkspaceMessageWebOrigin({
        configuredOrigin: "https://public.example",
        browserOrigin: "https://browser.example",
        organizationOrigin: "https://org.example",
      }),
    ).toBe("https://public.example");
    expect(
      resolveWorkspaceMessageWebOrigin({
        configuredOrigin: "file:///bad",
        browserOrigin: "https://browser.example",
      }),
    ).toBeNull();
    expect(resolveWorkspaceMessageWebOrigin({ browserOrigin: "https://browser.example" })).toBe(
      "https://browser.example",
    );
  });
});
