# Agent Extensions

Status: current implemented architecture

Agent Extensions let independently released ACP agents integrate with Tutti
without adding provider-specific executable code to this repository. An
extension is declarative data: a manifest, discovery/tool/capability/composer
profiles, locale resources, and static assets.

## Trust And Distribution

Configured sources live in `config/tutti.defaults.json`. Each source pins an
agent key, HTTPS `versions.json` URL, feature flag, signing key ID, and Ed25519
public key. `tuttid` accepts only active compatible releases whose canonical
release JSON signature, artifact SHA-256, byte size, manifest identity, and
package contents all validate.

Release ZIPs are data-only. Installation rejects path traversal, symlinks,
executable regular files, unsupported file types, excessive entry counts, and
excessive compressed or expanded sizes. Directory entries may carry the normal
execute/search bits required to traverse them. The package may describe an exact
standard npm, pnpm, or uv runtime installation, but it never carries executable
code itself.

Each concrete Agent repository owns its reproducible archive, release signing,
versions generation, verification, and S3/CloudFront workflow. Tutti consumes
signed immutable releases but does not build or upload third-party Agent
artifacts. The provider-independent setup and release procedure lives in the
`tutti-os/tutti-agent-extension-skill` repository.

## Installation And Runtime Ownership

Verified installations are immutable and stored under:

```text
<state>/agent/extensions/<agentKey>/<version>/
<state>/agent/extensions/<agentKey>/active.json
```

The active record registers a system Agent Target with an
`agent_extension` launch reference fixed to `<agentKey>@<version>`. The Target
provides the cached icon and optional home hero image as data URLs, so renderer
code does not add presentation assets or provider branches for every extension.
Both assets originate in the verified package and remain pinned to the active
installation version.

At launch the runtime controller asks `AgentRuntimeResolver` for unknown
providers. The resolver verifies the fixed installation reference, evaluates
the declarative discovery profile, prefers a compatible runtime already on the
user's PATH, and creates the generic standard ACP adapter. It never loads
JavaScript, React, Go plugins, or native modules from the extension.

The generic adapter applies declarative tool aliases before canonical activity
normalization and maps composer permission semantics onto runtime permission
IDs. Standard ACP content diffs continue through the shared ACP diff
normalizer, so Gemini and future extensions do not add provider branches to
AgentGUI. Both standard ACP `models` state and legacy `configOptions` are
normalized into the shared composer model descriptor; the catalog remains
runtime-reported instead of being hardcoded for Gemini. A no-project composer
probe runs from the daemon-owned discovery directory under
`<state>/agent/discovery/<provider>`, because standard ACP session creation
requires a concrete working directory.

Extension-owned provider identities remain open metadata after an Agent Target
authorizes the launch. The shared provider registry validates their canonical
shape before activity events are created, so turn lifecycle and message events
retain identities such as `acp:gemini`; runtime authority still comes only from
the fixed `agent_extension` Target reference.

The standard ACP adapter stamps each turn transition with a sequenced,
adapter-origin lifecycle snapshot. Reporters and GUI consumers copy that
provider-independent snapshot, so completed, failed, and canceled extension
turns clear their active turn reference without requiring the extension
provider to be added to the built-in event projection catalog.

The current runtime adapter is cached by open provider ID for the daemon
lifetime. Sessions persist `agentTargetId` and resume re-derives the extension
installation from that Target. A session-pinned runtime/profile fingerprint is
still required before enabling automatic extension upgrades; until then,
sources remain feature-gated and releases are activated deliberately.

## Feature Gate And Failure Behavior

Disabled sources do not perform network requests and their system Target is
removed. When an enabled source cannot reach its index, a previously verified
active installation remains available. If no verified installation exists,
the source is not registered and `tuttid` logs one
`agent_extension.reconcile_failed` record with a JSON payload.

Project-scoped runtime installation, ACP readiness/auth probing, session-pinned
adapter cache keys, and full pre-session capability/composer projection remain
migration work. Until those controls are exposed through an explicit
user-confirmed action, extensions run only against a version-compatible local
runtime; `tuttid` does not silently modify a project.
