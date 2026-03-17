# New FSD Entity

```
Create a new FSD entity "<ENTITY_NAME>" with Zustand store.

## Data Model
interface <EntityName> {
  id: string;
  <field>: <type>;
  ...
}

## Store Actions
- add<Entity>(item) — add item
- remove<Entity>(id) — remove by ID
- update<Entity>(id, patch) — partial update
- get<Entity>(id) — query by ID
- clear() — reset state

## API Endpoints
- GET /api/v1/<endpoint> — fetch list
- POST /api/v1/<endpoint> — create
- PATCH /api/v1/<endpoint>/{id} — update
- DELETE /api/v1/<endpoint>/{id} — delete

## Instructions
1. Create entities/<name>/<name>.types.ts — interfaces
2. Write entities/<name>/<name>.test.ts — failing tests for all store actions
3. Create entities/<name>/<name>.model.ts — Zustand store
4. Run tests → all pass
5. Create entities/<name>/<name>.api.ts — API functions
6. Create entities/<name>/index.ts — public barrel
7. Update docs/STORES_REFERENCE.md
8. Run: npx tsc --noEmit && npx vitest run
```
