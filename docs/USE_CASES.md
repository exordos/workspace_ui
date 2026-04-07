# Use Cases — Workspace UI

> Complete registry of user scenarios.
> Status: `[x]` implemented, `[~]` partial, `[ ]` planned.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Navigation and Interface](#2-navigation-and-interface)
3. [Chat List](#3-chat-list)
4. [Direct Messages (DM)](#4-direct-messages-dm)
5. [Channels](#5-channels)
6. [Messages](#6-messages)
7. [Reactions and Actions](#7-reactions-and-actions)
8. [Folders](#8-folders)
9. [Search](#9-search)
10. [Calls (Jitsi)](#10-calls-jitsi)
11. [Notifications](#11-notifications)
12. [Presence](#12-presence)
13. [Drafts](#13-drafts)
14. [Starred and Mentions](#14-starred-and-mentions)
15. [Profile and Settings](#15-profile-and-settings)
16. [Themes and Personalization](#16-themes-and-personalization)
17. [Organizations (Multi-server)](#17-organizations-multi-server)
18. [PWA and Offline](#18-pwa-and-offline)
19. [Electron (Desktop)](#19-electron-desktop)
20. [Updates](#20-updates)
21. [Security](#21-security)
22. [Accessibility](#22-accessibility)
23. [Analytics](#23-analytics)
24. [Plugins](#24-plugins)
25. [Deep Links](#25-deep-links)
26. [Files and Attachments](#26-files-and-attachments)
27. [Internationalization](#27-internationalization)
28. [Embedding (Embed)](#28-embedding-embed)
29. [Stickers](#29-stickers)
30. [AI Replies](#30-ai-replies)
31. [Inbox](#31-inbox)
32. [Feed](#32-feed)

---

## 1. Authentication

| ID         | Use Case                                                        | Actor  | Status |
| ---------- | --------------------------------------------------------------- | ------ | ------ |
| UC-AUTH-01 | Login via email/password → obtain API key → save credentials    | User   | `[x]`  |
| UC-AUTH-02 | Automatic login when saved token is present                     | System | `[x]`  |
| UC-AUTH-03 | Enter server URL on first login                                 | User   | `[x]`  |
| UC-AUTH-04 | Logout → clear credentials, close event loop, wipe localStorage | User   | `[x]`  |
| UC-AUTH-05 | Automatic session termination on inactivity timeout (24h)       | System | `[x]`  |
| UC-AUTH-06 | OIDC login (OAuth2) via external browser                        | User   | `[x]`  |
| UC-AUTH-07 | Login via Google/GitHub/GitLab (SSO)                            | User   | `[x]`  |

### Preconditions

- Zulip server is accessible at the entered URL
- API endpoint returns `server_settings`

### Flows

```
UC-AUTH-01:
  1. User enters server URL, email, password
  2. POST /fetch_api_key → { api_key, email }
  3. Save to instancesStore (localStorage)
  4. Redirect to home page → start event loop
  Error: display message "Invalid email or password"

UC-AUTH-04:
  1. Click "Log out"
  2. wipeCredentials() → clear localStorage
  3. Revoke push token (unregisterPushToken)
  4. Send presence "idle"
  5. Redirect to login page
```

---

## 2. Navigation and Interface

| ID        | Use Case                                                  | Actor  | Status |
| --------- | --------------------------------------------------------- | ------ | ------ |
| UC-NAV-01 | Switch between sections: Messenger, Calendar, Mail, Calls | User   | `[x]`  |
| UC-NAV-02 | Navigate history forward/back (Alt+←/→, mouse, swipe)     | User   | `[x]`  |
| UC-NAV-03 | Open/close sidebar                                        | User   | `[x]`  |
| UC-NAV-04 | Open/close right panel (info)                             | User   | `[x]`  |
| UC-NAV-05 | Open search modal (Cmd/Ctrl+K)                            | User   | `[x]`  |
| UC-NAV-06 | Open current user profile                                 | User   | `[x]`  |
| UC-NAV-07 | Lazy-loading pages with progress fallback                 | System | `[x]`  |
| UC-NAV-08 | ErrorBoundary on each route → fallback UI                 | System | `[x]`  |
| UC-NAV-09 | Help overlay for keyboard shortcuts (Cmd/Ctrl+/)          | User   | `[x]`  |
| UC-NAV-10 | Keyboard shortcuts: Cmd+1..4 to switch sections           | User   | `[x]`  |
| UC-NAV-11 | Alt+↑/↓ to switch between chats in sidebar                | User   | `[x]`  |

---

## 3. Chat List

| ID         | Use Case                                                                 | Actor  | Status |
| ---------- | ------------------------------------------------------------------------ | ------ | ------ |
| UC-CHAT-01 | Load initial data (1000 messages + channels + folders) → build chat list | System | `[x]`  |
| UC-CHAT-02 | Select chat → load messages → display in central panel                   | User   | `[x]`  |
| UC-CHAT-03 | Display unread (badge count)                                             | System | `[x]`  |
| UC-CHAT-04 | Update chat list in real time (new message, read receipt)                | System | `[x]`  |
| UC-CHAT-05 | Search chats by name                                                     | User   | `[x]`  |
| UC-CHAT-06 | Sort by last message                                                     | System | `[x]`  |
| UC-CHAT-07 | Create new DM                                                            | User   | `[x]`  |
| UC-CHAT-08 | Create group chat                                                        | User   | `[x]`  |
| UC-CHAT-09 | Pin/Unpin chat                                                           | User   | `[x]`  |
| UC-CHAT-10 | Lazy loading of all messages (batches of 5000)                           | System | `[x]`  |
| UC-CHAT-11 | Prioritize personal unread when sorting                                  | System | `[x]`  |
| UC-CHAT-12 | Sync after connectivity loss                                             | System | `[x]`  |

---

## 4. Direct Messages (DM)

| ID       | Use Case                                             | Actor  | Status |
| -------- | ---------------------------------------------------- | ------ | ------ |
| UC-DM-01 | Open DM → load partner profile + presence + messages | User   | `[x]`  |
| UC-DM-02 | Send text message in DM                              | User   | `[x]`  |
| UC-DM-03 | Display typing indicator in DM                       | System | `[x]`  |
| UC-DM-04 | Paginate messages upward (lazy load older)           | User   | `[x]`  |
| UC-DM-05 | Mark as read on view (visibility tracking)           | System | `[x]`  |
| UC-DM-06 | Open group chat → profiles of all participants       | User   | `[x]`  |

---

## 5. Channels

| ID       | Use Case                                                  | Actor | Status |
| -------- | --------------------------------------------------------- | ----- | ------ |
| UC-CH-01 | Open channel → load info + topics + members + messages    | User  | `[x]`  |
| UC-CH-02 | Open specific topic                                       | User  | `[x]`  |
| UC-CH-03 | Jump to next unread topic (Shift+N)                       | User  | `[x]`  |
| UC-CH-04 | Create new channel (name, description, subscribers, type) | User  | `[x]`  |
| UC-CH-05 | Mute/Unmute channel                                       | User  | `[x]`  |
| UC-CH-06 | Mute/Unmute topic                                         | User  | `[x]`  |
| UC-CH-07 | View channel member list                                  | User  | `[x]`  |
| UC-CH-08 | Edit channel (name, description)                          | User  | `[x]`  |
| UC-CH-09 | Delete channel (owner/admin)                              | User  | `[x]`  |
| UC-CH-10 | Subscribe/unsubscribe from channel                        | User  | `[x]`  |

---

## 6. Messages

| ID        | Use Case                                               | Actor  | Status |
| --------- | ------------------------------------------------------ | ------ | ------ |
| UC-MSG-01 | Send message (stream: stream_id + topic, DM: user_id)  | User   | `[x]`  |
| UC-MSG-02 | Edit own message                                       | User   | `[x]`  |
| UC-MSG-03 | Delete message                                         | User   | `[x]`  |
| UC-MSG-04 | Formatting: bold, italic, code (Cmd+B/I/E)             | User   | `[x]`  |
| UC-MSG-05 | Render HTML content (DOMPurify sanitization)           | System | `[x]`  |
| UC-MSG-06 | Display avatar, sender name, time                      | System | `[x]`  |
| UC-MSG-07 | Group consecutive messages from the same author        | System | `[x]`  |
| UC-MSG-08 | Update messages in real time (real-time events)        | System | `[x]`  |
| UC-MSG-09 | Delete messages in real time                           | System | `[x]`  |
| UC-MSG-10 | Copy message text                                      | User   | `[x]`  |
| UC-MSG-11 | Reply to message (quote reply)                         | User   | `[x]`  |
| UC-MSG-12 | Forward message to another chat/channel                | User   | `[x]`  |
| UC-MSG-13 | Multi-select messages (select mode)                    | User   | `[x]`  |
| UC-MSG-14 | "Read by" — list of readers                            | User   | `[x]`  |
| UC-MSG-15 | Pagination: load older messages on scroll up           | User   | `[x]`  |
| UC-MSG-16 | Quick edit last message (Arrow Up when input is empty) | User   | `[x]`  |

---

## 7. Reactions and Actions

| ID        | Use Case                                                 | Actor  | Status |
| --------- | -------------------------------------------------------- | ------ | ------ |
| UC-RXN-01 | Add emoji reaction to message                            | User   | `[x]`  |
| UC-RXN-02 | Remove own emoji reaction                                | User   | `[x]`  |
| UC-RXN-03 | Display reactions below message (with count and avatars) | System | `[x]`  |
| UC-RXN-04 | Update reactions in real time                            | System | `[x]`  |
| UC-RXN-05 | Star/Unstar message                                      | User   | `[x]`  |
| UC-RXN-06 | Message context menu (right-click or long-press)         | User   | `[x]`  |
| UC-RXN-07 | Emoji picker (full keyboard) in composer                 | User   | `[x]`  |

---

## 8. Folders

| ID        | Use Case                                | Actor  | Status |
| --------- | --------------------------------------- | ------ | ------ |
| UC-FLD-01 | Load folders from Workspace API         | System | `[x]`  |
| UC-FLD-02 | Select folder → filter chats in sidebar | User   | `[x]`  |
| UC-FLD-03 | Create folder (title, color)            | User   | `[x]`  |
| UC-FLD-04 | Edit folder                             | User   | `[x]`  |
| UC-FLD-05 | Delete folder                           | User   | `[x]`  |
| UC-FLD-06 | Add/remove chat from folder             | User   | `[x]`  |
| UC-FLD-07 | Pin/Unpin chat in folder                | User   | `[x]`  |
| UC-FLD-08 | Drag & drop to reorder pinned chats     | User   | `[x]`  |

---

## 9. Search

| ID        | Use Case                                     | Actor | Status |
| --------- | -------------------------------------------- | ----- | ------ |
| UC-SRC-01 | Search messages by text                      | User  | `[x]`  |
| UC-SRC-02 | Navigate to found message in chat            | User  | `[x]`  |
| UC-SRC-03 | Search chats/channels by name                | User  | `[x]`  |
| UC-SRC-04 | Search users by name/email                   | User  | `[x]`  |
| UC-SRC-05 | Filter search results (stream, sender, date) | User  | `[x]`  |

---

## 10. Calls (Jitsi)

| ID         | Use Case                                      | Actor  | Status |
| ---------- | --------------------------------------------- | ------ | ------ |
| UC-CALL-01 | Create call → enter name → generate Jitsi URL | User   | `[x]`  |
| UC-CALL-02 | Open call in modal window (iframe)            | User   | `[x]`  |
| UC-CALL-03 | Join call via link from message               | User   | `[x]`  |
| UC-CALL-04 | Display active call participants              | System | `[x]`  |
| UC-CALL-05 | Minimize call (PIP — picture-in-picture)      | User   | `[x]`  |
| UC-CALL-06 | Send call link to chat                        | User   | `[x]`  |

---

## 11. Notifications

| ID        | Use Case                                                      | Actor  | Status |
| --------- | ------------------------------------------------------------- | ------ | ------ |
| UC-NTF-01 | Request notification permission                               | System | `[x]`  |
| UC-NTF-02 | Desktop notification on new message (when tab is not focused) | System | `[x]`  |
| UC-NTF-03 | Push notification via Firebase FCM (background tab / closed)  | System | `[x]`  |
| UC-NTF-04 | Register FCM token on Zulip server                            | System | `[x]`  |
| UC-NTF-05 | Click notification → focus tab + navigate to chat             | User   | `[x]`  |
| UC-NTF-06 | Dismiss notification when message is read                     | System | `[x]`  |
| UC-NTF-07 | Sound alert on new message                                    | System | `[x]`  |
| UC-NTF-08 | Muted chats do not generate notifications                     | System | `[x]`  |
| UC-NTF-09 | Badge count (unread) on app icon                              | System | `[x]`  |

---

## 12. Presence

| ID        | Use Case                                                         | Actor  | Status |
| --------- | ---------------------------------------------------------------- | ------ | ------ |
| UC-PRS-01 | Track user activity (mouse, keyboard, touch)                     | System | `[x]`  |
| UC-PRS-02 | Auto-transition to "away" after 5 min of inactivity              | System | `[x]`  |
| UC-PRS-03 | Immediate transition to "away" when tab is hidden                | System | `[x]`  |
| UC-PRS-04 | Immediate transition to "online" when activity resumes           | System | `[x]`  |
| UC-PRS-05 | Send presence to server every 60 seconds                         | System | `[x]`  |
| UC-PRS-06 | Poll presence of other users every 90 seconds                    | System | `[x]`  |
| UC-PRS-07 | Display indicator: green (online), yellow (idle), gray (offline) | System | `[x]`  |
| UC-PRS-08 | Text status: "online", "away", "5 min ago", "2 h ago"            | System | `[x]`  |

---

## 13. Drafts

| ID        | Use Case                                   | Actor  | Status |
| --------- | ------------------------------------------ | ------ | ------ |
| UC-DRF-01 | Auto-save draft when leaving chat          | System | `[x]`  |
| UC-DRF-02 | Restore draft when returning to chat       | System | `[x]`  |
| UC-DRF-03 | View list of all drafts                    | User   | `[x]`  |
| UC-DRF-04 | Edit draft from list                       | User   | `[x]`  |
| UC-DRF-05 | Delete draft                               | User   | `[x]`  |
| UC-DRF-06 | Sync drafts with server (Zulip Drafts API) | System | `[x]`  |

---

## 14. Starred and Mentions

| ID        | Use Case                                       | Actor | Status |
| --------- | ---------------------------------------------- | ----- | ------ |
| UC-FAV-01 | View list of starred messages                  | User  | `[x]`  |
| UC-FAV-02 | Paginate starred                               | User  | `[x]`  |
| UC-FAV-03 | Remove from starred                            | User  | `[x]`  |
| UC-MNT-01 | View list of mentions (@mention)               | User  | `[x]`  |
| UC-MNT-02 | Navigate to mention message                    | User  | `[x]`  |
| UC-MNT-03 | @mention suggestion in composer (autocomplete) | User  | `[x]`  |

---

## 15. Profile and Settings

| ID        | Use Case                                     | Actor | Status |
| --------- | -------------------------------------------- | ----- | ------ |
| UC-PRF-01 | View own profile (name, email, avatar, role) | User  | `[x]`  |
| UC-PRF-02 | View another user's profile (right panel)    | User  | `[x]`  |
| UC-PRF-03 | Edit own profile                             | User  | `[x]`  |
| UC-SET-01 | Select language (ru/en)                      | User  | `[x]`  |
| UC-SET-02 | Chat sorting (personal unread first)         | User  | `[x]`  |
| UC-SET-03 | Configure notification sounds                | User  | `[x]`  |
| UC-SET-04 | Clear cache                                  | User  | `[x]`  |
| UC-SET-05 | View application version                     | User  | `[x]`  |
| UC-SET-06 | View Open Source licenses                    | User  | `[x]`  |

---

## 16. Themes and Personalization

| ID        | Use Case                                                     | Actor         | Status |
| --------- | ------------------------------------------------------------ | ------------- | ------ |
| UC-THM-01 | Toggle Light/Dark theme                                      | User          | `[x]`  |
| UC-THM-02 | Switch palette (Orange Warm / Blue Cold)                     | User          | `[x]`  |
| UC-THM-03 | Automatic theme (System) — follows OS                        | System        | `[x]`  |
| UC-THM-04 | Persist selected theme (localStorage)                        | System        | `[x]`  |
| UC-THM-05 | White-label: customization via env vars (name, logo, colors) | Administrator | `[x]`  |
| UC-THM-06 | Keyboard shortcut for theme toggle (Cmd+Shift+T)             | User          | `[x]`  |

---

## 17. Organizations (Multi-server)

| ID        | Use Case                                  | Actor  | Status |
| --------- | ----------------------------------------- | ------ | ------ |
| UC-ORG-01 | Add new server (URL + credentials)        | User   | `[x]`  |
| UC-ORG-02 | Switch between servers (InstanceSwitcher) | User   | `[x]`  |
| UC-ORG-03 | Remove server                             | User   | `[x]`  |
| UC-ORG-04 | Auto-select remaining server on removal   | System | `[x]`  |
| UC-ORG-05 | Unread count per organization             | System | `[x]`  |

---

## 18. PWA and Offline

| ID        | Use Case                                                | Actor  | Status |
| --------- | ------------------------------------------------------- | ------ | ------ |
| UC-PWA-01 | Install as PWA (Add to Home Screen)                     | User   | `[x]`  |
| UC-PWA-02 | Detect network loss → visual indicator                  | System | `[x]`  |
| UC-PWA-03 | Disable retry requests when offline                     | System | `[x]`  |
| UC-PWA-04 | Auto-recover on network restoration → re-fetch data     | System | `[x]`  |
| UC-PWA-05 | Service Worker: cache static assets (Workbox)           | System | `[x]`  |
| UC-PWA-06 | Runtime caching for API responses (NetworkFirst, 5 min) | System | `[x]`  |
| UC-PWA-07 | Detect runtime: browser / PWA / Electron                | System | `[x]`  |

---

## 19. Electron (Desktop)

| ID        | Use Case                                             | Actor  | Status |
| --------- | ---------------------------------------------------- | ------ | ------ |
| UC-ELT-01 | Launch as native desktop application (Win/Mac/Linux) | User   | `[x]`  |
| UC-ELT-02 | Badge count on app icon (unread)                     | System | `[x]`  |
| UC-ELT-03 | Progress bar on icon (file download)                 | System | `[x]`  |
| UC-ELT-04 | Request attention (taskbar flash)                    | System | `[x]`  |
| UC-ELT-05 | Native notifications via OS API                      | System | `[x]`  |
| UC-ELT-06 | Auto-start at system login (configurable)            | User   | `[x]`  |
| UC-ELT-07 | Minimize to tray                                     | User   | `[x]`  |
| UC-ELT-08 | Window management: minimize, maximize, close         | User   | `[x]`  |
| UC-ELT-09 | Custom protocol `workspace://` for deep links        | System | `[x]`  |
| UC-ELT-10 | Content Security Policy (CSP)                        | System | `[x]`  |

---

## 20. Updates

| ID        | Use Case                                     | Actor  | Status |
| --------- | -------------------------------------------- | ------ | ------ |
| UC-UPD-01 | Check for update (Electron auto-updater)     | System | `[x]`  |
| UC-UPD-02 | Download update with progress                | System | `[x]`  |
| UC-UPD-03 | Install update (quit & install)              | User   | `[x]`  |
| UC-UPD-04 | PWA: prompt to update service worker         | System | `[x]`  |
| UC-UPD-05 | Display notification "New version available" | System | `[x]`  |

---

## 21. Security

| ID        | Use Case                                        | Actor  | Status |
| --------- | ----------------------------------------------- | ------ | ------ |
| UC-SEC-01 | HTML sanitization in messages (DOMPurify)       | System | `[x]`  |
| UC-SEC-02 | URL validation before navigation                | System | `[x]`  |
| UC-SEC-03 | Redaction of sensitive data in logs             | System | `[x]`  |
| UC-SEC-04 | CSP headers (script-src, connect-src)           | System | `[x]`  |
| UC-SEC-05 | Role checking (hasPermission) for admin actions | System | `[x]`  |
| UC-SEC-06 | Session timeout on inactivity                   | System | `[x]`  |
| UC-SEC-07 | Block sensitive files on commit (git hook)      | System | `[x]`  |
| UC-SEC-08 | Iframe embedding with allowlist                 | System | `[x]`  |
| UC-SEC-09 | Input sanitization (filename, email)            | System | `[x]`  |

---

## 22. Accessibility

| ID         | Use Case                                         | Actor  | Status |
| ---------- | ------------------------------------------------ | ------ | ------ |
| UC-A11Y-01 | Minimum tap target 44x44 px on touch devices     | System | `[x]`  |
| UC-A11Y-02 | Focus-visible outline for keyboard navigation    | System | `[x]`  |
| UC-A11Y-03 | ARIA roles on interactive elements               | System | `[x]`  |
| UC-A11Y-04 | Keyboard navigation for all interactive elements | User   | `[x]`  |
| UC-A11Y-05 | Sufficient text contrast (WCAG AA)               | System | `[x]`  |
| UC-A11Y-06 | Safe-area insets for notch/rounded corners       | System | `[x]`  |

---

## 23. Analytics

| ID        | Use Case                                              | Actor  | Status |
| --------- | ----------------------------------------------------- | ------ | ------ |
| UC-ANL-01 | Request analytics consent                             | System | `[x]`  |
| UC-ANL-02 | Page view tracking (on page navigation)               | System | `[x]`  |
| UC-ANL-03 | Event tracking (send message, reaction, search, etc.) | System | `[x]`  |
| UC-ANL-04 | Identify user (userId, role, theme, locale)           | System | `[x]`  |
| UC-ANL-05 | Google Analytics 4 support                            | System | `[x]`  |
| UC-ANL-06 | Yandex Metrica support                                | System | `[x]`  |
| UC-ANL-07 | PII stripping before sending (email, token, password) | System | `[x]`  |

---

## 24. Plugins

| ID        | Use Case                                                                 | Actor     | Status |
| --------- | ------------------------------------------------------------------------ | --------- | ------ |
| UC-PLG-01 | Register plugin (manifest + activate/deactivate)                         | Developer | `[x]`  |
| UC-PLG-02 | Contribution to UI slots (sidebar, topbar, message actions, etc.)        | Developer | `[x]`  |
| UC-PLG-03 | Permission-gated API (storage, navigate, analytics, notifications)       | System    | `[x]`  |
| UC-PLG-04 | Subscribe to events (message:received, theme:changed, etc.)              | Developer | `[x]`  |
| UC-PLG-05 | Scoped localStorage for plugin                                           | Developer | `[x]`  |
| UC-PLG-06 | Dynamic loading of external plugin (script / import)                     | Developer | `[x]`  |
| UC-PLG-07 | Dev console: `window.__plugins__.list()` / `.register()` / `.activate()` | Developer | `[x]`  |

---

## 25. Deep Links

| ID       | Use Case                                        | Actor  | Status |
| -------- | ----------------------------------------------- | ------ | ------ |
| UC-DL-01 | Generate shareable URL for stream/topic/DM      | System | `[x]`  |
| UC-DL-02 | Parse incoming deep link → navigate to chat     | System | `[x]`  |
| UC-DL-03 | Electron custom protocol `workspace://open/...` | System | `[x]`  |
| UC-DL-04 | Web Share API for sending link                  | User   | `[x]`  |
| UC-DL-05 | Clipboard fallback when Share API unavailable   | User   | `[x]`  |

---

## 26. Files and Attachments

| ID         | Use Case                             | Actor  | Status |
| ---------- | ------------------------------------ | ------ | ------ |
| UC-FILE-01 | Upload file via attach button        | User   | `[x]`  |
| UC-FILE-02 | Drag-and-drop file into composer     | User   | `[x]`  |
| UC-FILE-03 | Display preview of uploaded image    | System | `[x]`  |
| UC-FILE-04 | Progress bar during upload           | System | `[x]`  |
| UC-FILE-05 | Download attachment from message     | User   | `[x]`  |
| UC-FILE-06 | Full-screen image/video viewer       | User   | `[x]`  |
| UC-FILE-07 | TUS resumable upload for large files | System | `[x]`  |

---

## 27. Internationalization

| ID         | Use Case                                            | Actor  | Status |
| ---------- | --------------------------------------------------- | ------ | ------ |
| UC-I18N-01 | Switch language (ru ↔ en)                           | User   | `[x]`  |
| UC-I18N-02 | Pluralization (1 message / 2 messages / 5 messages) | System | `[x]`  |
| UC-I18N-03 | Interpolation ({{ count }}, {{ name }})             | System | `[x]`  |
| UC-I18N-04 | Fallback to ru when translation is missing          | System | `[x]`  |

---

## 28. Embedding (Embed)

| ID        | Use Case                                   | Actor  | Status |
| --------- | ------------------------------------------ | ------ | ------ |
| UC-EMB-01 | Embed external page in iframe by URL       | System | `[x]`  |
| UC-EMB-02 | Validate URL against allowlist             | System | `[x]`  |
| UC-EMB-03 | Sandbox policy: strict/moderate/permissive | System | `[x]`  |
| UC-EMB-04 | Block with fallback UI for disallowed URL  | System | `[x]`  |

---

## 29. Stickers

| ID        | Use Case                                               | Actor  | Status |
| --------- | ------------------------------------------------------ | ------ | ------ |
| UC-STK-01 | Browse installed sticker packs in picker panel         | User   | `[x]`  |
| UC-STK-02 | Search stickers by emoji or keyword                    | User   | `[x]`  |
| UC-STK-03 | Send sticker as message                                | User   | `[x]`  |
| UC-STK-04 | Display sticker in message bubble (dedicated renderer) | System | `[x]`  |
| UC-STK-05 | Install/uninstall sticker pack                         | User   | `[x]`  |
| UC-STK-06 | Recently used stickers (max 30, persisted)             | System | `[x]`  |
| UC-STK-07 | Favorite stickers (max 50, persisted)                  | User   | `[x]`  |
| UC-STK-08 | Parse sticker from incoming message HTML               | System | `[x]`  |

---

## 30. AI Replies

| ID       | Use Case                                                   | Actor     | Status |
| -------- | ---------------------------------------------------------- | --------- | ------ |
| UC-AI-01 | Generate smart reply suggestions from message context      | User      | `[x]`  |
| UC-AI-02 | Rewrite draft text with AI (formal, casual, friendly tone) | User      | `[x]`  |
| UC-AI-03 | Translate draft text to another language                   | User      | `[x]`  |
| UC-AI-04 | Summarize conversation                                     | User      | `[x]`  |
| UC-AI-05 | Expand short draft into full message                       | User      | `[x]`  |
| UC-AI-06 | Fix grammar in draft                                       | User      | `[x]`  |
| UC-AI-07 | Streaming response display during generation               | System    | `[x]`  |
| UC-AI-08 | Accept/dismiss AI suggestion                               | User      | `[x]`  |
| UC-AI-09 | Abort in-flight AI generation                              | User      | `[x]`  |
| UC-AI-10 | Pluggable AI provider (mock for dev, HTTP for prod)        | Developer | `[x]`  |

---

## 31. Inbox

| ID        | Use Case                                     | Actor  | Status |
| --------- | -------------------------------------------- | ------ | ------ |
| UC-INB-01 | View inbox with grouped unread conversations | User   | `[x]`  |
| UC-INB-02 | Fetch unread entries from server             | System | `[x]`  |
| UC-INB-03 | Mark inbox entry as read                     | User   | `[x]`  |
| UC-INB-04 | Sort entries by last message time            | System | `[x]`  |
| UC-INB-05 | Display total unread count                   | System | `[x]`  |

---

## 32. Feed

| ID         | Use Case                                       | Actor  | Status |
| ---------- | ---------------------------------------------- | ------ | ------ |
| UC-FEED-01 | View combined message feed across all channels | User   | `[x]`  |
| UC-FEED-02 | Load feed messages from server                 | System | `[x]`  |
| UC-FEED-03 | Load older messages (pagination)               | User   | `[x]`  |
| UC-FEED-04 | Navigate to original message from feed         | User   | `[x]`  |

---

## Notes

Status at the use-case row level is the source of truth. This document is updated incrementally as features evolve, so the latest implementation state is reflected directly in each section above.

---

## Related Documents

- `docs/fsd-architecture.md` — FSD structure
- `docs/INTEGRATION_GUIDE.md` — how to add new features
- `docs/STORES_REFERENCE.md` — stores and domain data contracts
- `docs/API_CLIENT_REFERENCE.md` — API layer and endpoint integration
