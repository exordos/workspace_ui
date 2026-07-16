import type { Browser, BrowserContext, Page } from "@playwright/test";

export const LIVE_MESSENGER_ROLES = [
  "owner",
  "administrator",
  "moderator",
  "member",
  "guest",
  "outsider",
] as const;

export type LiveMessengerRole = (typeof LIVE_MESSENGER_ROLES)[number];

export interface LiveMessengerAccount {
  email: string;
  password: string;
  role: LiveMessengerRole;
}

export interface LiveMessengerEnvironment {
  accounts: Record<LiveMessengerRole, LiveMessengerAccount>;
  server: string;
  uiBaseUrl: string;
}

export interface LiveMessengerSession {
  account: LiveMessengerAccount;
  context: BrowserContext;
  page: Page;
}

export interface LiveApiResponse<T = unknown> {
  data: T;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
}

export interface LiveApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string>;
  scope?: "messenger" | "workspace";
}

const LOGIN_NEXT_BUTTON = /next|далее/i;

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function accountEnvPrefix(role: LiveMessengerRole): string {
  return `TEST_MESSENGER_${role.toUpperCase()}_`;
}

export function missingLiveMessengerEnvironmentVariables(): string[] {
  const missing: string[] = [];
  if (requiredEnv("TEST_MESSENGER_SERVER") == null) {
    missing.push("TEST_MESSENGER_SERVER");
  }
  for (const role of LIVE_MESSENGER_ROLES) {
    const prefix = accountEnvPrefix(role);
    if (requiredEnv(`${prefix}EMAIL`) == null) missing.push(`${prefix}EMAIL`);
    if (requiredEnv(`${prefix}PASSWORD`) == null) missing.push(`${prefix}PASSWORD`);
  }
  return missing;
}

export function loadLiveMessengerEnvironment(): LiveMessengerEnvironment | null {
  if (missingLiveMessengerEnvironmentVariables().length > 0) {
    return null;
  }

  const accounts = Object.fromEntries(
    LIVE_MESSENGER_ROLES.map((role) => {
      const prefix = accountEnvPrefix(role);
      return [
        role,
        {
          role,
          email: requiredEnv(`${prefix}EMAIL`),
          password: requiredEnv(`${prefix}PASSWORD`),
        },
      ];
    }),
  ) as Record<LiveMessengerRole, LiveMessengerAccount>;

  return {
    accounts,
    server: requiredEnv("TEST_MESSENGER_SERVER")!,
    uiBaseUrl: requiredEnv("TEST_MESSENGER_UI_BASE_URL") ?? "http://localhost:5173",
  };
}

export async function loginLiveMessengerAccount(
  page: Page,
  environment: LiveMessengerEnvironment,
  account: LiveMessengerAccount,
): Promise<void> {
  await page.goto("/");
  await page.locator("#realm").fill(environment.server);
  await page.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();
  await page.locator("#username").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#username").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("form button[type='submit']").click();
  await page.locator("[data-focus-zone='topbar']").waitFor({ state: "visible", timeout: 45_000 });
}

export async function openLiveMessengerSessions(
  browser: Browser,
  environment: LiveMessengerEnvironment,
): Promise<Record<LiveMessengerRole, LiveMessengerSession>> {
  const entries: [LiveMessengerRole, LiveMessengerSession][] = [];
  try {
    for (const role of LIVE_MESSENGER_ROLES) {
      const account = environment.accounts[role];
      const context = await browser.newContext({
        baseURL: environment.uiBaseUrl,
        locale: "ru-RU",
        timezoneId: "Europe/Moscow",
      });
      const page = await context.newPage();
      await loginLiveMessengerAccount(page, environment, account);
      entries.push([role, { account, context, page }]);
    }
    return Object.fromEntries(entries) as Record<LiveMessengerRole, LiveMessengerSession>;
  } catch (error) {
    await Promise.all(entries.map(([, session]) => session.context.close()));
    throw error;
  }
}

export async function closeLiveMessengerSessions(
  sessions: Partial<Record<LiveMessengerRole, LiveMessengerSession>>,
): Promise<void> {
  await Promise.all(
    Object.values(sessions).map(async (session) => {
      await session?.context.close();
    }),
  );
}

