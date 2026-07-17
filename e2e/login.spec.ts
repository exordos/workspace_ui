import type { Page } from "@playwright/test";
import {
  test,
  expect,
  LOGIN_BUTTON,
  LOGIN_NEXT_BUTTON,
  LOGIN_SERVER_FIELD,
  expectLoginOrganizationStep,
} from "./fixtures";

const E2E_EMAIL = "e2e@example.test";
const E2E_ORGANIZATION_URL = "https://workspace.example.test";
const LOGIN_EMAIL_FIELD = /email|логин/i;
const SERVER_SETTINGS_PATH = /^\/api\/workspace\/v1\/messenger\/server_settings\/?$/;

async function advanceToEmailStep(page: Page): Promise<void> {
  const serverSettingsResponse = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      SERVER_SETTINGS_PATH.test(new URL(response.url()).pathname)
    );
  });

  await page.getByLabel(LOGIN_SERVER_FIELD).fill(E2E_ORGANIZATION_URL);
  await page.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();

  expect((await serverSettingsResponse).ok()).toBe(true);
  await expect(page.getByLabel(LOGIN_EMAIL_FIELD)).toBeVisible();
}

test.describe("Login page", () => {
  test("shows login form when no instances", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expectLoginOrganizationStep(guestPage);
  });

  test("has realm, email, and password fields across login steps", async ({ guestPage }) => {
    await guestPage.goto("/");
    await advanceToEmailStep(guestPage);
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);
    await expect(guestPage.getByLabel(/^пароль$|^password$/i)).toBeVisible();
  });

  test("login button is present after entering email", async ({ guestPage }) => {
    await guestPage.goto("/");
    await advanceToEmailStep(guestPage);
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);

    const button = guestPage.getByRole("button", { name: LOGIN_BUTTON });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
