/**
 * Images must not move the text under them, down to the pixel.
 *
 * The conversation here is shaped like the one this was reported on: a screenshot
 * bridged from another messenger, whose link states no size, and one pasted through
 * this app's own composer, which states a portrait 892x1322. Both are displayed at
 * the same capped height, so both boxes are known before the bytes arrive.
 *
 * The gate is the height of every message and the on-screen position of the one
 * under the reader: a pixel of either is a jump. Measured before the fix at 20.65px
 * for the image without dimensions and 0.98px for the one with them — the second
 * being the inline box on the baseline, which reserves room for descenders that
 * changes when the placeholder is swapped for the image.
 *
 * Frame-by-frame measurement is sensitive to whatever else the machine is doing, so
 * this file belongs to the `measurement` project: `npm run e2e:measure`.
 */
import { expect, test } from "./fixtures";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
} from "./mocks/workspace-default-responses";
import type { Page, Route } from "@playwright/test";

const RESPONSE_DELAY_MS = 400;
/** The portrait screenshot the defect was reported on. */
const IMAGE_WIDTH = 892;
const IMAGE_HEIGHT = 1322;

function svgBytes(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"><rect width="100%" height="100%" fill="#4477aa"/></svg>`;
}

/**
 * Short lines and one long one, so the images sit among messages of both heights.
 * The text itself carries nothing: what the gate measures is the two images.
 */
const CONTENTS: string[] = [
  "morning",
  "checking the build",
  "green here",
  "do my messages reach the other channels?",
  "which ones?",
  "not seeing them yet",
  "the review topic, for one",
  'the last one from me there says "bump the dependency everywhere first"',
  "nothing like that on my side",
  "odd",
  // No dimensions: bridged from another messenger.
  "![screenshot.png](urn:image:747e1ff4-1057-50db-9e96-1ed76285db80)",
  "this is the review topic",
  // Dimensions stated by our own composer, portrait.
  `![pasted-image.png](urn:image:fa912385-0e53-4653-b6d9-dd8386fed3ab?name=pasted.png&content_type=image%2Fpng&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&size=375071)`,
  "that is not it",
  "let me write it up",
];

function messageDto(content: string, index: number) {
  const suffix = String(index).padStart(4, "0");
  return {
    uuid:
      index === CONTENTS.length - 1
        ? E2E_MESSAGE_UUID
        : `${suffix}1111-1111-4111-8111-1111${suffix}1111`,
    project_id: E2E_PROJECT_ID,
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    author_uuid: E2E_USER_UUID,
    payload: { kind: "markdown", content },
    user_uuid: E2E_USER_UUID,
    read: true,
    pinned: false,
    starred: false,
    is_own: index % 3 === 0,
    reactions: {},
    reaction_users: {},
    created_at: new Date(Date.UTC(2026, 7, 28, 17, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 7, 28, 17, index)).toISOString(),
  };
}

async function installConversation(page: Page): Promise<() => void> {
  // The bytes land when the test says so, so the two readings below cannot straddle
  // anything else the list does while it settles.
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(/\/actions\/download(?:\?|$)/, async (route: Route) => {
    await released;
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgBytes() });
  });

  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && /\/messages\/?$/.test(url.pathname)) {
      const items = CONTENTS.map(messageDto);
      const sortDir = url.searchParams.get("sort_dir") ?? "asc";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sortDir === "desc" ? [...items].reverse() : items),
      });
      return;
    }
    await route.fallback();
  });

  return release;
}

/** The height of every message and where the middle one sits, in one reading. */
async function readLayout(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(
      "[data-workspace-scroll-controller='true']",
    ) as HTMLElement | null;
    if (scroller == null)
      return {
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        heights: {} as Record<string, number>,
        anchor: null,
      };
    const rootRect = scroller.getBoundingClientRect();
    const nodes = [...scroller.querySelectorAll<HTMLElement>("[data-message-uuid]")];
    const heights: Record<string, number> = {};
    for (const node of nodes) {
      heights[(node.getAttribute("data-message-uuid") ?? "").slice(0, 8)] = Number(
        node.getBoundingClientRect().height.toFixed(2),
      );
    }
    const middle = rootRect.top + rootRect.height / 2;
    const anchorNode = nodes.find((node) => node.getBoundingClientRect().bottom >= middle);
    return {
      scrollTop: Number(scroller.scrollTop.toFixed(2)),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      heights,
      anchor:
        anchorNode == null
          ? null
          : {
              uuid: (anchorNode.getAttribute("data-message-uuid") ?? "").slice(0, 8),
              top: Number(anchorNode.getBoundingClientRect().top.toFixed(2)),
            },
    };
  });
}

test.describe.configure({ mode: "serial" });

test("images hold the conversation still, down to the pixel @mock", async ({
  authenticatedMocked: page,
}) => {
  const releaseImages = await installConversation(page);
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await page.locator("[data-message-uuid]").first().waitFor({ timeout: 20_000 });

  // Settled, with the previews still in flight: this is the layout the boxes reserved.
  await expect(page.locator("[data-workspace-preview-status='loading']").first()).toBeVisible();
  await page.waitForTimeout(RESPONSE_DELAY_MS * 4);
  const before = await readLayout(page);
  releaseImages();
  await expect(page.locator("[data-workspace-preview-status='loading']")).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.waitForTimeout(RESPONSE_DELAY_MS);
  const after = await readLayout(page);

  const moved = Object.entries(after.heights)
    .filter(([uuid, height]) => {
      const previous = before.heights[uuid];
      return previous != null && Math.abs(previous - height) >= 0.5;
    })
    .map(([uuid, height]) => `${uuid}:${before.heights[uuid]}->${height}`);

  // 20.65px for the image without dimensions, 0.98px for the one with them.
  const shape = `before=${JSON.stringify({ ...before, heights: undefined })}\nafter=${JSON.stringify(
    { ...after, heights: undefined },
  )}`;
  expect(moved, "an image changed the height of its message").toEqual([]);
  expect(after.anchor?.uuid, shape).toBe(before.anchor?.uuid);
  expect(Math.abs((after.anchor?.top ?? 0) - (before.anchor?.top ?? 0)), shape).toBeLessThan(1);
});
