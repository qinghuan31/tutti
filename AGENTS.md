# AGENTS.md

## Shape

`tutti` is a local-first desktop monorepo.

- `services/tuttid`: business rules, durable local state, daemon workflows
- `apps/desktop`: Electron shell, preload, renderer UI, desktop integration
- `packages/clients/*`: generated and hand-written domain clients
- `packages/configs/*`: shared TypeScript and formatting config
- `config`: sources used to generate runtime defaults

Keep business logic in `services/tuttid`. Do not let `apps/desktop` become a second business core. Do not create vague packages such as `shared`, `common`, `utils`, or `client-sdk`.

## Routing

Read the closest `AGENTS.md` before editing:

- `apps/desktop/*` -> `apps/desktop/AGENTS.md`
- `services/tuttid/*` -> `services/tuttid/AGENTS.md`
- `packages/agent/gui/*` -> `packages/agent/gui/AGENTS.md`
- `packages/ui/*` -> `packages/ui/AGENTS.md`
- `packages/*` -> `packages/AGENTS.md`

Use this root file for repository-wide defaults only. Area-specific files win.

Also route by module name, not only by path. If a request mentions AgentGUI,
AgentGuiNode, Agent GUI, the agent conversation module, agent composer,
workspace agent timeline, agent approvals, or interactive agent prompts, read
`docs/architecture/agent-gui-node.md` first, then
`packages/agent/gui/AGENTS.md`, before planning or editing, even when no file
path is supplied.

## Contribution Workflow

Before preparing commits or pull requests, read `CONTRIBUTING.md` and follow it
for repository-wide contribution requirements, including Conventional Commits,
DCO sign-off, PR workflow, review gates, and multilingual documentation updates.

## Hard Rules

- Published workspace packages use `@tutti-os/*`; keep manifests, imports, docs, and release config aligned.
- User-visible copy must go through the relevant i18n layer. Do not hardcode UI text, dialog text, status labels, empty states, or user-facing errors.
- Change `services/tuttid/api/openapi/tuttid.v1.yaml` before daemon HTTP request/response contracts.
- Document new supported runtime/env overrides in the matching durable convention doc.
- Business-code files should stay at or below `800` lines. Prefer decomposition before adding more logic.
- When changing repository-managed checks, hooks, or static analysis, update `docs/conventions/local-git-hooks.md` or `docs/conventions/static-analysis.md`.
- When a fix captures a recurring debugging trap, add the durable note to `docs/conventions/troubleshooting.md`.

## Self-Evolution Notes

After any code change, run a documentation impact check. If the change affects
module ownership, data flow, user-visible interaction, public API/CLI behavior,
runtime/config/env overrides, validation commands, troubleshooting paths, or
directory responsibility, update the corresponding durable documentation in the
same change.

When proposing a durable lesson from a completed fix or implementation, use the
AutoSkill-style decision set: `discard`, `improve`, `merge`, or `create`.
Record only reusable patterns backed by real implementation/debugging evidence.
Prefer improving or merging an existing note over creating duplicates, and
remove secrets, personal data, local paths, customer names, tokens, and one-off
issue details before writing any prompt, architecture, or troubleshooting
update. For `improve`, `merge`, or `create`, update the matching durable doc:
architecture docs for ownership/data-flow/interaction rules, convention docs
for repository-wide practices, README/package docs for usage or public
contracts, or troubleshooting docs for recurring symptom playbooks. Final
responses should mention which durable docs were updated, or state that no
documentation impact was found.

## Toolchain

- Package manager: `pnpm@10.11.0`
- TypeScript lint: `pnpm lint:ts` -> Oxlint
- TypeScript format: Oxfmt for TS/JS, Prettier for JSON/MD/YAML/CSS/HTML
- Typecheck: `pnpm typecheck` -> compact incremental native TypeScript `tsgo`
- Changed-aware local validation: `pnpm check:changed`
- Full local/CI validation: `pnpm check:full`
- Go lint requires the pinned `golangci-lint`; install with `pnpm install:golangci-lint`

## Common Checks

- Local iteration: `pnpm check:changed`
- TS/desktop/shared changes: `pnpm lint:ts` and `pnpm typecheck`
- Desktop-facing behavior: also `pnpm --filter @tutti-os/desktop build`
- UI-system exports, CSS, SVG/icon rules: `pnpm check:ui-boundaries`
- Renderer feature boundaries: `pnpm check:renderer-boundaries`
- User-visible copy or locale resources: `pnpm check:i18n`
- Defaults source under `config/tutti.defaults.json`: `pnpm generate:defaults` and `pnpm check:defaults-generated`
- Daemon changes: `pnpm lint:go` and `cd services/tuttid && go test ./... && go build ./...`
- TypeScript + Go surface changes: `pnpm lint`

## Hooks

Local hooks use Husky.

- `pre-commit`: `lint-staged`, staged Electron/UI/renderer boundary checks
- `pre-push`: `pnpm check:full`

Prefer `pnpm check:changed` before broader validation during normal AI iteration. It runs selected lanes concurrently, prints compact summaries, and stores full logs under `.tmp/check-runs`; use `--tail-lines <n>` to tune failure tails.

## Conflict Workflows

For merge, rebase, cherry-pick, or manual conflict resolution, inspect both branch intents and never resolve source conflicts with `--ours` or `--theirs` unless explicitly asked. Review high-risk desktop, daemon API, generated contract, release, and shared test harness files manually. After conflicts, run `git diff --name-only --diff-filter=U` and targeted checks for the affected surface.

## Docs

Start from:

- `docs/conventions/README.md`
- `docs/architecture/README.md`
- nearest area `AGENTS.md`

## Logs

