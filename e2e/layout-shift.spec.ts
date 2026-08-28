/**
 * How much the chat moves under the reader while images load.
 *
 * The reported symptom — "everything jumps while scrolling" — is layout shift, and
 * layout shift is a number the browser will tell you: `PerformanceObserver` reports
 * a `layout-shift` entry for every frame in which laid-out content moved without
 * user input. So this is measured rather than eyeballed.
 *
 * An image whose dimensions the message carries reserves its box before the bytes
 * arrive and must not move anything. One without dimensions has nothing to reserve
 * and will shift — which is asserted too, as the proof that the instrument is
 * actually looking at something.
 */
import { expect, test } from "./fixtures";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import { E2E_PROJECT_ID, E2E_USER_UUID } from "./mocks/workspace-default-responses";
import type { Page, Route } from "@playwright/test";

const CREATED_AT = "2026-07-16T10:00:00.000Z";
const IMAGE_WIDTH = 400;
const IMAGE_HEIGHT = 300;
/** Long enough that the load lands well after first paint, as it does over a network. */
const FILE_RESPONSE_DELAY_MS = 400;

function svgBytes(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"><rect width="100%" height="100%" fill="#4477aa"/></svg>`;
}

function imageMessage(index: number, withDimensions: boolean) {
  const fileUuid = `${index}0000000-0000-4000-8000-00000000000${index}`;
  const dimensions = withDimensions ? `&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}` : "";
  return {
    uuid: `${index}1111111-1111-4111-8111-11111111111${index}`,
    project_id: E2E_PROJECT_ID,
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    author_uuid: E2E_USER_UUID,
    payload: {
      kind: "markdown",
      content: `![shot-${index}.svg](urn:image:${fileUuid}?content_type=image%2Fsvg%2Bxml${dimensions})\n\nMessage ${index}`,
    },
    user_uuid: E2E_USER_UUID,
    read: true,
    pinned: false,
    starred: false,
    is_own: false,
    reactions: {},
    reaction_users: {},
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

async function installImageConversation(page: Page, withDimensions: boolean): Promise<void> {
  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (/\/actions\/download\/?$/.test(url.pathname)) {
      // Delayed, so the image lands after the text has already been laid out.
      await new Promise((resolve) => setTimeout(resolve, FILE_RESPONSE_DELAY_MS));
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgBytes() });
      return;
    }

    if (route.request().method() === "GET" && /\/messages\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: 6 }, (_unused, index) => imageMessage(index + 1, withDimensions)),
        ),
      });
      return;
    }

    await route.fallback();
  });
}

/** Accumulates layout shift the same way the browser scores it, before app code runs. */
async function installLayoutShiftProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { score: 0, shifts: 0 };
    (window as unknown as { __shift__: typeof probe }).__shift__ = probe;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        // Shifts the user caused by typing or clicking are not the defect.
        if (shift.hadRecentInput) continue;
        probe.score += shift.value;
        probe.shifts += 1;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function readShiftScore(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __shift__?: { score: number } }).__shift__?.score ?? 0,
  );
}

async function openConversationAndSettle(page: Page): Promise<void> {
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await expect(page.locator("[data-workspace-file-preview='true']").first()).toBeVisible({
    timeout: 20_000,
  });
  // Let every remaining preview land, then let one more frame score.
  await page.waitForTimeout(FILE_RESPONSE_DELAY_MS * 3);
}

test.describe("Message layout shift @mock", () => {
  test("images that carry their dimensions do not move the conversation", async ({
    authenticatedMocked: page,
  }) => {
    await installLayoutShiftProbe(page);
    await installImageConversation(page, true);

    await openConversationAndSettle(page);

    // Measured at ~0.0012 with the box reserved, ~0.0096 without it.
    expect(await readShiftScore(page)).toBeLessThan(0.003);
  });

  test("an image without dimensions moves it, which is what the probe is for", async ({
    authenticatedMocked: page,
  }) => {
    await installLayoutShiftProbe(page);
    await installImageConversation(page, false);

    await openConversationAndSettle(page);

    expect(await readShiftScore(page)).toBeGreaterThan(0.003);
  });
});
