import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(import.meta.dirname, "../../..");
const WORKSPACE_MESSAGE_LIST_DIR = resolve(SRC_ROOT, "widgets/workspace-message-list");
const WORKSPACE_RENDER_CORE_DIR = import.meta.dirname;
const WORKSPACE_COMPACT_SUMMARY_FILES = [
  resolve(SRC_ROOT, "entities/messenger/messenger-sidebar.lib.ts"),
  resolve(SRC_ROOT, "pages/feed/feed-page.ui.tsx"),
] as const;
const WORKSPACE_RICH_RENDER_SURFACE_FILES = [
  resolve(SRC_ROOT, "widgets/workspace-message-list/workspace-message-bubble.ui.tsx"),
  resolve(SRC_ROOT, "widgets/workspace-message-list/workspace-message-quote.ui.tsx"),
  resolve(SRC_ROOT, "widgets/message-composer/message-composer-preview.hook.ts"),
] as const;
const LEGACY_MESSAGE_LIST_PATH = ["widgets", "message-list"].join("/");
const LEGACY_MESSAGE_LIST_IMPORT_PATTERN = new RegExp(
  `(?:~/${LEGACY_MESSAGE_LIST_PATH}|${LEGACY_MESSAGE_LIST_PATH}|/message-list/message-)`,
);
const ZULIP_API_IMPORT_PATTERN = new RegExp(["shared/api/zulip", "-"].join(""));
const LEGACY_MOCK_MESSAGE_TYPE_PATTERN = new RegExp(["Mock", "Message"].join(""));
const LEGACY_PLAIN_TEXT_PREVIEW_HELPER_PATTERN = new RegExp(
  ["plainTextPreview", "FromMessageBody"].join(""),
);
const ACTIVE_WORKSPACE_RENDERER_FILES = [
  ...listSourceFiles(WORKSPACE_MESSAGE_LIST_DIR),
  resolve(SRC_ROOT, "pages/chat/chat-page-workspace-message-list-section.types.ts"),
  resolve(SRC_ROOT, "pages/chat/chat-page-workspace-message-list-section.ui.tsx"),
  resolve(SRC_ROOT, "pages/chat/chat-page-workspace.ui.tsx"),
] as const;

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .flatMap((entry) => {
      const absolutePath = resolve(dir, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        return listSourceFiles(absolutePath);
      }
      return /\.(?:ts|tsx)$/.test(entry) ? [absolutePath] : [];
    })
    .sort();
}

function source(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function relativeFile(filePath: string): string {
  return relative(SRC_ROOT, filePath);
}

function expectNoForbiddenText(files: readonly string[], forbidden: RegExp): void {
  const offenders = files
    .map((filePath) => ({ filePath, content: source(filePath) }))
    .filter(({ content }) => forbidden.test(content))
    .map(({ filePath }) => relativeFile(filePath));

  expect(offenders).toEqual([]);
}

describe("Workspace message render boundaries", () => {
  it("keeps workspace-message-list independent from the legacy message-list", () => {
    // Фаза 11 фиксирует физическую границу: новый список может повторять UX,
    // но не должен получать runtime-зависимость от старого Zulip-shaped виджета.
    expectNoForbiddenText(
      listSourceFiles(WORKSPACE_MESSAGE_LIST_DIR),
      LEGACY_MESSAGE_LIST_IMPORT_PATTERN,
    );
  });

  it("keeps Workspace render core independent from Zulip API modules", () => {
    expectNoForbiddenText(listSourceFiles(WORKSPACE_RENDER_CORE_DIR), ZULIP_API_IMPORT_PATTERN);
  });

  it("keeps the active Workspace renderer free from the legacy mock message type", () => {
    expectNoForbiddenText(ACTIVE_WORKSPACE_RENDERER_FILES, LEGACY_MOCK_MESSAGE_TYPE_PATTERN);
  });

  it("keeps compact Workspace previews on the summary API", () => {
    expectNoForbiddenText(
      WORKSPACE_COMPACT_SUMMARY_FILES,
      LEGACY_PLAIN_TEXT_PREVIEW_HELPER_PATTERN,
    );

    for (const filePath of WORKSPACE_COMPACT_SUMMARY_FILES) {
      expect(source(filePath), relativeFile(filePath)).toContain(
        "summarizeWorkspaceMessageMarkdown",
      );
    }
  });

  it("keeps rich Workspace surfaces on the shared render API", () => {
    for (const filePath of WORKSPACE_RICH_RENDER_SURFACE_FILES) {
      expect(source(filePath), relativeFile(filePath)).toMatch(
        /renderWorkspaceMessageBody(?:Segments)?/,
      );
      expect(source(filePath), relativeFile(filePath)).not.toMatch(/from ["']marked["']/);
    }
  });

  it("does not switch compact Workspace previews to the rich renderer", () => {
    for (const filePath of WORKSPACE_COMPACT_SUMMARY_FILES) {
      expect(source(filePath), relativeFile(filePath)).not.toContain("renderWorkspaceMessageBody");
    }
  });
});
