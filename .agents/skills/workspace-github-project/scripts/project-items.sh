#!/usr/bin/env bash
set -euo pipefail

gh project item-list 3 \
  --owner exordos \
  --limit 100 \
  --format json \
  --jq '{
    project: {
      owner: "exordos",
      number: 3,
      repository: "exordos/workspace_ui",
      url: "https://github.com/orgs/exordos/projects/3"
    },
    totalCount: .totalCount,
    items: [
      .items[]
      | {
          number: (.content.number // null),
          title,
          status: (.status // "No status"),
          assignees: (.assignees // []),
          labels: (.labels // []),
          linkedPullRequests: (."linked pull requests" // []),
          url: (.content.url // null)
        }
    ]
  }'
