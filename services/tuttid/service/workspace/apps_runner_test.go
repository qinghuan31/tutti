package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

func TestAppRunnerStartsHealthyAppWithWorkspaceScopedCwdAndInjectedDirs(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3 is required for runner happy path test")
	}

	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	packageDir := filepath.Join(root, "package")
	runtimeDir := filepath.Join(root, "runtime")
	dataDir := filepath.Join(root, "data")
	logDir := filepath.Join(root, "logs")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
echo runner-started
exec "$TUTTI_APP_PYTHON" "$TUTTI_APP_PACKAGE_DIR/server.py"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "server.py"), []byte(pythonAppReadyServerScript("/ready", true)), 0o644); err != nil {
		t.Fatalf("WriteFile(server.py) error = %v", err)
	}

	t.Setenv(tuttiAppRuntimeRootEnv, createManagedAppRuntimeFixture(t, root))
	t.Setenv("TUTTI_ENV", "production")
	t.Setenv("TUTTI_STATE_DIR", stateRoot)
	runner := &AppRunner{HealthcheckTimeout: 10 * time.Second}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-runner",
		WorkspaceName:   "Runner Workspace",
		WorkspaceRoot:   root,
		AppID:           "hello",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      runtimeDir,
		DataDir:         dataDir,
		LogDir:          logDir,
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "hello")
	})
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing, lastError=%v", state.Status, state.LastError)
	}
	state = waitForRunnerStatus(t, runner, "ws-runner", "hello", workspacebiz.AppRuntimeStatusRunning)
	if state.LaunchURL == nil || !strings.HasPrefix(*state.LaunchURL, "http://127.0.0.1:") {
		t.Fatalf("LaunchURL = %v", state.LaunchURL)
	}
	if state.Port == nil || *state.Port <= 0 {
		t.Fatalf("Port = %v", state.Port)
	}

	probePath := filepath.Join(dataDir, "probe.json")
	probe, err := os.ReadFile(probePath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", probePath, err)
	}
	var probeValues map[string]string
	if err := json.Unmarshal(probe, &probeValues); err != nil {
		t.Fatalf("Unmarshal(probe) error = %v", err)
	}
	if samePath(t, probeValues["cwd"], runtimeDir) == false {
		t.Fatalf("probe cwd = %q, want %q", probeValues["cwd"], runtimeDir)
	}
	for key, want := range map[string]string{
		"packageDir":    packageDir,
		"runtimeDir":    runtimeDir,
		"dataDir":       dataDir,
		"logDir":        logDir,
		"toolchainRoot": filepath.Join(stateRoot, "app-toolchains"),
		"workspaceRoot": root,
	} {
		if probeValues[key] != want {
			t.Fatalf("probe[%s] = %q, want %q", key, probeValues[key], want)
		}
	}
	for key, want := range map[string]string{
		"appId":         "hello",
		"workspaceId":   "ws-runner",
		"workspaceName": "Runner Workspace",
		"appHost":       "127.0.0.1",
		"appBaseUrl":    *state.LaunchURL,
	} {
		if probeValues[key] != want {
			t.Fatalf("probe[%s] = %q, want %q", key, probeValues[key], want)
		}
	}
	wantCLIPath := filepath.Join(stateRoot, "bin", "tutti")
	if probeValues["tuttiCli"] != wantCLIPath {
		t.Fatalf("probe[tuttiCli] = %q, want %q", probeValues["tuttiCli"], wantCLIPath)
	}
	pathDirs := filepath.SplitList(probeValues["path"])
	if len(pathDirs) == 0 || pathDirs[0] != filepath.Dir(wantCLIPath) {
		t.Fatalf("probe[path] = %q, want tutti CLI shim dir first", probeValues["path"])
	}

	logData, err := os.ReadFile(filepath.Join(logDir, "runtime.log"))
	if err != nil {
		t.Fatalf("ReadFile(runtime.log) error = %v", err)
	}
	if !strings.Contains(string(logData), "runner-started") {
		t.Fatalf("runtime.log = %q, want runner output", string(logData))
	}
	if !strings.Contains(string(logData), "tutti workspace app startup") || !strings.Contains(string(logData), "workspaceRoot="+root) {
		t.Fatalf("runtime.log = %q, want startup diagnostic", string(logData))
	}
	if !strings.Contains(string(logData), "python=") || !strings.Contains(string(logData), "node=") {
		t.Fatalf("runtime.log = %q, want managed runtime diagnostic", string(logData))
	}

	stopped, err := runner.Stop(context.Background(), "ws-runner", "hello")
	if err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if stopped.Status != workspacebiz.AppRuntimeStatusIdle {
		t.Fatalf("Stop() status = %q, want idle", stopped.Status)
	}
}

func TestAppBootstrapCommandUsesNodeForWindowsNodeStaticPackage(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows node-static bootstrap test")
	}

	for _, relativeEntrypoint := range []string{
		"server.mjs",
		filepath.Join("server", "server.js"),
		filepath.Join("server", "dist", "main.js"),
	} {
		t.Run(relativeEntrypoint, func(t *testing.T) {
			packageDir := t.TempDir()
			bootstrapPath := filepath.Join(packageDir, "bootstrap.sh")
			entrypoint := filepath.Join(packageDir, relativeEntrypoint)
			if err := os.MkdirAll(filepath.Dir(entrypoint), 0o755); err != nil {
				t.Fatalf("MkdirAll(entrypoint parent) error = %v", err)
			}
			if err := os.WriteFile(bootstrapPath, []byte("#!/bin/sh\n"), 0o644); err != nil {
				t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
			}
			if err := os.WriteFile(entrypoint, []byte("console.log('ready');\n"), 0o644); err != nil {
				t.Fatalf("WriteFile(entrypoint) error = %v", err)
			}

			command, err := appBootstrapCommand(
				AppStartInput{PackageDir: packageDir, RuntimeProfile: "node-static"},
				ResolvedAppRuntime{Node: `C:\\Program Files\\Tutti\\Tutti.exe`},
				bootstrapPath,
			)
			if err != nil {
				t.Fatalf("appBootstrapCommand() error = %v", err)
			}
			if command.Path != `C:\\Program Files\\Tutti\\Tutti.exe` {
				t.Fatalf("Path = %q", command.Path)
			}
			if len(command.Args) != 2 || command.Args[1] != entrypoint {
				t.Fatalf("Args = %#v, want Node entrypoint command", command.Args)
			}
		})
	}
}

