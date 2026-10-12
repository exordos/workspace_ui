/**
 * E2E tests for the profile drawer and settings.
 */
import { test, expect } from "./fixtures";
import { E2E_USER_UUID, usersSuccess } from "./mocks/workspace-default-responses";

test.describe("Profile & Settings", () => {
  test("edits IAM fields inline with a live top name and refreshes the Workspace profile", async ({
    authenticated,
  }) => {
    let user = usersSuccess()[0];
    if (user == null) throw new Error("Missing fixture user");
    let savedBody: unknown;
    await authenticated.route(/\/api\/core\/v1\/iam\/users\//, async (route) => {
      if (route.request().method() === "PUT") {
        const patch = route.request().postDataJSON() as Record<string, unknown>;
        savedBody = patch;
        user = {
          ...user,
          first_name: String(patch.first_name),
          last_name: String(patch.last_name),
          updated_at: "2026-07-16T10:01:00.000Z",
        };
      }
      await route.fulfill({
        json: { ...user, uuid: E2E_USER_UUID, phone: "+123", description: "About E2E" },
      });
    });
    await authenticated.route(/\/api\/workspace\/v1\/users\/[^/]+$/, async (route) => {
      await route.fulfill({ json: user });
    });
    await authenticated.getByRole("button", { name: /профиль|profile/i }).click();
    await authenticated.getByRole("button", { name: /личная информация|personal info/i }).click();
    const panel = authenticated.getByTestId("right-panel-user-profile");
    const details = authenticated.getByTestId("right-panel-user-profile-details");
    await expect(details).toBeVisible();
    await expect(authenticated.locator('input[name="firstName"]')).toHaveCount(0);
    await expect(authenticated.locator('input[name="lastName"]')).toHaveCount(0);
    await expect(authenticated.locator('input[name="username"]')).toHaveCount(0);
    const originalDetailIds = await details
      .locator(":scope > li")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-testid")).filter((id): id is string => id != null),
      );
    await authenticated.getByTestId("right-panel-profile-edit").click();
    await expect(details).toBeVisible();
    for (const id of originalDetailIds) await expect(authenticated.getByTestId(id)).toBeVisible();
    const emailRow = authenticated.getByTestId("right-panel-profile-detail-email");
    await expect(emailRow).toContainText(user.email);
    await expect(emailRow.locator("input")).toHaveCount(0);
    await expect(emailRow.getByRole("button", { name: /копировать|copy/i })).toBeVisible();
    await expect(
      authenticated.getByTestId("right-panel-profile-detail-phone").locator("input"),
    ).toHaveValue("+123");
    const topName = authenticated.getByTestId("right-panel-profile-name-readonly");
    const preview = topName.getByTestId("profile-display-name-preview");
    await expect(authenticated.getByTestId("profile-display-name-preview")).toHaveCount(1);
    await authenticated.locator('input[name="lastName"]').fill("");
    await expect(preview).toHaveText("E2E");
    await authenticated.locator('input[name="firstName"]').fill("  ");
    await expect(preview).toHaveText(user.username);
    await authenticated.locator('input[name="username"]').fill("new-username");
    await expect(preview).toHaveText("new-username");
    await authenticated.locator('input[name="lastName"]').fill("OnlyLast");
    await expect(preview).toHaveText("OnlyLast");
    await authenticated.getByTestId("right-panel-profile-cancel").click();
    await expect(panel).toHaveAttribute("data-editing", "false");
    await expect(panel.locator("header p").first()).toHaveText("E2E User");
    expect(savedBody).toBeUndefined();
    await authenticated.getByTestId("right-panel-profile-edit").click();
    await expect(authenticated.locator('input[name="username"]')).toHaveValue(user.username);
    await expect(authenticated.locator('input[name="firstName"]')).toHaveValue("E2E");
    await authenticated.locator('input[name="firstName"]').fill("Edited");
    await authenticated.locator('input[name="lastName"]').fill("Person");
    await expect(authenticated.locator('input[name="username"]')).toHaveValue(user.username);
    await expect(authenticated.getByTestId("profile-display-name-preview")).toHaveText(
      "Edited Person",
    );
    await authenticated.getByTestId("right-panel-profile-save").click();
    await expect(authenticated.getByTestId("right-panel-user-profile")).toHaveAttribute(
      "data-editing",
      "false",
    );
    expect(savedBody).toEqual({ first_name: "Edited", last_name: "Person" });
    await expect(authenticated.getByRole("button", { name: /профиль|profile/i })).toContainText(
      "Edited Person",
    );
    await expect(authenticated.locator('input[name="username"]')).toHaveCount(0);
    await expect(panel.locator("header p").first()).toHaveText("Edited Person");
    await authenticated.getByTestId("right-panel-profile-edit").click();
    await expect(authenticated.locator('input[name="firstName"]')).toHaveValue("Edited");
    await expect(authenticated.locator('input[name="lastName"]')).toHaveValue("Person");
  });
  test("profile button exists in top bar", async ({ authenticated }) => {
    const profileBtn = authenticated.getByRole("button", { name: /профиль|profile/i });
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
  });

  test("dark theme is default", async ({ authenticated }) => {
    await expect(authenticated.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("app has correct lang attribute", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(["en", "ru"]).toContain(lang);
  });
});
