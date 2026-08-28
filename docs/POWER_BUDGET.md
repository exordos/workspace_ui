# Power budget

A desktop messenger spends most of its life on screen and unattended. This
document records what the client costs while nothing is happening, what was done
about it, and how to measure it again.

## The state the platform does not throttle

Chromium gives a page two states, and throttles one of them:

| Window state                        | `document.visibilityState` | Platform behaviour                                                                                                                       |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tab in background, window minimized | `hidden`                   | Timers slowed to ≥1s, then ~1/min after ~5 min; `requestAnimationFrame` stops; Electron's `backgroundThrottling` (on by default) applies |
| **On screen, not focused**          | `visible`                  | **Nothing is throttled.** Timers run at full rate, the compositor keeps animating                                                        |
| Focused                             | `visible`                  | Normal                                                                                                                                   |

The middle row is the normal all-day state for a messenger — the window sits on a
second monitor, or behind a browser. The platform will not stand it down, so the
app has to.

`shared/lib/visibility.ts` therefore tracks three states rather than two:

- `active` — visible and focused
- `visible` — on screen, nobody looking
- `hidden` — background or minimized

The current state is mirrored onto `<html data-window-activity>` so CSS can react
without a React render, and is published through `onActivityStateChange()`.

### Where focus comes from

In the browser, from the `window` `focus`/`blur` events. In Electron, also from
the main process (`window:activity` IPC, `main.ts`) via
`setExternalWindowFocus()`. The main process is the authority: a renderer's own
focus events depend on the window manager cooperating, which is not guaranteed on
every desktop.

## What was changed

| Change                                | Where                                                   | Effect                                                                                    |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Animations pause off-focus            | `app.styles.css`, keyed on `data-window-activity`       | Compositor stops on an unfocused window; spinners and progressbars are excluded           |
| Presence dot pulse removed            | `shared/ui/presence-indicator.tsx`                      | It rendered per roster row, per message author and per mention candidate                  |
| Presence heartbeat follows activity   | `entities/user/user-workspace-presence-reporter.lib.ts` | 30s focused → 120s unfocused → 300s hidden, doubled on battery; reports at once on return |
| Presence tracker stopped sending      | `shared/lib/presence.ts`                                | The heartbeat is the single sender; one periodic timer dropped                            |
| Jitsi participant poll backs off      | `features/jitsi-call/jitsi-call-modal-shell.hook.ts`    | 5s → 30s unfocused; joins/leaves already arrive as callbacks                              |
| Scheduled sends wait for the deadline | `widgets/message-composer/message-composer.ui.tsx`      | Was a 1s poll for as long as anything was queued                                          |
| OS power events forwarded             | `packages/electron/src/main.ts`, `shared/lib/power.ts`  | Reconnect on wake instead of waiting out the idle watchdog; back off on battery           |

### Deliberately left alone

- **The call title pulse** (`shared/lib/call-state.ts`, 1s). The pulsing window
  title exists precisely for when you are _not_ looking at the window, so
  throttling it off-focus would remove the feature rather than its cost.
- **Message list virtualisation.** The list renders every day group and message
  (`workspace-message-list.ui.tsx`), so each realtime event rebuilds the whole
  tree. This is the largest remaining idle cost, and the largest change: the
  scroll and anchoring logic around it is substantial. Worth its own branch.

## Measuring it again

There is no committed instrument: measuring this means idling for minutes and
reading numbers, which is a poor fit for the e2e suite and quick enough to set up
from scratch. The method that produced the figures below, so a rerun is
comparable:

- Boot the messenger under Playwright against a roster of ~40 users in `active`
  and ~60 messages, so the presence dots and the message list carry realistic
  weight. Wait out startup traffic and first paint before the counters start.
- Wrap `setInterval`/`setTimeout`/`requestAnimationFrame` in an `addInitScript`,
  before app code runs, and count the fires. That, plus
  `document.getAnimations().filter((a) => a.playState === "running").length` and
  the request count, is the primary evidence: deterministic and load-independent.
  Take CPU (`ProcessTime` via a CDP `Performance.getMetrics` session) as
  corroboration only — it is noisy on a shared machine.
- Measure a fixed window per arm, focused and blurred, and repeat it a few times.
  Read `document.documentElement.dataset.windowActivity` in every sample: it is
  the proof that the app saw the arm switch rather than that the numbers moved
  for some other reason.
- Presence cadence needs its own, longer window — at least the unfocused interval
  — counting requests to `/actions/presence/invoke`.

Dispatching a DOM `blur` event exercises the same path Chromium fires on an OS
focus change. **Verifying the OS leg needs a desktop with a window manager**:
under a bare X server (`xvfb` with no WM) Chromium keeps reporting
`document.hasFocus() === true` no matter where X input focus is, so the last hop
cannot be exercised headlessly. On a real desktop, click another window and check:

```js
document.documentElement.dataset.windowActivity; // "visible"
document.visibilityState; // "visible"
document.getAnimations().filter((a) => a.playState === "running").length; // 0
```

### Measured

20s idle window, 40-user roster, quiet machine, Chromium via Playwright, three
repeats per arm:

|                           | running animations | renderer CPU per 20s | style recalcs |
| ------------------------- | ------------------ | -------------------- | ------------- |
| Before                    | 60                 | ~1000 ms             | ~92           |
| CSS pause only, unfocused | 0                  | ~90 ms               | 41            |
| After both changes        | 0                  | ~55 ms               | 0             |

Roughly a 20× cut in idle renderer CPU, from ~5% of a core to ~0.3%. The pause
mechanism was measured separately from the pulse removal so each stands on its
own: with the pulse deliberately restored, pausing alone still took the unfocused
arm from ~1000 ms to ~90 ms.

Presence heartbeats over a 135s window: **4 focused → 1 blurred**.
