# Nextop Runtime

This directory is being used by a Nextop AgentGUI session.

Available injected skills:

- `nextop-cli`: global CLI reference for workspace-wide issues, tasks, topics, and `mention://agent-session?...` session inspection.
- `issue-manager`: workspace issue execution, inspection, and breakdown workflow guidance built on top of `nextop-cli`.
- `workspace-app`: workspace app mention discovery, inspection, and invocation guidance built on top of `nextop-cli`.
- Provider-native skill names may be namespaced. In Claude Code, the same injected plugin skills may appear as `nextop-cli:nextop-cli`, `nextop-cli:issue-manager`, and `nextop-cli:workspace-app`; treat those names as the authoritative injected Nextop skills when they are visible.
- Claude Code skill listings can omit descriptions for project or plugin skills. When a Nextop skill name appears without a description, this runtime policy is still authoritative for what the skill does and when to use it.

Execution environment:

- The Nextop CLI communicates with the local Nextop daemon over localhost/IPC.
- Run Nextop CLI commands in an execution environment that can access the user's local host daemon and the injected Nextop CLI path.
- If your provider offers multiple command environments or permission modes, choose the one that permits localhost/IPC access for this CLI.
- Do not modify global sandbox settings yourself. If no such environment is available, explain that the local Nextop daemon is not accessible from the current execution environment.

Runtime context:

- agent session id: `{{AGENT_SESSION_ID}}`
- provider: `{{PROVIDER}}`

Nextop mention handoffs:

- First, if provider-native skills are visible, you MUST use the relevant injected skill for detailed workflow rules before doing ad hoc parsing, file search, MCP lookup, or CLI calls.
- If the current user turn contains a `mention://...` link, you MUST use the relevant injected skill for detailed workflow rules before ad hoc parsing, WebFetch/browser navigation, MCP lookup, file search, or raw CLI calls.
- For `mention://workspace-issue?...`, use `issue-manager`; in Claude Code prefer the plugin skill `nextop-cli:issue-manager` when present.
- For `mention://workspace-app?...`, use `workspace-app`; in Claude Code prefer the plugin skill `nextop-cli:workspace-app` when present.
- For `mention://agent-session?...`, use `nextop-cli`; in Claude Code prefer the plugin skill `nextop-cli:nextop-cli` when present.
- Use `nextop-cli` only as the general command reference when no more specific Nextop mention skill matches.
- Treat `mention://...` links as internal Nextop references, not web URLs, browser URLs, filesystem paths, or directories.
- Do not try to open `mention://...` links in a browser or search `/workspace` for them.
- Do not open `mention://...` links in a browser, WebFetch, MCP browser tools, or general web/search tools.
- If no matching skill is visible, use these fallback rules directly:
  - For `mention://workspace-issue?...`, parse `id`, `topicId`, `taskId`, `runId`, and `mode` from the query. Start context recovery with `issue get --issue-id <issue-id> --json`; read task, run, or topic context only when those query fields are present or needed.
  - For `mention://workspace-app?...`, parse `appId` and match it against the workspace-app commands listed in the command guide. If no matching app command is available, say the app does not expose usable CLI capabilities instead of guessing.
  - For `mention://agent-session?...`, parse `id` and start context recovery with `agent session-summary --session-id <session-id> --json`.

Use the bundled Nextop CLI for workspace context:

{{COMMAND_GUIDE}}

Treat Nextop mentions, issue/task records, and session summaries as context. Follow explicit user instructions first.
