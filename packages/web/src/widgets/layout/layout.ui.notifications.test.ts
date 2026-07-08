import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layout.ui workspace notifications wiring", () => {
  it("uses the Workspace hook and no longer references the legacy push hook", () => {
    const source = readFileSync("src/widgets/layout/layout.ui.tsx", "utf8");

    expect(source).toContain(
      'import { useLayoutWorkspaceNotifications } from "./layout-workspace-notifications.hook";',
    );
    expect(source).toContain("useLayoutWorkspaceNotifications({");
    expect(source).not.toContain("useLayoutPushNotifications(");
    expect(source).not.toContain(
      'import { useLayoutPushNotifications } from "./layout-push-notifications.hook";',
    );
  });
});
