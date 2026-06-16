package workspace

import (
	"context"
	"errors"
	"testing"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

func TestSQLiteStoreWorkspaceAppsPersistPackagesAndInstallations(t *testing.T) {
	t.Parallel()

	store := openTestSQLiteStore(t)
	ctx := context.Background()

	if err := store.Create(ctx, workspacebiz.Summary{ID: "ws-apps", Name: "Workspace Apps"}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if err := store.PutAppPackage(ctx, workspacebiz.AppPackage{
		AppID:      "hello",
		Version:    "0.1.0",
		PackageDir: "/tmp/hello",
		Manifest: workspacebiz.AppManifest{
			SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
			AppID:         "hello",
			Version:       "0.1.0",
			Name:          "Hello",
			Description:   "Minimal app",
			Icon: workspacebiz.AppManifestIcon{
				Type: "asset",
				Src:  "icon.png",
			},
			Runtime: workspacebiz.AppManifestRuntime{
				Bootstrap:       "start.sh",
				HealthcheckPath: "/ready",
			},
		},
	}); err != nil {
		t.Fatalf("PutAppPackage() error = %v", err)
	}

	packages, err := store.ListAppPackages(ctx)
	if err != nil {
		t.Fatalf("ListAppPackages() error = %v", err)
	}
	if len(packages) != 1 || packages[0].AppID != "hello" || packages[0].PackageDir != "/tmp/hello" {
		t.Fatalf("ListAppPackages() = %#v", packages)
	}
	if packages[0].DisplayName() != "Hello" || packages[0].Description() != "Minimal app" || packages[0].Manifest.Runtime.HealthcheckPath != "/ready" || packages[0].ManifestJSON == "" {
		t.Fatalf("ListAppPackages() manifest = %#v", packages[0])
	}

	if err := store.PutWorkspaceAppInstallation(ctx, workspacebiz.AppInstallation{
		WorkspaceID: "ws-apps",
		AppID:       "hello",
		Enabled:     true,
	}); err != nil {
		t.Fatalf("PutWorkspaceAppInstallation() error = %v", err)
	}

	installations, err := store.ListWorkspaceAppInstallations(ctx, "ws-apps")
	if err != nil {
		t.Fatalf("ListWorkspaceAppInstallations() error = %v", err)
	}
	if len(installations) != 1 || installations[0].AppID != "hello" || !installations[0].Enabled {
		t.Fatalf("ListWorkspaceAppInstallations() = %#v", installations)
	}
	installationsByApp, err := store.ListWorkspaceAppInstallationsByApp(ctx, "hello")
	if err != nil {
		t.Fatalf("ListWorkspaceAppInstallationsByApp() error = %v", err)
	}
	if len(installationsByApp) != 1 || installationsByApp[0].WorkspaceID != "ws-apps" || !installationsByApp[0].Enabled {
		t.Fatalf("ListWorkspaceAppInstallationsByApp() = %#v", installationsByApp)
	}

	if err := store.DeleteWorkspaceAppInstallation(ctx, "ws-apps", "hello"); err != nil {
		t.Fatalf("DeleteWorkspaceAppInstallation() error = %v", err)
	}
	installations, err = store.ListWorkspaceAppInstallations(ctx, "ws-apps")
	if err != nil {
		t.Fatalf("ListWorkspaceAppInstallations() after delete error = %v", err)
	}
	if len(installations) != 0 {
		t.Fatalf("installations after delete = %#v, want empty", installations)
	}
	if err := store.DeleteWorkspaceAppInstallation(ctx, "ws-apps", "hello"); !errors.Is(err, ErrWorkspaceAppNotFound) {
		t.Fatalf("DeleteWorkspaceAppInstallation() missing error = %v", err)
	}
}

func TestSQLiteStoreDeleteAppPackageRemovesCatalogVersionsAndInstallations(t *testing.T) {
	t.Parallel()

	store := openTestSQLiteStore(t)
	ctx := context.Background()

	if err := store.Create(ctx, workspacebiz.Summary{ID: "ws-apps", Name: "Workspace Apps"}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	manifest := workspacebiz.AppManifest{
		SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
		AppID:         "local-app",
		Version:       "0.1.0",
		Name:          "Local App",
		Description:   "Local app",
		Runtime: workspacebiz.AppManifestRuntime{
			Bootstrap:       "start.sh",
			HealthcheckPath: "/ready",
		},
	}
	if err := store.PutAppPackage(ctx, workspacebiz.AppPackage{
		AppID:      manifest.AppID,
		Version:    manifest.Version,
		PackageDir: "/tmp/local-app-0.1.0",
		Manifest:   manifest,
		Source:     workspacebiz.AppPackageSourceGenerated,
	}); err != nil {
		t.Fatalf("PutAppPackage() first error = %v", err)
	}
	manifest.Version = "0.2.0"
	if err := store.PutAppPackage(ctx, workspacebiz.AppPackage{
		AppID:      manifest.AppID,
		Version:    manifest.Version,
		PackageDir: "/tmp/local-app-0.2.0",
		Manifest:   manifest,
		Source:     workspacebiz.AppPackageSourceGenerated,
	}); err != nil {
		t.Fatalf("PutAppPackage() second error = %v", err)
	}
	if err := store.PutWorkspaceAppInstallation(ctx, workspacebiz.AppInstallation{
		WorkspaceID: "ws-apps",
		AppID:       "local-app",
		Enabled:     true,
	}); err != nil {
		t.Fatalf("PutWorkspaceAppInstallation() error = %v", err)
	}

	if err := store.DeleteAppPackage(ctx, "local-app"); err != nil {
		t.Fatalf("DeleteAppPackage() error = %v", err)
	}
	if _, err := store.GetAppPackage(ctx, "local-app"); !errors.Is(err, ErrWorkspaceAppNotFound) {
		t.Fatalf("GetAppPackage() after delete error = %v, want ErrWorkspaceAppNotFound", err)
	}
	versions, err := store.ListAppPackageVersions(ctx, "local-app")
	if err != nil {
		t.Fatalf("ListAppPackageVersions() after delete error = %v", err)
	}
	if len(versions) != 0 {
		t.Fatalf("versions after delete = %#v, want empty", versions)
	}
	installations, err := store.ListWorkspaceAppInstallations(ctx, "ws-apps")
	if err != nil {
		t.Fatalf("ListWorkspaceAppInstallations() after delete error = %v", err)
	}
	if len(installations) != 0 {
		t.Fatalf("installations after delete = %#v, want empty", installations)
	}
}

func TestSQLiteStorePutAppPackageVersionDoesNotActivateVersion(t *testing.T) {
	t.Parallel()

	store := openTestSQLiteStore(t)
	ctx := context.Background()
	manifest := workspacebiz.AppManifest{
		SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
		AppID:         "remote-app",
		Version:       "1.0.0",
		Name:          "Remote App v1",
		Description:   "Remote app",
		Runtime: workspacebiz.AppManifestRuntime{
			Bootstrap:       "start.sh",
			HealthcheckPath: "/ready",
		},
	}
	if err := store.PutAppPackage(ctx, workspacebiz.AppPackage{
		AppID:      manifest.AppID,
		Version:    manifest.Version,
		PackageDir: "/tmp/remote-app-1.0.0",
		Manifest:   manifest,
		Source:     workspacebiz.AppPackageSourceBuiltin,
	}); err != nil {
		t.Fatalf("PutAppPackage() error = %v", err)
	}
	manifest.Version = "1.1.0"
	manifest.Name = "Remote App v2"
	if err := store.PutAppPackageVersion(ctx, workspacebiz.AppPackage{
		AppID:      manifest.AppID,
		Version:    manifest.Version,
		PackageDir: "/tmp/remote-app-1.1.0",
		Manifest:   manifest,
		Source:     workspacebiz.AppPackageSourceBuiltin,
	}); err != nil {
		t.Fatalf("PutAppPackageVersion() error = %v", err)
	}

	active, err := store.GetAppPackage(ctx, "remote-app")
	if err != nil {
		t.Fatalf("GetAppPackage() error = %v", err)
	}
	if active.Version != "1.0.0" {
		t.Fatalf("active version = %q, want 1.0.0", active.Version)
	}
	versions, err := store.ListAppPackageVersions(ctx, "remote-app")
	if err != nil {
		t.Fatalf("ListAppPackageVersions() error = %v", err)
	}
	if len(versions) != 2 {
		t.Fatalf("versions length = %d, want 2: %#v", len(versions), versions)
	}
	if err := store.SetActiveAppPackageVersion(ctx, "remote-app", "1.1.0"); err != nil {
		t.Fatalf("SetActiveAppPackageVersion() error = %v", err)
	}
	active, err = store.GetAppPackage(ctx, "remote-app")
	if err != nil {
		t.Fatalf("GetAppPackage() after activate error = %v", err)
	}
	if active.Version != "1.1.0" {
		t.Fatalf("active version after activate = %q, want 1.1.0", active.Version)
	}
}

func TestSQLiteStorePutAppPackageVersionCreatesInitialCatalogEntry(t *testing.T) {
	t.Parallel()

	store := openTestSQLiteStore(t)
	ctx := context.Background()
	manifest := workspacebiz.AppManifest{
		SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
		AppID:         "remote-app",
		Version:       "1.0.0",
		Name:          "Remote App",
		Description:   "Remote app",
		Runtime: workspacebiz.AppManifestRuntime{
			Bootstrap:       "start.sh",
			HealthcheckPath: "/ready",
		},
	}
	if err := store.PutAppPackageVersion(ctx, workspacebiz.AppPackage{
		AppID:      manifest.AppID,
		Version:    manifest.Version,
		PackageDir: "/tmp/remote-app-1.0.0",
		Manifest:   manifest,
		Source:     workspacebiz.AppPackageSourceBuiltin,
	}); err != nil {
		t.Fatalf("PutAppPackageVersion() error = %v", err)
	}
	active, err := store.GetAppPackage(ctx, "remote-app")
	if err != nil {
		t.Fatalf("GetAppPackage() error = %v", err)
	}
	if active.Version != "1.0.0" {
		t.Fatalf("active version = %q, want 1.0.0", active.Version)
	}
}
