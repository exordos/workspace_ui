/**
 * The sidebar badge of a thread (topic) after the reader scrolls through it.
 *
 * Scroll-driven reads go through `POST /messages/{uuid}/actions/read_up_to/invoke`.
 * When the boundary is the topic's last message the client settles the topic and
 * stream counters itself; the backend's `topic.updated` projection remains
 * authoritative when it arrives.
 */
import { expect, test } from "./fixtures";
import { e2eOrgBasePath, E2E_STREAM_UUID } from "./helpers/navigate-messenger";
import { E2E_PROJECT_ID, E2E_USER_UUID, topicsSuccess } from "./mocks/workspace-default-responses";
import {
  REAL_CONVERSATION_AUTHOR_UUIDS,
  REAL_CONVERSATION_SAMPLE,
  type RealConversationSampleMessage,
} from "./mocks/real-conversation-sample";
import type { Page, Route, WebSocketRoute } from "@playwright/test";

const THREAD_UUID = "77777777-7777-4777-8777-777777777777";
const THREAD_NAME = "Repro thread";
const UNREAD_TAIL = 12;
const WORKSPACE_EVENTS_SOCKET_PATH = "/api/workspace/v1/events/ws";
const CREATED_AT = "2026-07-16T10:00:00.000Z";

const LAST_MESSAGE_UUID = REAL_CONVERSATION_SAMPLE.at(-1)?.uuid ?? "";

function sampleUuid(sample: RealConversationSampleMessage): string {
  return sample.uuid;
}

function messageDto(sample: RealConversationSampleMessage, unread: boolean) {
  return {
    uuid: sampleUuid(sample),
    project_id: E2E_PROJECT_ID,
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: THREAD_UUID,
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
    last_ping_at: CREATED_AT,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

function threadTopicDto(unreadCount: number) {
  return {
    ...topicsSuccess()[0],
    uuid: THREAD_UUID,
    name: THREAD_NAME,
    is_default: false,
    unread_count: unreadCount,
    active_unread_count: unreadCount,
    passive_unread_count: 0,
    last_message_uuid: LAST_MESSAGE_UUID,
  };
}

function topicUpdatedFrame(epochVersion: number, unreadCount: number) {
  return {
    schema_version: 1,
    epoch_version: epochVersion,
    uuid: `9d1c0000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: E2E_PROJECT_ID,
    user_uuid: E2E_USER_UUID,
    object_type: "topic",
    action: "updated",
    payload: { kind: "topic.updated", ...threadTopicDto(unreadCount) },
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

async function installRealtime(page: Page, sockets: WebSocketRoute[]): Promise<void> {
  await page.routeWebSocket(
    (url) => url.pathname === WORKSPACE_EVENTS_SOCKET_PATH,
    (socket) => {
      sockets.push(socket);
      setTimeout(() => {
        socket.send(
          JSON.stringify({ type: "ready", epoch_generation: "e2e-generation-1", epoch_version: 1 }),
        );
      }, 200);
    },
  );
}

async function installThread(page: Page, readUpToCalls: string[]): Promise<void> {
  const unreadFrom = REAL_CONVERSATION_SAMPLE.length - UNREAD_TAIL;
  const allMessages = () =>
    REAL_CONVERSATION_SAMPLE.map((message, index) => messageDto(message, index >= unreadFrom));

  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === "GET" && /\/users\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(REAL_CONVERSATION_AUTHOR_UUIDS.map((uuid, i) => userDto(uuid, i))),
      });
      return;
    }

    if (method === "GET" && /\/stream_topics\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([...topicsSuccess(), threadTopicDto(UNREAD_TAIL)]),
      });
      return;
    }
    if (method === "GET" && url.pathname.endsWith(`/stream_topics/${THREAD_UUID}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(threadTopicDto(UNREAD_TAIL)),
      });
      return;
    }

    const readUpTo = /\/messages\/([0-9a-f-]+)\/actions\/read_up_to\/invoke$/.exec(url.pathname);
    if (method === "POST" && readUpTo != null) {
      const boundaryUuid = readUpTo[1] ?? "";
      readUpToCalls.push(boundaryUuid);
      const boundary = allMessages().find((message) => message.uuid === boundaryUuid);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...(boundary ?? allMessages()[0]), read: true }),
      });
      return;
    }

    if (method === "GET" && /\/messages\/?$/.test(url.pathname)) {
      const requestedUuids = url.searchParams.getAll("uuid");
      if (requestedUuids.length > 0) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            allMessages().filter((message) => requestedUuids.includes(message.uuid)),
          ),
        });
        return;
      }
      const sortDir = url.searchParams.get("sort_dir") ?? "asc";
      const pageLimit = Number(url.searchParams.get("page_limit") ?? "0");
      const pageMarker = url.searchParams.get("page_marker");
      let items = allMessages();
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

test.describe("Thread unread badge after scroll read @mock", () => {
  test("read_up_to reaches the last message and the badge drops", async ({
    authenticatedMocked: page,
  }) => {
    const sockets: WebSocketRoute[] = [];
    const readUpToCalls: string[] = [];
    await installRealtime(page, sockets);
    await installThread(page, readUpToCalls);

    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${THREAD_UUID}`);
    await page.locator("[data-message-uuid]").first().waitFor({ timeout: 20_000 });

    const streamRow = page.locator("a", { hasText: "#General" }).first();
    await expect(streamRow).toBeVisible({ timeout: 15_000 });
    await streamRow.hover();
    await page.getByTestId("sidebar-stream-expand-chevron").first().click();
    const threadRow = page.locator("a", { hasText: THREAD_NAME }).first();
    await expect(threadRow).toBeVisible({ timeout: 15_000 });
    const badge = threadRow.getByTestId("sidebar-chat-row-unread-badge");
    await expect(badge).toHaveText(String(UNREAD_TAIL));

    // Let the socket become ready, then scroll through the whole tail.
    await expect.poll(() => sockets.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1_000);
    const scroller = page.locator("[data-workspace-scroll-controller='true']");
    for (let step = 0; step < 6; step += 1) {
      await scroller.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1_500);

    expect(readUpToCalls.length, "read_up_to was never sent").toBeGreaterThan(0);
    expect(readUpToCalls.at(-1)).toBe(LAST_MESSAGE_UUID);

    // The boundary is the topic's last message: the badge drops without waiting
    // for the backend counter projection.
    await expect(badge).toBeHidden({ timeout: 10_000 });

    // The authoritative projection still applies when it arrives.
    const socket = sockets.at(-1);
    if (socket == null) throw new Error("no realtime socket");
    socket.send(JSON.stringify(topicUpdatedFrame(2, 1)));
    await expect(badge).toHaveText("1", { timeout: 10_000 });
    socket.send(JSON.stringify(topicUpdatedFrame(3, 0)));
    await expect(badge).toBeHidden({ timeout: 10_000 });
  });
});
