package builtinapps

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
	"github.com/tutti-os/tutti/services/tuttid/service/cli/appcli"
)

func TestCatalogLoadsRemoteAppsFromFile(t *testing.T) {
	t.Setenv(remoteCatalogURLEnv, "")
	catalogPath := filepath.Join(t.TempDir(), "catalog.json")
	if err := os.WriteFile(catalogPath, []byte(`{
		"schemaVersion": "tutti.app.catalog.v1",
		"apps": [
			{
				"manifest": {
					"schemaVersion": "tutti.app.manifest.v1",
					"appId": "remote-design",
					"version": "0.1.0",
					"name": "Remote Design",
					"description": "Design workspace",
						"icon": {"type": "asset", "src": "icon.svg"},
						"runtime": {"bootstrap": "bootstrap.sh", "healthcheckPath": "/healthz"}
				},
				"distribution": {
					"kind": "remote",
					"artifactUrl": "https://cdn.example.test/apps/remote-design/remote-design.zip",
					"artifactSha256": "abc123",
					"iconUrl": "https://cdn.example.test/apps/remote-design/icon.svg"
				}
			}
		]
	}`), 0o644); err != nil {
		t.Fatalf("write catalog: %v", err)
	}
	t.Setenv(remoteCatalogFileEnv, catalogPath)

	apps, err := Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	app := findCatalogAppForTest(apps, "remote-design")
	if app == nil {
		t.Fatalf("remote app missing from catalog: %#v", apps)
	}
	if app.Distribution.Kind != DistributionRemote || app.Distribution.IconURL == "" {
		t.Fatalf("remote app distribution = %#v", app.Distribution)
	}
}

func TestCatalogReturnsExplicitFileErrors(t *testing.T) {
	t.Setenv(remoteCatalogURLEnv, "")
	t.Setenv(remoteCatalogFileEnv, filepath.Join(t.TempDir(), "missing-catalog.json"))

	if _, err := Catalog(); err == nil {
		t.Fatal("Catalog() error = nil, want missing catalog file error")
	}
}

func TestCatalogLoadsRemoteAppsFromURL(t *testing.T) {
	t.Setenv(remoteCatalogFileEnv, "")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"schemaVersion": "tutti.app.catalog.v1",
			"apps": [
				{
					"manifest": {
						"schemaVersion": "tutti.app.manifest.v1",
						"appId": "remote-tool",
						"version": "1.2.3",
						"name": "Remote Tool",
						"description": "Remote tool",
							"icon": {"type": "asset", "src": "icon.png"},
							"runtime": {"bootstrap": "bootstrap.sh", "healthcheckPath": "/"}
					},
					"distribution": {
						"kind": "remote",
						"artifactUrl": "https://cdn.example.test/apps/remote-tool/remote-tool.zip",
						"artifactSha256": "def456",
						"iconUrl": "https://cdn.example.test/apps/remote-tool/icon.png"
					}
				}
			]
		}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv(remoteCatalogURLEnv, server.URL+"/catalog.json")

	snapshot, err := Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if snapshot.RemoteCatalog.Status != RemoteCatalogLoadStatusLoading {
		t.Fatalf("remote catalog status = %q, want loading", snapshot.RemoteCatalog.Status)
	}
	if app := findCatalogAppForTest(snapshot.Apps, "remote-tool"); app != nil {
		t.Fatalf("remote app loaded synchronously: %#v", app)
	}

	snapshot = waitForCatalogStatusForTest(t, RemoteCatalogLoadStatusReady)
	if snapshot.RemoteCatalog.LastError != "" {
		t.Fatalf("remote catalog last error = %q, want empty", snapshot.RemoteCatalog.LastError)
	}
	if app := findCatalogAppForTest(snapshot.Apps, "remote-tool"); app == nil {
		t.Fatalf("remote app missing from catalog: %#v", snapshot.Apps)
	}
}