func TestAppBootstrapCommandUsesWindowsCompanionForShellBootstrap(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows companion bootstrap test")
	}

	packageDir := t.TempDir()
	bootstrapPath := filepath.Join(packageDir, "bootstrap.sh")
	companionPath := filepath.Join(packageDir, "bootstrap.cmd")
	if err := os.WriteFile(bootstrapPath, []byte("#!/bin/sh\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}
	if err := os.WriteFile(companionPath, []byte("@echo off\r\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(bootstrap.cmd) error = %v", err)
	}
	command, err := appBootstrapCommand(
		AppStartInput{PackageDir: packageDir, RuntimeProfile: workspaceAppStandaloneRuntimeProfile},
		ResolvedAppRuntime{},
		bootstrapPath,
	)
	if err != nil {
		t.Fatalf("appBootstrapCommand() error = %v", err)
	}
	if command.Path != companionPath {
		t.Fatalf("Path = %q", command.Path)
	}
	if len(command.Args) != 1 || command.Args[0] != companionPath {
		t.Fatalf("command = %#v, want companion %q", command.Args, companionPath)
	}
}

func TestAppBootstrapCommandSupervisesAICanvasProcessesOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows AI Canvas bootstrap test")
	}

	packageDir := t.TempDir()
	for _, relativePath := range []string{
		"bootstrap.sh",
		filepath.Join("server", "worker.js"),
		filepath.Join("server", "server.js"),
	} {
		path := filepath.Join(packageDir, relativePath)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll(%s) error = %v", relativePath, err)
		}
		if err := os.WriteFile(path, []byte("console.log('ready');\n"), 0o644); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", relativePath, err)
		}
	}

	command, err := appBootstrapCommand(
		AppStartInput{
			AppID:          "ai-media-canvas",
			PackageDir:     packageDir,
			RuntimeProfile: workspaceAppNodeRuntimePreloadProfile,
		},
		ResolvedAppRuntime{Node: `C:\\Program Files\\Tutti\\Tutti.exe`},
		filepath.Join(packageDir, "bootstrap.sh"),
	)
	if err != nil {
		t.Fatalf("appBootstrapCommand() error = %v", err)
	}
	if command.Path != `C:\\Program Files\\Tutti\\Tutti.exe` {
		t.Fatalf("Path = %q", command.Path)
	}
	if len(command.Args) != 5 || command.Args[1] != "--eval" || command.Args[3] != filepath.Join(packageDir, "server", "worker.js") || command.Args[4] != filepath.Join(packageDir, "server", "server.js") {
		t.Fatalf("Args = %#v, want supervised AI Canvas worker and server", command.Args)
	}
}

func TestWindowsAppBootstrapEnvOverridesConfiguresAICanvas(t *testing.T) {
	input := AppStartInput{
		AppID:          "ai-media-canvas",
		DataDir:        `C:\\Data`,
		PackageDir:     `C:\\Package`,
		RuntimeProfile: workspaceAppNodeRuntimePreloadProfile,
		WorkspaceRoot:  `C:\\Workspace`,
	}
	overrides := windowsAppBootstrapEnvOverrides(input, 3042)
	if runtime.GOOS != "windows" {
		if len(overrides) != 0 {
			t.Fatalf("overrides = %#v, want none outside Windows", overrides)
		}
		return
	}
	for _, expected := range []string{
		"AIMC_SERVER_PORT=3042",
		"AIMC_APP_VERSION=" + filepath.Base(input.PackageDir),
		"AIMC_WEB_DIST=" + filepath.Join(input.PackageDir, "dist"),
		"AIMC_DATA_ROOT=" + input.DataDir,
		"AIMC_AGENT_FILES_ROOT=" + input.WorkspaceRoot,
	} {
		if !slices.Contains(overrides, expected) {
			t.Fatalf("overrides = %#v, want %q", overrides, expected)
		}
	}
}

func TestWindowsAppBootstrapEnvOverridesConfiguresCatalogNodeApps(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows catalog app bootstrap environment test")
	}

	tests := []struct {
		appID    string
		expected []string
	}{
		{
			appID: "ai-slide",
			expected: []string{
				"HOST=127.0.0.1",
				"PORT=3042",
				"AI_SLIDE_APP_VERSION=0.1.25",
				"AI_SLIDE_SERVER_URL=http://127.0.0.1:3042",
			},
		},
		{
			appID: "group-chat",
			expected: []string{
				"HOST=127.0.0.1",
				"PORT=3042",
				"GROUP_CHAT_APP_VERSION=0.1.25",
				"GROUP_CHAT_SERVER_URL=http://127.0.0.1:3042",
			},
		},
	}

	for _, test := range tests {
		t.Run(test.appID, func(t *testing.T) {
			input := AppStartInput{
				AppID:          test.appID,
				DataDir:        `C:\\Data`,
				LogDir:         `C:\\Logs`,
				PackageDir:     `C:\\Packages\\` + test.appID + `\\0.1.25`,
				RuntimeDir:     `C:\\Runtime`,
				RuntimeProfile: workspaceAppNodeRuntimePreloadProfile,
				WorkspaceRoot:  `C:\\Workspace`,
			}
			overrides := windowsAppBootstrapEnvOverrides(input, 3042)
			for _, expected := range test.expected {
				if !slices.Contains(overrides, expected) {
					t.Fatalf("overrides = %#v, want %q", overrides, expected)
				}
			}
		})
	}
}

