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
import { seedAuthStorage } from "./helpers/seed-auth";
import {
  installTimelineProbe,
  readTimelineCpu,
  type TimelineCpu,
} from "./helpers/timeline-performance";
import { installWorkspaceReadyRealtime } from "./helpers/workspace-ready-realtime";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
  streamsSuccess,
  topicsSuccess,
} from "./mocks/workspace-default-responses";
import {
  REAL_CONVERSATION_AUTHOR_UUIDS,
  REAL_CONVERSATION_SAMPLE,
  type RealConversationSampleMessage,
} from "./mocks/real-conversation-sample";
import type { Page, Route, WebSocketRoute } from "@playwright/test";

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

async function installConversation(
  page: Page,
  options: {
    unreadTail?: number;
    messageCount?: number;
    historyGate?: Promise<void>;
    historyPageSize?: number;
    olderPageGate?: Promise<void>;
    sample?: readonly RealConversationSampleMessage[];
  } = {},
): Promise<void> {
  const unreadTail = options.unreadTail ?? 0;
  const sample = options.sample ?? REAL_CONVERSATION_SAMPLE;
  const unreadFrom = sample.length - unreadTail;

  await page.route(/\/actions\/download(?:\?|$)/, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgBytes() });
  });

  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && /\/(streams|topics)\/?$/.test(url.pathname)) {
      const tail = sample.slice(0, options.messageCount).at(-1);
      const items = url.pathname.includes("/topics") ? topicsSuccess() : streamsSuccess();
      await route.fulfill({
        json: items.map((item) => ({
          ...item,
          last_message_uuid: tail == null ? null : sampleUuid(tail),
          unread_count: unreadTail,
        })),
      });
      return;
    }

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
      if (url.searchParams.get("mentioned") === "true") {
        await route.fulfill({ json: [] });
        return;
      }
      const requestedUuids = url.searchParams.getAll("uuid");
      if (requestedUuids.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            [...sample, OUT_OF_WINDOW_QUOTED_MESSAGE]
              .filter((message) => requestedUuids.includes(message.uuid))
              .map((message) => messageDto(message, false)),
          ),
        });
        return;
      }

      await options.historyGate;
      const sortDir = url.searchParams.get("sort_dir") ?? "asc";
      const requestedPageLimit = Number(url.searchParams.get("page_limit") ?? "0");
      const pageLimit = Math.min(requestedPageLimit, options.historyPageSize ?? requestedPageLimit);
      const pageMarker = url.searchParams.get("page_marker");
      let items = sample
        .slice(0, options.messageCount)
        .map((message, index) => messageDto(message, unreadTail > 0 && index >= unreadFrom));
      if (url.searchParams.get("read") === "false") {
        items = items.filter((item) => !item.read);
      }
      if (pageMarker != null) {
        await options.olderPageGate;
        const markerIndex = items.findIndex((item) => item.uuid === pageMarker);
        if (markerIndex >= 0) {
          items = sortDir === "desc" ? items.slice(0, markerIndex) : items.slice(markerIndex + 1);
        }
      }
      if (sortDir === "desc") items = [...items].reverse();
      const nextPageMarker =
        options.historyPageSize != null && pageLimit > 0 && items.length > pageLimit
          ? items[pageLimit - 1]?.uuid
          : undefined;
      if (pageLimit > 0) items = items.slice(0, pageLimit);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: nextPageMarker == null ? undefined : { "X-Pagination-Marker": nextPageMarker },
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
  test("prepending a delayed older page preserves the reader's row and offset", async ({
    authenticatedMocked: page,
  }, testInfo) => {
    let releaseOlderPage = () => {};
    const olderPageGate = new Promise<void>((resolve) => {
      releaseOlderPage = resolve;
    });
    const pageSize = 15;
    const oldestInFirstPage = REAL_CONVERSATION_SAMPLE.at(-pageSize);
    const expectedOlder = REAL_CONVERSATION_SAMPLE.at(-pageSize - 1);
    if (oldestInFirstPage == null || expectedOlder == null) {
      throw new Error("Expected enough sample messages for two history pages");
    }
    await installWorkspaceReadyRealtime(page);
    await installConversation(page, { historyPageSize: pageSize, olderPageGate });

    try {
      await page.goto(TOPIC_PATH);
      const scroller = page.locator("[data-workspace-scroll-controller='true']");
      const olderRow = scroller.locator(`[data-message-uuid="${sampleUuid(expectedOlder)}"]`);
      await expect(scroller.locator(`[data-message-uuid="${E2E_MESSAGE_UUID}"]`)).toBeInViewport();
      await expect(olderRow).toHaveCount(0);
      const beforeRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).searchParams.get("page_marker") === sampleUuid(oldestInFirstPage),
      );
      await scroller.hover();
      await page.mouse.wheel(0, -10000);
      await beforeRequest;

      const previousScrollTop = await scroller.evaluate((root) => root.scrollTop);
      await page.mouse.wheel(0, 180);
      await expect
        .poll(() => scroller.evaluate((root) => root.scrollTop))
        .toBeGreaterThan(previousScrollTop);

      const readVisibleRow = () =>
        scroller.evaluate((root) => {
          const viewport = root.getBoundingClientRect();
          for (const row of root.querySelectorAll("[data-message-uuid]")) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom > viewport.top && rect.top < viewport.bottom) {
              return {
                uuid: row.getAttribute("data-message-uuid"),
                offset: rect.top - viewport.top,
              };
            }
          }
          return null;
        });
      const before = await readVisibleRow();
      if (before?.uuid == null) throw new Error("Expected a visible history row after scrolling");

      const positionTrace = await scroller.evaluateHandle(
        (root, { anchorUuid, olderUuid, offset }) => ({
          result: new Promise<number[]>((resolve) => {
            const start = performance.now();
            const offsets: number[] = [];
            let framesAfterPrepend = 0;
            function sample(): void {
              const anchor = root.querySelector(`[data-message-uuid="${anchorUuid}"]`);
              if (anchor != null) {
                offsets.push(
                  anchor.getBoundingClientRect().top - root.getBoundingClientRect().top - offset,
                );
              }
              if (root.querySelector(`[data-message-uuid="${olderUuid}"]`) != null) {
                framesAfterPrepend += 1;
              }
              if (framesAfterPrepend >= 3 || performance.now() - start > 10_000) {
                resolve(offsets);
              } else {
                requestAnimationFrame(sample);
              }
            }
            requestAnimationFrame(sample);
          }),
        }),
        { anchorUuid: before.uuid, olderUuid: sampleUuid(expectedOlder), offset: before.offset },
      );

      releaseOlderPage();
      await expect(olderRow).toBeAttached();
      const after = await readVisibleRow();
      const offsetDeltaPx = (after?.offset ?? Number.NaN) - before.offset;
      const frameOffsetsPx = await positionTrace.evaluate((trace) => trace.result);
      await testInfo.attach("delayed-prepend-position", {
        contentType: "application/json",
        body: JSON.stringify({ before, after, offsetDeltaPx, frameOffsetsPx }),
      });
      expect(after?.uuid).toBe(before.uuid);
      expect(Math.abs(offsetDeltaPx)).toBeLessThanOrEqual(1);
    } finally {
      releaseOlderPage();
    }
  });

  test("cached tail stays provisional until delayed unread history chooses its boundary", async ({
    authenticatedMocked: page,
  }) => {
    await installWorkspaceReadyRealtime(page);
    await installConversation(page, { messageCount: REAL_CONVERSATION_SAMPLE.length - 12 });
    await page.goto(TOPIC_PATH);
    const cachedTail = REAL_CONVERSATION_SAMPLE.at(-13);
    const firstUnread = REAL_CONVERSATION_SAMPLE.at(-12);
    if (cachedTail == null || firstUnread == null) throw new Error("Expected a populated fixture");
    await expect(page.locator(`[data-message-uuid="${sampleUuid(cachedTail)}"]`)).toBeAttached();
    await expect
      .poll(
        () =>
          page.evaluate(
            async ({ conversationId, newestMessageUuid }) => {
              return await new Promise<boolean>((resolve, reject) => {
                const request = indexedDB.open("workspace-messenger-cache-v1");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const db = request.result;
                  const rows = db
                    .transaction("messageWindows", "readonly")
                    .objectStore("messageWindows")
                    .getAll();
                  rows.onsuccess = () => {
                    db.close();
                    const windows = rows.result as {
                      conversationId: string;
                      newestMessageUuid: string | null;
                    }[];
                    resolve(
                      windows.some(
                        (window) =>
                          window.conversationId === conversationId &&
                          window.newestMessageUuid === newestMessageUuid,
                      ),
                    );
                  };
                  rows.onerror = () => {
                    db.close();
                    reject(rows.error);
                  };
                };
              });
            },
            {
              conversationId: `topic:${E2E_STREAM_UUID}:${E2E_TOPIC_UUID}`,
              newestMessageUuid: sampleUuid(cachedTail),
            },
          ),
        {
          message:
            "The first visit must persist this conversation before testing a stale-cache reload",
        },
      )
      .toBe(true);

    let releaseHistory = () => {};
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    await installConversation(page, { unreadTail: 12, historyGate });
    const readRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/actions/read_up_to/")) readRequests.push(request.url());
    });
    await page.reload();
    await expect(page.locator(`[data-message-uuid="${sampleUuid(cachedTail)}"]`)).toBeAttached();
    await expect(page.locator(`[data-message-uuid="${sampleUuid(firstUnread)}"]`)).toHaveCount(0);
    expect(readRequests).toHaveLength(0);
    releaseHistory();
    const unreadNode = page.locator(`[data-message-uuid="${sampleUuid(firstUnread)}"]`);
    await expect(unreadNode).toBeInViewport();
  });

  test("a read conversation opens at the tail and stays there", async ({
    authenticatedMocked: page,
  }) => {
    await installScrollTrace(page);
    // Late, the way a socket connects on the first conversation of a session.
    await installWorkspaceReadyRealtime(page, { readyDelayMs: 1500 });
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
    await installWorkspaceReadyRealtime(page, { readyDelayMs: 1500 });
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
    await installWorkspaceReadyRealtime(page, { readyDelayMs: 1500 });
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

const INBOX_PATH = `${e2eOrgBasePath()}/inbox`;
const TIMELINE_PAGE_SIZE = 50;
const TIMELINE_SAMPLE_COUNT = 3;

// Text-only messages isolate render and scroll costs from protected file resolution.
function timelineSample(count: number): RealConversationSampleMessage[] {
  return Array.from({ length: count }, (_unused, index) => ({
    uuid:
      index === count - 1
        ? E2E_MESSAGE_UUID
        : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    author_uuid: REAL_CONVERSATION_AUTHOR_UUIDS[index % REAL_CONVERSATION_AUTHOR_UUIDS.length]!,
    is_own: index % 4 === 0,
    created_at: new Date(Date.UTC(2026, 7, 28, 17, index)).toISOString(),
    reactions: {},
    content: `Timeline message ${index}\n\n${"A representative short text. ".repeat(1 + (index % 4))}`,
  }));
}

// Browser CPU counters are monotonically increasing during a test page's lifetime.
function cpuDelta(before: TimelineCpu, after: TimelineCpu): TimelineCpu {
  return {
    taskMs: after.taskMs - before.taskMs,
    scriptMs: after.scriptMs - before.scriptMs,
    layoutMs: after.layoutMs - before.layoutMs,
  };
}

test.describe("Timeline performance @mock", () => {
  for (const windowSize of [50, 200]) {
    test(`records opening and editing a ${windowSize}-row window`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await installTimelineProbe(page);
      const sample = timelineSample(windowSize);
      const tail = sample.at(-1)!;
      let activeSocket: WebSocketRoute | undefined;
      await installWorkspaceReadyRealtime(page, {
        onConnection: (socket) => {
          activeSocket = socket;
        },
      });
      await installConversation(page, { sample, historyPageSize: TIMELINE_PAGE_SIZE });
      await seedAuthStorage(page);
      await page.goto(TOPIC_PATH);

      const scroller = page.locator("[data-workspace-scroll-controller='true']");
      const rows = scroller.locator("[data-message-uuid]");
      await expect(rows).toHaveCount(TIMELINE_PAGE_SIZE);
      await expect(rows.last()).toBeInViewport();
      await expect.poll(() => activeSocket?.url()).toBeDefined();
      for (let loaded = TIMELINE_PAGE_SIZE; loaded < windowSize; loaded += TIMELINE_PAGE_SIZE) {
        await scroller.hover();
        await page.mouse.wheel(0, -100_000);
        await expect(rows).toHaveCount(loaded + TIMELINE_PAGE_SIZE);
      }

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const inboxLink = page.locator(`a[href="${INBOX_PATH}"]`).first();
      const topicLink = page.locator(`a[href="${TOPIC_PATH}"]`).first();
      const openings = [];
      for (let index = 0; index < TIMELINE_SAMPLE_COUNT; index += 1) {
        await inboxLink.click();
        await expect(rows).toHaveCount(0);
        const openingStart = await readTimelineCpu(cdp);
        await topicLink.evaluate((link, count) => {
          if (!(link instanceof HTMLAnchorElement)) throw new Error("Expected a topic link");
          window.__timelineMeasurement.begin(count);
          link.click();
        }, windowSize);
        const opening = await page.evaluate(() => window.__timelineMeasurement.finish());
        const openingCpu = cpuDelta(openingStart, await readTimelineCpu(cdp));
        expect(opening.changedRowUuids).toHaveLength(windowSize);
        const { changedRowUuids, ...metrics } = opening;
        openings.push({ ...metrics, distinctRows: changedRowUuids.length, ...openingCpu });
      }

      // Measure edits separately, on a visible row after the conversation settles at the tail.
      await scroller.hover();
      await page.mouse.wheel(0, 100_000);
      await expect(rows.last()).toBeInViewport();
      const edits = [];
      for (let index = 0; index < TIMELINE_SAMPLE_COUNT; index += 1) {
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const text = `Updated timeline message ${index}`;
        const updatedAt = new Date(Date.UTC(2026, 7, 29, 17, index)).toISOString();
        const editStart = await readTimelineCpu(cdp);
        await page.evaluate(({ count, edit }) => window.__timelineMeasurement.begin(count, edit), {
          count: windowSize,
          edit: { uuid: E2E_MESSAGE_UUID, text },
        });
        if (activeSocket == null) throw new Error("Workspace realtime socket was not connected");
        activeSocket.send(
          JSON.stringify({
            schema_version: 1,
            epoch_version: index + 2,
            uuid: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
            project_id: E2E_PROJECT_ID,
            user_uuid: E2E_USER_UUID,
            object_type: "message",
            action: "updated",
            payload: {
              ...messageDto({ ...tail, content: text }, false),
              kind: "message.updated",
              updated_at: updatedAt,
            },
            created_at: tail.created_at,
            updated_at: updatedAt,
          }),
        );
        const edit = await page.evaluate(() => window.__timelineMeasurement.finish());
        const editCpu = cpuDelta(editStart, await readTimelineCpu(cdp));
        expect(edit.changedRowUuids).toContain(E2E_MESSAGE_UUID);
        const { changedRowUuids, ...metrics } = edit;
        edits.push({ ...metrics, distinctRows: changedRowUuids.length, ...editCpu });
      }
      const results = JSON.stringify({ windowSize, openings, edits });
      await testInfo.attach("timeline-performance", {
        contentType: "application/json",
        body: results,
      });
      console.log(`[timeline-performance] ${results}`);
    });
  }
});
