---
name: workspace-github-project
description: Read, summarize, prioritize, create, and update GitHub issues and project cards for exordos/workspace_ui and the Exordos Workspace project. Use when the user asks about active tasks, Ready, In progress, review, backlog, priorities, stale work, assignees, linked pull requests, creating tasks, or moving cards on the Workspace GitHub project.
---

# Workspace GitHub Project

Use the `gh` CLI as the primary interface for the Workspace task board.

## Project constants

- Repository: `exordos/workspace_ui`
- Organization: `exordos`
- Project number: `3`
- Project URL: `https://github.com/orgs/exordos/projects/3`

Do not substitute organization project `4` unless the user explicitly requests it.

## Read workflow

1. Run `scripts/project-items.sh` from this skill directory.
2. Group items by `status`: `Ready`, `In progress`, `In review`, and `Backlog`.
3. Report counts and include issue links for actionable items.
4. Inspect linked pull requests with `gh pr view` when deciding whether work is active or stale.
5. Read `references/triage-policy.md` before recommending an execution order.
6. Clearly separate stored GitHub fields from your own recommendation. The project has no dedicated priority field.

Use these commands only when additional detail is needed:

```bash
gh project field-list 3 --owner exordos --format json
gh issue view <number> --repo exordos/workspace_ui --json number,title,state,assignees,labels,updatedAt,url
gh pr view <number> --repo exordos/workspace_ui --json number,title,state,isDraft,mergedAt,closedAt,author,url,statusCheckRollup
```

Prefer structured `--json` and `--jq` output. Do not request issue bodies when titles, fields, and links are sufficient.

## Authentication

For read-only project access, `gh` needs `read:project`:

```bash
gh auth refresh -s read:project
```

For adding or changing project cards, it needs `project`. Request that scope only when a write is requested:

```bash
gh auth refresh -s project
```

If `gh` reports a connection failure inside a sandbox, retry with the required network approval before concluding that authentication is broken.

## Write workflow

Only create or change issues and cards when the user explicitly asks.

Before a write, state the exact repository, issue title or number, target project, and target status. Never infer permission to close, delete, or reprioritize unrelated work.

For a new task:

1. Draft the title and body from the user's request.
2. Show the proposed title, labels, assignees, and acceptance criteria.
3. Create the issue with `gh issue create`.
4. Add the returned issue URL with `gh project item-add 3 --owner exordos --url <issue-url>`.
5. Resolve current project, field, item, and option IDs through `gh`; do not hardcode mutable IDs.
6. Set a status only when the user requested one or the project workflow makes it unambiguous.
7. Return the created issue URL and final project status.

For an existing task, inspect its current state before changing fields. Preserve existing labels, assignees, milestone, and body unless the user asks to replace them.

## Tool choice

Use `gh` instead of browser automation. Use a browser only when the user explicitly requests it or when a required GitHub capability is unavailable through `gh`, and explain the limitation.
