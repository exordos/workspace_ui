import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layout.ui workspace notifications wiring", () => {
  it("uses the Workspace hook without Firebase push registration", () => {
    const source = readFileSync("src/widgets/layout/layout.ui.tsx", "utf8");

    expect(source).toContain(
      'import { useLayoutWorkspaceNotifications } from "./layout-workspace-notifications.hook";',
    );
    expect(source).toContain("useLayoutWorkspaceNotifications({");
    expect(source.includes("push" + "Service")).toBe(false);
    expect(source).not.toContain("useLayoutPush");
  });
});
