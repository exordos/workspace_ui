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

/**
 * When `VITE_USER_UPLOADS_PATH_PREFIX` is unset, match dev Orval layout: uploads live at
 * `/workspace{REST}/v1/user_uploads/...` on the upstream (same as `/workspace` proxy).
 */
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

/** Logs incoming dev path → resolved upstream URL (after rewrite). Gated by VITE_DEV_PROXY_DEBUG. */
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
        // Dev-only; vite.config.ts is ESLint-ignored. Intentionally not app logger (Node, no ~/shared).
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
    } satisfies Record<string, ViteProxyEntry>);

  return {
    plugins: [
      // Multi-org Workspace REST: same-origin `/workspace/...` + X-Workspace-Dev-Target-Origin (before server.proxy)
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
                name: env.VITE_BRAND_APP_NAME || "Workspace",
                short_name: env.VITE_BRAND_SHORT_NAME || "Workspace",
                description: env.VITE_BRAND_DESCRIPTION || "Corporate messenger",
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
          manualChunks: {
            react: ["react", "react-dom"],
            router: ["react-router-dom"],
            radix: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-scroll-area",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
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
