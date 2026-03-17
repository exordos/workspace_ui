# ADR-001: React + Zustand + Tailwind CSS as the Primary Stack

**Date**: 2025-12
**Status**: accepted

## Context

The project previously had a desktop implementation on a different stack with limited maintainability and inconsistent UX quality. The team decided to standardize desktop/web delivery on a modern React-based stack. Mobile apps are handled separately by dedicated teams.

## Options

1. **React + Redux + CSS Modules** — classic stack, high verbosity
2. **React + Zustand + Tailwind** — minimal boilerplate, fast start
3. **Vue 3 + Pinia** — alternative framework, fewer React experts in the market
4. **Svelte + SvelteKit** — compilation instead of virtual DOM, young ecosystem

## Decision

React 19 + Zustand 4 + Tailwind CSS 3.4.

- **React**: largest ecosystem, Electron compatibility, availability of Radix UI, React Router, react-testing-library
- **Zustand**: minimal API, no boilerplate (vs Redux), native React integration, cross-store access via `getState()`
- **Tailwind**: utility-first, CSS variables for themes, sorting via prettier-plugin, tree-shaking

## Consequences

- Positive: fast start, easy onboarding for React developers, large candidate pool
- Negative: Zustand is less structured than Redux (mitigation: FSD architecture + Cursor rules)
- Risks: as the codebase grows, Zustand stores may become tangled (mitigation: one store = one domain)
