---
name: workspace-module-design
description: Design business module boundaries and incrementally refactor Workspace UI workflows using the project's architecture notes. Use for Workspace architecture discussions, state ownership decisions, or agreed extraction of application behavior from pages and components.
---

# Workspace module design

Use explicit business modules that own application behavior. Views receive data and callbacks. Local interaction state stays in UI.

## Read the relevant project context

Start with the [architecture notes map](../../../docs/plans/messenger-architecture/README.md) and [refactoring principles](../../../docs/plans/messenger-architecture/principles.md). Read the scenario relevant to the task. Current detailed scenarios cover sending, history loading, bootstrap and realtime. Read [module responsibilities](../../../docs/plans/messenger-architecture/modules.md) when choosing a boundary.

Follow [Project Facts](../../../docs/PROJECT_FACTS.md) for current entrypoints and checks, and [module and import policy](../../../docs/fsd-architecture.md#files-and-imports) when changing production boundaries. Verify current behavior in source and tests. Identify which details are implemented, proposed, or still open.

## Explain the problem and contract

For each boundary, name the coordination problem it owns and what becomes easier for its caller. Show concrete, short examples of the public operation.

```ts
drafts.update(draftRef, { text });
sending.submitDraft({ draftRef, revision });
messages.loadMore({ conversationId, direction: "before" });
```

Describe the owned state, its consumers, permitted mutations and lifetime. Walk a multi-module scenario through the handoff of responsibility on success and failure. Preserve relevant guarantees such as retaining a newer draft after an earlier send completes. Classes, objects, functions and stores remain implementation choices. Choose instance lifetimes and owner scoping explicitly.

## Keep business behavior with its owner

Keep workflow coordination, requests and storage decisions in the owning business module. A page composes the screen and translates navigation into user intent. A thin hook or connected component subscribes to a module and binds its operations to a view.

```tsx
function ComposerConnected({ draftRef }) {
  const draft = useDraft(drafts, draftRef);

  return (
    <ComposerView
      text={draft.text}
      onTextChange={(text) => drafts.update(draftRef, { text })}
      onSend={() => sending.submitDraft({ draftRef, revision: draft.revision })}
    />
  );
}
```

Examples describe the proposed contracts. Choose real types and subscriptions during implementation. Keep focus, expansion, keyboard interaction and temporary visual selection in UI. A checkbox changing a vote or durable preference calls its business owner. Data subscriptions can be bound near the view, while derived business rules belong to their module.

## Refactor an agreed scenario incrementally

Stay within the requested scope. Architecture discussions produce explanations and requested notes. Implementation extracts an agreed scenario through its normal entrypoints and verifies relevant behavior. Use existing flows and [async ownership guarantees](../../../docs/ORG_SCOPED_ASYNC_SAFETY.md), including account and generation checks, when moving responsibilities.

Evaluate whether an action becomes easier to trace, change and verify independently of the full screen. Give each added abstraction a concrete responsibility. Assess runtime performance through measurements of the affected behavior.

When asked to save ideas, update the owning scenario with code examples, purpose, state ownership, caller benefit and open decisions. Update the map and cross-links to preserve the reasoning for later work. Extend this project skill when the user agrees to a reusable design principle.
