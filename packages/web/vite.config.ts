/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import svgr from "vite-plugin-svgr";
import { devWorkspaceBrowserMountPath } from "./src/shared/config/dev-workspace-org-proxy";
import { WORKSPACE_HTTP_PATH_DEFAULTS } from "./src/shared/config/workspace-api-layout";
import { buildPermissionsPolicyHeader } from "./src/shared/lib/permissions-policy";
import { workspaceOrgApiOriginFromZulipRealmRoot } from "./src/shared/lib/workspace-org-origin.lib";
import { installDevWorkspaceOrgProxyMiddleware } from "./vite-dev-workspace-org-proxy";

function normalizeUserUploadsPathPrefix(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim().replace(/\/+$/, "");
  return t.startsWith("/") ? t : `/${t}`;
}

function normalizeWorkspaceRestPath(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

// Если `VITE_USER_UPLOADS_PATH_PREFIX` не задан,
// подстраиваемся под dev-layout Orval: uploads лежат на upstream по пути
// `/workspace{REST}/v1/user_uploads/...`, то есть так же, как и `/workspace` proxy.
function defaultDevUserUploadsProxyPrefix(workspaceRestPath: string): string {
  const rest = normalizeWorkspaceRestPath(workspaceRestPath);
  const segment = rest === "" ? "" : rest.startsWith("/") ? rest : `/${rest}`;
  return `/workspace${segment}/v1`;
}

function effectiveUserUploadsProxyRewritePrefix(
  explicitPrefix: string,
  workspaceRestPath: string,
): string {
  if (explicitPrefix !== "") {
    return explicitPrefix.replace(/\/+$/, "");
  }
  return defaultDevUserUploadsProxyPrefix(workspaceRestPath).replace(/\/+$/, "");
}

function isViteDevProxyDebugEnabled(rawEnv: Record<string, string>): boolean {
  const v = rawEnv.VITE_DEV_PROXY_DEBUG?.trim().toLowerCase();
  return v === "true" || v === "1";
}

type ViteProxyEntry = {
  target: string;
  changeOrigin: boolean;
  rewrite?: (pathValue: string) => string;
  configure?: (proxy: unknown, options: unknown) => void;
};

const BACKEND_NAVIGATE_FALLBACK_DENY_LIST: RegExp[] = [
  /^\/accounts(?:\/|$|[?#])/,
  /^\/login(?:\/|$)/,
  /^\/complete(?:\/|$|[?#])/,
  /^\/api(?:\/|$|[?#])/,
  /^\/json(?:\/|$|[?#])/,
  /^\/workspace(?:\/|$|[?#])/,
  /^\/user_avatars(?:\/|$|[?#])/,
  /^\/user_uploads(?:\/|$|[?#])/,
  /^\/avatar(?:\/|$|[?#])/,
  /^\/external_content(?:\/|$|[?#])/,
];

// Логирует входящий dev-path и итоговый upstream URL после rewrite.
// Включается только через `VITE_DEV_PROXY_DEBUG`.
function withDevProxyRequestLog(
  routeLabel: string,
  targetBase: string,
  enabled: boolean,
  entry: ViteProxyEntry,
): ViteProxyEntry {
  if (!enabled) {
    return entry;
  }
  const previous = entry.configure;
  return {
    ...entry,
    configure(proxy: unknown, options: unknown) {
      previous?.(proxy, options);
      if (
        typeof proxy !== "object" ||
        proxy === null ||
        !("on" in proxy) ||
        typeof (proxy as { on: unknown }).on !== "function"
      ) {
        return;
      }
      const p = proxy as { on: (event: string, handler: (...args: unknown[]) => void) => void };
      p.on("proxyReq", (proxyReq: unknown, req: unknown) => {
        const pr = proxyReq as { path?: string };
        const r = req as { method?: string; url?: string };
        const path = typeof pr.path === "string" ? pr.path : "";
        const base = targetBase.replace(/\/+$/, "");
        let upstream: string;
        try {
          const pathname = path.startsWith("/") ? path : `/${path}`;
          upstream = new URL(pathname, `${base}/`).href;
        } catch {
          upstream = `${base}${path}`;
        }
        // Это только dev-код; `vite.config.ts` исключен из ESLint.
        // Намеренно не используем логгер приложения, потому что здесь Node-контекст и нет `~/shared`.
        console.info(`[vite-proxy:${routeLabel}] ${r.method ?? "?"} ${r.url ?? ""} → ${upstream}`);
      });
    },
  };
}

function deriveLegacyWorkspaceOrigin(
  workspaceOrigin: string,
  explicitLegacyOrigin: string | undefined,
): string {
  const normalizedExplicitOrigin = explicitLegacyOrigin?.trim().replace(/\/+$/, "");
  if (normalizedExplicitOrigin) {
    return normalizedExplicitOrigin;
  }

  const normalizedWorkspaceOrigin = workspaceOrigin.replace(/\/+$/, "");
  return workspaceOrgApiOriginFromZulipRealmRoot(normalizedWorkspaceOrigin);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const workspaceOrigin = env.VITE_WORKSPACE_API_ORIGIN?.replace(/\/+$/, "");
  const workspaceRestPath = normalizeWorkspaceRestPath(
    env.VITE_WORKSPACE_REST_API_PATH !== undefined
      ? env.VITE_WORKSPACE_REST_API_PATH
      : WORKSPACE_HTTP_PATH_DEFAULTS.workspaceRestApiPath,
  );
  const rawUserUploadsPrefix =
    env.VITE_USER_UPLOADS_PATH_PREFIX !== undefined
      ? (env.VITE_USER_UPLOADS_PATH_PREFIX?.trim() ?? "")
      : WORKSPACE_HTTP_PATH_DEFAULTS.userUploadsPathPrefix;
  const uploadsAtRealmRootFlag = env.VITE_USER_UPLOADS_AT_REALM_ROOT?.trim().toLowerCase();
  let proxyUserUploadsAsRealmRoot =
    rawUserUploadsPrefix === "-" ||
    rawUserUploadsPrefix.toLowerCase() === "realm-root" ||
    uploadsAtRealmRootFlag === "true" ||
    uploadsAtRealmRootFlag === "1";
  const userUploadsPathPrefix = proxyUserUploadsAsRealmRoot
    ? ""
    : normalizeUserUploadsPathPrefix(env.VITE_USER_UPLOADS_PATH_PREFIX);
  const workspaceLegacyOrigin = workspaceOrigin
    ? deriveLegacyWorkspaceOrigin(workspaceOrigin, env.VITE_WORKSPACE_API_LEGACY_ORIGIN)
    : "";
  const isElectron = !!env.ELECTRON;
  const isPwaDevEnabled = env.VITE_PWA_DEV === "true";
  const cdnUrl = env.VITE_CDN_URL?.replace(/\/+$/, "");
  const permissionsPolicyHeader = buildPermissionsPolicyHeader(env.VITE_JITSI_MEET_DOMAIN);

  const base = isElectron ? "./" : cdnUrl ? `${cdnUrl}/` : "/";

  const proxyDebug = isViteDevProxyDebugEnabled(env);

  const rewriteUserUploadsPathForUpstream = (pathWithQuery: string): string => {
    if (proxyUserUploadsAsRealmRoot) {
      return pathWithQuery;
    }
    const prefix = effectiveUserUploadsProxyRewritePrefix(
      userUploadsPathPrefix,
      workspaceRestPath,
    );
    return `${prefix}${pathWithQuery}`;
  };

  const devApiProxy =
    workspaceOrigin &&
    ({
      "/workspace/workspace/v1": withDevProxyRequestLog(
        "workspace-legacy",
        workspaceLegacyOrigin,
        proxyDebug,
        {
          target: workspaceLegacyOrigin,
          changeOrigin: true,
          rewrite: (pathValue) => pathValue.replace(/^\/workspace/, ""),
        },
      ),
      "/workspace": withDevProxyRequestLog("workspace", workspaceOrigin, proxyDebug, {
        target: workspaceOrigin,
        changeOrigin: true,
      }),
      "/user_uploads": withDevProxyRequestLog("user_uploads", workspaceOrigin, proxyDebug, {
        target: workspaceOrigin,
        changeOrigin: true,
        rewrite: (pathValue) => rewriteUserUploadsPathForUpstream(pathValue),
      }),
      "/external_content": withDevProxyRequestLog(
        "external_content",
        workspaceOrigin,
        proxyDebug,
        {
          target: workspaceOrigin,
          changeOrigin: true,
        },
      ),
    } satisfies Record<string, ViteProxyEntry>);

  return {
    plugins: [
      // Multi-org Workspace REST: same-origin-путь `/workspace/...`
      // плюс `X-Workspace-Dev-Target-Origin` до прохода через `server.proxy`.
      ...(mode === "development" && !isElectron
        ? [
            {
              name: "dev-workspace-org-proxy",
              enforce: "pre" as const,
              configureServer(server) {
                installDevWorkspaceOrgProxyMiddleware(server.middlewares, {
                  proxyDebug,
                  workspaceMountPath: devWorkspaceBrowserMountPath(workspaceRestPath),
                  workspaceRestPathRaw: workspaceRestPath,
                });
              },
            },
          ]
        : []),
      react(),
      svgr(),
      ...(!isElectron
        ? [
            VitePWA({
              registerType: "prompt",
              includeAssets: ["favicon.ico", "apple-touch-icon.png"],
              manifest: {
                name: env.VITE_BRAND_APP_NAME || "Exordos Workspace",
                short_name: env.VITE_BRAND_SHORT_NAME || "Workspace",
                description:
                  env.VITE_BRAND_DESCRIPTION || "Exordos Workspace — smart corporate messenger",
                theme_color: env.VITE_BRAND_THEME_COLOR || "#1B1B1D",
                background_color: env.VITE_BRAND_BG_COLOR || "#1B1B1D",
                display: "standalone",
                scope: "/",
                start_url: "/",
                orientation: "any",
                categories: ["social", "productivity"],
                icons: [
                  {
                    src: `${base}pwa-192x192.png`,
                    sizes: "192x192",
                    type: "image/png",
                  },
                  {
                    src: `${base}pwa-512x512.png`,
                    sizes: "512x512",
                    type: "image/png",
                  },
                  {
                    src: `${base}pwa-512x512.png`,
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "maskable",
                  },
                ],
              },
              workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
                navigateFallback: "/index.html",
                navigateFallbackDenylist: BACKEND_NAVIGATE_FALLBACK_DENY_LIST,
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                  {
                    urlPattern:
                      /^https:\/\/.*\/api\/v1\/(messages|events|typing|realm\/presence)/,
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "api-realtime-cache",
                      expiration: { maxEntries: 30, maxAgeSeconds: 60 },
                      networkTimeoutSeconds: 10,
                    },
                  },
                  {
                    urlPattern: /^https:\/\/.*\/api\/v1\/(users|server_settings|realm)/,
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "api-static-cache",
                      expiration: { maxEntries: 30, maxAgeSeconds: 300 },
                      networkTimeoutSeconds: 15,
                    },
                  },
                  {
                    urlPattern: /^https:\/\/.*\/api\/v1\//,
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "api-cache",
                      expiration: { maxEntries: 50, maxAgeSeconds: 120 },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/.*\/user_uploads\//,
                    handler: "CacheFirst",
                    options: {
                      cacheName: "uploads-cache",
                      expiration: { maxEntries: 200, maxAgeSeconds: 86400 * 30 },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/.*\/external_content\//,
                    handler: "CacheFirst",
                    options: {
                      cacheName: "external-content-cache",
                      expiration: { maxEntries: 200, maxAgeSeconds: 86400 * 30 },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/.*\/avatar\//,
                    handler: "StaleWhileRevalidate",
                    options: {
                      cacheName: "avatar-cache",
                      expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
                    },
                  },
                ],
              },
              devOptions: {
                enabled: isPwaDevEnabled,
              },
            }),
          ]
        : []),
    ],

    base,

    resolve: {
      alias: {
        "~": path.resolve(import.meta.dirname, "src"),
      },
    },

    build: {
      target: "es2022",
      sourcemap: true,
      chunkSizeWarningLimit: 400,
      rollupOptions: {
        output: {
          // Vite 8 / Rolldown: manualChunks must be a function (object form removed).
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/")
            ) {
              return "react";
            }
            if (id.includes("/node_modules/react-router-dom/")) {
              return "router";
            }
            if (id.includes("/node_modules/@radix-ui/")) {
              return "radix";
            }
          },
        },
      },
    },

    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/vite-env.d.ts",
          "src/main.tsx",
          "src/main-app.tsx",
        ],
      },
    },

    server: {
      port: 5173,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": permissionsPolicyHeader,
      },
      ...(devApiProxy && { proxy: devApiProxy }),
    },

    preview: {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": permissionsPolicyHeader,
      },
      ...(devApiProxy && { proxy: devApiProxy }),
    },
  };
});
