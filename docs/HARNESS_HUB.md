# Harness Hub

Harness Hub is Hermes Workspace's compatibility layer for external agent
runtimes. Hermes Workspace remains the UI and source of truth for native Hermes
sessions; AionCore supplies ACP discovery and process compatibility for other
local harnesses.

## Current integration

- The Operations screen discovers installed runtimes and shows their real
  connection status.
- Each runtime can be tested without exposing AionCore directly to the browser.
- The desktop app starts AionCore as a child process and stops it when Hermes
  Workspace exits.
- Companion state is isolated under the Hermes Workspace application data
  directory.
- Existing Hermes themes, sessions, approvals, and agent-team UI are unchanged.

## Binary discovery

The desktop app checks these sources in order:

1. `AIONCORE_BIN`
2. A bundled `resources/bundled-aioncore/<platform>-<arch>/aioncore` binary
3. `vendor/aioncore/<platform>-<arch>/aioncore` during development
4. The verified AionUi application bundle path on macOS

Set `AIONCORE_URL` to use an already-running local or remote companion instead.
When that variable is present, Hermes Workspace will not launch another local
process. `AIONCORE_WORK_DIR` overrides the default `~/workspace` working root.

## Security boundary

The renderer only talks to the authenticated Hermes Workspace
`/api/external-agents` route. That route validates runtime IDs and returns a
small allowlisted status payload. AionCore remains bound to localhost by
default.

## Next milestone

The next layer maps AionCore conversation streams into Hermes Workspace's
existing message, tool-call, approval, and artifact components. After that,
remote ACP endpoints can be registered through Tailscale without replacing the
native Hermes session database.