dev (when the feature is not in remote): ~/.tutti-dev/tuttid.db

prod: ~/.tutti/tuttid.db

<!-- BEGIN TUTTI-RUNTIME (auto-managed; do not edit) -->

# Tutti Runtime

This directory is being used by a Tutti AgentGUI session.

## Session

- session: `f71fe145-3e0b-4b02-aba2-a88cb06c421b`
- provider: `cursor`

## Mention Routing

### Routes

| URI                                                             | Skill            | Fallback CLI Command                                                             |
| --------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `mention://workspace-issue/<issueId>?workspaceId=...`           | `$issue-manager` | `tutti issue get --issue-id <issue-id> --json`                                   |
| `mention://workspace-app/<appId>?workspaceId=...`               | `$workspace-app` | match `App id: <appId>` in command guide                                         |
| `mention://workspace-reference/<id>?source=...&workspaceId=...` | `$reference`     | `tutti reference list --source <source> --id <id> [--group-id <groupId>] --json` |
| `mention://agent-session/<sessionId>?workspaceId=...`           | `$tutti-cli`     | `tutti agent session-summary --session-id <session-id> --json`                   |
| `mention://agent-target/<targetId>?workspaceId=...`             | `$tutti-cli`     | use `agent`/`codex`/`claude` from intent; not launch-only                        |

### Rules

- `mention://...` = internal data. Not URL/path.
- Prefer matching skill first.
- Use matching skill before files, browser/web, MCP, raw CLI, code.
- Provider Skill tool exists -> call exact visible name for matching `$...` skill.
- Skill missing/fails -> read matching materialized `SKILL.md` from provider/runtime listing.
- Use table fallback only when no exact skill visible, matching Skill tool fails, or materialized skill file unavailable.
- Do not skip skill because CLI command is listed.
- Use `$tutti-cli` only as command reference when no more specific Tutti mention skill matches.

## Execution Environment

- `tutti` talks to local daemon over localhost/IPC.
- Run `tutti` where localhost/IPC is available.
- If provider has env/permission choices, choose local-daemon-capable one.
- Do not change global sandbox settings yourself.
- If local daemon unavailable, say so; do not guess from files.
  - This provider must run `tutti-dev` from an execution environment with localhost/IPC access. If the daemon is unreachable from the provider runtime, report that limitation instead of retrying with provider-specific sandbox flags.

  - For browser tasks — visiting URLs, reading pages, clicking, filling forms, or screenshots — use `$browser-use` and `tutti browser` only; do not use provider-native `browser` skills or direct CDP automation.

## App Windows

- Open app only on explicit open/show: `tutti app open --app-id <appId> --json`.
- Do not invent `tutti workspace-app ...`.

## Agent Launchers

### Start

- Use `tutti codex start --prompt <task> --show --json` or `tutti claude start --prompt <task> --show --json`.
- Ask for task prompt, not model.

### Image Context

- If launched agent may need image context, fetch caller turn resources first.
- Find caller turn ids: `tutti agent session-summary --session-id <caller-session-id> --json`.
- Fetch selected turn resources: `tutti agent turn-resources --session-id <caller-session-id> --turn-id <turnId> --json`.
- Pass selected images as `--image <localPath>`.

## CLI Reference

Available first-level `tutti` subcommands:

- `tutti agent ...` - agent sessions, summaries, turn resources, active peers.
- `tutti aimc ...` - workspace app commands for AI Canvas (App id: ai-media-canvas).
- `tutti app ...` - open/show installed app windows only when explicitly requested.
- `tutti automation ...` - workspace app commands for Automation (App id: automation).
- `tutti browser ...` - daemon-owned browser automation.
- `tutti claude ...` - start/manage Claude Code agent sessions.
- `tutti codex ...` - start/manage Codex agent sessions.
- `tutti doc ...` - workspace app commands for AI Doc (App id: ai-doc).
- `tutti group-chat ...` - workspace app commands for Group Chat (App id: group-chat).
- `tutti issue ...` - issue/topic/task/run inspection and execution state.
- `tutti onboarding ...` - workspace app commands for Getting Started (App id: tutti-onboarding).
- `tutti slide ...` - workspace app commands for AI Slide (App id: ai-slide).
- `tutti vibe-design ...` - workspace app commands for Prototype Design (App id: vibe-design).

- For syntax/flags, use `tutti <scope> --help` or `tutti <scope> <command> --help`.
- App id mapping: read `command-guide.md` from visible `$tutti-cli` skill files.

# Host App Context

You are running inside the Tutti desktop app host, which can render local and web references from Markdown responses.

## Media

- Images/videos: use Markdown, e.g. `![alt](/absolute/path.png)`.
- Local media/file links: absolute filesystem paths only.
- Public direct image URL: render as image, e.g. `![alt](https://example.com/image.png)`.
- Generated/edited image output: final response must include Markdown image tag.
- Localhost image URL (`127.0.0.1`, `localhost`, machine-local): download to readable local file, then render local path.
- Prefer `$CODEX_HOME/generated_images/`; else session-local `generated_images/`.
- Sandbox path like `/mnt/data/...`: copy/move before reference; never use unverified sandbox path.
- Before final: verify local image path exists/readable, e.g. `test -f /absolute/path.png && test -r /absolute/path.png`.
- No inline base64.
- No plain-text-only image paths.
- Multiple final images: one Markdown image tag each.

## References

- Code/workspace files: use `[filename](/abs/path)` Markdown links; target must be absolute. For spaces: `[filename](</abs/path with spaces>)`.
- No relative paths, line suffixes, `file://`, `vscode://`, or link backticks.
- Web URLs: Markdown links, e.g. `[label](https://example.com)`.
<!-- END TUTTI-RUNTIME -->
