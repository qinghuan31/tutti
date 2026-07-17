# Workspace App Center

Host-neutral workspace app center contracts, validation, status mapping, view-model derivation, shared React UI, and package i18n defaults.

The package does not construct daemon clients, access desktop preload APIs, resolve host paths, spawn processes, or register workbench or dock contributions.

## View State

`WorkspaceAppCenterViewState` preserves the selected app tab and may include an
`openAppId`. Hosts can use that id to replace the app list with the running app
in the same presentation region, then clear it to return to the preserved list.
The package only owns this host-neutral state contract; rendering and webview
lifecycle remain host responsibilities.

## Developer Sources

Developer/source presentation is host-controlled. `AppCenterPanel` and
`AppCard` accept `showDeveloperSources`, default it to `false`, and render the
developer/source row from app metadata only when enabled. The shared package
does not own the preference or persistence policy.

Desktop owns the `showAppDeveloperSources` preference, persists it through the
desktop-preferences service, and passes the resulting value into the App Center
pane. Keep preference UI, daemon storage, and host-specific source links out of
this package.
