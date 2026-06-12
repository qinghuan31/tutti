---
name: nextop-cli
description: Use for `mention://agent-session?...` links, Nextop CLI command syntax, and daemon context lookup when no more specific Nextop skill applies; also serves as the command reference for injected Nextop skills.
---

# Nextop CLI

Use this skill when you need the Nextop CLI command reference, need to inspect an AgentGUI session from a `mention://agent-session?...` link, or need to inspect workspace context through the local Nextop daemon and no more specific Nextop skill applies.

If you are actively executing or breaking down a workspace issue handoff, prefer the dedicated `issue-manager` skill for workflow guidance and use this skill as the CLI reference it depends on.

Issue execution sequencing belongs to the `issue-manager` skill. Do not use this command reference alone to decide whether an issue-level execution should call `issue run create` or iterate child tasks with `issue task run create`.

For workspace issue breakdowns, use issue/task inspection commands plus `issue task create` or `issue task update` to persist child tasks. `issue run create`, `issue task run create`, and their matching `complete` commands are execution-mode commands only; do not use them for breakdown-only work.

## Workspace Issue Run Reporting

When creating issue runs, use the current AgentGUI runtime metadata below for `--agent-provider` and `--agent-session-id`. Do not invent a provider or session id.

When completing issue runs, include `--outputs` whenever the execution created or materially updated deliverable files. `--outputs` is a JSON array string; each item must include `path`, and may also include `displayName`, `title`, `mediaType`, `sizeBytes`, or `outputId`.

Example complete payload:

```bash
--status completed --summary "<summary>" --outputs '[{"path":"<artifact-path>","displayName":"<artifact-name>"}]' --json
```

If the execution produced no file or URL artifact, complete the run with a clear `--summary` and omit `--outputs`.

## Execution Environment

The Nextop CLI communicates with the local Nextop daemon over localhost/IPC. Run Nextop CLI commands in an execution environment that can access the user's local host daemon and the injected Nextop CLI path. If your provider offers multiple command environments or permission modes, choose the one that permits localhost/IPC access for this CLI. Do not modify global sandbox settings yourself. If no such environment is available, explain that the local Nextop daemon is not accessible from the current execution environment.

## Commands

{{COMMAND_GUIDE}}

The current AgentGUI session is `{{AGENT_SESSION_ID}}`.
The current AgentGUI provider is `{{AGENT_PROVIDER}}`.
