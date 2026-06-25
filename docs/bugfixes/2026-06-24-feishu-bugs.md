# 2026-06-24 Feishu Bug Records

## Wb7grfq2ZewOJfcB9wucxkHrnvb

- Link: https://ccn53rwonxso.feishu.cn/record/Wb7grfq2ZewOJfcB9wucxkHrnvb
- Record id: unavailable locally; the short `/record/...` link does not expose Base token/table id, no local bug-runner config was present, and the managed browser redirected to Feishu login.
- Bug: After a workspace app update/download, the dock entry could become disabled even though the app should remain actionable through restart-and-open.
- Evidence: `/Users/wwcome/Downloads/tutti-logs-20260624-204049.zip` shows `ai-doc` in `installed_pending_restart` with `enabled=true`, `installed=true`, `launchUrl=http://127.0.0.1:53807`, `version=0.1.16`, and `availableVersion=0.1.18`. The logs also repeatedly show `workspace app updated event publish failed` with `app.status is unsupported`.
- Cause: The desktop dock projection only treated `running` workspace apps as launch-enabled, so `installed_pending_restart` fell through to disabled. Separately, eventstream's hand-written workspace app status validator did not allow the schema/API-supported `installed_pending_restart` status, blocking update events for that state.
- Fix: Mark `installed_pending_restart` workspace apps as dock-launchable, route dock clicks for that state through the existing `restartAndOpenApp` flow, and allow `installed_pending_restart` in eventstream validation.
- Verification:
  - `node --import ./apps/desktop/test/register-asset-stub.mjs --test --experimental-strip-types ./apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterContribution.test.ts ./apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterDockProjection.test.ts`
  - `pnpm --filter @tutti-os/workspace-app-center test`
  - `go test ./services/tuttid/service/eventstream`
  - `pnpm --filter @tutti-os/desktop typecheck`
- Status: fixed locally
- Commit: this commit
- Feishu status update: not performed because the short record link could not be resolved to a writable Base record without Base token/table id or an authenticated browser session.