func TestAppRunnerStartsAICanvasStylePackageOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows AI Canvas runner integration test")
	}
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for AI Canvas runner integration test")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(filepath.Join(packageDir, "server"), 0o755); err != nil {
		t.Fatalf("MkdirAll(server) error = %v", err)
	}
	for path, source := range map[string]string{
		"bootstrap.sh":                       "#!/bin/sh\n",
		filepath.Join("server", "worker.js"): `setInterval(() => {}, 1000);`,
		filepath.Join("server", "server.js"): `const http = require("node:http"); const port = Number(process.env.AIMC_SERVER_PORT); if (!process.env.AIMC_APP_VERSION) process.exit(2); http.createServer((request, response) => { response.writeHead(request.url === "/api/health" ? 200 : 404); response.end(); }).listen(port, "127.0.0.1");`,
	} {
		if err := os.WriteFile(filepath.Join(packageDir, path), []byte(source), 0o644); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", path, err)
		}
	}

	runner := &AppRunner{
		HealthcheckTimeout: 10 * time.Second,
		RuntimeResolver: staticAppRuntimeResolver{runtime: ResolvedAppRuntime{
			Node:         nodePath,
			EnvOverrides: []string{"TUTTI_APP_NODE=" + nodePath},
		}},
	}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-ai-canvas",
		WorkspaceName:   "AI Canvas",
		WorkspaceRoot:   root,
		AppID:           "ai-media-canvas",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/api/health",
		RuntimeProfile:  workspaceAppNodeRuntimePreloadProfile,
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing", state.Status)
	}
	waitForRunnerStatus(t, runner, "ws-ai-canvas", "ai-media-canvas", workspacebiz.AppRuntimeStatusRunning)
	stopped, err := runner.Stop(context.Background(), "ws-ai-canvas", "ai-media-canvas")
	if err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if stopped.Status != workspacebiz.AppRuntimeStatusIdle {
		t.Fatalf("Stop() status = %q, want idle", stopped.Status)
	}
}

func TestAppRunnerStartsWindowsCompanionBootstrap(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows companion runner integration test")
	}
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for companion runner integration test")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package with spaces")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(package) error = %v", err)
	}
	files := map[string]string{
		"bootstrap.sh": "#!/bin/sh\n",
		"bootstrap.cmd": `@echo off
"%TUTTI_APP_NODE%" "%TUTTI_APP_PACKAGE_DIR%\server.js"
`,
		"server.js": `const http = require("node:http"); const port = Number(process.env.TUTTI_APP_PORT); http.createServer((request, response) => { response.writeHead(request.url === "/healthz" ? 204 : 404); response.end(); }).listen(port, "127.0.0.1");`,
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(packageDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", name, err)
		}
	}

	runner := &AppRunner{
		HealthcheckTimeout: 10 * time.Second,
		RuntimeResolver: staticAppRuntimeResolver{runtime: ResolvedAppRuntime{
			Node:         nodePath,
			EnvOverrides: []string{"TUTTI_APP_NODE=" + nodePath},
		}},
	}
	if _, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-companion",
		WorkspaceName:   "Companion",
		WorkspaceRoot:   root,
		AppID:           "companion-test",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/healthz",
		RuntimeProfile:  workspaceAppNodeRuntimePreloadProfile,
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	}); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	waitForRunnerStatus(t, runner, "ws-companion", "companion-test", workspacebiz.AppRuntimeStatusRunning)
	if _, err := runner.Stop(context.Background(), "ws-companion", "companion-test"); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
}

func TestAppRunnerStartsCatalogNodeStaticPackagesOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows catalog node-static runner test")
	}
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for catalog runner integration test")
	}
	t.Setenv("TUTTI_DESKTOP_CLI_EXECUTABLE", nodePath)

	tests := []struct {
		appID        string
		entrypoint   string
		requiredEnv  []string
		serverURLEnv string
		versionEnv   string
	}{
		{
			appID:        "ai-doc",
			entrypoint:   filepath.Join("server", "server.js"),
			requiredEnv:  []string{"AI_DOC_WEB_DIST", "AI_DOC_HOME", "AI_DOC_RUNTIME_ROOT", "AI_DOC_LOG_ROOT", "AI_DOC_WORKSPACE_ROOT", "AI_DOC_TEMPLATE_ROOT", "AI_DOC_TUTTI_CLI"},
			serverURLEnv: "AI_DOC_SERVER_URL",
			versionEnv:   "AI_DOC_APP_VERSION",
		},
		{
			appID:        "ai-slide",
			entrypoint:   filepath.Join("server", "server.js"),
			requiredEnv:  []string{"AI_SLIDE_WEB_DIST", "AI_SLIDE_HOME", "AI_SLIDE_RUNTIME_ROOT", "AI_SLIDE_LOG_ROOT", "AI_SLIDE_WORKSPACE_ROOT", "AI_SLIDE_TEMPLATE_ROOT", "AI_SLIDE_TEMPLATE_ASSET_ROOT"},
			serverURLEnv: "AI_SLIDE_SERVER_URL",
			versionEnv:   "AI_SLIDE_APP_VERSION",
		},
		{
			appID:        "group-chat",
			entrypoint:   filepath.Join("server", "server.js"),
			requiredEnv:  []string{"GROUP_CHAT_WEB_DIST", "GROUP_CHAT_HOME", "GROUP_CHAT_WORKSPACE_ROOT"},
			serverURLEnv: "GROUP_CHAT_SERVER_URL",
			versionEnv:   "GROUP_CHAT_APP_VERSION",
		},
		{
			appID:       "daily-tech-radar",
			entrypoint:  "server.mjs",
			requiredEnv: []string{"HOST", "PORT", "TUTTI_APP_NODE", "TUTTI_APP_PACKAGE_DIR", "TUTTI_APP_DATA_DIR"},
		},
		{
			appID:       "omni-catcher",
			entrypoint:  filepath.Join("server", "server.js"),
			requiredEnv: []string{"TUTTI_APP_NODE", "TUTTI_APP_RUNTIME_DIR", "TUTTI_APP_LOG_DIR", "TUTTI_APP_DATA_DIR"},
		},
		{
			appID:       "tutti-onboarding",
			entrypoint:  "server.mjs",
			requiredEnv: []string{"HOST", "PORT", "TUTTI_APP_PACKAGE_DIR", "TUTTI_APP_DATA_DIR"},
		},
		{
			appID:       "vibe-design",
			entrypoint:  filepath.Join("server", "dist", "main.js"),
			requiredEnv: []string{"VIBE_TUTTI_CLI", "VIBE_WORKSPACE_ROOT", "TUTTI_APP_NODE", "TUTTI_APP_BASE_URL"},
		},
	}

	for _, test := range tests {
		t.Run(test.appID, func(t *testing.T) {
			root := t.TempDir()
			packageDir := filepath.Join(root, "packages", test.appID, "0.1.25")
			entrypoint := filepath.Join(packageDir, test.entrypoint)
			if err := os.MkdirAll(filepath.Dir(entrypoint), 0o755); err != nil {
				t.Fatalf("MkdirAll(server) error = %v", err)
			}
			if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte("#!/bin/sh\n"), 0o644); err != nil {
				t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
			}
			requiredEnv, err := json.Marshal(test.requiredEnv)
			if err != nil {
				t.Fatalf("Marshal(requiredEnv) error = %v", err)
			}
			serverSource := strings.NewReplacer(
				"__REQUIRED_ENV__", string(requiredEnv),
				"__VERSION_ENV__", test.versionEnv,
				"__SERVER_URL_ENV__", test.serverURLEnv,
			).Replace(`(async () => {
const http = await import("node:http");
const { execFile } = await import("node:child_process");
const port = Number(process.env.PORT);
for (const key of __REQUIRED_ENV__) if (!process.env[key]) process.exit(2);
if ("__VERSION_ENV__" && !process.env["__VERSION_ENV__"]) process.exit(3);
if ("__SERVER_URL_ENV__" && process.env["__SERVER_URL_ENV__"] !== "http://127.0.0.1:" + port) process.exit(4);
execFile(process.env.TUTTI_CLI, ["--version"], (error) => {
  if (error) process.exit(5);
  http.createServer((request, response) => {
    response.writeHead(request.url === "/api/health" ? 200 : 404);
    response.end();
  }).listen(port, "127.0.0.1");
});
})();
`)
			if err := os.WriteFile(entrypoint, []byte(serverSource), 0o644); err != nil {
				t.Fatalf("WriteFile(%s) error = %v", test.entrypoint, err)
			}

			runner := &AppRunner{
				HealthcheckTimeout: 10 * time.Second,
				RuntimeResolver: staticAppRuntimeResolver{runtime: ResolvedAppRuntime{
					Node:         nodePath,
					EnvOverrides: []string{"TUTTI_APP_NODE=" + nodePath},
				}},
			}
			if _, err := runner.Start(context.Background(), AppStartInput{
				WorkspaceID:     "ws-catalog-app",
				WorkspaceName:   "Catalog app",
				WorkspaceRoot:   root,
				AppID:           test.appID,
				PackageDir:      packageDir,
				Bootstrap:       "bootstrap.sh",
				HealthcheckPath: "/api/health",
				RuntimeProfile:  workspaceAppNodeRuntimePreloadProfile,
				RuntimeDir:      filepath.Join(root, "runtime"),
				DataDir:         filepath.Join(root, "data"),
				LogDir:          filepath.Join(root, "logs"),
			}); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			waitForRunnerStatus(t, runner, "ws-catalog-app", test.appID, workspacebiz.AppRuntimeStatusRunning)
			if _, err := runner.Stop(context.Background(), "ws-catalog-app", test.appID); err != nil {
				t.Fatalf("Stop() error = %v", err)
			}
		})
	}
}

