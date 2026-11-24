import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  collectArchitectureViolations,
  compareArchitectureBaseline,
} from "./check-architecture.mjs";

// Use a real miniature TypeScript project so alias, index, and relative resolution are exercised.
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "workspace-arch-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, "tsconfig.json");
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "bundler",
        verbatimModuleSyntax: true,
        paths: { "~/*": ["./src/*"] },
      },
      include: ["src"],
    }),
  );
  const write = (file, contents) => {
    const path = join(root, "src", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  };
  for (const [file, contents] of Object.entries(files)) write(file, contents);
  return { root, write, scan: () => collectArchitectureViolations(config) };
}

test("checks layer and private boundaries across type imports, lazy imports, and re-exports", (t) => {
  const { scan } = fixture(t, {
    "app/router.ts": 'export const route = () => import("~/applications/messenger/messenger");',
    "app/eager.ts": 'export * from "~/applications/messenger/messenger";',
    "applications/messenger/messenger.ts": 'export { screen } from "./pages";',
    "applications/messenger/pages/index.ts": 'export { screen } from "../features/screen";',
    "applications/messenger/features/screen.ts": [
      'export type Example = import("../model/messages/history/history.lib").Example;',
      'export const screen = () => import("../messenger");',
    ].join("\n"),
    "applications/messenger/model/messages/history/history.lib.ts": [
      'import type { Route } from "../../../../../app/route";',
      'export type Screen = typeof import("../../../features/screen").screen;',
      "export type Example = Route;",
    ].join("\n"),
    "app/route.ts": "export type Route = string;",
    "entities/user/sync.ts":
      'export type { Example } from "~/applications/messenger/model/messages/history/history.lib";',
    "shared/lib/up.ts": 'export type { Route } from "../../app/route";',
    "shared/lib/up.test.ts": 'export * from "../../app/eager";',
  });

  const { checked, violations } = scan();
  assert.equal(checked, 9);
  assert.deepEqual(
    violations.map(({ rule, from, line }) => [rule, from, line]),
    [
      ["application-direction", "applications/messenger/model/messages/history/history.lib.ts", 1],
      ["application-direction", "entities/user/sync.ts", 1],
      ["legacy-direction", "shared/lib/up.ts", 1],
      ["messenger-direction", "applications/messenger/model/messages/history/history.lib.ts", 2],
      ["messenger-lazy-entry", "app/eager.ts", 1],
      ["messenger-lazy-entry", "applications/messenger/features/screen.ts", 2],
      ["messenger-private", "applications/messenger/features/screen.ts", 1],
      ["messenger-private", "entities/user/sync.ts", 1],
    ],
  );
});

test("enforces established shared indexes across alias and relative imports", (t) => {
  const { scan } = fixture(t, {
    "app/consumer.ts": [
      'export { Button } from "~/shared/ui/button";',
      'export type { ButtonProps } from "~/shared/ui/button/button";',
      'export { copy } from "../shared/lib/clipboard";',
      'export { copy as bypass } from "../shared/lib/clipboard/copy";',
      'export { direct } from "../shared/lib/unindexed/direct";',
    ].join("\n"),
    "shared/lib/clipboard/index.ts": 'export { copy } from "./copy";',
    "shared/lib/clipboard/copy.ts": "export const copy = () => {};",
    "shared/lib/unindexed/direct.ts": "export const direct = true;",
    "shared/ui/button/index.ts": 'export { Button, type ButtonProps } from "./button";',
    "shared/ui/button/button.ts": [
      'export type { ButtonProps } from "./props";',
      "export const Button = () => {};",
    ].join("\n"),
    "shared/ui/button/helper.ts": 'export type { ButtonProps } from ".";',
    "shared/ui/button/props.ts": "export type ButtonProps = { disabled: boolean };",
  });

  assert.deepEqual(scan().violations, [
    {
      rule: "shared-public-entry",
      from: "app/consumer.ts",
      to: "shared/lib/clipboard/copy.ts",
      line: 4,
    },
    {
      rule: "shared-public-entry",
      from: "app/consumer.ts",
      to: "shared/ui/button/button.ts",
      line: 2,
    },
    {
      rule: "shared-public-entry",
      from: "shared/ui/button/helper.ts",
      to: "shared/ui/button/index.ts",
      line: 1,
    },
  ]);
});

