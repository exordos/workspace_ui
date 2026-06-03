/**
 * Vite dev proxy for multi-org via `X-Workspace-Dev-Target-Origin`.
 * Runs before static `server.proxy`; pairs with `src/shared/config/dev-workspace-org-proxy.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import httpProxy from "http-proxy";
import {
  DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX,
  X_WORKSPACE_DEV_TARGET_ORIGIN,
  isAllowedDevWorkspaceProxyTargetOrigin,
  workspaceDevProxyUpstreamPathname,
} from "./src/shared/config/dev-workspace-org-proxy";

const HEADER_LC = X_WORKSPACE_DEV_TARGET_ORIGIN.toLowerCase();

function readHeader(req: IncomingMessage): string | undefined {
  const v = req.headers[HEADER_LC];
  if (typeof v === "string") {
    return v;
  }
  if (Array.isArray(v) && v[0] != null) {
    return v[0];
  }
  return undefined;
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

type ConnectUse = (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;

export function installDevWorkspaceOrgProxyMiddleware(
  middlewares: { use: ConnectUse },
  options: {
    proxyDebug: boolean;
    workspaceMountPath: string;
    workspaceRestPathRaw: string;
  },
): void {
  const mount = options.workspaceMountPath.replace(/\/+$/, "");
  const devEscapedMount =
    `${DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX}${mount}`.replace(/\/+$/, "");

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    xfwd: true,
  });

  proxy.on("error", (err, _req, res) => {
    const r = res as ServerResponse | undefined;
    if (r != null && !r.headersSent) {
      sendText(r, 502, `Workspace dev proxy error: ${err.message}`);
    }
  });

  middlewares.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url ?? "";
    let parsed: URL;
    try {
      parsed = new URL(url, "http://localhost");
    } catch {
      next();
      return;
    }
    const pathname = parsed.pathname;

    const onRealmMedia =
      pathname === "/user_uploads" ||
      pathname.startsWith("/user_uploads/") ||
      pathname === "/external_content" ||
      pathname.startsWith("/external_content/") ||
      pathname === "/avatar" ||
      pathname.startsWith("/avatar/") ||
      pathname === "/user_avatars" ||
      pathname.startsWith("/user_avatars/");
    if (onRealmMedia) {
      const mediaLabel =
        pathname === "/external_content" || pathname.startsWith("/external_content/")
          ? "external_content"
          : pathname === "/avatar" || pathname.startsWith("/avatar/")
            ? "avatar"
            : pathname === "/user_avatars" || pathname.startsWith("/user_avatars/")
              ? "user_avatars"
              : "user_uploads";
      const targetRaw = readHeader(req);
      const trimmedTarget = targetRaw?.trim() ?? "";

      if (trimmedTarget === "") {
        next();
        return;
      }

      if (!isAllowedDevWorkspaceProxyTargetOrigin(trimmedTarget)) {
        sendText(res, 403, "Target origin not allowed for dev realm media proxy");
        return;
      }

      let targetOrigin: string;
      try {
        targetOrigin = new URL(trimmedTarget).origin;
      } catch {
        sendText(res, 400, "Invalid target origin URL");
        return;
      }

      delete req.headers[HEADER_LC];

      const pathWithQuery = `${parsed.pathname}${parsed.search}`;
      req.url = `${pathWithQuery}${parsed.hash}`;

      if (options.proxyDebug) {
        const upstream = new URL(req.url ?? "/", `${targetOrigin}/`).href;
        console.info(`[vite-proxy:${mediaLabel}-org] ${req.method ?? "?"} ${url} → ${upstream}`);
      }

      proxy.web(req, res, { target: targetOrigin });
      return;
    }

    const onMount = pathname === mount || pathname.startsWith(`${mount}/`);
    const onDevEscaped =
      pathname === devEscapedMount || pathname.startsWith(`${devEscapedMount}/`);

    if (!onMount && !onDevEscaped) {
      next();
      return;
    }

    const targetRaw = readHeader(req);
    const trimmedTarget = targetRaw?.trim() ?? "";

    if (trimmedTarget === "") {
      if (onDevEscaped) {
        sendText(res, 400, `Missing ${X_WORKSPACE_DEV_TARGET_ORIGIN} header`);
        return;
      }
      next();
      return;
    }

    if (!isAllowedDevWorkspaceProxyTargetOrigin(trimmedTarget)) {
      sendText(res, 403, "Target origin not allowed for dev Workspace proxy");
      return;
    }

    let targetOrigin: string;
    try {
      targetOrigin = new URL(trimmedTarget).origin;
    } catch {
      sendText(res, 400, "Invalid target origin URL");
      return;
    }

    delete req.headers[HEADER_LC];

    let forwardPath: string;
    try {
      forwardPath = workspaceDevProxyUpstreamPathname({
        pathname,
        mount,
        onDevEscaped,
        workspaceRestPathRaw: options.workspaceRestPathRaw,
      });
    } catch {
      sendText(res, 500, "Workspace dev proxy path mismatch");
      return;
    }

    req.url = `${forwardPath}${parsed.search}${parsed.hash}`;

    if (options.proxyDebug) {
      const upstream = new URL(req.url ?? "/", `${targetOrigin}/`).href;
      console.info(`[vite-proxy:workspace-org] ${req.method ?? "?"} ${url} → ${upstream}`);
    }

    proxy.web(req, res, { target: targetOrigin });
  });
}