func TestAppRunnerStartsPythonStaticPackageOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows Python runner integration test")
	}
	pythonPath, err := exec.LookPath("python")
	if err != nil {
		t.Skip("python is required for Windows Python runner integration test")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(package) error = %v", err)
	}
	for path, source := range map[string]string{
		"bootstrap.sh": "#!/bin/sh\n",
		"server.py": `import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/healthz" else 404)
        self.end_headers()
    def log_message(self, format, *args):
        pass
ThreadingHTTPServer(("127.0.0.1", int(os.environ["TUTTI_APP_PORT"])), Handler).serve_forever()
`,
	} {
		if err := os.WriteFile(filepath.Join(packageDir, path), []byte(source), 0o644); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", path, err)
		}
	}

	runner := &AppRunner{
		HealthcheckTimeout: 10 * time.Second,
		RuntimeResolver: staticAppRuntimeResolver{runtime: ResolvedAppRuntime{
			Python:       pythonPath,
			EnvOverrides: []string{"TUTTI_APP_PYTHON=" + pythonPath},
		}},
	}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-python-app",
		WorkspaceName:   "Python app",
		WorkspaceRoot:   root,
		AppID:           "python-app",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/healthz",
		RuntimeProfile:  workspaceAppPythonRuntimePreloadProfile,
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing", state.Status)
	}
	waitForRunnerStatus(t, runner, "ws-python-app", "python-app", workspacebiz.AppRuntimeStatusRunning)
	stopped, err := runner.Stop(context.Background(), "ws-python-app", "python-app")
	if err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if stopped.Status != workspacebiz.AppRuntimeStatusIdle {
		t.Fatalf("Stop() status = %q, want idle", stopped.Status)
	}
}

type staticAppRuntimeResolver struct {
	runtime ResolvedAppRuntime
}

func (r staticAppRuntimeResolver) Resolve(context.Context) (ResolvedAppRuntime, error) {
	return r.runtime, nil
}

func (r staticAppRuntimeResolver) PreloadProfile(context.Context, string) error {
	return nil
}

func (r staticAppRuntimeResolver) ResolveProfile(context.Context, string) (ResolvedAppRuntime, error) {
	return r.runtime, nil
}

func TestAppRunnerStartsStandaloneAppWithoutResolvingManagedRuntime(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3 is required for runner standalone test")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	runtimeDir := filepath.Join(root, "runtime")
	dataDir := filepath.Join(root, "data")
	logDir := filepath.Join(root, "logs")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
exec python3 "$TUTTI_APP_PACKAGE_DIR/server.py"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "server.py"), []byte(pythonAppReadyServerScript("/healthz", false)), 0o644); err != nil {
		t.Fatalf("WriteFile(server.py) error = %v", err)
	}

	resolver := &appRuntimeResolverStub{called: make(chan struct{})}
	runner := &AppRunner{
		HealthcheckTimeout: 10 * time.Second,
		RuntimeResolver:    resolver,
	}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-runner",
		WorkspaceName:   "Runner Workspace",
		WorkspaceRoot:   root,
		AppID:           "standalone",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/healthz",
		RuntimeProfile:  workspaceAppStandaloneRuntimeProfile,
		RuntimeDir:      runtimeDir,
		DataDir:         dataDir,
		LogDir:          logDir,
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "standalone")
	})
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing, lastError=%v", state.Status, state.LastError)
	}
	state = waitForRunnerStatus(t, runner, "ws-runner", "standalone", workspacebiz.AppRuntimeStatusRunning)
	if state.LaunchURL == nil || !strings.HasPrefix(*state.LaunchURL, "http://127.0.0.1:") {
		t.Fatalf("LaunchURL = %v", state.LaunchURL)
	}

	select {
	case <-resolver.called:
		t.Fatal("standalone app resolved managed runtime")
	default:
	}
}

