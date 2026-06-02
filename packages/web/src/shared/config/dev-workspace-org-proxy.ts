/**
 * Dev-only dynamic Workspace API proxy (Vite + browser client).
 *
 * In dev, Workspace REST uses {@link X_WORKSPACE_DEV_TARGET_ORIGIN} with the workspace org target;
 * `/user_uploads` fetches use the same header with the **Zulip realm** origin (files live on the
 * realm host). Vite middleware forwards `/user_uploads/...` without a gateway prefix; the static
 * proxy is the fallback. If
 * `WORKSPACE_API_BASE` is an absolute URL, the client falls back to
 * `/{prefix}/workspace{REST}/...` (see {@link DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX}).
 * Keep in sync with `vite-dev-workspace-org-proxy.ts`.
 */

export const DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX = "/__dev_workspace_org";

/**
 * Same rule as `env.WORKSPACE_API_BASE` in dev when not overridden by an absolute URL.
 * When {@link WORKSPACE_REST_API_PATH} is `/workspace` (REST under `origin/workspace/...` in prod),
 * the dev mount is still a single `/workspace` segment — do not produce `/workspace/workspace`.
 */
export function devWorkspaceBrowserMountPath(restPathNoTrailingSlash: string): string {
  const rest = restPathNoTrailingSlash.replace(/\/+$/, "");
  if (rest === "") {
    return "/workspace";
  }
  if (rest === "/workspace" || rest.startsWith("/workspace/")) {
    return rest;
  }
  return `/workspace${rest}`;
}

/** Path after Workspace API origin before `/v1/...` (same rules as `getWorkspaceApiBaseForCurrentInstance` in prod). */
export function workspaceRestApiPathSuffix(restPathRaw: string): string {
  const restPath = restPathRaw.replace(/\/+$/, "");
  if (restPath === "") {
    return "";
  }
  if (restPath.startsWith("/")) {
    return restPath;
  }
  return `/${restPath}`;
}

/**
 * Path to send upstream when forwarding Workspace REST from the dev mount to the org origin.
 * Drops the dev-only Vite mount, then prefixes with `workspaceRestApiPathSuffix(WORKSPACE_REST_API_PATH)`
 * so the result matches prod (`origin + suffix + /v1/...`).
 */
export function workspaceDevProxyUpstreamPathname(input: {
  pathname: string;
  mount: string;
  onDevEscaped: boolean;
  workspaceRestPathRaw: string;
}): string {
  const mountNorm = input.mount.replace(/\/+$/, "");
  let effective = input.pathname;
  if (input.onDevEscaped) {
    const stripped = input.pathname.slice(DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX.length) || "/";
    effective = stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  if (!(effective === mountNorm || effective.startsWith(`${mountNorm}/`))) {
    throw new Error("Workspace dev proxy path mismatch");
  }
  const relative = effective === mountNorm ? "/" : effective.slice(mountNorm.length);
  let rel = relative;
  if (relative === "" || relative === "/") {
    rel = "/";
  } else if (!relative.startsWith("/")) {
    rel = `/${relative}`;
  }
  const suffix = workspaceRestApiPathSuffix(input.workspaceRestPathRaw);
  if (suffix === "") {
    return rel === "/" ? "/" : rel;
  }
  if (rel === "/" || rel === "") {
    return suffix;
  }
  return `${suffix}${rel}`;
}

/** Request header carrying the Zulip realm origin (https://host, optional port). */
export const X_WORKSPACE_DEV_TARGET_ORIGIN = "X-Workspace-Dev-Target-Origin";

/** True when value is https origin, or http on localhost/127.0.0.1/::1 only. */
export function isAllowedDevWorkspaceProxyTargetOrigin(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return false;
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "") {
    return false;
  }
  if (u.search !== "" || u.hash !== "") {
    return false;
  }
  if (u.pathname !== "/" && u.pathname !== "") {
    return false;
  }
  if (u.protocol === "https:") {
    return true;
  }
  if (u.protocol === "http:") {
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }
  return false;
}
