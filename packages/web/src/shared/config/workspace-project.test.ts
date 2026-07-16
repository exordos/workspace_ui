import { describe, expect, it } from "vitest";
import {
  WORKSPACE_IAM_PROJECT_SCOPE,
  WORKSPACE_IAM_PROJECT_SCOPE_VERSION,
  WORKSPACE_PROJECT_UUID,
} from "./workspace-project";

describe("workspace project configuration", () => {
  it("pins Workspace authentication and local scopes to the deployed project", () => {
    expect(WORKSPACE_PROJECT_UUID).toBe("fe02e55d-4548-4b3e-a175-fcae928f41b2");
    expect(WORKSPACE_IAM_PROJECT_SCOPE).toBe(`project:${WORKSPACE_PROJECT_UUID}`);
    expect(WORKSPACE_IAM_PROJECT_SCOPE_VERSION).toBe(1);
  });
});
