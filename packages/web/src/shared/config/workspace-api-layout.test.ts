import { describe, expect, it } from "vitest";
import {
  VANILLA_ZULIP_HTTP_PATH_DEFAULTS,
  WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS,
  WORKSPACE_HTTP_PATH_DEFAULTS,
} from "./workspace-api-layout";

describe("workspace-api-layout", () => {
  it("exposes vanilla Zulip path defaults", () => {
    expect(VANILLA_ZULIP_HTTP_PATH_DEFAULTS.zulipApiPath).toBe("/api/v1");
    expect(VANILLA_ZULIP_HTTP_PATH_DEFAULTS.workspaceApiPath).toBe("/api/v1");
    expect(VANILLA_ZULIP_HTTP_PATH_DEFAULTS.workspaceRestApiPath).toBe("");
  });

  it("gateway defaults use /workspace/v1 for workspace API path", () => {
    expect(WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS.workspaceApiPath).toBe("/workspace/v1");
    expect(WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS.zulipApiPath).toBe("/api/v1");
  });

  it("active defaults match gateway preset", () => {
    expect(WORKSPACE_HTTP_PATH_DEFAULTS).toEqual(WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS);
  });
});
