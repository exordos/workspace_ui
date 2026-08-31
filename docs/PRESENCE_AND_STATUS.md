# Presence and status

The Workspace API keeps **one** field for two different things:

- **presence** — liveness the client measures: is the user at the keyboard;
- **status** — something the user deliberately chose: away, do not disturb,
  plus a free-text message and emoji.

Both are written through `POST /users/{uuid}/actions/presence/invoke`, so once a
value reaches the server nothing distinguishes "the auto-timeout set idle" from
"the user set away". Everything below exists to work around that.

## Who owns what

| Concern                                                      | Where                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Measuring local activity (mouse, keys, scroll, idle timeout) | `shared/lib/presence.ts`                                                                                           |
| Remembering what the user deliberately chose                 | `entities/user/user-manual-status.lib.ts`                                                                          |
| Deciding what may be claimed                                 | `entities/user/user-presence-status.lib.ts`                                                                        |
| Sending it, on a cadence                                     | `entities/user/user-workspace-presence-reporter.lib.ts`                                                            |
| The user setting a status                                    | `entities/user/user-workspace-status-actions.lib.ts`, dialog in `widgets/right-panel/right-panel-user-menu.ui.tsx` |

`presence.ts` only measures — it sends nothing. The heartbeat subscribes to it
through `onLocalPresenceChange()` so a transition reaches the server when it
happens, rather than at the next interval, which off-focus can be minutes away.

## The rule

`resolveWorkspaceHeartbeatStatus()` decides, in order:

1. No local activity to report (`offline`) → **send nothing**. `presence.ts`
   reaches `offline` after the tab has been hidden for five minutes, so a
   minimized window stops claiming anything rather than holding `idle` forever.
2. The user chose a status in this client → **send that**, unchanged.
3. The account is in do-not-disturb → **leave it**. Nothing sets DND
   automatically, so it is always deliberate, even from another device.
4. Otherwise → **report what was measured** (`active` or `idle`).

Status text and emoji ride along on every heartbeat. Whether the server treats an
omitted field as "unchanged" or as "cleared" is not visible from the client, so it
states the values when it knows them rather than betting on one reading — and omits
the fields entirely until the roster has loaded the account, since the nulls of an
absent user would read as "clear".

## What this fixed

The heartbeat used to send a hardcoded `{ status: "active" }` every 30s and
discard the response. A user who set themselves away was pushed back online
within half a minute, and because the realtime `user` event then updated the
store, their own UI flipped back too. Away was effectively unusable.

The choice is persisted per user (`workspace-manual-status:<uuid>` in
localStorage) because after a restart the server only reports an ambiguous
`idle`, which the client would otherwise overwrite with a fresh `active`.

The away toggle in the status dialog is seeded from the remembered choice, not
from the account status, so the `idle` that the five-minute activity timeout
produces does not show up as an "away" the user asked for.

## Known limit

An **idle set deliberately on another device** is indistinguishable from one an
auto-timeout produced, so this client will overwrite it with its own measurement.
DND survives because nothing sets it automatically; a deliberate idle does not.

Closing that gap needs the server to separate measured presence from chosen
status — two fields, or a flag saying which one wrote the value. Until then the
client cannot do better than the rule above.