func TestCatalogRetriesRemoteURLFetch(t *testing.T) {
	t.Setenv(remoteCatalogFileEnv, "")
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		if requests.Add(1) < remoteCatalogFetchAttempts {
			http.Error(writer, "unavailable", http.StatusServiceUnavailable)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"schemaVersion": "tutti.app.catalog.v1",
			"apps": [
				{
					"manifest": {
						"schemaVersion": "tutti.app.manifest.v1",
						"appId": "retry-tool",
						"version": "1.2.3",
						"name": "Retry Tool",
						"description": "Retry tool",
							"icon": {"type": "asset", "src": "icon.png"},
							"runtime": {"bootstrap": "bootstrap.sh", "healthcheckPath": "/"}
					},
					"distribution": {
						"kind": "remote",
						"artifactUrl": "https://cdn.example.test/apps/retry-tool/retry-tool.zip",
						"artifactSha256": "def456",
						"iconUrl": "https://cdn.example.test/apps/retry-tool/icon.png"
					}
				}
			]
		}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv(remoteCatalogURLEnv, server.URL+"/catalog.json")

	snapshot, err := RefreshRemoteCatalog()
	if err != nil {
		t.Fatalf("RefreshRemoteCatalog() error = %v", err)
	}
	if snapshot.RemoteCatalog.Status != RemoteCatalogLoadStatusLoading {
		t.Fatalf("remote catalog status = %q, want loading", snapshot.RemoteCatalog.Status)
	}

	snapshot = waitForCatalogStatusForTest(t, RemoteCatalogLoadStatusReady)
	if got := requests.Load(); got != remoteCatalogFetchAttempts {
		t.Fatalf("remote catalog requests = %d, want %d", got, remoteCatalogFetchAttempts)
	}
	if app := findCatalogAppForTest(snapshot.Apps, "retry-tool"); app == nil {
		t.Fatalf("retry-loaded remote app missing from catalog: %#v", snapshot.Apps)
	}
}

func TestCatalogDefaultURLDoesNotFallBackToLegacyURL(t *testing.T) {
	var requests atomic.Int32
	var legacyRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		switch request.URL.Path {
		case "/tutti/catalog.json":
			http.Error(writer, "not migrated yet", http.StatusForbidden)
		case "/nextop/catalog.json":
			legacyRequests.Add(1)
			http.Error(writer, "legacy catalog must not be requested", http.StatusInternalServerError)
		default:
			http.NotFound(writer, request)
		}
	}))
	t.Cleanup(server.Close)

	apps, err := fetchRemoteCatalogWithFallbacks([]string{
		server.URL + "/tutti/catalog.json",
	})
	if err == nil {
		t.Fatalf("fetchRemoteCatalogWithFallbacks() error = nil, apps = %#v", apps)
	}
	if requests.Load() != 1 {
		t.Fatalf("catalog requests = %d, want 1", requests.Load())
	}
	if legacyRequests.Load() != 0 {
		t.Fatalf("legacy catalog requests = %d, want 0", legacyRequests.Load())
	}
}

func TestCatalogKeepsEmbeddedAppsWhenRemoteURLFails(t *testing.T) {
	t.Setenv(remoteCatalogFileEnv, "")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "unavailable", http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	t.Setenv(remoteCatalogURLEnv, server.URL+"/catalog.json")

	apps, err := Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	if app := findCatalogAppForTest(apps, "automation"); app == nil {
		t.Fatalf("embedded automation app missing from catalog: %#v", apps)
	} else if app.Manifest.CLI == nil || app.Manifest.CLI.Manifest != "tutti.cli.json" {
		t.Fatalf("embedded automation cli manifest = %#v, want tutti.cli.json", app.Manifest.CLI)
	}

	snapshot := waitForCatalogStatusForTest(t, RemoteCatalogLoadStatusFailed)
	if snapshot.RemoteCatalog.LastError == "" {
		t.Fatal("remote catalog last error is empty, want failure details")
	}
	if app := findCatalogAppForTest(snapshot.Apps, "automation"); app == nil {
		t.Fatalf("embedded automation app missing from failed snapshot: %#v", snapshot.Apps)
	}
}

func TestEmbeddedAutomationCLIManifestIsValid(t *testing.T) {
	t.Setenv(remoteCatalogURLEnv, "")

	apps, err := Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	app := findCatalogAppForTest(apps, "automation")
	if app == nil {
		t.Fatalf("embedded automation app missing from catalog: %#v", apps)
	}
	if app.Manifest.CLI == nil {
		t.Fatal("embedded automation cli manifest is nil")
	}
	packageDir := t.TempDir()
	if err := CopyTo(*app, packageDir); err != nil {
		t.Fatalf("CopyTo() error = %v", err)
	}
	manifest, err := appcli.ReadManifest(filepath.Join(packageDir, app.Manifest.CLI.Manifest))
	if err != nil {
		t.Fatalf("ReadManifest() error = %v", err)
	}
	if manifest.Scope != "automation" || len(manifest.Commands) != 8 {
		t.Fatalf("automation cli manifest = %#v, want scope automation with 8 commands", manifest)
	}
	if manifest.Documentation == nil || manifest.Documentation.File != "COMMANDS.md" {
		t.Fatalf("automation cli documentation = %#v, want COMMANDS.md", manifest.Documentation)
	}
	if _, err := os.Stat(filepath.Join(packageDir, "COMMANDS.md")); err != nil {
		t.Fatalf("automation command documentation missing from copied package: %v", err)
	}
}

