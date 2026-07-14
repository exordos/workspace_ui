import { describe, expect, it } from "vitest";
import {
  devWorkspaceBrowserMountPath,
  isAllowedDevWorkspaceProxyTargetOrigin,
  workspaceDevProxyUpstreamPathname,
} from "./dev-workspace-org-proxy";

describe("devWorkspaceBrowserMountPath", () => {
  it("matches dev WORKSPACE_API_BASE when REST path is empty", () => {
    expect(devWorkspaceBrowserMountPath("")).toBe("/api/workspace");
  });

  it("concatenates normalized REST suffix", () => {
    expect(devWorkspaceBrowserMountPath("/gateway")).toBe("/gateway");
  });

  it("does not duplicate the canonical REST mount", () => {
    expect(devWorkspaceBrowserMountPath("/api/workspace")).toBe("/api/workspace");
  });
});

describe("workspaceDevProxyUpstreamPathname", () => {
  it("with empty REST suffix upstream is /v1/… only", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/api/workspace/v1/folders/",
        mount: "/api/workspace",
        onDevEscaped: false,
        workspaceRestPathRaw: "",
      }),
    ).toBe("/v1/folders/");
  });

  it("prepends WORKSPACE_REST_API_PATH after stripping dev mount", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/api/workspace/v1/folders/",
        mount: "/api/workspace",
        onDevEscaped: false,
        workspaceRestPathRaw: "/api/workspace",
      }),
    ).toBe("/api/workspace/v1/folders/");
  });

  it("strips a custom gateway mount and prepends the same suffix", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/gateway/v1/folders/",
        mount: "/gateway",
        onDevEscaped: false,
        workspaceRestPathRaw: "/gateway",
      }),
    ).toBe("/gateway/v1/folders/");
  });

  it("handles __dev escaped path then mount", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/__dev_workspace_org/api/workspace/v1/folders/",
        mount: "/api/workspace",
        onDevEscaped: true,
        workspaceRestPathRaw: "",
      }),
    ).toBe("/v1/folders/");
  });
});

describe("isAllowedDevWorkspaceProxyTargetOrigin", () => {
  it("allows https origin without path or query", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("https://chat.example.com")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("https://chat.example.com/")).toBe(true);
  });

  it("rejects https with path", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("https://chat.example.com/api")).toBe(false);
  });

  it("allows http for localhost, loopback, .local, and private networks", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://localhost:9991")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://127.0.0.1:8080")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://[::1]:3000")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://workspace.exordos.local")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://192.168.1.50:8080")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://evil.com")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("file:///etc/passwd")).toBe(false);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("ftp://chat.example.com")).toBe(false);
  });
});
