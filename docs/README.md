# Documentation index

Start with [AGENTS.md](../AGENTS.md) and [Project Facts](PROJECT_FACTS.md). Read topic-specific documents as needed; do not load the entire documentation set for every task.

## Active development guidance

| Document                                          | Purpose                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| [Project Facts](PROJECT_FACTS.md)                 | Entrypoints, backend contracts and verification commands |
| [Architecture](fsd-architecture.md)               | FSD ownership and imports                                |
| [Async safety](ORG_SCOPED_ASYNC_SAFETY.md)        | Runtime owner/generation and stale writes                |
| [Integration guide](INTEGRATION_GUIDE.md)         | Adding or changing behavior                              |
| [Store map](STORES_REFERENCE.md)                  | Domain state ownership                                   |
| [Component map](COMPONENT_CATALOG.md)             | UI composition and reusable primitives                   |
| [API map](API_CLIENT_REFERENCE.md)                | Workspace transport and API entrypoints                  |
| [Security architecture](SECURITY_ARCHITECTURE.md) | Implemented boundaries and their limits                  |
| [Use cases](USE_CASES.md)                         | Product paths and explicit implementation limits         |
| [Messenger cache](WORKSPACE_MESSENGER_CACHE.md)   | Cache ownership, source map and invariants               |
| [Presence and status](PRESENCE_AND_STATUS.md)     | Manual status versus measured activity                   |
| [Power budget](POWER_BUDGET.md)                   | Background activity policy and measurement method        |

## Operations

- [Contributing](../CONTRIBUTING.md): setup, review and release workflow.
- [macOS signing](MACOS_SIGNING.md): signing/notarization pipeline.
- [apt repository](apt-repository.md): package publication.
- [Exordos element](exordos-element.md): web artifact and deployment contract.

Operational guides describe repository configuration. External account permissions, deployed infrastructure and historical benchmark numbers require live verification for operational decisions.

## Agent entrypoints

- [GitHub project skill](../.agents/skills/workspace-github-project/SKILL.md) handles the task board.
- Cursor rules under `.cursor/rules/` are topic-specific pointers and constraints; [AGENTS.md](../AGENTS.md) is the shared core.

## History and proposals

[ADRs](adr/) preserve decisions and historical context. Their original versions, inventories and audit numbers are dated snapshots. Current source and active guidance supersede obsolete implementation details; revisiting a decision should be explicit.

[Archived cache plan](archive/WORKSPACE_MESSENGER_CACHE_PLAN.md) preserves the original implementation proposal, not a task queue to execute again. Draft documents describe proposals and open decisions; they do not authorize implementation or establish backend support.

## Maintenance

- Link real source files rather than duplicating signatures, counters or version tables.
- Update the owning reference when behavior or ownership changes.
- Keep historical plans outside the active instruction path and identify their replacements.
- Run `npm run docs:check` for local Markdown links and `~/` import targets in active guides, rules and skills. The checker does not verify URL reachability, anchors, symbols exported by a file, or runtime behavior.
- Verify external/backend contracts separately; a source map is not an API compatibility guarantee.
