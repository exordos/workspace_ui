import { describe, expect, it } from "vitest";
import { isWorkspaceExternalAccountDto } from "./messenger-external-accounts.types";

const account = {
  uuid: "telegram-account",
  provider: "telegram",
  status: "syncing",
  settings: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("Telegram account registry contract", () => {
  it("accepts Telegram accounts while automatically importing all history", () => {
    expect(isWorkspaceExternalAccountDto(account)).toBe(true);
  });

  it.each(["api_hash", "session", "password", "qr_url"])(
    "rejects %s in public settings",
    (field) => {
      expect(
        isWorkspaceExternalAccountDto({
          ...account,
          settings: { ...account.settings, [field]: "synthetic" },
        }),
      ).toBe(false);
    },
  );
});
