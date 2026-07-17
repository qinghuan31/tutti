---
goal: "Move desktop stable and RC update discovery to the existing CloudFront static release feed so Draft RC packages remain updateable."
version: "1.0"
date_created: "2026-07-13"
last_updated: "2026-07-13"
owner: "Tutti desktop"
status: "In progress"
tags: [refactor, desktop, electron-updater, release, s3, cloudfront, rc]
---

# Introduction

![Status: In%20progress](https://img.shields.io/badge/status-In%20progress-yellow)

The desktop release workflow already uploads signed assets and updater YAML to
CloudFront-backed S3 paths. Stable writes `<base>/latest.json`; RC writes
`<base>/channels/rc/latest.json`; each immutable `<base>/<tag>/` directory
contains the channel YAML and ZIP required by `electron-updater`.

The desktop application still uses GitHub as its updater provider. Its custom
fallback reads the public GitHub Releases Atom feed for legacy
`tutti-desktop-v*` tags, but Draft RC releases are intentionally absent from
that feed. This refactor makes the static release metadata the single runtime
discovery source without making RC GitHub Releases public or changing release
ordering.

Implementation is complete in the accompanying change set. The remaining
release-environment verification is the Draft RC and stable acceptance path in
TEST-005 and TEST-006, which can run only after a signed release is produced.

## 1. Requirements & Constraints

- **REQ-001**: Resolve stable update metadata from `<base>/latest.json`.
- **REQ-002**: Resolve RC update metadata from
  `<base>/channels/rc/latest.json`, independently of GitHub Draft visibility.
- **REQ-003**: Before every `electron-updater` check, set a generic provider
  URL to the validated immutable version directory, then let the updater read
  `latest-mac.yml` for stable or `rc-mac.yml` for RC.
- **REQ-004**: Preserve the current update IPC state model, update policy,
  scheduled checks, manual/automatic download behavior, and macOS support
  guard.
- **REQ-005**: Surface invalid static metadata as the existing update error
  state; do not fall back to GitHub Releases.
- **SEC-001**: Accept only HTTPS metadata whose normalized base URL equals the
  packaged CloudFront release prefix; require the selected channel, tag, and
  semantic version to agree before setting a feed URL.
- **CON-001**: Support only existing application channels `stable` and `rc`.
  Beta metadata remains producer-only until the settings contract exposes it.
- **CON-002**: Keep concrete stable releases and the `stable` alias public;
  keep RC and beta GitHub Releases as Draft.
- **CON-003**: Do not change GitHub Release ordering, Feishu notification,
  asset direct-download links, or the floating `stable` alias in this work.
- **CON-004**: Treat `latest.json` as a locator only. Download integrity and
  code-signing verification remain `electron-updater` responsibilities.
- **CON-005**: The production CloudFront prefix is a public packaged
  compatibility endpoint, not a user-supplied runtime environment variable.

## 2. Implementation Steps

### Implementation Phase 1 — Define the static-feed resolver

- **GOAL-001**: Create a validated, deterministic mapping from the selected
  application channel to its metadata pointer and immutable generic feed URL.

| Task     | Description                                                                                                                                                                                                                                                                                                                                              | Completed | Date |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-001 | Add `apps/desktop/src/main/update/desktopReleaseFeed.ts`. Export one production CloudFront base URL constant, normalize it without a trailing slash, and map `stable` to `/latest.json` and `rc` to `/channels/rc/latest.json`.                                                                                                                          |           |      |
| TASK-002 | In `desktopReleaseFeed.ts`, implement a resolver using `outboundFetch` that parses the producer schema `tutti.desktop.release.latest.v1` emitted by `apps/desktop/scripts/build-release-latest.mjs`. Return `{ feedUrl, updaterChannel, version, tag, releasedAt }`, where `feedUrl` is `<base>/<encoded-tag>` and `updaterChannel` is `latest` or `rc`. |           |      |
| TASK-003 | Reject non-object JSON, an unknown schema, empty tag/version, a non-HTTPS or different base URL, a selected-channel mismatch, and a tag/version semantic-version mismatch before any feed configuration occurs.                                                                                                                                          |           |      |
| TASK-004 | Add `apps/desktop/src/main/update/desktopReleaseFeed.test.ts` with fixtures for stable/RC resolution, URL normalization/encoding, malformed JSON, invalid schema, wrong origin, wrong channel, and invalid tag/version pairs.                                                                                                                            |           |      |

### Implementation Phase 2 — Configure Electron before checking

- **GOAL-002**: Replace GitHub discovery with the static-feed resolver while
  retaining the existing user-visible update lifecycle.

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                    | Completed | Date |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-005 | Extend the internal `AppUpdateDriver` in `apps/desktop/src/main/update/appUpdateService.ts` with `setFeedUrl(url: string): void`. Implement it in `createElectronAppUpdateDriver` using `autoUpdater.setFeedURL({ provider: "generic", url })`; extend the fake driver in the companion test to capture calls.                                                                                 |           |      |
| TASK-006 | Replace the `prefixedReleaseResolver` option and `activeCheckCanUsePrefixedFallback` state with an injectable static-feed resolver. In the existing single-flight `checkForUpdates` path, resolve metadata and invoke `setFeedUrl` before `resolvedDriver.checkForUpdates()`. Preserve the configured updater channel, prerelease permission, auto-download flags, and `forceDevUpdateConfig`. |           |      |
| TASK-007 | Route resolver errors through `applyUpdaterError`, clear the single-flight promise, and return/throw consistently with current failed checks. Do not invoke GitHub after a static pointer failure and do not preserve a stale `available` result.                                                                                                                                              |           |      |
| TASK-008 | Remove `apps/desktop/src/main/update/prefixedDesktopReleaseResolver.ts`, its test file, the Atom parsing/version comparison helpers used only by it, and the special “No published versions on GitHub” logger suppression.                                                                                                                                                                     |           |      |
| TASK-009 | Update `apps/desktop/src/main/update/appUpdateService.test.ts` to assert stable and RC feed URLs are configured before `checkForUpdates`, resolver failure produces `error`, concurrent checks share one resolver call, and no legacy GitHub fallback runs.                                                                                                                                    |           |      |

### Implementation Phase 3 — Align packaged configuration and release contract

- **GOAL-003**: Ensure packaged updater configuration, workflow publication,
  and operator documentation describe the same static-feed architecture.

| Task     | Description                                                                                                                                                                                                                                                    | Completed | Date |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-010 | Change the `build.publish` entry in `apps/desktop/package.json` from GitHub to the production generic CloudFront base. The generated `app-update.yml` must describe the same provider that runtime checks override to an immutable tag directory.              |           |      |
| TASK-011 | Extend `tools/scripts/desktop-release-config.test.mjs` to assert the release workflow uploads immutable assets and generated updater YAML before publishing stable `latest.json` or RC `channels/rc/latest.json`, and retains the RC pointer publication path. |           |      |
| TASK-012 | Modify `.github/workflows/desktop-release.yml` only if TASK-011 exposes a missing ordering guarantee; preserve its existing asset upload and 60-second pointer-cache behavior otherwise.                                                                       |           |      |
| TASK-013 | Update `docs/conventions/desktop-release.md` to state that the desktop runtime consumes the stable/RC static pointers, that Draft RC is expected, and that operators must validate the pointer, YAML, and ZIP before announcing a release.                     |           |      |

## 3. Alternatives

- **ALT-001**: Publish RC GitHub Releases. Rejected because it conflicts with
  the deliberately private prerelease policy and recreates the public release
  list ordering problem.
- **ALT-002**: Keep the GitHub Atom/API fallback. Rejected because Draft
  releases are not a reliable public discovery source and current tags no
  longer match its legacy prefix.
- **ALT-003**: Mirror `rc-mac.yml` at the mutable CloudFront root. Rejected
  because it introduces cache and channel-collision risk; a short-lived JSON
  pointer followed by an immutable tag directory is auditable and safe.
- **ALT-004**: Build a new update backend service. Deferred because existing
  CloudFront storage, release metadata, updater YAML, and signed artifacts
  already satisfy the discovery requirement.
- **ALT-005**: Use GitHub for stable and static discovery only for RC.
  Rejected because two discovery systems produce different availability and
  error behavior.

## 4. Dependencies

- **DEP-001**: The public production CloudFront release prefix remains
  available over HTTPS and backward compatible for installed clients.
- **DEP-002**: `.github/workflows/desktop-release.yml` continues to upload
  versioned assets and `*-mac.yml` before mutating a channel pointer.
- **DEP-003**: `electron-updater` supports a generic provider configured with
  `setFeedURL`; the currently pinned package version is `^6.8.3`.
- **DEP-004**: macOS release packaging continues to generate signed ZIP and
  channel-specific updater YAML files.

## 5. Files

- **FILE-001**: `apps/desktop/src/main/update/desktopReleaseFeed.ts` — new
  resolver, metadata type, validation, pointer URL mapping, and feed URL
  construction.
- **FILE-002**: `apps/desktop/src/main/update/desktopReleaseFeed.test.ts` —
  new unit tests for resolver behavior and validation failures.
- **FILE-003**: `apps/desktop/src/main/update/appUpdateService.ts` — driver
  feed operation, resolver integration, and removal of GitHub fallback.
- **FILE-004**: `apps/desktop/src/main/update/appUpdateService.test.ts` —
  integration tests for feed-before-check and update-state errors.
- **FILE-005**: `apps/desktop/src/main/update/prefixedDesktopReleaseResolver.ts`
  — delete obsolete GitHub Atom resolver.
- **FILE-006**: `apps/desktop/src/main/update/prefixedDesktopReleaseResolver.test.ts`
  — delete obsolete resolver tests.
- **FILE-007**: `apps/desktop/package.json` — change packaged publish provider
  from GitHub to generic static feed.
- **FILE-008**: `tools/scripts/desktop-release-config.test.mjs` — assert static
  release publication ordering.
- **FILE-009**: `.github/workflows/desktop-release.yml` — only change if the
  workflow test identifies a missing producer guarantee.
- **FILE-010**: `docs/conventions/desktop-release.md` — document consumer
  behavior and release verification.

## 6. Testing

- **TEST-001**: Run narrowed desktop tests for `desktopReleaseFeed` and
  `appUpdateService`; verify static pointer resolution and feed-before-check
  behavior for both channels.
- **TEST-002**: Run `pnpm --filter @tutti-os/desktop typecheck` after changing
  the driver and resolver interfaces.
- **TEST-003**: Run `node --test tools/scripts/desktop-release-latest.test.mjs tools/scripts/desktop-release-config.test.mjs` to verify producer schema and workflow invariants.
- **TEST-004**: Run `pnpm lint` and the repository’s changed-aware validation
  lane for affected desktop/workflow files.
- **TEST-005**: Publish a Draft RC in the release environment and verify HTTP
  200 for `channels/rc/latest.json`, `<tag>/rc-mac.yml`, and the referenced ZIP;
  install the preceding RC and confirm it discovers, downloads, and installs
  without GitHub Releases access.
- **TEST-006**: Publish a stable build and repeat TEST-005 using `latest.json`
  and `latest-mac.yml`; use an invalid-pointer test fixture to confirm the UI
  enters `error` rather than falling back to GitHub or accepting an arbitrary
  URL.

## 7. Risks & Assumptions

- **RISK-001**: The mutable pointer can be visible briefly before a CDN edge
  observes its newly uploaded dependencies. Mitigate by publishing immutable
  assets/YAML first, retaining the current 60-second pointer cache, and relying
  on scheduled retries.
- **RISK-002**: Moving the CloudFront prefix would strand already-installed
  clients. Treat it as a compatibility endpoint; keep the old endpoint or ship
  a bridge release before any move.
- **RISK-003**: A malformed pointer could select an unintended feed. Validate
  HTTPS, exact base prefix, selected channel, and tag/version consistency;
  retain platform signing verification for binaries.
- **ASSUMPTION-001**: The first build containing this refactor may need to be
  installed by RC testers from the existing direct-download/Feishu route,
  because older installed clients still use GitHub discovery.
- **ASSUMPTION-002**: macOS is the active release target. The resolver is
  platform-neutral, but Windows/Linux acceptance must wait until those updater
  YAML and artifact paths are published.

## 8. Related Specifications / Further Reading

- `docs/conventions/desktop-release.md`
- `.github/workflows/desktop-release.yml`
- `apps/desktop/scripts/build-release-latest.mjs`
- `apps/desktop/src/main/update/appUpdateService.ts`
- [electron-updater AppUpdater API](https://www.electron.build/docs/api/electron-updater.class.appupdater/)
