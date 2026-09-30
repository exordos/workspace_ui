# Contributing to Workspace

Contributions use the [Apache 2.0 license](LICENSE) and [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## Setup

Follow the [README](README.md#getting-started). Use the repository Node version and package scripts. Workspace backend contracts and current entrypoints are linked from [Project Facts](docs/PROJECT_FACTS.md).

## Workflow

1. Inspect the branch and working tree. Preserve unrelated work.
2. Understand the requested behavior and existing owner before changing files. Analysis/review requests alone do not authorize fixes.
3. Prefer a focused extension of the existing feature or entity. Follow [architecture](docs/fsd-architecture.md), [integration](docs/INTEGRATION_GUIDE.md), and [async safety](docs/ORG_SCOPED_ASYNC_SAFETY.md).
4. Verify at the scope of the change and inspect the resulting diff.
5. For a requested commit, stage only intended paths and review `git diff --cached`. For a requested PR, describe the problem, resulting behavior and actual validation.

Feature/fix PRs normally target `master`; follow an explicitly requested target. Do not infer permission to commit, push, merge or publish from a request to edit files.

## Code standards

[AGENTS.md](AGENTS.md) contains the shared core rules. Use Workspace UUIDs, concrete imports, narrow selectors, i18n, semantic tokens, sanitized rendering and project logging. Keep scope small; do not add file segments or abstractions by template.

Use regression tests for behavior with meaningful failure modes. A focused bug test should demonstrate the failure when practical. Pure presentation or documentation changes do not need artificial tests that mirror the implementation.

Memoization is a performance tool, not a universal checklist requirement. Preserve referential stability where consumers depend on it, and profile expensive work before adding complexity.

Reuse design tokens and components while honoring the user's explicit visual requirements. Verify affected states and report browser/native QA separately from unit tests.

## Verification

See the exact [command table](docs/PROJECT_FACTS.md#verification).

- Documentation: `npm run docs:check`, formatting, and `git diff --check`.
- Behavior: relevant tests; add typecheck for changed API/store/type contracts.
- Broad code changes: appropriate package quality gates; targeted E2E when a user flow changes.
- Desktop changes: include Electron checks and platform testing when affected.

Run a gate once after the relevant changes; repeat if subsequent edits or failures warrant it. Report pre-existing failures and unperformed checks. Local scripts and CI are distinct: consult the workflow files before claiming a gate runs automatically.

## Commits and releases

Use Conventional Commits, for example `fix(chat): preserve draft on project switch`. Keep the subject specific and explain non-obvious reasons in the body. [commitlint.config.js](commitlint.config.js) and [pre-commit.sh](scripts/pre-commit.sh) define enforced checks.

Release work is a separate authorized task:

1. Use `npm run version:bump -- <version-or-level>` to synchronize manifests.
2. Update release notes as needed, inspect the diff, and commit only intended files.
3. Merge through the agreed PR process.
4. Inspect `npm run version:tag:dry-run` before an authorized tag/publish operation.

Consult [versioning ADR](docs/adr/006-versioning.md), [macOS signing](docs/MACOS_SIGNING.md), [apt publication](docs/apt-repository.md), and [Exordos deployment](docs/exordos-element.md) when relevant.

## Documentation and agent workflows

Maintain one source for each fact. Prefer links to source modules over copies of TypeScript interfaces, dependency versions, API method lists or test counts. Update a document when its contract or navigation changes, not simply because a new component was added.

[The documentation index](docs/README.md) separates active guidance, operational guides and historical decisions. Mark proposals and snapshots clearly; an old plan is not evidence of current implementation or backend support.

Cursor rules provide topic-specific guidance; [the GitHub project skill](.agents/skills/workspace-github-project/SKILL.md) covers board operations. Keep these consistent with the core instructions rather than duplicating them.
