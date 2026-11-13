---
name: workspace-figma-design
description: Create, edit, review, or implement Workspace Figma mockups through Figma Bridge MCP using the Exordos UI kit and existing desktop and mobile screens. Use for Workspace design tasks such as a new dialog, a chat state, or adapting a screen to another platform.
---

# Workspace Figma design

Connect through the [Workspace Figma Bridge skill](../workspace-figma-bridge/SKILL.md#connect) for all Figma reads and writes. Reuse the verified file key when that skill has already connected for this task.

Start from a finished screen showing the same user action on the requested platform. Use the [screen and component guide](references/screen-patterns.md) to find it in Figma Bridge.

1. Use the current file key from `list_files` and confirm the file and page with `get_metadata`. Open the requested frame if supplied. The node IDs in the guide refer to one copy. If an ID points elsewhere, find the frame by page, section and name.
2. Inspect the reference screenshot and its node tree. Choose a neutral frame for a new resting screen. Some frames named Messenger already have a message menu open. For an interaction, also open the state immediately before or after it. Identify what initiated the action, which parts of the screen stayed in place, and where the result appears. If the connected plugin does not expose prototype reactions, use visible before/after states and annotations. Describe inferred transitions as such.
3. Inspect the matching `ui-кит` family and an instance used on the finished screen. Reuse the matching variant, text style, icon, color role and layout settings. Prefer an existing instance from the same context when the Bridge can duplicate it. Preserve component links, theme bindings and instance overrides. When the Bridge cannot reproduce a binding, identify the affected element in the handoff.
4. For a new mockup, start from a copy of the closest finished frame. For a scoped edit, change the requested frame. Carry over the surrounding composition and adapt only what the task calls for. For implementation in the application, map the Figma elements to the [component catalog](../../../docs/COMPONENT_CATALOG.md), adjacent stories and current callers. Check product behavior against the application and API.
5. Compare the result and reference at the same platform width and in the same theme. Check the changed state in context, including long labels or wrapped content when relevant. Inspect the changed layers for preserved instances and styles as well as visible alignment. In the handoff, identify the reference frame, any new pattern and any visual check you could not perform.
