import { afterEach, describe, expect, it } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import { WORKSPACE_PROJECT_UUID } from "~/shared/config/workspace-project";
import {
  resolveCurrentMessengerCacheAccountScope,
  resolveCurrentMessengerEntitiesCacheKey,
} from "./messenger-cache-scope.lib";

const USER_UUID = "22222222-2222-4222-8222-222222222222";
const TOKEN_PROJECT_UUID = "11111111-1111-4111-8111-111111111111";

function accessToken(): string {
  const payload = btoa(JSON.stringify({ sub: USER_UUID, project_id: TOKEN_PROJECT_UUID }));
  return `e30.${payload}.signature`;
}

afterEach(() => {
  setInstanceProvider(() => null);
});

describe("messenger cache scope", () => {
  it("uses the canonical Workspace project instead of a token project claim", () => {
    setInstanceProvider(() => ({
      id: "instance-a",
      realm: "https://Workspace.Example.com/",
      login: "cassi",
      authType: "iam",
      iamAccessToken: accessToken(),
    }));

    expect(resolveCurrentMessengerCacheAccountScope()).toEqual({
      accountScope: `https://workspace.example.com|${USER_UUID}`,
      projectId: WORKSPACE_PROJECT_UUID,
      userUuid: USER_UUID,
    });
    expect(resolveCurrentMessengerEntitiesCacheKey()).toBe(
      `https://workspace.example.com|${USER_UUID}|${WORKSPACE_PROJECT_UUID}`,
    );
  });
});