test("enforces the users public entries and keeps users independent of applications", (t) => {
  const { scan } = fixture(t, {
    "app/consumer.ts": [
      'export { readUser } from "~/modules/users/users";',
      'export { updateUser } from "../modules/users/users-profile";',
      'export const loadUsersRuntime = () => import("~/modules/users/users-runtime");',
      'export { selectUser } from "~/modules/users/users-selectors";',
      'export type { User } from "../modules/users/users-types";',
      'export { store } from "~/modules/users/user.model";',
      'export type { User as PrivateUser } from "../modules/users/user.types.js";',
      'export const loadPrivate = () => import("~/modules/users/internal/users");',
      'export type { Private } from "../modules/users/private-declaration";',
      'import "../modules/users/private.test";',
    ].join("\n"),
    "app/consumer.test.ts": 'import "~/modules/users/user.model";',
    "modules/users/user.model.ts":
      'import type { User } from "./user.types"; export const store: User[] = [];',
    "modules/users/user.types.ts": "export type User = { id: string };",
    "modules/users/users.ts":
      'import { store } from "./user.model"; export const readUser = () => store[0];',
    "modules/users/users-profile.ts": "export const updateUser = () => {};",
    "modules/users/users-runtime.ts": [
      'export const loadMessenger = () => import("~/applications/messenger/model/chats/chats");',
      'export type { CalendarEvent } from "../../applications/calendar/events";',
      'import "~/applications/calendar/events.stories";',
    ].join("\n"),
    "modules/users/users-selectors.ts": "export const selectUser = () => {};",
    "modules/users/users-types.ts": 'export type { User } from "./user.types";',
    "modules/users/internal/users.ts": "export {};",
    "modules/users/private-declaration.d.ts": "export type Private = string;",
    "modules/users/private.test.ts": "export {};",
    "modules/users-extra/consumer.ts": 'import "../users/user.model";',
    "applications/calendar/events.ts": "export type CalendarEvent = { id: string };",
    "applications/calendar/events.stories.ts": "export {};",
    "applications/messenger/model/chats/chats.ts": "export {};",
    "shared/lib/excluded-target.ts": 'import "~/app/consumer.test";',
  });

  assert.deepEqual(
    scan().violations.map(({ rule, from, to, line }) => [rule, from, to, line]),
    [
      [
        "users-direction",
        "modules/users/users-runtime.ts",
        "applications/calendar/events.stories.ts",
        3,
      ],
      ["users-direction", "modules/users/users-runtime.ts", "applications/calendar/events.ts", 2],
      [
        "users-direction",
        "modules/users/users-runtime.ts",
        "applications/messenger/model/chats/chats.ts",
        1,
      ],
      ["users-public-entry", "app/consumer.ts", "modules/users/internal/users.ts", 8],
      ["users-public-entry", "app/consumer.ts", "modules/users/private-declaration.d.ts", 9],
      ["users-public-entry", "app/consumer.ts", "modules/users/private.test.ts", 10],
      ["users-public-entry", "app/consumer.ts", "modules/users/user.model.ts", 6],
      ["users-public-entry", "app/consumer.ts", "modules/users/user.types.ts", 7],
      ["users-public-entry", "modules/users-extra/consumer.ts", "modules/users/user.model.ts", 1],
    ],
  );
});

test("enforces users boundaries with the filesystem's path casing", (t) => {
  const { root, scan } = fixture(t, {
    "app/consumer.ts": [
      'import "~/MODULES/USERS/USER.MODEL";',
      'export { readUser } from "../MODULES/users/USERS";',
      'export type { Private } from "../../SRC/MODULES/USERS/Private";',
    ].join("\n"),
    "modules/users/private.d.ts": "export type Private = string;",
    "modules/users/user.model.ts": "export {};",
    "modules/users/users.ts": "export const readUser = () => {};",
    "modules/users/users-runtime.ts": 'import "~/APPLICATIONS/CALENDAR/EVENTS";',
    "applications/calendar/events.ts": "export {};",
  });
  if (!existsSync(join(root, "src/MODULES/USERS/USER.MODEL.ts"))) {
    t.skip("The fixture filesystem is case-sensitive.");
    return;
  }

  assert.deepEqual(scan().violations, [
    {
      rule: "users-direction",
      from: "modules/users/users-runtime.ts",
      to: "applications/calendar/events.ts",
      line: 1,
    },
    {
      rule: "users-public-entry",
      from: "app/consumer.ts",
      to: "modules/users/private.d.ts",
      line: 3,
    },
    {
      rule: "users-public-entry",
      from: "app/consumer.ts",
      to: "modules/users/user.model.ts",
      line: 1,
    },
  ]);
});

test("allows statement-level type and lazy back edges while recording inline-type re-exports", (t) => {
  const { write, scan } = fixture(t, {
    "shared/lib/a.ts": [
      "export const a = 1;",
      "export type T = number;",
      'export { b } from "./b";',
    ].join("\n"),
    "shared/lib/b.ts": [
      'import type { T } from "~/shared/lib/a";',
      'export type { T } from "./a";',
      'export const lazy = () => import("./a");',
      "export const b: T = 1;",
    ].join("\n"),
  });

  assert.deepEqual(scan().violations, []);
  write("shared/lib/b.ts", 'export { type T } from "./a"; export const b = 1;');
  assert.deepEqual(
    scan().violations.map(({ rule, from, to }) => [rule, from, to]),
    [
      ["static-value-cycle", "shared/lib/a.ts", "shared/lib/b.ts"],
      ["static-value-cycle", "shared/lib/b.ts", "shared/lib/a.ts"],
    ],
  );
});

test("rejects a new directed edge within an existing cycle and reports fixed exceptions", (t) => {
  const { write, scan } = fixture(t, {
    "shared/lib/a.ts": 'import "./b";',
    "shared/lib/b.ts": 'import "./c";',
    "shared/lib/c.ts": 'import "./a";',
  });
  const baseline = {
    "static-value-cycle": [
      "shared/lib/a.ts -> shared/lib/b.ts",
      "shared/lib/b.ts -> shared/lib/c.ts",
      "shared/lib/c.ts -> shared/lib/a.ts",
    ],
  };

  assert.deepEqual(compareArchitectureBaseline(scan().violations, baseline), {
    unexpected: [],
    obsolete: [],
  });
  write("shared/lib/b.ts", 'import "./c"; import "./a";');
  const added = compareArchitectureBaseline(scan().violations, baseline);
  assert.deepEqual(added.unexpected, [
    { rule: "static-value-cycle", from: "shared/lib/b.ts", to: "shared/lib/a.ts", line: 1 },
  ]);
  assert.deepEqual(added.obsolete, []);
  write("shared/lib/c.ts", "export {};");
  assert.deepEqual(compareArchitectureBaseline(scan().violations, baseline).obsolete, [
    "static-value-cycle: shared/lib/b.ts -> shared/lib/c.ts",
    "static-value-cycle: shared/lib/c.ts -> shared/lib/a.ts",
  ]);
});
