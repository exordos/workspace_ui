# Bug Fix

```
Fix the following bug:

## Bug Description
<What goes wrong>

## Steps to Reproduce
1. <step>
2. <step>
3. <step>

## Expected Behavior
<What should happen>

## Actual Behavior
<What actually happens>

## Instructions
Follow .cursor/skills/bug-investigation/SKILL.md:

1. Trace the data flow: event handler → store → API → store → UI
2. Identify the root cause
3. Write a FAILING test that reproduces the bug
4. Apply the minimum fix
5. Verify: test passes + no regressions
6. Run: npx tsc --noEmit && npx vitest run
```
