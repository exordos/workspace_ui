/**
 * Where a conversation lands when it opens, and whether it stays there.
 *
 * The pixel-level drift is measured in real-conversation-shift.spec.ts. This is the
 * larger jump: the list used to paint at scroll offset zero — the oldest message in
 * the window — and only then, once the initial position was allowed to settle
 * (which waits for the realtime socket on the first conversation of a session), snap
 * to the tail or to the first unread. On screen that is the whole conversation
 * moving under the reader a moment after it appears.
 *
 * So the trajectory is traced from before the app paints, and the gate is what the
 * reader sees: the message at the top of the viewport in the first painted frame is
 * the one still there when everything has settled.
 *
 * Positions are read frame by frame and are sensitive to what else the machine is
 * doing, so this file belongs to the `measurement` project: `npm run e2e:measure`.
 */
import { expect, test } from "./fixtures";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
} from "./mocks/workspace-default-responses";
import {
  REAL_CONVERSATION_AUTHOR_UUIDS,
  REAL_CONVERSATION_SAMPLE,
  type RealConversationSampleMessage,
} from "./mocks/real-conversation-sample";
import type { Page, Route } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const RESPONSE_DELAY_MS = 400;
const IMAGE_WIDTH = 900;
const IMAGE_HEIGHT = 500;

const OUT_OF_WINDOW_QUOTED_MESSAGE = {
  uuid: "9cf04589-a0e2-54f5-a34e-c7388be1738d",
  author_uuid: REAL_CONVERSATION_AUTHOR_UUIDS[1] ?? "",
  is_own: false,
  created_at: "2026-08-26T20:40:00.000000Z",
  reactions: {},
  content: "Сообщение старше окна, на него ссылается цитата в самом верху.",
};

function svgBytes(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"><rect width="100%" height="100%" fill="#4477aa"/></svg>`;
}

/**
 * The newest message answers to the uuid the topic advertises as its last one, so
 * the app sees the loaded window as the tail rather than as history.
 */
function sampleUuid(sample: RealConversationSampleMessage): string {
  return sample.uuid === REAL_CONVERSATION_SAMPLE.at(-1)?.uuid ? E2E_MESSAGE_UUID : sample.uuid;
}

function messageDto(sample: RealConversationSampleMessage, unread: boolean) {
  return {
    uuid: sampleUuid(sample),
    project_id: E2E_PROJECT_ID,
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    author_uuid: sample.author_uuid,
    payload: { kind: "markdown", content: sample.content },
    user_uuid: E2E_USER_UUID,
    read: !unread,
    pinned: false,
    starred: false,
    is_own: sample.is_own,
    reactions: sample.reactions,
    reaction_users: {},
    created_at: sample.created_at,
    updated_at: sample.created_at,
  };
}

function userDto(uuid: string, index: number) {
  return {
    uuid,
    username: `user-${index}`,
    source: "iam",
    avatar: null,
    status: "active",
    status_emoji: null,
    status_text: null,
    first_name: `User${index}`,
    last_name: "Sample",
    email: `user-${index}@example.test`,
    last_ping_at: "2026-07-16T10:00:00.000Z",
    created_at: "2026-07-16T10:00:00.000Z",
    updated_at: "2026-07-16T10:00:00.000Z",
  };
}

const WORKSPACE_EVENTS_SOCKET_PATH = "/api/workspace/v1/events/ws";

/** The realtime socket, answering after the list has already been painted. */
async function installRealtime(page: Page, readyDelayMs: number): Promise<void> {
  await page.routeWebSocket(
    (url) => url.pathname === WORKSPACE_EVENTS_SOCKET_PATH,
    (socket) => {
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            type: "ready",
            epoch_generation: "e2e-generation-1",
            epoch_version: 1,
          }),
        );
      }, readyDelayMs);
    },
  );
}

