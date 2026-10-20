import { t } from "~/i18n/i18n";
import { getElectronAPI } from "./electron";

interface NavigatorWithClientHints extends Navigator {
  userAgentData?: {
    brands: readonly { brand: string; version: string }[];
    platform: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
  };
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
}

async function readOptionalName(read: () => Promise<unknown>, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Optional environment APIs must not block creation of the local crypto identity.
    return cleanName(
      await Promise.race([
        read(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]),
    );
  } catch {
    return "";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function getWebDevice(nav: NavigatorWithClientHints): string {
  const ua = nav.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1)) return "iPad";

  const platforms = new Map([
    ["macOS", "Mac"],
    ["Windows", "Windows"],
    ["Android", "Android"],
    ["Linux", "Linux"],
    ["Chrome OS", "Chrome OS"],
    ["iOS", "iOS"],
  ]);
  const platform = platforms.get(nav.userAgentData?.platform ?? "");
  if (platform) return platform;

  const patterns: readonly [RegExp, string][] = [
    [/Android/i, "Android"],
    [/CrOS/i, "Chrome OS"],
    [/Macintosh|Mac OS X/i, "Mac"],
    [/Windows/i, "Windows"],
    [/Linux/i, "Linux"],
  ];
  return patterns.find(([pattern]) => pattern.test(ua))?.[1] ?? t("deviceName.unknown");
}

function getBrowser(nav: NavigatorWithClientHints): string {
  // Client Hints include synthetic brands; only use known product names.
  const brands = nav.userAgentData?.brands ?? [];
  const products: readonly [string, string][] = [
    ["Microsoft Edge", "Edge"],
    ["Samsung Internet", "Samsung Internet"],
    ["Opera", "Opera"],
    ["Google Chrome", "Chrome"],
  ];
  const product = products.find(([brand]) => brands.some((entry) => entry.brand === brand));
  if (product) return product[1];

  const patterns: readonly [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//i, "Edge"],
    [/SamsungBrowser\//i, "Samsung Internet"],
    [/OPR\/|OPiOS\//i, "Opera"],
    [/Firefox\/|FxiOS\//i, "Firefox"],
    [/Chrome\/|CriOS\//i, "Chrome"],
    [/Safari\//i, "Safari"],
  ];
  return (
    patterns.find(([pattern]) => pattern.test(nav.userAgent))?.[1] ??
    (brands.some((entry) => entry.brand === "Chromium") ? "Chromium" : "")
  );
}

function getDesktopDevice(platform: string | undefined): string {
  switch (platform) {
    case "darwin":
      return "Mac";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return t("deviceName.unknown");
  }
}

/** Returns display metadata only; it never creates or changes a device ID. */
export async function getDeviceName(): Promise<string> {
  const desktop = typeof window === "undefined" ? null : getElectronAPI();
  if (desktop) {
    const systemName = await readOptionalName(async () => desktop.app?.getDeviceName?.(), 1500);
    return `${systemName || getDesktopDevice(desktop.platform)} — ${t("deviceName.desktop")}`;
  }

  const nav = typeof navigator === "undefined" ? null : (navigator as NavigatorWithClientHints);
  const model = nav?.userAgentData?.getHighEntropyValues
    ? await readOptionalName(async () => {
        const hints = await nav.userAgentData?.getHighEntropyValues?.(["model"]);
        return hints?.model;
      }, 500)
    : "";
  const device = model || (nav ? getWebDevice(nav) : t("deviceName.unknown"));
  const browser = nav ? getBrowser(nav) : "";
  const description = browser ? `${device} · ${browser}` : device;
  return `${description} — ${t("deviceName.web")}`;
}
