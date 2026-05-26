import type { Page } from "@playwright/test";
import { E2E_EMAIL, E2E_INSTANCE_ID, E2E_REALM } from "../mocks/zulip-default-responses";

export async function seedAuthStorage(page: Page, apiKey?: string): Promise<string> {
  const key = apiKey ?? `fixture-key-${Date.now()}`;
  await page.goto("/");
  await page.evaluate(
    ({ instanceId, realm, email, resolvedApiKey }) => {
      const instance = {
        id: instanceId,
        realm,
        email,
        apiKey: resolvedApiKey,
      };
      localStorage.setItem("zulip-web-instances", JSON.stringify([instance]));
      localStorage.setItem("zulip-web-current-instance", instanceId);
      localStorage.setItem(`workspace-theme-mode:${instanceId}`, "dark");
      localStorage.setItem(`workspace-palette:${instanceId}`, "orange-warm");
    },
    { instanceId: E2E_INSTANCE_ID, realm: E2E_REALM, email: E2E_EMAIL, resolvedApiKey: key },
  );
  return key;
}
