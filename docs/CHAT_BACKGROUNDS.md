# Local chat backgrounds

Open **Profile -> Appearance -> Chat background**. The fifth appearance row uses the existing picture icon and expands to a two-by-two grid: Mountains, Sea, Forest and an action for a local image. The existing dialog and button primitives own keyboard, focus and dismissal behavior.

Selecting a preset, a custom image or the default background opens a confirmation dialog. **For all chats** replaces the owner's global background and clears previous conversation overrides. **Only this chat** overrides the current Workspace conversation, including an explicit default background. Cancel leaves saved preferences unchanged. The current-chat action is disabled outside a concrete conversation route.

Preferences belong to the current account, instance, organization, project and user. They are stored in this browser or desktop profile under `workspace-chat-background-v1:` plus the existing runtime-owner key. They are not uploaded or synchronized between devices. Logout disables changes, and switching owners does not expose another owner's background. Pending selection and image processing are discarded on route/runtime changes; old save callbacks cannot write after leaving and returning to the same owner.

Custom input accepts JPEG, PNG and WebP with a matching image signature, up to 8 MiB and 24 megapixels. The browser decodes and resizes the raster to fit within 1600 by 1600 pixels, then stores a bounded JPEG. Blob URLs are released after success or failure. Restored preferences accept built-in presets or bounded JPEG data URLs, excluding external URLs and SVG. Storage errors preserve the previous saved background and show a localized error.

The feature lives in `packages/web/src/features/chat-background`. The appearance widget composes its settings, and the chat message-list section composes its surface. It changes no message, file-upload, backend or Electron contract.

## Verification

- Run the feature tests and `right-panel-user-settings.ui.test.tsx` for confirmation, cancellation, per-chat/global scope, account isolation, stale callbacks, local persistence, invalid input and storage failures.
- Run `npm run typecheck` and `npm run build --workspace=web`.
- Open **Widgets -> Right panel -> Chat backgrounds -> Appearance** in Storybook. Use the real application themes and locales to inspect the expanded row, confirmation dialog and a local raster image. The story uses synthetic local state and performs no backend requests; it is not live-service acceptance.
