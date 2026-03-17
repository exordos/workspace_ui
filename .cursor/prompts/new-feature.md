# New Feature

```
Implement the "<FEATURE_NAME>" feature.

## Description
<1-3 sentences describing what the feature does>

## Use Cases
- UC1: <user can...>
- UC2: <user can...>

## Zulip API Endpoints
- GET /api/v1/<endpoint> — <what it returns>
- POST /api/v1/<endpoint> — <what it does>

## Instructions
Follow .cursor/skills/full-stack-feature/SKILL.md:

1. Plan: define FSD location (entity? feature? widget? page?)
2. Types: create <name>.types.ts
3. Tests: write failing store/API tests (TDD)
4. Store: implement <name>.model.ts
5. API: implement <name>.api.ts with MSW test
6. UI: implement <name>.ui.tsx
7. Integration: wire into layout/page/event-loop
8. Quality gates: tsc + vitest + i18n + a11y + security + logging
9. Documentation: update USE_CASES.md, STORES_REFERENCE.md

After each phase, run: npx tsc --noEmit && npx vitest run
```
