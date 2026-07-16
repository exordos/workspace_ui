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

test.describe("Login page", () => {
  test("shows login form when no instances", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expectLoginOrganizationStep(guestPage);
  });

  test("has realm, email, and password fields across login steps", async ({ guestPage }) => {
    await guestPage.goto("/");
    await guestPage.getByLabel(LOGIN_SERVER_FIELD).fill(E2E_ORGANIZATION_URL);
    await guestPage.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();

    await expect(guestPage.getByLabel(LOGIN_EMAIL_FIELD)).toBeVisible();
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);
    await expect(guestPage.getByLabel(/^пароль$|^password$/i)).toBeVisible();
  });

  test("login button is present after entering email", async ({ guestPage }) => {
    await guestPage.goto("/");
    await guestPage.getByLabel(LOGIN_SERVER_FIELD).fill(E2E_ORGANIZATION_URL);
    await guestPage.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();
    await expect(guestPage.getByLabel(LOGIN_EMAIL_FIELD)).toBeVisible();
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);

    const button = guestPage.getByRole("button", { name: LOGIN_BUTTON });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
