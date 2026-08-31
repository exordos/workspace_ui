import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DEFAULT_LOGIN_ORGANIZATION_URL = "https://workspace.example.test";
const ENABLE_WSL_FIREFOX = process.env.PW_WSL_FIREFOX === "1";

/**
 * Specs that compare two measurements of the same page — layout shift, on-screen
 * drift — rather than asserting a fixed outcome. Whatever else the machine is doing
 * lands in the numbers, so they get their own project and a single worker.
 */
const MEASUREMENT_SPECS =
  /(layout-shift|media-placeholder-shift|conversation-open-position)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],

  timeout: 45_000,
  expect: { timeout: 10_000 },
  grepInvert: process.env.E2E_GREP_INVERT
    ? new RegExp(process.env.E2E_GREP_INVERT)
    : process.env.CI
      ? /@live/
      : undefined,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  },

  projects: [
    {
      name: "chromium",
      testIgnore: MEASUREMENT_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "resilience",
      testMatch: /connection-resilience\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: false,
    },
    {
      name: "measurement",
      testMatch: MEASUREMENT_SPECS,
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "edge",
      testIgnore: MEASUREMENT_SPECS,
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    {
      name: "mobile-chrome",
      testIgnore: MEASUREMENT_SPECS,
      use: { ...devices["Pixel 7"] },
    },
    ...(ENABLE_WSL_FIREFOX
      ? [
          {
            name: "firefox",
            testIgnore: MEASUREMENT_SPECS,
            use: { ...devices["Desktop Firefox"] },
          },
        ]
      : []),
  ],

  webServer: {
    command: "npm run dev:web",
    url: BASE_URL,
    env: {
      VITE_DEFAULT_LOGIN_ORGANIZATION_URL: E2E_DEFAULT_LOGIN_ORGANIZATION_URL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
