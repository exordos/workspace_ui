import { expect, test } from "./fixtures";
import { seedAuthStorage } from "./helpers/seed-auth";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import {
  E2E_ACCOUNT_ID,
  E2E_INSTANCE_ID,
  E2E_ORGANIZATION_ID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
  messageSuccess,
} from "./mocks/workspace-default-responses";
import type { Page, Route, WebSocketRoute } from "@playwright/test";

const MESSAGE_ROUTE = /\/messenger\/messages(?:\/|$)/;
const EVENTS_SOCKET_PATH = "/api/workspace/v1/events/ws";
const FIRST_ANCHOR_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_ANCHOR_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REALTIME_MESSAGE_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FIRST_AFTER_UUID = "20000000-0000-4000-8000-000000000001";

type MessageDto = ReturnType<typeof messageSuccess>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface WindowRouteInput {
  route: Route;
  url: URL;
  messageUuid: string;
}

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  if (resolve == null) {
    throw new Error("Deferred promise did not initialize");
  }

  return { promise, resolve };
}

function messageDto(uuid: string, content: string, createdAt: string): MessageDto {
  return {
    ...messageSuccess(content),
    uuid,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function anchorWindow(anchor: MessageDto): { before: MessageDto[]; after: MessageDto[] } {
  const before = Array.from({ length: 18 }, (_, index) =>
    messageDto(
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      `before anchor ${index + 1}`,
      `2026-07-16T09:${String(index + 1).padStart(2, "0")}:00.000Z`,
    ),
  );
  const after = Array.from({ length: 18 }, (_, index) =>
    messageDto(
      `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      `after anchor ${index + 1}`,
      `2026-07-16T11:${String(index + 1).padStart(2, "0")}:00.000Z`,
    ),
  );

  return { before, after };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function fulfillAnchorWindow(route: Route, url: URL, anchor: MessageDto): Promise<void> {
  const window = anchorWindow(anchor);
  const sortDirection = url.searchParams.get("sort_dir");
  const body = sortDirection === "desc" ? [...window.before].reverse() : window.after;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: {
      "X-Pagination-Limit": "50",
      "X-Pagination-Marker": sortDirection === "desc" ? "before-page" : "after-page",
    },
    body: JSON.stringify(body),
  });
}

function hasTopicQuery(url: URL): boolean {
  return (
    url.searchParams.get("stream_uuid") === E2E_STREAM_UUID &&
    url.searchParams.get("topic_uuid") === E2E_TOPIC_UUID
  );
}

function hasAnchorWindowQuery(url: URL): boolean {
  const sortDirection = url.searchParams.get("sort_dir");
  return (
    hasTopicQuery(url) &&
    url.searchParams.get("sort_key") === "created_at" &&
    (sortDirection === "asc" || sortDirection === "desc")
  );
}

async function installMessageRoute(
  page: Page,
  options: {
    messages: ReadonlyMap<string, MessageDto>;
    resolveStatus?: (messageUuid: string) => number;
    onWindowRequest?: (input: WindowRouteInput) => Promise<void>;
    tailMessages?: readonly MessageDto[];
  },
): Promise<void> {
  await page.route(MESSAGE_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(request.url());
    const segments = url.pathname.split("/").filter(Boolean);
    const messagesSegmentIndex = segments.lastIndexOf("messages");
    const requestedUuid = segments[messagesSegmentIndex + 1];

    if (requestedUuid != null) {
      const message = options.messages.get(requestedUuid);
      if (message == null) {
        await route.fallback();
        return;
      }
      const status = options.resolveStatus?.(requestedUuid) ?? 200;
      if (status !== 200) {
        await fulfillJson(route, status, { error: "message_not_found" });
        return;
      }
      await fulfillJson(route, 200, message);
      return;
    }

    const pageMarker = url.searchParams.get("page_marker");
    if (pageMarker == null) {
      if (options.tailMessages != null && hasTopicQuery(url)) {
        await fulfillJson(route, 200, options.tailMessages);
        return;
      }
      await route.fallback();
      return;
    }
    if (!hasAnchorWindowQuery(url)) {
      await route.fallback();
      return;
    }
    const anchor = options.messages.get(pageMarker);
    if (anchor == null) {
      await route.fallback();
      return;
    }

    await options.onWindowRequest?.({ route, url, messageUuid: pageMarker });
    await fulfillAnchorWindow(route, url, anchor);
  });
}

function directMessageRoute(messageUuid: string): string {
  return `${e2eOrgBasePath()}/message/${messageUuid}`;
}

function topicRoute(): string {
  return `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`;
}

function topicAnchorRoute(messageUuid: string): RegExp {
  return new RegExp(`/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}#message-${messageUuid}$`);
}

function realtimeCursorStorageKey(): string {
  return [
    "workspace-realtime:cursor",
    "account",
    E2E_ACCOUNT_ID,
    "instance",
    E2E_INSTANCE_ID,
    "organization",
    E2E_ORGANIZATION_ID,
    "project",
    E2E_PROJECT_ID,
    "user",
    E2E_USER_UUID,
  ].join(":");
}

async function expectFocusedAnchor(page: Page, messageUuid: string): Promise<void> {
  const target = page.locator(`[data-message-uuid="${messageUuid}"]`);
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute("data-workspace-message-anchor-highlight", "true");

  const centerMetrics = await page
    .locator("[data-workspace-scroll-controller='true']")
    .evaluate((root, uuid) => {
      const targetNode = root.querySelector<HTMLElement>(`[data-message-uuid="${uuid}"]`);
      if (targetNode == null) {
        throw new Error("Focused message is absent from the canonical list");
      }
      const rootRect = root.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      return {
        offset: Math.abs(
          targetRect.top + targetRect.height / 2 - (rootRect.top + rootRect.height / 2),
        ),
        rowHeight: targetRect.height,
        rootCenter: rootRect.top + rootRect.height / 2,
        scrollTop: root.scrollTop,
        targetCenter: targetRect.top + targetRect.height / 2,
      };
    }, messageUuid);
  expect(
    centerMetrics.offset,
    `Expected ${messageUuid} to be centered: ${JSON.stringify(centerMetrics)}`,
  ).toBeLessThanOrEqual(Math.max(24, centerMetrics.rowHeight / 2));
}

interface AnchorVisualSample {
  readonly reason: "frame" | "mutation";
  readonly canonicalLayerVisible: boolean;
  readonly targetPresent: boolean;
  readonly targetHighlighted: boolean;
  readonly centered: boolean;
  readonly scrollTop: number | null;
  readonly targetCenter: number | null;
  readonly rootCenter: number | null;
}

interface AnchorVisualSamplerResult {
  readonly samples: readonly AnchorVisualSample[];
}

const ANCHOR_VISUAL_SAMPLER_KEY = "__e2eMessageAnchorVisualSampler";

async function startAnchorVisualSampler(page: Page, messageUuid: string): Promise<void> {
  await page.evaluate(
    ({ key, targetUuid }) => {
      type Sampler = { wait: () => Promise<AnchorVisualSamplerResult> };
      type TestWindow = Window & { [samplerKey: string]: Sampler | undefined };
      type Sample = AnchorVisualSample;

      const samples: Sample[] = [];
      let resolveResult: ((result: AnchorVisualSamplerResult) => void) | null = null;
      let finished = false;
      let activated = false;
      const done = new Promise<AnchorVisualSamplerResult>((resolve) => {
        resolveResult = resolve;
      });
      const activateAfterTargetClick = (event: MouseEvent): void => {
        const eventTarget = event.target;
        if (!(eventTarget instanceof Element)) return;
        const quote = eventTarget.closest<HTMLElement>("[data-workspace-quote-message-uuid]");
        if (quote?.getAttribute("data-workspace-quote-message-uuid") !== targetUuid) return;

        activated = true;
        document.removeEventListener("click", activateAfterTargetClick, true);
      };
      document.addEventListener("click", activateAfterTargetClick, true);
      const isVisible = (element: HTMLElement): boolean => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const sample = (reason: Sample["reason"]): void => {
        if (finished || !activated) return;

        const layer = document.querySelector<HTMLElement>(
          "[data-message-anchor-list-layer='true']",
        );
        const root = layer?.querySelector<HTMLElement>("[data-workspace-scroll-controller='true']");
        const target = root?.querySelector<HTMLElement>(`[data-message-uuid="${targetUuid}"]`);
        const canonicalLayerVisible = layer != null && isVisible(layer);
        const targetPresent = target != null;
        const targetHighlighted =
          target?.getAttribute("data-workspace-message-anchor-highlight") === "true";
        const rootRect = root?.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();
        const rootCenter = rootRect == null ? null : rootRect.top + rootRect.height / 2;
        const targetCenter = targetRect == null ? null : targetRect.top + targetRect.height / 2;
        const centered =
          rootCenter != null &&
          targetCenter != null &&
          targetRect != null &&
          Math.abs(targetCenter - rootCenter) <= Math.max(24, targetRect.height / 2);

        samples.push({
          reason,
          canonicalLayerVisible,
          targetPresent,
          targetHighlighted,
          centered,
          scrollTop: root?.scrollTop ?? null,
          targetCenter,
          rootCenter,
        });

        if (canonicalLayerVisible && targetHighlighted) {
          finished = true;
          observer.disconnect();
          document.removeEventListener("click", activateAfterTargetClick, true);
          resolveResult?.({ samples });
        }
      };
      const observer = new MutationObserver(() => sample("mutation"));
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      const nextFrame = (): void => {
        sample("frame");
        if (!finished) requestAnimationFrame(nextFrame);
      };

      (window as TestWindow)[key] = { wait: () => done };
      requestAnimationFrame(nextFrame);
    },
    { key: ANCHOR_VISUAL_SAMPLER_KEY, targetUuid: messageUuid },
  );
}

async function finishAnchorVisualSampler(page: Page): Promise<AnchorVisualSamplerResult> {
  return page.evaluate((key) => {
    type Sampler = { wait: () => Promise<AnchorVisualSamplerResult> };
    type TestWindow = Window & { [samplerKey: string]: Sampler | undefined };
    const sampler = (window as TestWindow)[key];

    if (sampler == null) {
      throw new Error("Expected anchor visual sampler");
    }

    return sampler.wait();
  }, ANCHOR_VISUAL_SAMPLER_KEY);
}

function expectNoVisibleAnchorJump(result: AnchorVisualSamplerResult, messageUuid: string): void {
  const visibleSamples = result.samples.filter((sample) => sample.canonicalLayerVisible);

  expect(
    visibleSamples.length,
    `Expected visible canonical samples for ${messageUuid}`,
  ).toBeGreaterThan(0);
  expect(
    visibleSamples.every((sample) => sample.targetPresent && sample.centered),
    `Canonical list became visible away from ${messageUuid}: ${JSON.stringify(visibleSamples)}`,
  ).toBe(true);
}

test.describe("Message anchor navigation @mock", () => {
  test("a quote to a message in the current window focuses the existing canonical node", async ({
    authenticated,
  }) => {
    const anchor = messageDto(
      FIRST_ANCHOR_UUID,
      "current window anchor",
      "2026-07-16T10:00:00.000Z",
    );
    const quoteHost = messageDto(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      `[Current window quote](urn:quote:${FIRST_ANCHOR_UUID})`,
      "2026-07-16T12:00:00.000Z",
    );
    const currentWindow = anchorWindow(anchor);
    let exactRequests = 0;
    let windowRequests = 0;

    await installMessageRoute(authenticated, {
      messages: new Map([[FIRST_ANCHOR_UUID, anchor]]),
      resolveStatus: () => {
        exactRequests += 1;
        return 200;
      },
      onWindowRequest: async () => {
        windowRequests += 1;
      },
      tailMessages: [...currentWindow.before, anchor, ...currentWindow.after, quoteHost],
    });

    await authenticated.goto(topicRoute());
    const target = authenticated.locator(`[data-message-uuid="${FIRST_ANCHOR_UUID}"]`);
    const quote = authenticated.locator(
      `[data-workspace-quote-message-uuid="${FIRST_ANCHOR_UUID}"]`,
    );
    await expect(target).toBeVisible();
    await expect(quote).toBeVisible();
    await target.evaluate((node) => {
      node.setAttribute("data-e2e-canonical-node", "retained");
    });

    await startAnchorVisualSampler(authenticated, FIRST_ANCHOR_UUID);
    await quote.click();
    expect(await authenticated.locator("[data-message-anchor-transition='true']").count()).toBe(0);
    expect(await authenticated.locator("[data-message-anchor-preview-layer='true']").count()).toBe(
      0,
    );
    expect(await authenticated.locator("[data-message-bubble-skeleton='true']").count()).toBe(0);

    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);
    await expect(target).toHaveAttribute("data-e2e-canonical-node", "retained");
    await expect(authenticated.locator("[data-message-anchor-transition='true']")).toHaveCount(0);
    await expect(authenticated.locator("[data-message-anchor-preview-layer='true']")).toHaveCount(
      0,
    );
    await expect(authenticated.locator("[data-message-bubble-skeleton='true']")).toHaveCount(0);
    expectNoVisibleAnchorJump(await finishAnchorVisualSampler(authenticated), FIRST_ANCHOR_UUID);
    expect(exactRequests).toBe(0);
    expect(windowRequests).toBe(0);
  });

  test("a quote outside the current window never reveals the new canonical list before its anchor is centered", async ({
    authenticated,
  }) => {
    const anchor = messageDto(
      FIRST_ANCHOR_UUID,
      "outside window anchor",
      "2026-07-16T10:00:00.000Z",
    );
    const quoteHost = messageDto(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      `[Outside window quote](urn:quote:${FIRST_ANCHOR_UUID})`,
      "2026-07-16T12:00:00.000Z",
    );
    const windowGate = deferred<void>();
    let windowRequests = 0;

    await installMessageRoute(authenticated, {
      messages: new Map([[FIRST_ANCHOR_UUID, anchor]]),
      tailMessages: [quoteHost],
      onWindowRequest: async ({ messageUuid }) => {
        if (messageUuid !== FIRST_ANCHOR_UUID) return;
        windowRequests += 1;
        await windowGate.promise;
      },
    });

    await authenticated.goto(topicRoute());
    const quote = authenticated.locator(
      `[data-workspace-quote-message-uuid="${FIRST_ANCHOR_UUID}"]`,
    );
    await expect(quote).toBeVisible();

    await startAnchorVisualSampler(authenticated, FIRST_ANCHOR_UUID);
    await quote.click();
    await expect.poll(() => windowRequests).toBeGreaterThanOrEqual(2);
    windowGate.resolve();

    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);
    expectNoVisibleAnchorJump(await finishAnchorVisualSampler(authenticated), FIRST_ANCHOR_UUID);
  });

  test("a second quote M1 to M2 never flashes M1's list while M2 replaces its window", async ({
    authenticated,
  }) => {
    const first = messageDto(
      FIRST_ANCHOR_UUID,
      `[Second quote](urn:quote:${SECOND_ANCHOR_UUID})`,
      "2026-07-16T10:00:00.000Z",
    );
    const second = messageDto(SECOND_ANCHOR_UUID, "second anchor", "2026-07-16T10:01:00.000Z");
    const quoteHost = messageDto(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      `[First quote](urn:quote:${FIRST_ANCHOR_UUID})`,
      "2026-07-16T12:00:00.000Z",
    );
    const secondWindowGate = deferred<void>();
    let secondWindowRequests = 0;

    await installMessageRoute(authenticated, {
      messages: new Map([
        [FIRST_ANCHOR_UUID, first],
        [SECOND_ANCHOR_UUID, second],
      ]),
      tailMessages: [quoteHost],
      onWindowRequest: async ({ messageUuid }) => {
        if (messageUuid !== SECOND_ANCHOR_UUID) return;
        secondWindowRequests += 1;
        await secondWindowGate.promise;
      },
    });

    await authenticated.goto(topicRoute());
    await authenticated
      .locator(`[data-workspace-quote-message-uuid="${FIRST_ANCHOR_UUID}"]`)
      .click();
    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);

    const secondQuote = authenticated.locator(
      `[data-workspace-quote-message-uuid="${SECOND_ANCHOR_UUID}"]`,
    );
    await expect(secondQuote).toBeVisible();
    await startAnchorVisualSampler(authenticated, SECOND_ANCHOR_UUID);
    await secondQuote.click();
    await expect.poll(() => secondWindowRequests).toBeGreaterThanOrEqual(2);
    secondWindowGate.resolve();

    await authenticated.waitForURL(topicAnchorRoute(SECOND_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, SECOND_ANCHOR_UUID);
    expectNoVisibleAnchorJump(await finishAnchorVisualSampler(authenticated), SECOND_ANCHOR_UUID);
  });

  test("cold direct route stages the message, focuses one canonical anchor, and restores it after tail", async ({
    authenticated,
  }) => {
    const anchor = messageDto(FIRST_ANCHOR_UUID, "cold direct anchor", "2026-07-16T10:00:00.000Z");
    const windowGate = deferred<void>();
    let windowRequests = 0;

    await authenticated.emulateMedia({ reducedMotion: "reduce" });
    await installMessageRoute(authenticated, {
      messages: new Map([[FIRST_ANCHOR_UUID, anchor]]),
      onWindowRequest: async ({ messageUuid }) => {
        if (messageUuid !== FIRST_ANCHOR_UUID) return;
        windowRequests += 1;
        await windowGate.promise;
      },
    });

    await authenticated.goto(directMessageRoute(FIRST_ANCHOR_UUID));
    await expect(authenticated.locator("[data-message-anchor-preview-layer='true']")).toBeVisible();
    await expect(authenticated.getByText("cold direct anchor", { exact: true })).toBeVisible();
    await expect(authenticated.locator(`#message-${FIRST_ANCHOR_UUID}`)).toHaveCount(0);
    await expect.poll(() => windowRequests).toBe(2);
    await expect(
      authenticated.locator("[data-message-bubble-skeleton='true']").first(),
    ).toBeVisible();
    await expect(
      authenticated.locator("[data-message-bubble-skeleton='true'] .animate-pulse"),
    ).toHaveCount(0);

    windowGate.resolve();
    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);
    await expect
      .poll(() =>
        authenticated
          .locator(`[data-message-uuid="${FIRST_ANCHOR_UUID}"]`)
          .evaluate((node) => getComputedStyle(node, "::before").animationName),
      )
      .toBe("none");

    const tailButton = authenticated.getByRole("button", {
      name: /прокрутить вниз|scroll to bottom/i,
    });
    await expect(tailButton).toBeVisible();
    await tailButton.click();
    await expect
      .poll(() => {
        const url = new URL(authenticated.url());
        return `${url.pathname}${url.hash}`;
      })
      .toBe(topicRoute());

    await authenticated.goBack();
    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);
    await authenticated.goForward();
    await expect
      .poll(() => {
        const url = new URL(authenticated.url());
        return `${url.pathname}${url.hash}`;
      })
      .toBe(topicRoute());
  });

  test("current 404 keeps an explicit retryable error instead of falling back to tail", async ({
    authenticated,
  }) => {
    const anchor = messageDto(FIRST_ANCHOR_UUID, "recovered anchor", "2026-07-16T10:00:00.000Z");
    let resolveAttempts = 0;

    await installMessageRoute(authenticated, {
      messages: new Map([[FIRST_ANCHOR_UUID, anchor]]),
      resolveStatus: () => {
        resolveAttempts += 1;
        return resolveAttempts === 1 ? 404 : 200;
      },
    });

    await authenticated.goto(directMessageRoute(FIRST_ANCHOR_UUID));
    const alert = authenticated.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(authenticated.locator("[data-workspace-scroll-controller='true']")).toHaveCount(0);
    await expect(authenticated).toHaveURL(new RegExp(`/message/${FIRST_ANCHOR_UUID}$`));

    await authenticated
      .getByRole("button", { name: /повторить открытие сообщения|retry message navigation/i })
      .click();
    await authenticated.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, FIRST_ANCHOR_UUID);
    expect(resolveAttempts).toBeGreaterThanOrEqual(2);
  });

  test("a newer browser-history intent keeps M2 when M1's window returns late", async ({
    authenticated,
  }) => {
    const first = messageDto(FIRST_ANCHOR_UUID, "first anchor", "2026-07-16T10:00:00.000Z");
    const second = messageDto(SECOND_ANCHOR_UUID, "second anchor", "2026-07-16T10:01:00.000Z");
    const quoteHost = messageDto(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      `[First quote](urn:quote:${FIRST_ANCHOR_UUID})`,
      "2026-07-16T12:00:00.000Z",
    );
    const firstWindowGate = deferred<void>();
    const firstWindowDirections = new Set<string>();

    await installMessageRoute(authenticated, {
      messages: new Map([
        [FIRST_ANCHOR_UUID, first],
        [SECOND_ANCHOR_UUID, second],
      ]),
      tailMessages: [quoteHost],
      onWindowRequest: async ({ messageUuid, url }) => {
        if (messageUuid !== FIRST_ANCHOR_UUID) return;
        const direction = url.searchParams.get("sort_dir");
        if (direction != null) {
          firstWindowDirections.add(direction);
        }
        await firstWindowGate.promise;
      },
    });

    await authenticated.goto(topicRoute());
    const firstQuote = authenticated.locator(
      `[data-workspace-quote-message-uuid="${FIRST_ANCHOR_UUID}"]`,
    );
    await expect(firstQuote).toBeVisible();
    await firstQuote.click();
    await expect.poll(() => [...firstWindowDirections].sort()).toEqual(["asc", "desc"]);
    await authenticated.evaluate((route) => {
      window.history.pushState(null, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, directMessageRoute(SECOND_ANCHOR_UUID));
    await authenticated.waitForURL(topicAnchorRoute(SECOND_ANCHOR_UUID));
    await expectFocusedAnchor(authenticated, SECOND_ANCHOR_UUID);

    firstWindowGate.resolve();
    await expect(authenticated).toHaveURL(topicAnchorRoute(SECOND_ANCHOR_UUID));
    await expect(authenticated.locator(`[data-message-uuid="${FIRST_ANCHOR_UUID}"]`)).toHaveCount(
      0,
    );
    await expectFocusedAnchor(authenticated, SECOND_ANCHOR_UUID);
  });

  test("realtime created during anchor fetch survives the window handoff", async ({ page }) => {
    const sockets: WebSocketRoute[] = [];
    const anchor = messageDto(
      FIRST_ANCHOR_UUID,
      "anchor with realtime",
      "2026-07-16T10:00:00.000Z",
    );
    const realtimeMessage = messageDto(
      REALTIME_MESSAGE_UUID,
      "realtime between fetch and apply",
      "2026-07-16T10:30:00.000Z",
    );
    const windowGate = deferred<void>();
    let windowRequests = 0;

    await page.routeWebSocket(
      (url) => url.pathname === EVENTS_SOCKET_PATH,
      (socket) => {
        sockets.push(socket);
      },
    );
    await seedAuthStorage(page, "e2e-anchor-access-token");
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
    await expect(page.locator("[data-message-uuid]").first()).toBeVisible();
    await expect.poll(() => sockets.length).toBeGreaterThanOrEqual(1);
    const readySocket = sockets.at(-1);
    if (readySocket == null) {
      throw new Error("Expected Workspace realtime socket before the anchor handoff");
    }
    readySocket.send(
      JSON.stringify({ type: "ready", epoch_generation: "e2e-generation-1", epoch_version: 0 }),
    );
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          realtimeCursorStorageKey(),
        ),
      )
      .toEqual({ epochGeneration: "e2e-generation-1", epochVersion: 0 });

    await installMessageRoute(page, {
      messages: new Map([[FIRST_ANCHOR_UUID, anchor]]),
      onWindowRequest: async ({ messageUuid }) => {
        if (messageUuid !== FIRST_ANCHOR_UUID) return;
        windowRequests += 1;
        await windowGate.promise;
      },
    });
    await page.goto(directMessageRoute(FIRST_ANCHOR_UUID));
    await expect.poll(() => windowRequests).toBe(2);
    const socket = sockets.at(-1);
    if (socket == null) {
      throw new Error("Expected Workspace realtime socket before the anchor handoff");
    }

    socket.send(
      JSON.stringify({
        schema_version: 1,
        epoch_version: 1,
        uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        project_id: E2E_PROJECT_ID,
        user_uuid: E2E_USER_UUID,
        object_type: "message",
        action: "created",
        payload: { ...realtimeMessage, kind: "message.created" },
        created_at: realtimeMessage.created_at,
        updated_at: realtimeMessage.updated_at,
      }),
    );
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          realtimeCursorStorageKey(),
        ),
      )
      .toEqual({ epochGeneration: "e2e-generation-1", epochVersion: 1 });

    windowGate.resolve();
    await page.waitForURL(topicAnchorRoute(FIRST_ANCHOR_UUID));
    await expectFocusedAnchor(page, FIRST_ANCHOR_UUID);
    await expect(page.locator(`[data-message-uuid="${REALTIME_MESSAGE_UUID}"]`)).toHaveCount(1);
    const messageOrder = await page
      .locator("[data-workspace-scroll-controller='true'] [data-message-uuid]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-message-uuid")));
    const anchorIndex = messageOrder.indexOf(FIRST_ANCHOR_UUID);
    const realtimeIndex = messageOrder.indexOf(REALTIME_MESSAGE_UUID);
    const firstAfterIndex = messageOrder.indexOf(FIRST_AFTER_UUID);
    expect(anchorIndex).toBeGreaterThanOrEqual(0);
    expect(realtimeIndex).toBeGreaterThan(anchorIndex);
    expect(firstAfterIndex).toBeGreaterThan(realtimeIndex);
  });
});