func TestAppRunnerRestartStartsFreshProcessAndWritesStartupDiagnostic(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3 is required for runner restart test")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	runtimeDir := filepath.Join(root, "runtime")
	dataDir := filepath.Join(root, "data")
	logDir := filepath.Join(root, "logs")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
echo runner-started
exec "$TUTTI_APP_PYTHON" "$TUTTI_APP_PACKAGE_DIR/server.py"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "server.py"), []byte(pythonAppReadyServerScript("/ready", false)), 0o644); err != nil {
		t.Fatalf("WriteFile(server.py) error = %v", err)
	}

	t.Setenv(tuttiAppRuntimeRootEnv, createManagedAppRuntimeFixture(t, root))
	runner := &AppRunner{HealthcheckTimeout: 10 * time.Second}
	input := AppStartInput{
		WorkspaceID:     "ws-runner",
		WorkspaceName:   "Runner Workspace",
		WorkspaceRoot:   root,
		AppID:           "hello",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      runtimeDir,
		DataDir:         dataDir,
		LogDir:          logDir,
	}
	if _, err := runner.Start(context.Background(), input); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "hello")
	})
	first := waitForRunnerStatus(t, runner, "ws-runner", "hello", workspacebiz.AppRuntimeStatusRunning)
	if first.Port == nil {
		t.Fatalf("first Port = nil")
	}

	state, err := runner.Start(context.Background(), input)
	if err != nil {
		t.Fatalf("Start(no restart) error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusRunning {
		t.Fatalf("Start(no restart) status = %q, want running", state.Status)
	}
	if state.Port == nil || *state.Port != *first.Port {
		t.Fatalf("Start(no restart) port = %v, want %d", state.Port, *first.Port)
	}

	input.Restart = true
	state, err = runner.Start(context.Background(), input)
	if err != nil {
		t.Fatalf("Start(Restart) error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start(Restart) status = %q, want preparing", state.Status)
	}
	second := waitForRunnerStatus(t, runner, "ws-runner", "hello", workspacebiz.AppRuntimeStatusRunning)
	if second.Port == nil {
		t.Fatalf("second Port = nil")
	}

	logData, err := os.ReadFile(filepath.Join(logDir, "runtime.log"))
	if err != nil {
		t.Fatalf("ReadFile(runtime.log) error = %v", err)
	}
	if got := strings.Count(string(logData), "tutti workspace app startup"); got != 2 {
		t.Fatalf("startup diagnostics = %d, want 2; runtime.log=%q", got, string(logData))
	}
}

func TestAppRunnerStopProcessDoesNotOverwriteReplacementRuntime(t *testing.T) {
	runner := &AppRunner{}
	runner.ensure()
	key := appRuntimeKey("ws-runner", "hello")
	oldURL := "http://127.0.0.1:41001"
	newURL := "http://127.0.0.1:41002"
	oldPort := 41001
	newPort := 41002
	oldProcess := &appProcess{done: make(chan error, 1)}
	newProcess := &appProcess{done: make(chan error, 1)}

	runner.mu.Lock()
	runner.processes[key] = oldProcess
	runner.states[key] = workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: &oldURL,
		Port:      &oldPort,
	}
	runner.mu.Unlock()

	type stopResult struct {
		state workspacebiz.AppRuntimeState
		err   error
	}
	stopped := make(chan stopResult, 1)
	go func() {
		state, err := runner.stopProcess(context.Background(), key, oldProcess)
		stopped <- stopResult{state: state, err: err}
	}()

	waitForRunnerStatus(t, runner, "ws-runner", "hello", workspacebiz.AppRuntimeStatusStopping)

	runner.mu.Lock()
	runner.processes[key] = newProcess
	runner.states[key] = workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: &newURL,
		Port:      &newPort,
	}
	runner.mu.Unlock()

	oldProcess.done <- nil

	select {
	case result := <-stopped:
		if result.err != nil {
			t.Fatalf("stopProcess() error = %v", result.err)
		}
		if result.state.Status != workspacebiz.AppRuntimeStatusRunning {
			t.Fatalf("stopProcess() status = %q, want running", result.state.Status)
		}
		if result.state.LaunchURL == nil || *result.state.LaunchURL != newURL {
			t.Fatalf("stopProcess() launchURL = %v, want %q", result.state.LaunchURL, newURL)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for stopProcess")
	}

	state := runner.State("ws-runner", "hello")
	if state.Status != workspacebiz.AppRuntimeStatusRunning {
		t.Fatalf("runner state = %q, want running", state.Status)
	}
	if state.LaunchURL == nil || *state.LaunchURL != newURL {
		t.Fatalf("runner launchURL = %v, want %q", state.LaunchURL, newURL)
	}
}

func TestAppRunnerStopProcessWaitsForProcessDoneWhenContextIsCanceled(t *testing.T) {
	runner := &AppRunner{}
	runner.ensure()
	key := appRuntimeKey("ws-runner", "hello")
	process := &appProcess{done: make(chan error)}
	runner.mu.Lock()
	runner.processes[key] = process
	runner.states[key] = workspacebiz.AppRuntimeState{
		Status: workspacebiz.AppRuntimeStatusRunning,
	}
	runner.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	type stopResult struct {
		state workspacebiz.AppRuntimeState
		err   error
	}
	stopped := make(chan stopResult, 1)
	go func() {
		state, err := runner.stopProcess(ctx, key, process)
		stopped <- stopResult{state: state, err: err}
	}()

	select {
	case result := <-stopped:
		t.Fatalf("stopProcess() returned before process done: %#v", result)
	case <-time.After(50 * time.Millisecond):
	}
	process.done <- nil
	select {
	case result := <-stopped:
		if !errors.Is(result.err, context.Canceled) {
			t.Fatalf("stopProcess() error = %v, want context.Canceled", result.err)
		}
		if result.state.Status != workspacebiz.AppRuntimeStatusFailed {
			t.Fatalf("stopProcess() status = %q, want failed", result.state.Status)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for stopProcess")
	}
}

func TestAppRunnerStopAllClearsStateOnlyRuntime(t *testing.T) {
	runner := &AppRunner{}
	runner.setState(appRuntimeKey("ws-runner", "orphaned"), workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: stringPtr("http://127.0.0.1:43210"),
		Port:      intPtr(43210),
	})

	runner.StopAll(context.Background())

	assertRunnerStatus(t, runner, "ws-runner", "orphaned", workspacebiz.AppRuntimeStatusIdle)
}

