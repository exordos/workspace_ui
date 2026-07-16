/**
 * Playwright route mock for Workspace REST (`/workspace/v1/**`, dev org proxy paths).
 */
import type { Page, Route } from "@playwright/test";
import {
  folderItemsSuccess,
  foldersSuccess,
  messageSuccess,
  messagesSuccess,
  servicesSuccess,
  serverSettingsSuccess,
  streamsSuccess,
  topicsSuccess,
  usersSuccess,
} from "../mocks/workspace-default-responses";

/** Same-origin Workspace REST in dev (avoid `*workspace*` — it matches `workspace-api` npm paths). */
const WORKSPACE_REST_ROUTE = /\/(?:api\/messenger|workspace)\/v1\//;
const WORKSPACE_DEV_ORG_ROUTE = /\/__dev_workspace_org\/workspace\//;

export class WorkspaceApiMock {
  private installed = false;

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    if (this.installed) return;
    const handler = (route: Route) => this.handleRoute(route);
    await this.page.route(WORKSPACE_REST_ROUTE, handler);
    await this.page.route(WORKSPACE_DEV_ORG_ROUTE, handler);
    this.installed = true;
  }

  async uninstall(): Promise<void> {
    if (!this.installed) return;
    await this.page.unroute(WORKSPACE_REST_ROUTE);
    await this.page.unroute(WORKSPACE_DEV_ORG_ROUTE);
    this.installed = false;
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path.endsWith("/v1/server_settings") || path.endsWith("/v1/server_settings/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serverSettingsSuccess()),
      });
      return;
    }

    if (path.endsWith("/v1/streams/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(streamsSuccess()),
      });
      return;
    }

    if (path.endsWith("/v1/stream_topics/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(topicsSuccess()),
      });
      return;
    }

    if (path.endsWith("/v1/users/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(usersSuccess()),
      });
      return;
    }

    if (/\/v1\/users\/[^/]+\/actions\/presence\/invoke\/?$/.test(path) && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(usersSuccess()[0]),
      });
      return;
    }

    if (path.endsWith("/v1/messages/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(messagesSuccess()),
      });
      return;
    }

    if (path.endsWith("/v1/messages/") && method === "POST") {
      const body = request.postDataJSON() as { payload?: { content?: unknown } } | null;
      const content = typeof body?.payload?.content === "string" ? body.payload.content : "";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(messageSuccess(content)),
      });
      return;
    }

    if (path.endsWith("/v1/events/") && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (path.endsWith("/v1/epoch/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ epoch_version: 0 }),
      });
      return;
    }

    if (path.includes("/v1/folders/") && path.includes("/items/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(folderItemsSuccess()),
      });
      return;
    }

    if (path.endsWith("/v1/folders/") || /\/v1\/folders\/[^/]+\/?$/.test(path)) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(foldersSuccess()),
        });
        return;
      }
      if (method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            uuid: "e2e-folder-new",
            title: "New folder",
            project_id: "11111111-1111-4111-8111-111111111111",
            user_uuid: "22222222-2222-4222-8222-222222222222",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            background_color_value: 0,
            system_type: "created",
            unread_count: 0,
            folder_items: [],
          }),
        });
        return;
      }
    }

    if (path.includes("/v1/services")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(servicesSuccess()),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  }
}
