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

// Layout shift is sensitive to whatever else the machine is doing, and each of these
// compares two measurements taken minutes apart. Serial keeps them out of each
// other's way; the `measurement` project keeps the rest of the suite out of theirs
// (`npm run e2e:measure`).
test.describe.configure({ mode: "serial" });

const CREATED_AT = "2026-07-16T10:00:00.000Z";
const MESSAGE_COUNT = 6;
const SCROLL_MESSAGE_COUNT = 60;
const IMAGE_WIDTH = 400;
const IMAGE_HEIGHT = 300;
/** Long enough that the load lands well after first paint, as it does over a network. */
const FILE_RESPONSE_DELAY_MS = 400;

function svgBytes(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"><rect width="100%" height="100%" fill="#4477aa"/></svg>`;
}

function imageMessage(index: number, withDimensions: boolean) {
  const suffix = String(index).padStart(4, "0");
  const fileUuid = `${suffix}0000-0000-4000-8000-0000${suffix}0000`;
  const dimensions = withDimensions ? `&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}` : "";
  return {
    uuid: `${suffix}1111-1111-4111-8111-1111${suffix}1111`,
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

async function installImageConversation(
  page: Page,
  withDimensions: boolean,
  messageCount = MESSAGE_COUNT,
): Promise<void> {
  // Its own route, so a download can never fall through to another handler: a failed
  // preview reverts the placeholder, which is a shift of its own and would be
  // measured as if it were the defect.
  await page.route(/\/actions\/download(?:\?|$)/, async (route: Route) => {
    // Delayed, so the image lands after the text has already been laid out.
    await new Promise((resolve) => setTimeout(resolve, FILE_RESPONSE_DELAY_MS));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgBytes() });
  });

  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && /\/messages\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: messageCount }, (_unused, index) =>
            imageMessage(index + 1, withDimensions),
          ),
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

/**
 * Scrolling into history while the images there are still arriving — the reported
 * symptom, measured. Reserved boxes have to hold the text still through it.
 */
async function measureScrollShift(page: Page, withDimensions: boolean): Promise<number> {
  await installLayoutShiftProbe(page);
  await installImageConversation(page, withDimensions, SCROLL_MESSAGE_COUNT);

  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  const scroller = page.locator("[data-workspace-scroll-controller='true']").first();
  await scroller.waitFor({ state: "visible", timeout: 20_000 });

  // Deliberately without waiting for the previews: a reader scrolls into history
  // while the images there are still arriving, and that is when the text moves.
  for (let step = 0; step < 10; step += 1) {
    await scroller.evaluate((node) => {
      node.scrollTop = Math.max(0, node.scrollTop - node.clientHeight * 0.8);
    });
    await page.waitForTimeout(250);
  }

  return readShiftScore(page);
}

test.describe("Message list scroll shift @mock", () => {
  test("reserved images hold the conversation still while scrolling through it", async ({
    authenticatedMocked: page,
  }) => {
    const reserved = await measureScrollShift(page, true);
    // A fresh page, so the probe starts from zero again.
    const unreserved = await measureScrollShift(page, false);

    // Measured at ~0.0012 reserved against ~0.0096 unreserved over 60 messages. The
    // comparison rather than a fixed number: what matters is that reserving works,
    // and the absolute value belongs to the machine that ran it.
    expect(reserved).toBeLessThan(unreserved / 3);
  });
});

const STREAM_PATH = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}`;
const TOPIC_PATH = `${STREAM_PATH}/topic/${E2E_TOPIC_UUID}`;

/** In-app navigation: a reload would empty the memory under test. */
async function openConversation(page: Page, href: string): Promise<void> {
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}`);
}

async function readReservedStyle(page: Page): Promise<string> {
  return page
    .locator("[data-workspace-file='true']")
    .first()
    .evaluate((node) => node.getAttribute("style") ?? "none")
    .catch(() => "none");
}

/**
 * An image whose message states no size can still be reserved for — after it has
 * been loaded once, its natural size is known and remembered. This is the second
 * visit to a conversation in the same session, with the file cache cleared by the
 * conversation change, so the bytes are in flight again and the box either holds
 * the text still or does not.
 */
test.describe("Measured media sizes @mock", () => {
  test("reserves a box for an image the session has already loaded once", async ({
    authenticatedMocked: page,
  }) => {
    await installLayoutShiftProbe(page);
    await installImageConversation(page, false);

    await page.goto(TOPIC_PATH);
    await expect(page.locator("[data-workspace-file-preview='true']").first()).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(FILE_RESPONSE_DELAY_MS * 3);
    const firstPass = await readShiftScore(page);

    await openConversation(page, STREAM_PATH);
    await openConversation(page, TOPIC_PATH);

    // While the previews are in flight again: this is when a reserved box exists.
    expect(await readReservedStyle(page)).toMatch(/^width: \d+px; height: \d+px;$/);

    await page.waitForTimeout(FILE_RESPONSE_DELAY_MS * 3);
    expect((await readShiftScore(page)) - firstPass).toBeLessThan(firstPass / 2);
  });
});
