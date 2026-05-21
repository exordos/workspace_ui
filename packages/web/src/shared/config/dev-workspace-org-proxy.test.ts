import { describe, expect, it } from "vitest";
import {
  devWorkspaceBrowserMountPath,
  isAllowedDevWorkspaceProxyTargetOrigin,
  workspaceDevProxyUpstreamPathname,
} from "./dev-workspace-org-proxy";

describe("devWorkspaceBrowserMountPath", () => {
  it("matches dev WORKSPACE_API_BASE when REST path is empty", () => {
    expect(devWorkspaceBrowserMountPath("")).toBe("/workspace");
  });

  it("concatenates normalized REST suffix", () => {
    expect(devWorkspaceBrowserMountPath("/gateway")).toBe("/workspace/gateway");
  });

  it("does not duplicate /workspace when REST path is already /workspace (prod gateway layout)", () => {
    expect(devWorkspaceBrowserMountPath("/workspace")).toBe("/workspace");
  });
});

describe("workspaceDevProxyUpstreamPathname", () => {
  it("with empty REST suffix upstream is /v1/… only", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/workspace/v1/folders/",
        mount: "/workspace",
        onDevEscaped: false,
        workspaceRestPathRaw: "",
      }),
    ).toBe("/v1/folders/");
  });

  it("prepends WORKSPACE_REST_API_PATH after stripping dev mount", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/workspace/v1/folders/",
        mount: "/workspace",
        onDevEscaped: false,
        workspaceRestPathRaw: "/workspace",
      }),
    ).toBe("/workspace/v1/folders/");
  });

  it("strips /workspace/gateway mount and prepends gateway suffix", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/workspace/gateway/v1/folders/",
        mount: "/workspace/gateway",
        onDevEscaped: false,
        workspaceRestPathRaw: "/gateway",
      }),
    ).toBe("/gateway/v1/folders/");
  });

  it("handles __dev escaped path then mount", () => {
    expect(
      workspaceDevProxyUpstreamPathname({
        pathname: "/__dev_workspace_org/workspace/v1/folders/",
        mount: "/workspace",
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

  it("allows http only for localhost and loopback", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://localhost:9991")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://127.0.0.1:8080")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://[::1]:3000")).toBe(true);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("http://evil.com")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isAllowedDevWorkspaceProxyTargetOrigin("file:///etc/passwd")).toBe(false);
    expect(isAllowedDevWorkspaceProxyTargetOrigin("ftp://chat.example.com")).toBe(false);
  });
});
