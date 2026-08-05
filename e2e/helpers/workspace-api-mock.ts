/** Playwright route mock for the public Workspace REST contract. */
import type { Page, Route } from "@playwright/test";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
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

const WORKSPACE_API_PREFIX = "/api/workspace/v1";
const MESSENGER_API_PREFIX = `${WORKSPACE_API_PREFIX}/messenger`;
const DEV_WORKSPACE_ORG_PREFIX = "/__dev_workspace_org";

const WORKSPACE_REST_ROUTE = /\/api\/workspace\/v1(?:\/|$)/;
const WORKSPACE_DEV_ORG_ROUTE = /\/__dev_workspace_org\/(?:api\/workspace|workspace)\/v1(?:\/|$)/;

const JSON_HEADERS = { contentType: "application/json" };
const CREATED_AT = "2026-07-16T10:00:00.000Z";

const streamBindingSuccess = {
  uuid: "66666666-6666-4666-8666-666666666666",
  project_id: E2E_PROJECT_ID,
  stream_uuid: E2E_STREAM_UUID,
  user_uuid: E2E_USER_UUID,
  who_uuid: E2E_USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

const folderItemSuccess = {
  uuid: "77777777-7777-4777-8777-777777777777",
  project_id: E2E_PROJECT_ID,
  folder_uuid: "e2e-folder-created",
  user_uuid: E2E_USER_UUID,
  stream_uuid: E2E_STREAM_UUID,
  chat_type: "stream",
  order_index: 0,
  pinned_at: null,
  unread_count: 0,
  active_unread_count: 0,
  passive_unread_count: 0,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

const messageReactionSuccess = {
  uuid: "88888888-8888-4888-8888-888888888888",
  project_id: E2E_PROJECT_ID,
  message_uuid: E2E_MESSAGE_UUID,
  user_uuid: E2E_USER_UUID,
  emoji_name: "thumbs_up",
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

const fileSuccess = {
  uuid: "99999999-9999-4999-8999-999999999999",
  project_id: E2E_PROJECT_ID,
  user_uuid: E2E_USER_UUID,
  stream_uuid: E2E_STREAM_UUID,
  name: "e2e-file.txt",
  description: "E2E file",
  content_type: "text/plain",
  size_bytes: 8,
  hash: "e2e-file-hash",
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

type WorkspaceRequestPath =
  | { domain: "workspace"; resource: string; resourceUuid?: string; action?: string }
  | { domain: "messenger"; resource: string; resourceUuid?: string; action?: string };

function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function canonicalWorkspacePath(pathname: string): string | null {
  if (pathname === WORKSPACE_API_PREFIX || pathname.startsWith(`${WORKSPACE_API_PREFIX}/`)) {
    return pathname;
  }

  if (!pathname.startsWith(`${DEV_WORKSPACE_ORG_PREFIX}/`)) {
    return null;
  }

  const proxiedPath = pathname.slice(DEV_WORKSPACE_ORG_PREFIX.length);
  if (proxiedPath === "/workspace/v1" || proxiedPath.startsWith("/workspace/v1/")) {
    return `/api${proxiedPath}`;
  }
  if (proxiedPath === WORKSPACE_API_PREFIX || proxiedPath.startsWith(`${WORKSPACE_API_PREFIX}/`)) {
    return proxiedPath;
  }
  return null;
}

function parseWorkspaceRequestPath(pathname: string): WorkspaceRequestPath | null {
  const canonicalPath = canonicalWorkspacePath(pathname);
  if (canonicalPath == null) {
    return null;
  }

  const messenger =
    canonicalPath === MESSENGER_API_PREFIX || canonicalPath.startsWith(`${MESSENGER_API_PREFIX}/`);
  const prefix = messenger ? MESSENGER_API_PREFIX : WORKSPACE_API_PREFIX;
  const relativePath = trimTrailingSlash(canonicalPath.slice(prefix.length));
  const segments = relativePath.split("/").filter(Boolean);
  const [resource, resourceUuid, actions, action, invoke] = segments;

  if (resource == null || (segments.length > 1 && resourceUuid == null)) {
    return null;
  }
  if (segments.length > 2 && (actions !== "actions" || action == null || invoke !== "invoke")) {
    return null;
  }
  if (segments.length > 5) {
    return null;
  }

  return {
    domain: messenger ? "messenger" : "workspace",
    resource,
    ...(resourceUuid == null ? {} : { resourceUuid }),
    ...(action == null ? {} : { action }),
  };
}

function isCollection(requestPath: WorkspaceRequestPath, resource: string): boolean {
  return requestPath.resource === resource && requestPath.resourceUuid == null;
}

function isResource(requestPath: WorkspaceRequestPath, resource: string): boolean {
  return (
    requestPath.resource === resource &&
    requestPath.resourceUuid != null &&
    requestPath.action == null
  );
}

function isAction(requestPath: WorkspaceRequestPath, resource: string, action: string): boolean {
  return (
    requestPath.resource === resource &&
    requestPath.resourceUuid != null &&
    requestPath.action === action
  );
}

function readMessageContent(route: Route): string {
  const body = route.request().postDataJSON() as { payload?: { content?: unknown } } | null;
  return typeof body?.payload?.content === "string" ? body.payload.content : "";
}

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

  private async fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
    await route.fulfill({ status, ...JSON_HEADERS, body: JSON.stringify(body) });
  }

  private async fulfillEmpty(route: Route, status = 204): Promise<void> {
    await route.fulfill({ status });
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = parseWorkspaceRequestPath(url.pathname);

    if (requestPath == null) {
      await this.fulfillJson(route, 501, {
        error: "unsupported_e2e_workspace_api_route",
        message: `Unsupported Workspace API route: ${request.method()} ${url.pathname}`,
      });
      return;
    }

    if (requestPath.domain === "messenger") {
      await this.handleMessengerRoute(route, requestPath);
      return;
    }

    await this.handleWorkspaceRoute(route, requestPath, url);
  }

  private async handleMessengerRoute(
    route: Route,
    requestPath: WorkspaceRequestPath,
  ): Promise<void> {
    const method = route.request().method();

    if (isCollection(requestPath, "server_settings") && method === "GET") {
      await this.fulfillJson(route, 200, serverSettingsSuccess());
      return;
    }

    if (isCollection(requestPath, "streams")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, streamsSuccess());
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, streamsSuccess()[0]);
        return;
      }
    }
    if (isResource(requestPath, "streams")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, streamsSuccess()[0]);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }
    if (isAction(requestPath, "streams", "add_users") && method === "POST") {
      await this.fulfillJson(route, 200, [streamBindingSuccess]);
      return;
    }
    if (
      (isAction(requestPath, "streams", "archive") ||
        isAction(requestPath, "streams", "unarchive") ||
        isAction(requestPath, "streams", "notifications") ||
        isAction(requestPath, "streams", "read")) &&
      method === "POST"
    ) {
      await this.fulfillJson(route, 200, streamsSuccess()[0]);
      return;
    }

    if (isCollection(requestPath, "stream_bindings") && method === "GET") {
      await this.fulfillJson(route, 200, [streamBindingSuccess]);
      return;
    }
    if (isResource(requestPath, "stream_bindings")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, streamBindingSuccess);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }

    if (isCollection(requestPath, "stream_topics")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, topicsSuccess());
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, topicsSuccess()[0]);
        return;
      }
    }
    if (isResource(requestPath, "stream_topics")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, topicsSuccess()[0]);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }
    if (
      (isAction(requestPath, "stream_topics", "toggle_done") ||
        isAction(requestPath, "stream_topics", "notifications") ||
        isAction(requestPath, "stream_topics", "set_default") ||
        isAction(requestPath, "stream_topics", "read")) &&
      method === "POST"
    ) {
      await this.fulfillJson(route, 200, topicsSuccess()[0]);
      return;
    }

    if (isCollection(requestPath, "messages")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, messagesSuccess());
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, messageSuccess(readMessageContent(route)));
        return;
      }
    }
    if (isResource(requestPath, "messages")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, messagesSuccess()[0]);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }
    if (
      (isAction(requestPath, "messages", "read") ||
        isAction(requestPath, "messages", "read_up_to")) &&
      method === "POST"
    ) {
      await this.fulfillJson(route, 200, messagesSuccess()[0]);
      return;
    }

    if (isCollection(requestPath, "message_reactions")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, []);
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, messageReactionSuccess);
        return;
      }
    }
    if (isResource(requestPath, "message_reactions")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, messageReactionSuccess);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }

    if (isCollection(requestPath, "folders")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, foldersSuccess());
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, foldersSuccess()[1]);
        return;
      }
    }
    if (isResource(requestPath, "folders")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, foldersSuccess()[1]);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }

    if (isCollection(requestPath, "folder_items")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, folderItemsSuccess());
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, folderItemSuccess);
        return;
      }
    }
    if (isResource(requestPath, "folder_items")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, folderItemSuccess);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }
    if (
      (isAction(requestPath, "folder_items", "pin") ||
        isAction(requestPath, "folder_items", "unpin")) &&
      method === "POST"
    ) {
      await this.fulfillJson(route, 200, folderItemSuccess);
      return;
    }

    if (isCollection(requestPath, "files")) {
      if (method === "GET") {
        await this.fulfillJson(route, 200, []);
        return;
      }
      if (method === "POST") {
        await this.fulfillJson(route, 201, fileSuccess);
        return;
      }
    }
    if (isAction(requestPath, "files", "download") && method === "GET") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "e2e file" });
      return;
    }
    if (isResource(requestPath, "files")) {
      if (method === "GET" || method === "PUT") {
        await this.fulfillJson(route, 200, fileSuccess);
        return;
      }
      if (method === "DELETE") {
        await this.fulfillEmpty(route);
        return;
      }
    }

    await this.fulfillUnsupportedRoute(route, requestPath);
  }

  private async handleWorkspaceRoute(
    route: Route,
    requestPath: WorkspaceRequestPath,
    url: URL,
  ): Promise<void> {
    const method = route.request().method();

    if (isCollection(requestPath, "users") && method === "GET") {
      await this.fulfillJson(route, 200, usersSuccess());
      return;
    }
    if (isResource(requestPath, "users") && method === "GET") {
      await this.fulfillJson(route, 200, usersSuccess()[0]);
      return;
    }
    if (isAction(requestPath, "users", "presence") && method === "POST") {
      await this.fulfillJson(route, 200, usersSuccess()[0]);
      return;
    }
    if (isCollection(requestPath, "me") && method === "GET") {
      await this.fulfillJson(route, 200, usersSuccess()[0]);
      return;
    }
    if (
      (isCollection(requestPath, "services") || isResource(requestPath, "services")) &&
      method === "GET"
    ) {
      await this.fulfillJson(route, 200, servicesSuccess());
      return;
    }
    if (isCollection(requestPath, "events") && method === "GET") {
      const version = url.searchParams.get("epoch_version>");
      const generation = url.searchParams.get("epoch_generation");
      if (version != null && Number(version) > 0 && (generation == null || generation === "")) {
        await this.fulfillJson(route, 400, {
          error: "invalid_cursor",
          message: "epoch_generation is required with a non-zero epoch_version",
        });
        return;
      }
      await this.fulfillJson(route, 200, []);
      return;
    }
    if (isCollection(requestPath, "epoch") && method === "GET") {
      await this.fulfillJson(route, 200, {
        epoch_version: 0,
        epoch_generation: "e2e-generation-1",
        current_epoch_version: 0,
        minimum_epoch_version: 0,
      });
      return;
    }

    await this.fulfillUnsupportedRoute(route, requestPath);
  }

  private async fulfillUnsupportedRoute(
    route: Route,
    requestPath: WorkspaceRequestPath,
  ): Promise<void> {
    const apiPrefix =
      requestPath.domain === "messenger" ? MESSENGER_API_PREFIX : WORKSPACE_API_PREFIX;
    await this.fulfillJson(route, 501, {
      error: "unsupported_e2e_workspace_api_route",
      message: `Unsupported Workspace API route: ${route.request().method()} ${apiPrefix}/${requestPath.resource}`,
    });
  }
}
