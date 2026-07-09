import { env } from "~/shared/lib/env";

export function normalizeServerBaseUrl(url: string): string {
  let value = url.trim().replace(/\/+$/, "");
  const suffixes = [env.ZULIP_API_PATH, "/api/v1", "/json", "/api"];
  for (const suffix of suffixes) {
    if (suffix.length > 0 && value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return value.replace(/\/+$/, "");
}
