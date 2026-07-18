import type { Page } from "@playwright/test";
import { WORKSPACE_IAM_PROJECT_SCOPE_VERSION } from "../../packages/web/src/shared/config/workspace-project";
import {
  E2E_EMAIL,
  E2E_INSTANCE_ID,
  E2E_REALM,
  E2E_USER_UUID,
} from "../mocks/messenger-default-responses";

function e2eIamAccessToken(userUuid = E2E_USER_UUID): string {
  const payload = Buffer.from(JSON.stringify({ sub: userUuid, email: E2E_EMAIL })).toString(
    "base64url",
  );
  return `e2e.${payload}.signature`;
}

export async function seedAuthStorage(page: Page, apiKey?: string): Promise<string> {
  const key = apiKey ?? e2eIamAccessToken();
  await page.goto("/");
  await page.evaluate(
    ({ instanceId, projectScopeVersion, realm, email, resolvedApiKey }) => {
      const instance = {
        id: instanceId,
        realm,
        login: email,
        authType: "iam",
        iamAccessToken: resolvedApiKey,
        iamProjectScopeVersion: projectScopeVersion,
      };
      localStorage.setItem("messenger-web-instances", JSON.stringify([instance]));
      localStorage.setItem("messenger-web-current-instance", instanceId);
      localStorage.setItem(`workspace-theme-mode:${instanceId}`, "dark");
      localStorage.setItem(`workspace-palette:${instanceId}`, "orange-warm");
    },
    {
      instanceId: E2E_INSTANCE_ID,
      projectScopeVersion: WORKSPACE_IAM_PROJECT_SCOPE_VERSION,
      realm: E2E_REALM,
      email: E2E_EMAIL,
      resolvedApiKey: key,
    },
  );
  return key;
}
