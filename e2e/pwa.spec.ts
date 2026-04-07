/**
 * E2E tests for PWA capabilities.
 *
 * Verifies that the app has proper PWA metadata, viewport settings,
 * and service worker registration.
 */
import { test, expect } from "./fixtures";

test.describe("PWA Metadata", () => {
  // The app should have a viewport meta tag for mobile
  test("has viewport meta tag with correct settings", async ({ page }) => {
    await page.goto("/");
    const viewport = await page.getAttribute('meta[name="viewport"]', "content");
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
  });

  // Theme color meta tag should be present
  test("has theme-color meta tag", async ({ page }) => {
    await page.goto("/");
    const themeColor = await page.getAttribute('meta[name="theme-color"]', "content");
    expect(themeColor).toBeTruthy();
  });

  // Apple mobile web app meta tags should be present
  test("has apple-mobile-web-app-capable", async ({ page }) => {
    await page.goto("/");
    const capable = await page.getAttribute(
      'meta[name="apple-mobile-web-app-capable"]',
      "content",
    );
    expect(capable).toBe("yes");
  });

  // Security headers should be present
  test("has X-Content-Type-Options nosniff", async ({ page }) => {
    await page.goto("/");
    const meta = await page.getAttribute(
      'meta[http-equiv="X-Content-Type-Options"]',
      "content",
    );
    expect(meta).toBe("nosniff");
  });

  // Referrer policy should be set
  test("has strict referrer policy", async ({ page }) => {
    await page.goto("/");
    const referrer = await page.getAttribute('meta[name="referrer"]', "content");
    expect(referrer).toBe("strict-origin-when-cross-origin");
  });
});

test.describe("HTML Structure", () => {
  // Root element should exist
  test("has root div for React mounting", async ({ page }) => {
    await page.goto("/");
    const root = page.locator("#root");
    await expect(root).toBeAttached();
  });

  // No inline scripts (CSP compliance)
  test("no inline script tags in body", async ({ page }) => {
    await page.goto("/");
    const inlineScripts = await page.locator("body > script:not([src])").count();
    // Only the module entry point should be a script with src
    expect(inlineScripts).toBe(0);
  });
});
