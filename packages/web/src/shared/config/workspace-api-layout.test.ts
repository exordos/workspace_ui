import { describe, expect, it } from "vitest";
import {
  WORKSPACE_API_PATH,
  WORKSPACE_GATEWAY_V1_PATH,
  WORKSPACE_REST_API_PATH,
  ZULIP_API_PATH,
} from "./workspace-api-layout";

describe("workspace-api-layout", () => {
  it("exposes fixed gateway and Zulip API paths", () => {
    expect(ZULIP_API_PATH).toBe("/api/v1");
    expect(WORKSPACE_REST_API_PATH).toBe("/workspace");
    expect(WORKSPACE_GATEWAY_V1_PATH).toBe("/workspace/v1");
    expect(WORKSPACE_API_PATH).toBe(WORKSPACE_GATEWAY_V1_PATH);
  });
});
