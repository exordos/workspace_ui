import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;
const ENABLE_WSL_FIREFOX = process.env.PW_WSL_FIREFOX === "1";

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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "resilience",
      testMatch: /connection-resilience\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: false,
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    ...(ENABLE_WSL_FIREFOX
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
        ]
      : []),
  ],

  webServer: {
    command: "npm run dev:web",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
