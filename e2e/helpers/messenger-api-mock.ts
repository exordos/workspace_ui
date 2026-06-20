/**
 * Playwright route mock for Messenger REST API (`/api/v1/**`).
 */
import type { Page, Route } from "@playwright/test";
import {
  badEventQueueIdError,
  eventsSuccess,
  flagsSuccess,
  genericSuccess,
  messagesSuccess,
  registerSuccess,
  resetE2eQueueIdSequence,
  serverSettingsSuccess,
  subscriptionsSuccess,
  usersMeSuccess,
  usersSuccess,
} from "../mocks/messenger-default-responses";
import { foldersSuccess } from "../mocks/workspace-default-responses";

const API_ROUTE = "**/api/v1/**";
const MESSENGER_API_ROUTE = "**/api/messanger/v1/**";

export interface MessengerApiFailRule {
  pattern: RegExp;
  mode: "abort" | "status";
  status?: number;
  times: number;
}

export class MessengerApiMock {
  private installed = false;
  private registerCount = 0;
  private eventsCount = 0;
  private failRules: MessengerApiFailRule[] = [];
  private nextEventsBody: Record<string, unknown> | null = null;
  private persistentMessagesBody: Record<string, unknown> | null = null;
  private fixedQueueId: string | null = null;

  constructor(private readonly page: Page) {}

  getRegisterCallCount(): number {
    return this.registerCount;
  }

  getEventsCallCount(): number {
    return this.eventsCount;
  }

  async install(): Promise<void> {
    if (this.installed) return;
    resetE2eQueueIdSequence();
    this.registerCount = 0;
    this.eventsCount = 0;
    this.failRules = [];
    this.nextEventsBody = null;
    this.persistentMessagesBody = null;
    this.fixedQueueId = null;
    await this.page.route(API_ROUTE, (route) => this.handleRoute(route));
    await this.page.route(MESSENGER_API_ROUTE, (route) => this.handleRoute(route));
    this.installed = true;
  }

  async uninstall(): Promise<void> {
    if (!this.installed) return;
    await this.page.unroute(API_ROUTE);
    await this.page.unroute(MESSENGER_API_ROUTE);
    this.installed = false;
  }

  restoreDefaults(): void {
    this.failRules = [];
    this.nextEventsBody = null;
    this.persistentMessagesBody = null;
  }

  /** All GET /messages responses use this body until `restoreDefaults`. */
  setPersistentMessagesResponse(body: Record<string, unknown>): void {
    this.persistentMessagesBody = body;
  }

  failMatching(
    pattern: RegExp,
    options: { mode: "abort" | "status"; status?: number; times?: number },
  ): void {
    this.failRules.push({
      pattern,
      mode: options.mode,
      status: options.status ?? 503,
      times: options.times ?? 1,
    });
  }

  abortMatching(pattern: RegExp, times = 1): void {
    this.failMatching(pattern, { mode: "abort", times });
  }

  statusMatching(pattern: RegExp, status: number, times = 1): void {
    this.failMatching(pattern, { mode: "status", status, times });
  }

  setNextEventsResponse(body: Record<string, unknown>): void {
    this.nextEventsBody = body;
  }

  setFixedQueueId(queueId: string): void {
    this.fixedQueueId = queueId;
  }

  private consumeFailRule(url: string): MessengerApiFailRule | null {
    for (let i = 0; i < this.failRules.length; i += 1) {
      const rule = this.failRules[i]!;
      if (!rule.pattern.test(url)) continue;
      rule.times -= 1;
      if (rule.times <= 0) {
        this.failRules.splice(i, 1);
      }
      return rule;
    }
    return null;
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    const fail = this.consumeFailRule(url);
    if (fail != null) {
      if (fail.mode === "abort") {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: fail.status ?? 503,
        contentType: "application/json",
        body: JSON.stringify({ result: "error", msg: "E2E simulated server error" }),
      });
      return;
    }

    const path = new URL(url).pathname;
    const method = request.method();

    if (path.endsWith("/server_settings") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serverSettingsSuccess()),
      });
      return;
    }

    if (path.endsWith("/folders/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(foldersSuccess()),
      });
      return;
    }

    if (path.endsWith("/folders/") && method === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          uuid: "e2e-folder-new",
          title: "New folder",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          background_color_value: 0,
          system_type: "created",
          unread_messages: [],
          items: [],
        }),
      });
      return;
    }

    if (/\/folders\/[^/]+\/items\/[^/]+\/actions\/(?:pin|unpin)\/invoke\/?$/.test(path) && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success" }),
      });
      return;
    }

    if (path.includes("/folders/") && path.includes("/items/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path.includes("/folders/") && path.includes("/items/") && method === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          uuid: "e2e-folder-item-new",
          chat_id: 1,
          chat_type: "private",
          order_index: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
      });
      return;
    }

    if (path.includes("/folders/") && path.includes("/items/") && (method === "PUT" || method === "DELETE")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success" }),
      });
      return;
    }

    if (/\/folders\/[^/]+\/?$/.test(path) && (method === "PUT" || method === "DELETE" || method === "GET")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(foldersSuccess()[0]),
      });
      return;
    }

    if (path.endsWith("/register") && method === "POST") {
      this.registerCount += 1;
      const body = registerSuccess(this.fixedQueueId ?? undefined);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    if (path.endsWith("/events") && method === "GET") {
      this.eventsCount += 1;
      const payload = this.nextEventsBody ?? eventsSuccess();
      this.nextEventsBody = null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return;
    }

    if (path.endsWith("/users/me") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(usersMeSuccess()),
      });
      return;
    }

    if (path.endsWith("/users/me/subscriptions") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(subscriptionsSuccess()),
      });
      return;
    }

    if (/\/users\/\d+\/status$/.test(path) && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success", status: { away: false } }),
      });
      return;
    }

    if (/\/users\/\d+$/.test(path) && method === "GET") {
      const user = usersSuccess().members[0];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success", user }),
      });
      return;
    }

    if (path.endsWith("/users") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(usersSuccess()),
      });
      return;
    }

    if (path.includes("/messages/flags") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(flagsSuccess()),
      });
      return;
    }

    if (path.endsWith("/messages") && method === "GET") {
      const payload = this.persistentMessagesBody ?? messagesSuccess();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return;
    }

    if (path.endsWith("/messages") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success", id: 1001 }),
      });
      return;
    }

    if (path.endsWith("/realm/presence") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "success", presences: {} }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(genericSuccess()),
    });
  }
}

export { badEventQueueIdError };