async function installConversation(
  page: Page,
  options: { unreadTail?: number } = {},
): Promise<void> {
  const unreadTail = options.unreadTail ?? 0;
  const unreadFrom = REAL_CONVERSATION_SAMPLE.length - unreadTail;

  await page.route(/\/actions\/download(?:\?|$)/, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgBytes() });
  });

  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && /\/users\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          REAL_CONVERSATION_AUTHOR_UUIDS.map((uuid, index) => userDto(uuid, index)),
        ),
      });
      return;
    }

    if (route.request().method() === "GET" && /\/messages\/?$/.test(url.pathname)) {
      const requestedUuids = url.searchParams.getAll("uuid");
      if (requestedUuids.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            [...REAL_CONVERSATION_SAMPLE, OUT_OF_WINDOW_QUOTED_MESSAGE]
              .filter((message) => requestedUuids.includes(message.uuid))
              .map((message) => messageDto(message, false)),
          ),
        });
        return;
      }

      const sortDir = url.searchParams.get("sort_dir") ?? "asc";
      const pageLimit = Number(url.searchParams.get("page_limit") ?? "0");
      const pageMarker = url.searchParams.get("page_marker");
      let items = REAL_CONVERSATION_SAMPLE.map((message, index) =>
        messageDto(message, unreadTail > 0 && index >= unreadFrom),
      );
      if (pageMarker != null) {
        const markerIndex = items.findIndex((item) => item.uuid === pageMarker);
        if (markerIndex >= 0) {
          items = sortDir === "desc" ? items.slice(0, markerIndex) : items.slice(markerIndex + 1);
        }
      }
      if (sortDir === "desc") items = [...items].reverse();
      if (pageLimit > 0) items = items.slice(0, pageLimit);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(items),
      });
      return;
    }

    await route.fallback();
  });
}

interface TracePoint {
  t: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  top: string;
  count: number;
  /** How far the message first painted at the top of the viewport has moved since. */
  drift: number;
}

/**
 * Records the scroll trajectory from before the app has painted anything, and
 * follows the message that was first painted at the top of the viewport: content
 * settling moves it by a few tens of pixels, a repositioning by a screenful.
 */
async function installScrollTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: TracePoint[] = [];
    (window as unknown as { __trace__: TracePoint[] }).__trace__ = trace;
    const start = performance.now();
    let previous: TracePoint | null = null;
    let followed: { uuid: string; top: number } | null = null;

    const sample = (): void => {
      const scroller = document.querySelector(
        "[data-workspace-scroll-controller='true']",
      ) as HTMLElement | null;
      if (scroller != null) {
        const rootRect = scroller.getBoundingClientRect();
        const nodes = [...scroller.querySelectorAll("[data-message-uuid]")];
        const topNode = nodes.find((node) => node.getBoundingClientRect().bottom > rootRect.top);
        const topUuid = (topNode?.getAttribute("data-message-uuid") ?? "none").slice(0, 8);

        if (followed != null && !nodes.some((node) => idOf(node) === followed?.uuid)) {
          followed = null;
        }
        if (followed == null && topNode != null) {
          followed = { uuid: idOf(topNode), top: topNode.getBoundingClientRect().top };
        }
        const followedNode = nodes.find((node) => idOf(node) === followed?.uuid);
        const drift =
          followed == null || followedNode == null
            ? 0
            : Math.round(Math.abs(followedNode.getBoundingClientRect().top - followed.top));

        const point: TracePoint = {
          t: Math.round(performance.now() - start),
          scrollTop: Math.round(scroller.scrollTop),
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          top: topUuid,
          count: nodes.length,
          drift,
        };
        const changed =
          previous == null ||
          previous.scrollTop !== point.scrollTop ||
          previous.scrollHeight !== point.scrollHeight ||
          previous.top !== point.top ||
          previous.count !== point.count ||
          previous.drift !== point.drift;
        if (changed) {
          trace.push(point);
          previous = point;
        }
      }
      requestAnimationFrame(sample);
    };

    const idOf = (node: Element): string =>
      (node.getAttribute("data-message-uuid") ?? "").slice(0, 8);

    requestAnimationFrame(sample);
  });
}

