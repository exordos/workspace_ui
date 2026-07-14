import { describe, expect, it } from "vitest";
import {
  MESSENGER_API_PATH,
  MESSENGER_WORKSPACE_API_PATH,
  WORKSPACE_API_PATH,
  WORKSPACE_GATEWAY_V1_PATH,
  WORKSPACE_REST_API_PATH,
} from "./workspace-api-layout";

describe("workspace-api-layout", () => {
  it("exposes fixed gateway and Messenger API paths", () => {
    expect(MESSENGER_API_PATH).toBe("/api/workspace/v1/messenger");
    expect(MESSENGER_WORKSPACE_API_PATH).toBe("/api/workspace/v1/messenger");
    expect(WORKSPACE_REST_API_PATH).toBe("/api/workspace");
    expect(WORKSPACE_GATEWAY_V1_PATH).toBe("/api/workspace/v1");
    expect(WORKSPACE_API_PATH).toBe(WORKSPACE_GATEWAY_V1_PATH);
  });
});