func TestAppRunnerStopWorkspaceClearsMatchingStateOnlyRuntime(t *testing.T) {
	runner := &AppRunner{}
	runner.setState(appRuntimeKey("ws-runner", "orphaned"), workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: stringPtr("http://127.0.0.1:43210"),
		Port:      intPtr(43210),
	})
	runner.setState(appRuntimeKey("ws-other", "orphaned"), workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: stringPtr("http://127.0.0.1:43211"),
		Port:      intPtr(43211),
	})

	runner.StopWorkspace(context.Background(), "ws-runner")

	assertRunnerStatus(t, runner, "ws-runner", "orphaned", workspacebiz.AppRuntimeStatusIdle)
	assertRunnerStatus(t, runner, "ws-other", "orphaned", workspacebiz.AppRuntimeStatusRunning)
}

func TestAppRunnerStopAppClearsMatchingStateOnlyRuntime(t *testing.T) {
	runner := &AppRunner{}
	runner.setState(appRuntimeKey("ws-runner", "orphaned"), workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: stringPtr("http://127.0.0.1:43210"),
		Port:      intPtr(43210),
	})
	runner.setState(appRuntimeKey("ws-runner", "other"), workspacebiz.AppRuntimeState{
		Status:    workspacebiz.AppRuntimeStatusRunning,
		LaunchURL: stringPtr("http://127.0.0.1:43211"),
		Port:      intPtr(43211),
	})

	runner.StopApp(context.Background(), "orphaned")

	assertRunnerStatus(t, runner, "ws-runner", "orphaned", workspacebiz.AppRuntimeStatusIdle)
	assertRunnerStatus(t, runner, "ws-runner", "other", workspacebiz.AppRuntimeStatusRunning)
}

func TestAppRunnerStartWithoutRestartReusesQueuedStart(t *testing.T) {
	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}

	var eventsMu sync.Mutex
	var events []workspacebiz.AppRuntimeState
	runner := &AppRunner{
		RuntimeResolver: &appRuntimeResolverStub{called: make(chan struct{}), err: errors.New("skip runtime")},
		OnStateChanged: func(_ string, _ string, state workspacebiz.AppRuntimeState) {
			eventsMu.Lock()
			events = append(events, state)
			eventsMu.Unlock()
		},
		queue: make(chan struct{}, 1),
	}
	runner.queue <- struct{}{}
	input := AppStartInput{
		WorkspaceID:     "ws-runner",
		AppID:           "queued",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	}
	state, err := runner.Start(context.Background(), input)
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing", state.Status)
	}

	state, err = runner.Start(context.Background(), input)
	if err != nil {
		t.Fatalf("Start(no restart) error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start(no restart) status = %q, want preparing", state.Status)
	}
	eventsMu.Lock()
	eventCount := len(events)
	eventsMu.Unlock()
	if eventCount != 1 {
		t.Fatalf("state change events = %d, want 1", eventCount)
	}

	<-runner.queue
	waitForRunnerStatus(t, runner, "ws-runner", "queued", workspacebiz.AppRuntimeStatusFailed)
}

func TestAppRunnerFinishStartIgnoresReplacedStart(t *testing.T) {
	runner := &AppRunner{}
	runner.ensure()
	key := appRuntimeKey("ws-runner", "queued")
	oldStart := &appStart{cancel: func() {}}
	newStart := &appStart{cancel: func() {}}
	cancelledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	runner.mu.Lock()
	runner.starts[key] = newStart
	runner.states[key] = workspacebiz.AppRuntimeState{Status: workspacebiz.AppRuntimeStatusPreparing}
	runner.mu.Unlock()

	runner.finishStart(key, cancelledCtx, oldStart)

	runner.mu.Lock()
	defer runner.mu.Unlock()
	if runner.starts[key] != newStart {
		t.Fatalf("finishStart() replaced start = %v, want still active", runner.starts[key])
	}
	if state := runner.states[key]; state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("finishStart() status = %q, want preparing", state.Status)
	}
}

func TestAppRunnerStartWithoutRestartReusesStartingProcess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}

	t.Setenv(tuttiAppRuntimeRootEnv, createManagedAppRuntimeFixture(t, root))
	runner := &AppRunner{HealthcheckTimeout: 3 * time.Second}
	input := AppStartInput{
		WorkspaceID:     "ws-runner",
		AppID:           "starting",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	}
	if _, err := runner.Start(context.Background(), input); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "starting")
	})
	starting := waitForRunnerStatus(t, runner, "ws-runner", "starting", workspacebiz.AppRuntimeStatusStarting)
	if starting.Port == nil {
		t.Fatalf("starting Port = nil")
	}

	state, err := runner.Start(context.Background(), input)
	if err != nil {
		t.Fatalf("Start(no restart) error = %v", err)
	}
	if state.Status != workspacebiz.AppRuntimeStatusStarting {
		t.Fatalf("Start(no restart) status = %q, want starting", state.Status)
	}
	if state.Port == nil || *state.Port != *starting.Port {
		t.Fatalf("Start(no restart) port = %v, want %d", state.Port, *starting.Port)
	}
}

func TestAppRunnerStartsAppWithManagedNodeRuntimeEnv(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}
	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	runtimeDir := filepath.Join(root, "runtime")
	dataDir := filepath.Join(root, "data")
	logDir := filepath.Join(root, "logs")
	for _, dir := range []string{packageDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%s) error = %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
