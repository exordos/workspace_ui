/**
 * Commitlint configuration — enforces Conventional Commits format.
 *
 * Format: <type>(<scope>): <subject>
 *
 * Types: feat, fix, refactor, docs, test, chore, style, perf, ci, build, revert
 * Scope: optional (chat, auth, sidebar, electron, i18n, theme, ...)
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "docs",
        "test",
        "chore",
        "style",
        "perf",
        "ci",
        "build",
        "revert",
      ],
    ],
    "subject-max-length": [2, "always", 100],
    "header-max-length": [2, "always", 120],
    "body-max-line-length": [1, "always", 200],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