func TestRemoteCatalogURLDefaultsToPublishedCatalog(t *testing.T) {
	previousValue, hadPreviousValue := os.LookupEnv(remoteCatalogURLEnv)
	t.Cleanup(func() {
		if hadPreviousValue {
			_ = os.Setenv(remoteCatalogURLEnv, previousValue)
			return
		}
		_ = os.Unsetenv(remoteCatalogURLEnv)
	})
	_ = os.Unsetenv(remoteCatalogURLEnv)

	if got := remoteCatalogURL(); got != defaultRemoteCatalogURL {
		t.Fatalf("remoteCatalogURL() = %q, want %q", got, defaultRemoteCatalogURL)
	}

	_ = os.Setenv(remoteCatalogURLEnv, "")
	if got := remoteCatalogURL(); got != "" {
		t.Fatalf("remoteCatalogURL() with empty override = %q, want empty", got)
	}

	override := "https://cdn.example.test/catalog.json"
	_ = os.Setenv(remoteCatalogURLEnv, override)
	if got := remoteCatalogURL(); got != override {
		t.Fatalf("remoteCatalogURL() with override = %q, want %q", got, override)
	}
}

func TestCatalogPrefersEmbeddedAppIDOverRemoteCatalog(t *testing.T) {
	t.Setenv(remoteCatalogURLEnv, "")
	catalogPath := filepath.Join(t.TempDir(), "catalog.json")
	manifest := remoteCatalogManifestForTest("automation")
	document := remoteCatalogDocument{
		SchemaVersion: remoteCatalogSchemaVersionV1,
		Apps: []remoteCatalogApp{{
			Manifest: manifest,
			Distribution: remoteDistribution{
				Kind:           string(DistributionRemote),
				ArtifactURL:    "https://cdn.example.test/automation.zip",
				ArtifactSHA256: "abc123",
				IconURL:        "https://cdn.example.test/automation.png",
			},
		}},
	}
	data, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("marshal catalog: %v", err)
	}
	if err := os.WriteFile(catalogPath, data, 0o644); err != nil {
		t.Fatalf("write catalog: %v", err)
	}
	t.Setenv(remoteCatalogFileEnv, catalogPath)

	apps, err := Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	var matchingApps []App
	for _, app := range apps {
		if app.Manifest.AppID == "automation" {
			matchingApps = append(matchingApps, app)
		}
	}
	if len(matchingApps) != 1 {
		t.Fatalf("automation entries = %#v, want exactly one embedded entry", matchingApps)
	}
	if matchingApps[0].Distribution.Kind != DistributionEmbedded {
		t.Fatalf("automation distribution = %#v, want embedded", matchingApps[0].Distribution)
	}
}

func TestParseRemoteCatalogRequiresIconURLAndManifestIcon(t *testing.T) {
	manifest := remoteCatalogManifestForTest("remote-tool")
	document := remoteCatalogDocument{
		SchemaVersion: remoteCatalogSchemaVersionV1,
		Apps: []remoteCatalogApp{{
			Manifest: manifest,
			Distribution: remoteDistribution{
				Kind:           string(DistributionRemote),
				ArtifactURL:    "https://cdn.example.test/remote-tool.zip",
				ArtifactSHA256: "abc123",
			},
		}},
	}
	data, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("marshal catalog: %v", err)
	}
	if _, err := parseRemoteCatalog(data); err == nil {
		t.Fatal("parseRemoteCatalog() error = nil, want missing iconUrl error")
	}

	manifest.Icon = workspacebiz.AppManifestIcon{}
	document.Apps[0].Manifest = manifest
	document.Apps[0].Distribution.IconURL = "https://cdn.example.test/icon.png"
	data, err = json.Marshal(document)
	if err != nil {
		t.Fatalf("marshal catalog: %v", err)
	}
	if _, err := parseRemoteCatalog(data); err == nil {
		t.Fatal("parseRemoteCatalog() error = nil, want missing manifest icon error")
	}
}

func remoteCatalogManifestForTest(appID string) workspacebiz.AppManifest {
	return workspacebiz.AppManifest{
		SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
		AppID:         appID,
		Version:       "0.1.0",
		Name:          "Remote App",
		Description:   "Remote app",
		Icon: workspacebiz.AppManifestIcon{
			Type: "asset",
			Src:  "icon.png",
		},
		Runtime: workspacebiz.AppManifestRuntime{
			Bootstrap:       "bootstrap.sh",
			HealthcheckPath: "/",
		},
	}
}

func findCatalogAppForTest(apps []App, appID string) *App {
	for index := range apps {
		if apps[index].Manifest.AppID == appID {
			return &apps[index]
		}
	}
	return nil
}

func waitForCatalogStatusForTest(t *testing.T, status RemoteCatalogLoadStatus) CatalogSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		snapshot, err := Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		if snapshot.RemoteCatalog.Status == status {
			return snapshot
		}
		if time.Now().After(deadline) {
			t.Fatalf("remote catalog status = %q, want %q", snapshot.RemoteCatalog.Status, status)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