exec "$TUTTI_APP_NODE" "$TUTTI_APP_PACKAGE_DIR/server.js"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "server.py"), []byte(pythonAppReadyServerScript("/healthz", false)), 0o644); err != nil {
		t.Fatalf("WriteFile(server.py) error = %v", err)
	}

	runtimeRoot := createManagedAppRuntimeFixture(t, root)
	t.Setenv(tuttiAppRuntimeRootEnv, runtimeRoot)
	runner := &AppRunner{HealthcheckTimeout: 10 * time.Second}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-fnm",
		WorkspaceName:   "Fnm Workspace",
		WorkspaceRoot:   root,
		AppID:           "fnm-node",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/healthz",
		RuntimeDir:      runtimeDir,
		DataDir:         dataDir,
		LogDir:          logDir,
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-fnm", "fnm-node")
	})
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing, lastError=%v", state.Status, state.LastError)
	}
	waitForRunnerStatus(t, runner, "ws-fnm", "fnm-node", workspacebiz.AppRuntimeStatusRunning)
	logData, err := os.ReadFile(filepath.Join(logDir, "runtime.log"))
	if err != nil {
		t.Fatalf("ReadFile(runtime.log) error = %v", err)
	}
	if !strings.Contains(string(logData), filepath.Join(runtimeRoot, "node", "bin")) {
		t.Fatalf("runtime log PATH does not include managed node bin: %s", string(logData))
	}
}

func TestAppRunnerHealthcheckFailureIsBackgroundState(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
sleep 30
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}

	t.Setenv(tuttiAppRuntimeRootEnv, createManagedAppRuntimeFixture(t, root))
	runner := &AppRunner{HealthcheckTimeout: 100 * time.Millisecond}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-runner",
		AppID:           "slow",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "slow")
	})
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing", state.Status)
	}

	state = waitForRunnerStatus(t, runner, "ws-runner", "slow", workspacebiz.AppRuntimeStatusFailed)
	if state.FailureReason == nil || *state.FailureReason != "healthcheck" {
		t.Fatalf("FailureReason = %v, want healthcheck", state.FailureReason)
	}
}

func TestAppRunnerStopDuringHealthcheckLeavesAppIdle(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bootstrap.sh runner test is POSIX-only")
	}

	root := t.TempDir()
	packageDir := filepath.Join(root, "package")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(packageDir) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "bootstrap.sh"), []byte(`#!/bin/sh
set -eu
sleep 30
`), 0o755); err != nil {
		t.Fatalf("WriteFile(bootstrap.sh) error = %v", err)
	}

	t.Setenv(tuttiAppRuntimeRootEnv, createManagedAppRuntimeFixture(t, root))
	healthcheckStarted := make(chan struct{})
	var healthcheckStartedOnce sync.Once
	var eventsMu sync.Mutex
	var events []workspacebiz.AppRuntimeState
	runner := &AppRunner{
		HealthcheckTimeout: 3 * time.Second,
		HTTPClient: &http.Client{Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
			healthcheckStartedOnce.Do(func() {
				close(healthcheckStarted)
			})
			<-request.Context().Done()
			return nil, request.Context().Err()
		})},
		OnStateChanged: func(_ string, _ string, state workspacebiz.AppRuntimeState) {
			eventsMu.Lock()
			events = append(events, state)
			eventsMu.Unlock()
		},
	}
	state, err := runner.Start(context.Background(), AppStartInput{
		WorkspaceID:     "ws-runner",
		AppID:           "slow",
		PackageDir:      packageDir,
		Bootstrap:       "bootstrap.sh",
		HealthcheckPath: "/ready",
		RuntimeDir:      filepath.Join(root, "runtime"),
		DataDir:         filepath.Join(root, "data"),
		LogDir:          filepath.Join(root, "logs"),
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = runner.Stop(context.Background(), "ws-runner", "slow")
	})
	if state.Status != workspacebiz.AppRuntimeStatusPreparing {
		t.Fatalf("Start() status = %q, want preparing", state.Status)
	}

	select {
	case <-healthcheckStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for healthcheck request")
	}
	stopped, err := runner.Stop(context.Background(), "ws-runner", "slow")
	if err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if stopped.Status != workspacebiz.AppRuntimeStatusIdle {
		t.Fatalf("Stop() status = %q, want idle", stopped.Status)
	}

	state = waitForRunnerStatus(t, runner, "ws-runner", "slow", workspacebiz.AppRuntimeStatusIdle)
	if state.FailureReason != nil || state.LastError != nil {
		t.Fatalf("runner state after stop = %#v, want idle without failure", state)
	}

	eventsMu.Lock()
	defer eventsMu.Unlock()
	for _, event := range events {
		if event.Status != workspacebiz.AppRuntimeStatusFailed {
			continue
		}
		reason := ""
		if event.FailureReason != nil {
			reason = *event.FailureReason
		}
		lastError := ""
		if event.LastError != nil {
			lastError = *event.LastError
		}
		if reason == "healthcheck" && strings.Contains(lastError, context.Canceled.Error()) {
			t.Fatalf("recorded canceled healthcheck failure: %#v", event)
		}
	}
}

func TestTuttiCLIShimPathUsesProductionCommand(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("TUTTI_STATE_DIR", stateDir)
	t.Setenv("TUTTI_ENV", "production")

	want := filepath.Join(stateDir, "bin", "tutti")
	if got := tuttiCLIShimPathForPlatform("darwin"); got != want {
		t.Fatalf("tuttiCLIShimPathForPlatform() = %q, want %q", got, want)
	}
}

func TestTuttiCLIShimPathUsesDevelopmentCommand(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("TUTTI_STATE_DIR", stateDir)
	t.Setenv("TUTTI_ENV", "development")

	want := filepath.Join(stateDir, "bin", "tutti-dev")
	if got := tuttiCLIShimPathForPlatform("darwin"); got != want {
		t.Fatalf("tuttiCLIShimPathForPlatform() = %q, want %q", got, want)
	}
}

func TestTuttiCLIShimPathUsesWindowsCommandExtension(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("TUTTI_STATE_DIR", stateDir)
	t.Setenv("TUTTI_ENV", "production")

	want := filepath.Join(stateDir, "bin", "tutti.cmd")
	if got := tuttiCLIShimPathForPlatform("windows"); got != want {
		t.Fatalf("tuttiCLIShimPathForPlatform() = %q, want %q", got, want)
	}
}