async function readTrace(page: Page): Promise<TracePoint[]> {
  return page.evaluate(() => (window as unknown as { __trace__?: TracePoint[] }).__trace__ ?? []);
}

const STREAM_PATH = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}`;
const TOPIC_PATH = `${STREAM_PATH}/topic/${E2E_TOPIC_UUID}`;

function formatTrace(trace: TracePoint[]): string {
  return trace
    .map(
      (point) =>
        `${String(point.t).padStart(6)}ms top=${String(point.scrollTop).padStart(5)} h=${String(
          point.scrollHeight,
        ).padStart(5)} n=${String(point.count).padStart(3)} drift=${String(point.drift).padStart(
          5,
        )} first=${point.top}`,
    )
    .join("\n");
}

/** The frames in which the conversation was on screen. */
function paintedFrames(trace: TracePoint[]): TracePoint[] {
  return trace.filter((point) => point.count > 0);
}

/** A screenful is a repositioning; a few tens of pixels is content settling. */
function maxDrift(painted: TracePoint[]): number {
  return painted.reduce((worst, point) => Math.max(worst, point.drift), 0);
}

function driftAllowance(painted: TracePoint[]): number {
  return Math.round((painted.at(0)?.clientHeight ?? 0) / 4);
}

test.describe("Conversation open position @mock", () => {
  test("a read conversation opens at the tail and stays there", async ({
    authenticatedMocked: page,
  }) => {
    await installScrollTrace(page);
    // Late, the way a socket connects on the first conversation of a session.
    await installRealtime(page, 1500);
    await installConversation(page);

    await page.goto(TOPIC_PATH);
    await page.locator("[data-message-uuid]").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(RESPONSE_DELAY_MS * 12);

    const painted = paintedFrames(await readTrace(page));
    const first = painted.at(0);
    expect(first, "the conversation never painted").toBeDefined();
    // 4865px before the list was placed as soon as it had messages.
    expect(
      maxDrift(painted),
      `the list moved after it appeared\n${formatTrace(painted)}`,
    ).toBeLessThan(driftAllowance(painted));
    // The tail, not the top of the window.
    expect(first?.scrollTop ?? 0).toBeGreaterThan((first?.clientHeight ?? 0) / 2);
  });

  test("a conversation with unread messages opens on them and stays there", async ({
    authenticatedMocked: page,
  }) => {
    await installScrollTrace(page);
    await installRealtime(page, 1500);
    await installConversation(page, { unreadTail: 12 });

    await page.goto(TOPIC_PATH);
    await page.locator("[data-message-uuid]").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(RESPONSE_DELAY_MS * 12);

    const painted = paintedFrames(await readTrace(page));
    expect(painted.at(0), "the conversation never painted").toBeDefined();
    expect(
      maxDrift(painted),
      `the list moved after it appeared\n${formatTrace(painted)}`,
    ).toBeLessThan(driftAllowance(painted));
  });

  test("switching to a conversation and back lands in the same place", async ({
    authenticatedMocked: page,
  }) => {
    await installScrollTrace(page);
    await installRealtime(page, 1500);
    await installConversation(page);

    await page.goto(TOPIC_PATH);
    await page.locator("[data-message-uuid]").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(RESPONSE_DELAY_MS * 8);

    await page.locator(`a[href="${STREAM_PATH}"]`).first().click();
    await page.waitForURL(`**${STREAM_PATH}`);
    await page.waitForTimeout(RESPONSE_DELAY_MS * 3);
    const beforeReturn = (await readTrace(page)).length;
    await page.locator(`a[href="${TOPIC_PATH}"]`).first().click();
    await page.waitForURL(`**${TOPIC_PATH}`);
    await page.waitForTimeout(RESPONSE_DELAY_MS * 8);

    const painted = paintedFrames((await readTrace(page)).slice(beforeReturn));
    expect(painted.at(0), "the conversation never painted").toBeDefined();
    expect(
      maxDrift(painted),
      `the list moved after it appeared\n${formatTrace(painted)}`,
    ).toBeLessThan(driftAllowance(painted));
  });
});
