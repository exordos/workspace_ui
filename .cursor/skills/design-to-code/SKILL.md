---
name: design-to-code
description: >-
  Implement or refine Workspace UI from a mockup, screenshot, or Figma reference,
  reusing current components and tokens while honoring the requested visual behavior.
---

# Design to Workspace UI

Read [AGENTS.md](../../../AGENTS.md) and [PROJECT_FACTS.md](../../../docs/PROJECT_FACTS.md).
Use the supplied design and latest user feedback to establish the target. Preserve the
existing chat shell unless redesign is requested. Analysis-only requests remain read-only.

## Inspect and map

Identify layout, spacing, typography, colors, required interaction states, and responsive
behavior. Use the available reference; do not require a local design folder. With Figma,
use the available Figma integration instructions, and keep the design file read-only unless
the user requests edits there. State when measurements are inferred from screenshots.

Find the current component and owning FSD layer before creating another one. Reuse existing
primitives, semantic tokens, and shared avatar/presence behavior. Inspect the current theme
and design-system rules for actual token names. Do not silently override explicit visual
requirements with a generic spacing grid; explain any real constraint that affects fidelity.

## Implement

Use concrete imports without barrel-only `index.ts` files. Keep reusable visuals in `shared`,
domain binding in entities, user actions in features, compositions in widgets, and routes thin.
Create only the files needed by the change.

Keep API behavior contract-backed and UUID-native. If the screen loads or mutates scoped
data, reuse existing ownership and cache flows from
[async safety](../../../docs/ORG_SCOPED_ASYNC_SAFETY.md). Use an explicit unsupported state for
missing capabilities rather than fake production data.

Put UI text through the current i18n path with both locales. Preserve keyboard navigation,
accessible names, focus handling, sanitized content rendering, and relevant loading, empty,
error, and disabled states.

## Verify

Compare the result with the reference in the browser when available. Check the viewport and
states affected by the change: alignment, overflow/wrapping, focus/hover, scrolling, and theme
variants. Do not claim pixel accuracy from source inspection alone.

Run relevant existing tests and the checks appropriate to the scope in project facts. Add
behavioral coverage when justified; visual token or spacing changes do not automatically
need new tests. Report what changed, verification results, and any visual checks unavailable
in the environment.
