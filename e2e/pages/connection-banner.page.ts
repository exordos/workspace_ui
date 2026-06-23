import { expect, type Locator, type Page } from "@playwright/test";

export class ConnectionBannerPage {
  readonly banner: Locator;
  readonly reloadButton: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.getByTestId("layout-top-banner-expanded");
    this.reloadButton = this.banner.getByRole("button", {
      name: /Повторить|Try again|Перезагрузить|Reload/i,
    });
  }

  async expectVisible(options?: { timeout?: number }): Promise<void> {
    await expect(this.banner).toBeVisible(options);
  }

  async expectHidden(options?: { timeout?: number }): Promise<void> {
    await expect(this.banner).toBeHidden(options);
  }

  async expectDegradedMessage(): Promise<void> {
    await expect(this.banner).toContainText(
      /Проблемы с соединением|Connection issues|Нет подключения|No internet/i,
    );
  }

  async expectOfflineMessage(): Promise<void> {
    await expect(this.banner).toContainText(/Нет подключения|No internet/i);
  }
}

export class ConnectionBlockedPage {
  readonly alert: Locator;

  constructor(page: Page) {
    this.alert = page.getByRole("alert").filter({
      hasText: /Не удалось подключиться|Could not connect/i,
    });
  }

  async expectVisible(): Promise<void> {
    await expect(this.alert).toBeVisible();
  }
}