export async function liveMessengerApi<T = unknown>(
  page: Page,
  path: string,
  options: LiveApiRequestOptions = {},
): Promise<LiveApiResponse<T>> {
  return page.evaluate(
    async ({ requestPath, requestOptions }) => {
      const rawInstances = window.localStorage.getItem("messenger-web-instances");
      const currentId = window.localStorage.getItem("messenger-web-current-instance");
      const instances: unknown = rawInstances == null ? [] : JSON.parse(rawInstances);
      if (!Array.isArray(instances)) {
        throw new Error("Messenger instance storage is unavailable");
      }
      const instance = instances.find(
        (candidate): candidate is Record<string, unknown> =>
          candidate != null &&
          typeof candidate === "object" &&
          (candidate as Record<string, unknown>).id === currentId,
      );
      if (instance == null) {
        throw new Error("Current Messenger instance is unavailable");
      }
      const accessToken =
        typeof instance.iamAccessToken === "string" ? instance.iamAccessToken.trim() : "";
      const originCandidate =
        typeof instance.workspaceOrgOrigin === "string" && instance.workspaceOrgOrigin.trim() !== ""
          ? instance.workspaceOrgOrigin
          : instance.realm;
      if (accessToken === "" || typeof originCandidate !== "string") {
        throw new Error("Current Messenger IAM session is unavailable");
      }

      const origin = new URL(originCandidate).origin;
      const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
      const apiPath =
        requestOptions.scope === "workspace" ? "/api/workspace/v1" : "/api/workspace/v1/messenger";
      const url = new URL(`${apiPath}${normalizedPath}`, origin);
      for (const [name, value] of Object.entries(requestOptions.query ?? {})) {
        url.searchParams.set(name, value);
      }
      const hasBody = requestOptions.body !== undefined;
      const response = await fetch(url, {
        method: requestOptions.method ?? "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(requestOptions.body) } : {}),
        cache: "no-store",
      });
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return {
        data,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
      };
    },
    { requestPath: path, requestOptions: options },
  ) as Promise<LiveApiResponse<T>>;
}

export async function uploadLiveMessengerFile(
  page: Page,
  options: { bytesBase64: string; contentType: string; fileName: string; streamUuid: string },
): Promise<
  LiveApiResponse<{
    content_type?: string;
    name?: string;
    size_bytes?: number;
    stream_uuid?: string;
    uuid?: string;
  }>
> {
  return page.evaluate(async (upload) => {
    const rawInstances = window.localStorage.getItem("messenger-web-instances");
    const currentId = window.localStorage.getItem("messenger-web-current-instance");
    const instances: unknown = rawInstances == null ? [] : JSON.parse(rawInstances);
    if (!Array.isArray(instances)) throw new Error("Messenger instance storage is unavailable");
    const instance = instances.find(
      (candidate): candidate is Record<string, unknown> =>
        candidate != null &&
        typeof candidate === "object" &&
        (candidate as Record<string, unknown>).id === currentId,
    );
    if (instance == null) throw new Error("Current Messenger instance is unavailable");
    const accessToken =
      typeof instance.iamAccessToken === "string" ? instance.iamAccessToken.trim() : "";
    const originCandidate =
      typeof instance.workspaceOrgOrigin === "string" && instance.workspaceOrgOrigin.trim() !== ""
        ? instance.workspaceOrgOrigin
        : instance.realm;
    if (accessToken === "" || typeof originCandidate !== "string") {
      throw new Error("Current Messenger IAM session is unavailable");
    }
    const binary = window.atob(upload.bytesBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], upload.fileName, { type: upload.contentType }));
    form.append("stream_uuid", upload.streamUuid);
    const response = await fetch(
      new URL("/api/workspace/v1/messenger/files/", new URL(originCandidate).origin),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      data,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      status: response.status,
    };
  }, options) as Promise<
    LiveApiResponse<{
      content_type?: string;
      name?: string;
      size_bytes?: number;
      stream_uuid?: string;
      uuid?: string;
    }>
  >;
}

export function currentOrgPrefix(page: Page): string {
  const pathname = new URL(page.url()).pathname;
  const match = /^\/org\/[^/]+/.exec(pathname);
  return match?.[0] ?? "";
}

export async function openLiveStream(
  page: Page,
  streamUuid: string,
  topicName?: string,
): Promise<void> {
  const prefix = currentOrgPrefix(page);
  const topicSuffix =
    topicName == null || topicName.trim() === ""
      ? ""
      : `/topic/${encodeURIComponent(topicName.trim())}`;
  await page.goto(`${prefix}/stream/${streamUuid}${topicSuffix}`);
  await page
    .getByPlaceholder(/сообщение|message/i)
    .or(page.locator("textarea"))
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

export async function sendLiveMessageThroughComposer(page: Page, content: string): Promise<void> {
  const textarea = page.locator("textarea").first();
  await textarea.fill(content);
  await page
    .getByRole("form", { name: /поле ввода сообщения|message composer/i })
    .getByRole("button")
    .last()
    .click();
  await textarea.waitFor({ state: "visible" });
}
