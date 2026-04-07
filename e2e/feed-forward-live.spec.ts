import { existsSync, readFileSync } from "node:fs";
import { test, expect } from "./fixtures";

type LiveAuthEnv = Record<string, string>;

function parseDotEnv(contents: string): LiveAuthEnv {
  const env: LiveAuthEnv = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadLiveAuthEnvFromFile(): LiveAuthEnv {
  const envPath = `${process.cwd()}/packages/web/.env`;
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveLiveAuthVar(key: string, fileEnv: LiveAuthEnv): string | undefined {
  const processValue = process.env[key];
  const fileValue = fileEnv[key];
  if (!fileValue) return processValue;
  if (!processValue) return fileValue;

  // Shell-sourced .env can truncate "$..." fragments in passwords.
  if (fileValue.includes("$") && !processValue.includes("$") && fileValue.startsWith(processValue)) {
    return fileValue;
  }
  return processValue;
}

const FILE_ENV = loadLiveAuthEnvFromFile();
const LIVE_REALM = resolveLiveAuthVar("TEST_USER_ZULIP_SERVER", FILE_ENV);
const LIVE_EMAIL = resolveLiveAuthVar("TEST_USER_EMAIL", FILE_ENV);
const LIVE_PASSWORD = resolveLiveAuthVar("TEST_USER_PASSWORD", FILE_ENV);

test.describe("Feed forward live smoke", () => {
  test("opens forward flow from feed and pre-fills destination composer", async ({ page, loginAs }) => {
    test.skip(
      !(LIVE_REALM && LIVE_EMAIL && LIVE_PASSWORD),
      "Requires TEST_USER_ZULIP_SERVER, TEST_USER_EMAIL, TEST_USER_PASSWORD",
    );

    await loginAs(LIVE_EMAIL!, LIVE_PASSWORD!, LIVE_REALM!);
    await page.goto("/feed");

    const firstFeedRow = page.locator("ul > li").first();
    await expect(firstFeedRow).toBeVisible({ timeout: 20_000 });
    await firstFeedRow.hover();

    const forwardButton = page
      .locator("button[aria-label='Forward'], button[aria-label='Переслать']")
      .first();
    await expect(forwardButton).toBeVisible({ timeout: 10_000 });
    await forwardButton.click();

    await expect(page).toHaveURL(/forward=\d+/, { timeout: 20_000 });

    const streamSelect = page.locator("select").first();
    await expect(streamSelect).toBeVisible({ timeout: 10_000 });
    await streamSelect.selectOption({ index: 1 });

    const forwardToButton = page.getByRole("button", {
      name: /Forward to|Forward|Переслать в|Переслать/i,
    });
    await expect(forwardToButton).toBeEnabled({ timeout: 10_000 });
    await forwardToButton.click();

    const composer = page.locator("textarea").first();
    await expect(composer).toHaveValue(/@_\*\*/, { timeout: 20_000 });
  });
});
