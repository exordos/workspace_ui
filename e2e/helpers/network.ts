import type { BrowserContext } from "@playwright/test";

export async function setBrowserOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

export async function setBrowserOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}