func TestTuttiCLICommandPathUsesWindowsDesktopExecutable(t *testing.T) {
	t.Setenv("TUTTI_DESKTOP_CLI_EXECUTABLE", `C:\\Program Files\\Tutti\\resources\\bin\\tutti.exe`)

	want := `C:\\Program Files\\Tutti\\resources\\bin\\tutti.exe`
	if got := tuttiCLICommandPathForPlatform("windows"); got != want {
		t.Fatalf("tuttiCLICommandPathForPlatform() = %q, want %q", got, want)
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func samePath(t *testing.T, actual string, expected string) bool {
	t.Helper()

	actualResolved, err := filepath.EvalSymlinks(actual)
	if err != nil {
		actualResolved = actual
	}
	expectedResolved, err := filepath.EvalSymlinks(expected)
	if err != nil {
		expectedResolved = expected
	}
	return actualResolved == expectedResolved
}

func createManagedAppRuntimeFixture(t *testing.T, root string) string {
	t.Helper()

	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is required for managed app runtime fixture")
	}

	runtimeRoot := filepath.Join(root, "managed-runtime")
	pythonBinDir := filepath.Join(runtimeRoot, "python", "bin")
	nodeBinDir := filepath.Join(runtimeRoot, "node", "bin")
	for _, dir := range []string{pythonBinDir, nodeBinDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("MkdirAll(%s) error = %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(pythonBinDir, "python3"), []byte(`#!/bin/sh
exec "`+pythonPath+`" "$@"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(managed python) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(nodeBinDir, "node"), []byte(`#!/bin/sh
exec "`+pythonPath+`" "$TUTTI_APP_PACKAGE_DIR/server.py"
`), 0o755); err != nil {
		t.Fatalf("WriteFile(managed node) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(nodeBinDir, "npm"), []byte(`#!/bin/sh
exit 0
`), 0o755); err != nil {
		t.Fatalf("WriteFile(managed npm) error = %v", err)
	}
	return runtimeRoot
}

func pythonAppReadyServerScript(healthcheckPath string, writeProbe bool) string {
	probeImport := ""
	probeWrite := ""
	if writeProbe {
		probeImport = "import json\n"
		probeWrite = `        with open(os.path.join(os.environ["TUTTI_APP_DATA_DIR"], "probe.json"), "w") as f:
            json.dump({
                "cwd": os.getcwd(),
                "appId": os.environ["TUTTI_APP_ID"],
                "workspaceId": os.environ["TUTTI_WORKSPACE_ID"],
                "workspaceName": os.environ["TUTTI_WORKSPACE_NAME"],
                "workspaceRoot": os.environ["TUTTI_WORKSPACE_ROOT"],
                "appHost": os.environ["TUTTI_APP_HOST"],
                "appBaseUrl": os.environ["TUTTI_APP_BASE_URL"],
                "packageDir": os.environ["TUTTI_APP_PACKAGE_DIR"],
                "runtimeDir": os.environ["TUTTI_APP_RUNTIME_DIR"],
                "dataDir": os.environ["TUTTI_APP_DATA_DIR"],
                "logDir": os.environ["TUTTI_APP_LOG_DIR"],
                "toolchainRoot": os.environ["TUTTI_APP_TOOLCHAIN_ROOT"],
                "tuttiCli": os.environ["TUTTI_CLI"],
                "path": os.environ["PATH"],
            }, f)
`
	}

	script := `import os
__PROBE_IMPORT__import socket

HEALTHCHECK_PATH = "__HEALTHCHECK_PATH__"

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", int(os.environ["TUTTI_APP_PORT"])))
server.listen(16)

while True:
    connection, _ = server.accept()
    with connection:
        request = b""
        while b"\r\n\r\n" not in request:
            chunk = connection.recv(4096)
            if not chunk:
                break
            request += chunk
        request_line = request.split(b"\r\n", 1)[0].decode("ascii", "ignore")
        parts = request_line.split(" ")
        path = parts[1] if len(parts) > 1 else "/"
        if path != HEALTHCHECK_PATH:
            connection.sendall(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            continue
__PROBE_WRITE__        connection.sendall(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
`
	script = strings.ReplaceAll(script, "__PROBE_IMPORT__", probeImport)
	script = strings.ReplaceAll(script, "__PROBE_WRITE__", probeWrite)
	script = strings.ReplaceAll(script, "__HEALTHCHECK_PATH__", healthcheckPath)
	return script
}

func waitForRunnerStatus(t *testing.T, runner *AppRunner, workspaceID string, appID string, want workspacebiz.AppRuntimeStatus) workspacebiz.AppRuntimeState {
	t.Helper()

	return waitForRunnerState(t, runner, workspaceID, appID, func(state workspacebiz.AppRuntimeState) bool {
		return state.Status == want
	})
}

func assertRunnerStatus(t *testing.T, runner *AppRunner, workspaceID string, appID string, want workspacebiz.AppRuntimeStatus) {
	t.Helper()

	state := runner.State(workspaceID, appID)
	if state.Status != want {
		t.Fatalf("State(%q, %q) status = %q, want %q", workspaceID, appID, state.Status, want)
	}
}

func waitForRunnerState(t *testing.T, runner *AppRunner, workspaceID string, appID string, matches func(workspacebiz.AppRuntimeState) bool) workspacebiz.AppRuntimeState {
	t.Helper()

	deadline := time.Now().Add(runnerStatusWaitTimeout(runner))
	var state workspacebiz.AppRuntimeState
	for time.Now().Before(deadline) {
		state = runner.State(workspaceID, appID)
		if matches(state) {
			return state
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("runner state did not match before timeout: status=%q failureReason=%q lastError=%q launchURL=%v port=%v", state.Status, stringValue(state.FailureReason), stringValue(state.LastError), state.LaunchURL, state.Port)
	return state
}

func runnerStatusWaitTimeout(runner *AppRunner) time.Duration {
	timeout := 5 * time.Second
	if runner != nil && runner.HealthcheckTimeout > timeout {
		timeout = runner.HealthcheckTimeout + 2*time.Second
	}
	return timeout
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
