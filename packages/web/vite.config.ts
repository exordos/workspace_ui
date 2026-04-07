/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import svgr from "vite-plugin-svgr";
import { buildPermissionsPolicyHeader } from "./src/shared/lib/permissions-policy";

function deriveLegacyWorkspaceOrigin(
  workspaceOrigin: string,
  explicitLegacyOrigin: string | undefined,
): string {
  const normalizedExplicitOrigin = explicitLegacyOrigin?.trim().replace(/\/+$/, "");
  if (normalizedExplicitOrigin) {
    return normalizedExplicitOrigin;
  }

  const normalizedWorkspaceOrigin = workspaceOrigin.replace(/\/+$/, "");
  try {
    const parsedWorkspaceOrigin = new URL(normalizedWorkspaceOrigin);
    if (parsedWorkspaceOrigin.hostname.startsWith("zulip.")) {
      parsedWorkspaceOrigin.hostname = `workspace.${parsedWorkspaceOrigin.hostname.slice("zulip.".length)}`;
      return parsedWorkspaceOrigin.origin;
    }
  } catch {
    // Keep current origin when env value is not a valid URL.
  }

  return normalizedWorkspaceOrigin;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const workspaceOrigin = env.VITE_WORKSPACE_API_ORIGIN?.replace(/\/+$/, "");
  const workspaceLegacyOrigin = workspaceOrigin
    ? deriveLegacyWorkspaceOrigin(workspaceOrigin, env.VITE_WORKSPACE_API_LEGACY_ORIGIN)
    : "";
  const isElectron = !!env.ELECTRON;
  const isPwaDevEnabled = env.VITE_PWA_DEV === "true";
  const cdnUrl = env.VITE_CDN_URL?.replace(/\/+$/, "");
  const permissionsPolicyHeader = buildPermissionsPolicyHeader(env.VITE_JITSI_MEET_DOMAIN);

  const base = isElectron ? "./" : cdnUrl ? `${cdnUrl}/` : "/";

  return {
    plugins: [
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
      ...(workspaceOrigin && {
        proxy: {
          "/workspace/workspace/v1": {
            target: workspaceLegacyOrigin,
            changeOrigin: true,
            rewrite: (pathValue) => pathValue.replace(/^\/workspace/, ""),
          },
          "/workspace": {
            target: workspaceOrigin,
            changeOrigin: true,
          },
          "/user_uploads": {
            target: workspaceOrigin,
            changeOrigin: true,
          },
        },
      }),
    },

    preview: {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": permissionsPolicyHeader,
      },
    },
  };
});
