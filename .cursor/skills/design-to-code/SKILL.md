---
name: design-to-code
description: >-
  Translate UI mockups into React components with Tailwind CSS.
  Use when the user references Figma, screenshots, design exports, or asks to
  implement a screen from a mockup. IMPORTANT: Design system tokens take
  priority over pixel-perfect matching.
---

# Design-to-Code Workflow

> **Design system > Pixel Perfect.** See `.cursor/rules/design-system.mdc`.
> Mockups are a guide. Tokens are the contract. If they conflict, tokens win.

## Input Sources

Use whichever design input is available in the task:

- Figma links or screenshots shared by the user
- Attached PNG/JPG/SVG files
- Existing UI in the running app (for parity refinements)

Do not require a local `design` directory.

## Step 1: Clarify target state

Identify and write down:

1. Screen/flow being implemented
2. Required states (default, hover, active, selected, loading, empty, error)
3. Responsive behavior (desktop/tablet/mobile expectations)

## Step 2: Visual analysis

From the design input, extract:

- Layout structure and spacing rhythm
- Typography hierarchy (title/body/meta)
- Color intent (surface, text, accent, borders)
- Component patterns (avatars, badges, menus, composer, etc.)

## Step 3: Map to design system

Map design intent to existing tokens:

- Colors -> semantic tokens (`bg-card-bg`, `text-text-primary`)
- Spacing -> Tailwind 4px grid (`p-3`, `gap-2`, `mt-4`)
- Typography -> Tailwind scale (`text-sm`, `text-base`, `text-lg`)
- Radius -> `rounded-lg`, `rounded-full`

Never hardcode color hex values in component classes.

## Step 4: Implement in FSD layer

Place code by responsibility:

- Scenario UI -> `features/<name>/`
- Composite block -> `widgets/<name>/`
- Reusable primitive -> `shared/ui/`
- Route screen -> `pages/<name>/`

Import slices only through `index.ts` public APIs.

## Step 5: Validate quality gates

Check before completion:

- Works in dark and light modes
- Works with both palettes
- UI strings use i18n `t("key")`
- Interactive controls are keyboard accessible
- No regression to existing layout behavior

## Step 6: Verify visually

Use browser checks for:

- Alignment and spacing consistency
- Hover/focus/active states
- Overflow handling (ellipsis, wrapping)
- Empty/loading/error states

Iterate until parity with the intended design behavior is reached.
