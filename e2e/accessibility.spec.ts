import { test, expect, expectLoginOrganizationStep } from "./fixtures";

test.describe("Accessibility", () => {
  test("login page has a non-empty document title", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expect(guestPage).toHaveTitle(/.+/);
    const title = await guestPage.title();
    expect(title.trim().length).toBeGreaterThan(0);
  });

  test("html lang attribute is set", async ({ guestPage }) => {
    await guestPage.goto("/");
    const lang = await guestPage.getAttribute("html", "lang");
    expect(lang).toBeTruthy();
    expect(["ru", "en"]).toContain(lang);
  });

  test("login form fields have labels or placeholders", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expectLoginOrganizationStep(guestPage);
    const inputs = guestPage.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute("placeholder");
      const ariaLabel = await input.getAttribute("aria-label");
      const id = await input.getAttribute("id");
      expect(placeholder ?? ariaLabel ?? id).toBeTruthy();
    }
  });
});
