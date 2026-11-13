---
name: workspace-figma-bridge
description: Use Figma Bridge MCP whenever a Workspace task needs the live design to answer a question, choose a component variant, implement or verify its appearance, or edit the mockup. Apply even when the need emerges during work and the request omits Figma.
---

# Access the Workspace Figma file

## Connect

Use Figma Bridge MCP (`mcp__figma_bridge__*`) for all Figma reads and writes, including when the user supplies a Figma link. First discover and call `mcp__figma_bridge__list_files`. Use the official Figma MCP only if the user explicitly requests it.

- If the Bridge tools are unavailable, tell the user: «Figma Bridge MCP недоступен в этом чате. Включи сервер Figma Bridge MCP в настройках MCP Codex и напиши „готово“».
- If the server responds but the target file is missing, tell the user: «Figma Bridge не видит нужный макет. Открой его в Figma, запусти в нём плагин Figma Bridge и напиши „готово“».
- If the connection fails, report the observed error and ask the user to check that the MCP server is running and the plugin is connected in the target file. Pause Figma work until connected. When the user indicates the connection is ready, call `list_files` again and resume the original task.

## Find and inspect the target

- Pass the returned file key to each Bridge call. When the user supplies a link or node ID, use it to identify the target in the connected file. Bridge expects node IDs such as `123:456` for links containing `node-id=123-456`. If the user refers to their selection, use `get_selection` in that file.
- For a name or a general request, use `get_metadata` to locate the relevant page. The [screen and component guide](../workspace-figma-design/references/screen-patterns.md) provides starting nodes for the kit and finished screens. Inspect the smallest relevant section with `get_node`. Check the page, name, platform and variant, especially if several frames have the same name. Ask for a file or frame only if the connected files and the user's context leave the target ambiguous.
- Fetch the live node again when the user wants a fresh inspection or the comparison depends on a recent change. Use its tree for dimensions, layout, typography, instances and visible states. Use `get_screenshot` for appearance and check the parent frame when placement matters. Describe anything inferred from neighboring screens as an inference.

## Use the result

For a lookup, answer the question using the observed value or state and identify the frame or node so the user can find it. Inspection and review are read-only in both Figma and the repository.

When implementing a design in code, use the [Workspace design skill](../workspace-figma-design/SKILL.md) for visual conventions and the [component catalog](../../../docs/COMPONENT_CATALOG.md) to locate the existing component and story. Inspect the requested variant in its finished screen, implement the requested change in code, then compare the rendered result at the same size, state and theme. A request to implement a component authorizes code changes. Edit the Figma file only when the user asks for a mockup change.
