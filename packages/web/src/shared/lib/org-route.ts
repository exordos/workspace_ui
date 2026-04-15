/**
 * Organization-scoped routing helpers.
 *
 * Builds deterministic `/org/:orgId` segments from the Workspace gateway origin
 * saved at login (`workspaceOrgOrigin`) when present; otherwise from Zulip realm.
 * Helpers prefix or replace `/org/:orgId` in internal routes while preserving query/hash.
 */

const ORG_PATH_PREFIX = "/org/";
const PUBLIC_ROUTE_PREFIXES = ["/login", "/paste-token"] as const;
type OrgRouteIdResolver = (() => string | null) | null;
let currentOrgRouteIdResolver: OrgRouteIdResolver = null;

interface SplitPathResult {
  pathname: string;
  suffix: string;
}

export interface OrgRouteMatch {
  orgId: string | null;
  scopedPathname: string;
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed.length === 0) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function splitPath(path: string): SplitPathResult {
  const normalizedPath = normalizePathname(path);
  const match = /^([^?#]*)(.*)$/.exec(normalizedPath);
  if (!match) return { pathname: "/", suffix: "" };
  return {
    pathname: normalizePathname(match[1] ?? "/"),
    suffix: match[2] ?? "",
  };
}

function normalizeOrgId(orgId: string): string {
  const trimmed = orgId.trim();
  if (trimmed.length === 0) return "org";
  return encodeURIComponent(trimmed);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildOrgRouteIdFromRealm(realm: string): string {
  const trimmedRealm = realm.trim();
  if (trimmedRealm.length === 0) return "org";

  try {
    const withProtocol = /^https?:\/\//i.test(trimmedRealm)
      ? trimmedRealm
      : `https://${trimmedRealm}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    const portSuffix = parsed.port.length > 0 ? `-${parsed.port}` : "";
    const normalized = `${host}${portSuffix}`
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return normalized.length > 0 ? normalized : "org";
  } catch {
    const fallback = trimmedRealm
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return fallback.length > 0 ? fallback : "org";
  }
}

/** Minimal persisted instance fields needed to derive the org segment (shared layer — no entity import). */
export interface OrgRouteInstanceInput {
  realm: string;
  /** Origin of the server URL entered at login; aligns with Workspace REST / folders when set. */
  workspaceOrgOrigin?: string;
}

/**
 * Org route id for multi-tab routing: prefer login gateway origin over canonical Zulip realm.
 */
export function buildOrgRouteIdForZulipInstance(instance: OrgRouteInstanceInput): string {
  const fromLogin = instance.workspaceOrgOrigin?.trim() ?? "";
  if (fromLogin.length > 0) {
    return buildOrgRouteIdFromRealm(fromLogin);
  }
  return buildOrgRouteIdFromRealm(instance.realm);
}

export function extractOrgRouteFromPathname(pathname: string): OrgRouteMatch {
  const normalizedPathname = normalizePathname(pathname);
  const match = /^\/org\/([^/]+)(?:\/(.*))?$/.exec(normalizedPathname);
  if (!match) {
    return { orgId: null, scopedPathname: normalizedPathname };
  }

  const rawOrgId = match[1] ?? "";
  const decodedOrgId = rawOrgId.length > 0 ? safeDecodeURIComponent(rawOrgId) : null;
  const scopedTail = match[2];
  return {
    orgId: decodedOrgId,
    scopedPathname: scopedTail == null || scopedTail.length === 0 ? "/" : `/${scopedTail}`,
  };
}

export function isOrgRoutePublicPath(pathname: string): boolean {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => scopedPathname === prefix || scopedPathname.startsWith(`${prefix}/`),
  );
}

export function withOrgRoutePrefix(path: string, orgId: string): string {
  const { pathname, suffix } = splitPath(path);
  if (isOrgRoutePublicPath(pathname)) return `${pathname}${suffix}`;

  const normalizedOrgId = normalizeOrgId(orgId);
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (scopedPathname === "/") {
    return `/org/${normalizedOrgId}${suffix}`;
  }
  return `${ORG_PATH_PREFIX}${normalizedOrgId}${scopedPathname}${suffix}`;
}

export function replaceOrgRouteInPath(path: string, orgId: string): string {
  return withOrgRoutePrefix(path, orgId);
}

export function setCurrentOrgRouteIdResolver(resolver: OrgRouteIdResolver): void {
  currentOrgRouteIdResolver = resolver;
}

export function withCurrentOrgRoute(path: string): string {
  const { pathname } = splitPath(path);
  const pathMatch = extractOrgRouteFromPathname(pathname);
  if (pathMatch.orgId != null) {
    return path;
  }
  const resolvedOrgId = currentOrgRouteIdResolver?.();
  if (resolvedOrgId == null || resolvedOrgId.trim().length === 0) return path;
  return withOrgRoutePrefix(path, resolvedOrgId);
}
