import { describe, expect, it } from "vitest";
import { realmCustomProfileFieldIsManager } from "~/shared/lib/messenger-profile-fields-map.lib";

describe("realmCustomProfileFieldIsManager", () => {
  it("detects manager-like text and person fields", () => {
    expect(realmCustomProfileFieldIsManager({ id: 1, name: "Manager", type: 1, order: 1 })).toBe(
      true,
    );
    expect(
      realmCustomProfileFieldIsManager({ id: 2, name: "Руководитель", type: 6, order: 2 }),
    ).toBe(true);
  });

  it("ignores unrelated fields", () => {
    expect(realmCustomProfileFieldIsManager({ id: 3, name: "Phone", type: 1, order: 1 })).toBe(
      false,
    );
    expect(realmCustomProfileFieldIsManager({ id: 4, name: "Manager", type: 4, order: 2 })).toBe(
      false,
    );
  });
});
