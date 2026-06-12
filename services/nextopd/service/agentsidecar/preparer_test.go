package agentsidecar

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	agentsidecarbiz "github.com/tutti-os/tutti/services/nextopd/biz/agentsidecar"
	agentsidecardata "github.com/tutti-os/tutti/services/nextopd/data/agentsidecar"
)

func TestDefaultPreparerCodexWritesInstructionsSkillManifestAndEnv(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	userCodexHome := filepath.Join(home, ".codex")
	if err := os.MkdirAll(userCodexHome, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userCodexHome, "auth.json"), []byte(`{"token":"test"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	writeSidecarTestFile(t, filepath.Join(userCodexHome, "skills", "caveman", "SKILL.md"), "---\nname: caveman\n---\nCaveman mode\n")
	writeSidecarTestFile(t, filepath.Join(userCodexHome, "skills", "grill-me", "SKILL.md"), "---\nname: grill-me\n---\nGrill me\n")
	writeSidecarTestFile(t, filepath.Join(userCodexHome, "skills", ".system", "hidden", "SKILL.md"), "---\nname: hidden\n---\nHidden\n")
	if err := os.MkdirAll(filepath.Join(userCodexHome, "skills", "invalid"), 0o755); err != nil {
		t.Fatal(err)
	}

	stateDir := t.TempDir()
	cwd := t.TempDir()
	agentsPath := filepath.Join(cwd, "AGENTS.md")
	if err := os.WriteFile(agentsPath, []byte("existing guidance\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            cwd,
		ExtraSkills: []ProviderSkillBundle{
			{
				Name: "app-factory",
				Files: map[string]string{
					"SKILL.md":                        "---\nname: app-factory\n---\nmention://workspace-app-factory\n",
					"references/manifest-contract.md": "manifest contract",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}

	content, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "existing guidance\n" {
		t.Fatalf("cwd AGENTS.md content = %q, want user guidance unchanged", string(content))
	}
	codexHome := envValue(prepared.Env, "CODEX_HOME")
	if codexHome == "" {
		t.Fatalf("prepared env = %#v, want CODEX_HOME", prepared.Env)
	}
	codexAgents, err := os.ReadFile(filepath.Join(codexHome, "AGENTS.md"))
	if err != nil {
		t.Fatalf("codex AGENTS.md missing: %v", err)
	}
	if !strings.Contains(string(codexAgents), "nextop issue list") {
		t.Fatalf("codex AGENTS.md content = %q", string(codexAgents))
	}
	if !strings.Contains(string(codexAgents), "# Host App Context") ||
		!strings.Contains(string(codexAgents), "standard Markdown syntax, for example `![alt](/absolute/path.png)`") ||
		!strings.Contains(string(codexAgents), "you MUST include that image in your final response using Markdown image syntax") ||
		!strings.Contains(string(codexAgents), "Prefer final image paths under `$CODEX_HOME/generated_images/`") ||
		!strings.Contains(string(codexAgents), "Do not use unverified tool sandbox paths such as `/mnt/data/...`") ||
		!strings.Contains(string(codexAgents), "Do not include inline base64 image data in responses") ||
		!strings.Contains(string(codexAgents), "Return web URLs as Markdown links, for example") {
		t.Fatalf("codex AGENTS.md content = %q, want host app rendering guidance", string(codexAgents))
	}
	if _, err := os.Lstat(filepath.Join(codexHome, "auth.json")); err != nil {
		t.Fatalf("codex auth not exposed: %v", err)
	}
	cavemanPath := filepath.Join(codexHome, "skills", "caveman")
	cavemanInfo, err := os.Lstat(cavemanPath)
	if err != nil {
		t.Fatalf("caveman skill not exposed: %v", err)
	}
	if cavemanInfo.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("caveman skill mode = %v, want symlink", cavemanInfo.Mode())
	}
	cavemanTarget, err := os.Readlink(cavemanPath)
	if err != nil {
		t.Fatal(err)
	}
	if cavemanTarget != filepath.Join(userCodexHome, "skills", "caveman") {
		t.Fatalf("caveman symlink target = %q", cavemanTarget)
	}
	cavemanSkill, err := os.ReadFile(filepath.Join(cavemanPath, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(cavemanSkill), "Caveman mode") {
		t.Fatalf("caveman skill = %q", string(cavemanSkill))
	}
	grillMeInfo, err := os.Lstat(filepath.Join(codexHome, "skills", "grill-me"))
	if err != nil {
		t.Fatalf("grill-me skill not exposed: %v", err)
	}
	if grillMeInfo.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("grill-me skill mode = %v, want symlink", grillMeInfo.Mode())
	}
	if _, err := os.Lstat(filepath.Join(codexHome, "skills", ".system")); !os.IsNotExist(err) {
		t.Fatalf("hidden system skill exposed, err = %v", err)
	}
	if _, err := os.Lstat(filepath.Join(codexHome, "skills", "invalid")); !os.IsNotExist(err) {
		t.Fatalf("invalid skill exposed, err = %v", err)
	}
	skill, err := os.ReadFile(filepath.Join(codexHome, "skills", "nextop-cli", "SKILL.md"))
	if err != nil {
		t.Fatalf("nextop skill missing: %v", err)
	}
	if !strings.Contains(string(skill), "nextop agent sessions") {
		t.Fatalf("skill content = %q", string(skill))
	}
	if !strings.Contains(string(skill), "local Nextop daemon") ||
		!strings.Contains(string(skill), "localhost/IPC") ||
		!strings.Contains(string(skill), "execution environment") ||
		!strings.Contains(string(skill), "Issue execution sequencing belongs to the `issue-manager` skill") {
		t.Fatalf("skill content = %q, want local daemon environment guidance", string(skill))
	}
	if !strings.HasPrefix(string(skill), "---\nname: nextop-cli\n") {
		t.Fatalf("skill missing YAML frontmatter: %q", string(skill))
	}
	if strings.Contains(string(skill), "### Mention-driven issue handoff") {
		t.Fatalf("nextop skill should stay reference-focused: %q", string(skill))
	}
	issueSkill, err := os.ReadFile(filepath.Join(codexHome, "skills", "issue-manager", "SKILL.md"))
	if err != nil {
		t.Fatalf("issue-manager skill missing: %v", err)
	}
	if !strings.Contains(string(issueSkill), "mention://workspace-issue") ||
		!strings.Contains(string(issueSkill), "mode=breakdown") ||
		!strings.Contains(string(issueSkill), "Use the injected `nextop-cli` skill as the command reference") ||
		!strings.Contains(string(issueSkill), "## Inspection Mode") ||
		!strings.Contains(string(issueSkill), "Create the run yourself before doing the work") ||
		!strings.Contains(string(issueSkill), "If the mention does not include `taskId`, inspect the issue tasks before creating a run") ||
		!strings.Contains(string(issueSkill), "execute each child task in issue order") ||
		!strings.Contains(string(issueSkill), "--agent-provider codex --agent-session-id session-1") ||
		!strings.Contains(string(issueSkill), "complete that same run") ||
		!strings.Contains(string(issueSkill), "Do not edit code, do not execute the task, and do not create or complete runs in breakdown mode") {
		t.Fatalf("issue-manager skill content = %q", string(issueSkill))
	}
	if envValue(prepared.Env, "NEXTOP_AGENT_PROVIDER") != "codex" {
		t.Fatalf("prepared env = %#v, want NEXTOP_AGENT_PROVIDER", prepared.Env)
	}
	workspaceAppSkill, err := os.ReadFile(filepath.Join(codexHome, "skills", "workspace-app", "SKILL.md"))
	if err != nil {
		t.Fatalf("workspace-app skill missing: %v", err)
	}
	if !strings.Contains(string(workspaceAppSkill), "mention://workspace-app") ||
		!strings.Contains(string(workspaceAppSkill), "appId") ||
		!strings.Contains(string(workspaceAppSkill), "Use the injected `nextop-cli` skill as the command reference") {
		t.Fatalf("workspace-app skill content = %q", string(workspaceAppSkill))
	}
	appFactorySkill, err := os.ReadFile(filepath.Join(codexHome, "skills", "app-factory", "SKILL.md"))
	if err != nil {
		t.Fatalf("app-factory skill missing: %v", err)
	}
	if !strings.Contains(string(appFactorySkill), "mention://workspace-app-factory") {
		t.Fatalf("app-factory skill content = %q", string(appFactorySkill))
	}
	appFactoryReference, err := os.ReadFile(filepath.Join(codexHome, "skills", "app-factory", "references", "manifest-contract.md"))
	if err != nil {
		t.Fatalf("app-factory reference missing: %v", err)
	}
	if string(appFactoryReference) != "manifest contract" {
		t.Fatalf("app-factory reference = %q", string(appFactoryReference))
	}
	rules, err := os.ReadFile(filepath.Join(codexHome, "rules", "default.rules"))
	if err != nil {
		t.Fatalf("codex approval rules missing: %v", err)
	}
	if !strings.Contains(string(rules), `prefix_rule(pattern=["nextop"], decision="allow")`) {
		t.Fatalf("codex approval rules = %q, want nextop allow rule", string(rules))
	}
	runtimeRoot, err := agentsidecardata.LocalStore{StateDir: stateDir}.RuntimeRoot("workspace-1", "session-1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(runtimeRoot, agentsidecarbiz.SidecarManifestFileName)); err != nil {
		t.Fatalf("manifest missing: %v", err)
	}
	if envValue(prepared.Env, "NEXTOP_WORKSPACE_ID") != "workspace-1" {
		t.Fatalf("prepared env = %#v, want workspace id", prepared.Env)
	}
}

func TestDefaultPreparerCodexUserSkillNameWinsBeforeNextopInjection(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	userCodexHome := filepath.Join(home, ".codex")
	writeSidecarTestFile(t, filepath.Join(userCodexHome, "skills", "nextop-cli", "SKILL.md"), "---\nname: nextop-cli\n---\nUser nextop skill\n")

	stateDir := t.TempDir()
	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            t.TempDir(),
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}

	codexHome := envValue(prepared.Env, "CODEX_HOME")
	userSkillPath := filepath.Join(codexHome, "skills", "nextop-cli")
	userSkillInfo, err := os.Lstat(userSkillPath)
	if err != nil {
		t.Fatalf("user nextop-cli skill not exposed: %v", err)
	}
	if userSkillInfo.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("user nextop-cli skill mode = %v, want symlink", userSkillInfo.Mode())
	}
	userSkill, err := os.ReadFile(filepath.Join(userSkillPath, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(userSkill), "User nextop skill") {
		t.Fatalf("user nextop-cli skill = %q", string(userSkill))
	}
	nextopSkill, err := os.ReadFile(filepath.Join(codexHome, "skills", "nextop-cli-nextop", "SKILL.md"))
	if err != nil {
		t.Fatalf("nextop fallback skill missing: %v", err)
	}
	if !strings.Contains(string(nextopSkill), "nextop agent sessions") {
		t.Fatalf("nextop fallback skill = %q", string(nextopSkill))
	}
}

func TestDefaultPreparerUsesStateRootCLIShimName(t *testing.T) {
	t.Setenv("PATH", "/usr/bin:/bin")
	stateDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(stateDir, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "bin", "nextop-dev"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cwd := t.TempDir()

	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}

	codexHome := envValue(prepared.Env, "CODEX_HOME")
	content, err := os.ReadFile(filepath.Join(codexHome, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), "nextop-dev issue list") {
		t.Fatalf("codex AGENTS.md content = %q, want nextop-dev command", string(content))
	}
	pathEnv := envValue(prepared.Env, "PATH")
	wantPrefix := filepath.Join(stateDir, "bin") + string(os.PathListSeparator)
	if !strings.HasPrefix(pathEnv, wantPrefix) {
		t.Fatalf("PATH = %q, want prefix %q", pathEnv, wantPrefix)
	}
	rules, err := os.ReadFile(filepath.Join(codexHome, "rules", "default.rules"))
	if err != nil {
		t.Fatalf("codex approval rules missing: %v", err)
	}
	if !strings.Contains(string(rules), `prefix_rule(pattern=["nextop-dev"], decision="allow")`) {
		t.Fatalf("codex approval rules = %q, want nextop-dev allow rule", string(rules))
	}
}

func TestDefaultPreparerCleanupRemovesManagedBlocksAndRuntimeRoot(t *testing.T) {
	stateDir := t.TempDir()
	cwd := t.TempDir()
	agentsPath := filepath.Join(cwd, "AGENTS.md")
	if err := os.WriteFile(agentsPath, []byte("user guidance\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	preparer := NewDefaultPreparer(stateDir)
	_, err := preparer.Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}

	if err := preparer.Cleanup(t.Context(), CleanupInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
	}); err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}
	content, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(content), "BEGIN NEXTOP-RUNTIME") || !strings.Contains(string(content), "user guidance") {
		t.Fatalf("cleanup content = %q", string(content))
	}
	runtimeRoot, err := agentsidecardata.LocalStore{StateDir: stateDir}.RuntimeRoot("workspace-1", "session-1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(runtimeRoot); !os.IsNotExist(err) {
		t.Fatalf("runtime root still exists, err = %v", err)
	}
}

func TestDefaultPreparerCodexUsesSessionScopedInstructionFile(t *testing.T) {
	stateDir := t.TempDir()
	cwd := t.TempDir()
	preparer := NewDefaultPreparer(stateDir)
	prepared, err := preparer.Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	agentsPath := filepath.Join(cwd, "AGENTS.md")
	if _, err := os.Stat(agentsPath); !os.IsNotExist(err) {
		t.Fatalf("cwd AGENTS.md exists after prepare, err = %v", err)
	}
	codexHome := envValue(prepared.Env, "CODEX_HOME")
	if _, err := os.Stat(filepath.Join(codexHome, "AGENTS.md")); err != nil {
		t.Fatalf("codex AGENTS.md missing after prepare: %v", err)
	}
	if err := preparer.Cleanup(t.Context(), CleanupInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
	}); err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}
	if _, err := os.Stat(codexHome); !os.IsNotExist(err) {
		t.Fatalf("codex home still exists, err = %v", err)
	}
}

func TestDefaultPreparerRejectsMissingCwd(t *testing.T) {
	stateDir := t.TempDir()
	missingCwd := filepath.Join(t.TempDir(), "deleted-project")

	_, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "codex",
		Cwd:            missingCwd,
	})
	if !errors.Is(err, ErrCwdNotDirectory) {
		t.Fatalf("Prepare() error = %v, want ErrCwdNotDirectory", err)
	}
	if _, statErr := os.Stat(missingCwd); !os.IsNotExist(statErr) {
		t.Fatalf("missing cwd was recreated, stat err = %v", statErr)
	}
}

func TestDefaultPreparerClaudeCodeUsesSessionScopedSystemPrompt(t *testing.T) {
	stateDir := t.TempDir()
	cwd := t.TempDir()
	claudePath := filepath.Join(cwd, "CLAUDE.md")
	if err := os.WriteFile(claudePath, []byte("user claude guidance\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	userSkillPath := filepath.Join(cwd, ".claude", "skills", "nextop-cli", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(userSkillPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(userSkillPath, []byte("user skill\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	legacyIssueSkillPath := filepath.Join(cwd, ".claude", "skills", "issue-manager-nextop-7", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(legacyIssueSkillPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyIssueSkillPath, []byte(issueManagerSkill(PrepareInput{})), 0o644); err != nil {
		t.Fatal(err)
	}
	legacyWorkspaceAppSkillPath := filepath.Join(cwd, ".claude", "skills", "workspace-app", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(legacyWorkspaceAppSkillPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyWorkspaceAppSkillPath, []byte(workspaceAppSkill(PrepareInput{})), 0o644); err != nil {
		t.Fatal(err)
	}

	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "claude-code",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	content, err := os.ReadFile(userSkillPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "user skill\n" {
		t.Fatalf("user skill was overwritten: %q", string(content))
	}
	if _, err := os.Stat(filepath.Dir(legacyIssueSkillPath)); !os.IsNotExist(err) {
		t.Fatalf("legacy issue-manager skill still exists, err = %v", err)
	}
	if _, err := os.Stat(filepath.Dir(legacyWorkspaceAppSkillPath)); !os.IsNotExist(err) {
		t.Fatalf("legacy workspace-app skill still exists, err = %v", err)
	}
	claudeContent, err := os.ReadFile(claudePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(claudeContent) != "user claude guidance\n" {
		t.Fatalf("cwd CLAUDE.md content = %q, want user guidance unchanged", string(claudeContent))
	}
	nextopSkillPath := filepath.Join(cwd, ".claude", "skills", "nextop-cli-nextop", "SKILL.md")
	nextopSkill, err := os.ReadFile(nextopSkillPath)
	if err != nil {
		t.Fatalf("claude cwd nextop provider skill missing: %v", err)
	}
	if !strings.Contains(string(nextopSkill), "nextop issue list") {
		t.Fatalf("claude cwd nextop provider skill content = %q", string(nextopSkill))
	}
	issueSkillPath := filepath.Join(cwd, ".claude", "skills", "issue-manager", "SKILL.md")
	issueSkill, err := os.ReadFile(issueSkillPath)
	if err != nil {
		t.Fatalf("claude cwd issue-manager skill missing: %v", err)
	}
	if !strings.Contains(string(issueSkill), "mention://workspace-issue") {
		t.Fatalf("claude cwd issue-manager skill content = %q", string(issueSkill))
	}
	systemPromptPath := envValue(prepared.Env, claudeSystemPromptFileEnv)
	if systemPromptPath == "" {
		t.Fatalf("prepared env = %#v, want %s", prepared.Env, claudeSystemPromptFileEnv)
	}
	if rel, err := filepath.Rel(cwd, systemPromptPath); err == nil && !strings.HasPrefix(rel, "..") {
		t.Fatalf("claude system prompt path = %q, want outside cwd %q", systemPromptPath, cwd)
	}
	systemPrompt, err := os.ReadFile(systemPromptPath)
	if err != nil {
		t.Fatalf("claude system prompt missing: %v", err)
	}
	if !strings.Contains(string(systemPrompt), "nextop issue list") {
		t.Fatalf("claude system prompt content = %q", string(systemPrompt))
	}
	if !strings.Contains(string(systemPrompt), "First, if provider-native skills are visible") ||
		!strings.Contains(string(systemPrompt), "Provider-native skill names may be namespaced") ||
		!strings.Contains(string(systemPrompt), "`nextop-cli:issue-manager`") ||
		!strings.Contains(string(systemPrompt), "`nextop-cli:workspace-app`") ||
		!strings.Contains(string(systemPrompt), "you MUST use the relevant injected skill") ||
		!strings.Contains(string(systemPrompt), "Treat `mention://...` links as internal Nextop references") ||
		!strings.Contains(string(systemPrompt), "Do not try to open `mention://...` links in a browser") ||
		!strings.Contains(string(systemPrompt), "If no matching skill is visible") ||
		!strings.Contains(string(systemPrompt), "`mention://workspace-issue?...`") ||
		!strings.Contains(string(systemPrompt), "issue get --issue-id <issue-id> --json") ||
		!strings.Contains(string(systemPrompt), "`mention://agent-session?...`") ||
		!strings.Contains(string(systemPrompt), "agent session-summary --session-id <session-id> --json") {
		t.Fatalf("claude system prompt content = %q, want mention handoff fallback guidance", string(systemPrompt))
	}
	if !strings.Contains(string(systemPrompt), "# Host App Context") ||
		!strings.Contains(string(systemPrompt), "standard Markdown syntax, for example `![alt](/absolute/path.png)`") ||
		!strings.Contains(string(systemPrompt), "you MUST include that image in your final response using Markdown image syntax") ||
		!strings.Contains(string(systemPrompt), "Prefer final image paths under `$CODEX_HOME/generated_images/`") ||
		!strings.Contains(string(systemPrompt), "Do not use unverified tool sandbox paths such as `/mnt/data/...`") ||
		!strings.Contains(string(systemPrompt), "Do not include inline base64 image data in responses") ||
		!strings.Contains(string(systemPrompt), "Return web URLs as Markdown links, for example") {
		t.Fatalf("claude system prompt content = %q, want host app rendering guidance", string(systemPrompt))
	}
	if !strings.Contains(string(systemPrompt), "Provider-native skill names may be namespaced") ||
		!strings.Contains(string(systemPrompt), "Claude Code skill listings can omit descriptions") ||
		!strings.Contains(string(systemPrompt), "you MUST use the relevant injected skill") ||
		!strings.Contains(string(systemPrompt), "Do not open `mention://...` links in a browser") ||
		!strings.Contains(string(systemPrompt), "agent session-summary --session-id <session-id> --json") ||
		!strings.Contains(string(systemPrompt), "issue get --issue-id <issue-id> --json") {
		t.Fatalf("claude system prompt content = %q, want strict Nextop mention routing", string(systemPrompt))
	}
	pluginDir := envValue(prepared.Env, claudePluginDirEnv)
	if pluginDir == "" {
		t.Fatalf("prepared env = %#v, want %s", prepared.Env, claudePluginDirEnv)
	}
	if got := envValue(prepared.Env, claudeSkillListingBudgetEnv); got != claudeSkillListingBudgetChars {
		t.Fatalf("prepared env %s = %q, want %q", claudeSkillListingBudgetEnv, got, claudeSkillListingBudgetChars)
	}
	if rel, err := filepath.Rel(cwd, pluginDir); err == nil && !strings.HasPrefix(rel, "..") {
		t.Fatalf("claude plugin dir = %q, want outside cwd %q", pluginDir, cwd)
	}
	pluginManifest, err := os.ReadFile(filepath.Join(pluginDir, ".claude-plugin", "plugin.json"))
	if err != nil {
		t.Fatalf("claude plugin manifest missing: %v", err)
	}
	if !strings.Contains(string(pluginManifest), `"name": "nextop-cli"`) {
		t.Fatalf("claude plugin manifest = %q", string(pluginManifest))
	}
	if !strings.Contains(string(pluginManifest), `"author": {`) ||
		!strings.Contains(string(pluginManifest), `"name": "Nextop"`) {
		t.Fatalf("claude plugin manifest author = %q", string(pluginManifest))
	}
	pluginSkill, err := os.ReadFile(filepath.Join(pluginDir, "skills", "nextop-cli", "SKILL.md"))
	if err != nil {
		t.Fatalf("claude plugin skill missing: %v", err)
	}
	if !strings.Contains(string(pluginSkill), "nextop issue list") ||
		!strings.Contains(string(pluginSkill), "mention://agent-session") {
		t.Fatalf("claude plugin skill content = %q", string(pluginSkill))
	}
	issuePluginSkill, err := os.ReadFile(filepath.Join(pluginDir, "skills", "issue-manager", "SKILL.md"))
	if err != nil {
		t.Fatalf("claude issue-manager plugin skill missing: %v", err)
	}
	if !strings.Contains(string(issuePluginSkill), "mention://workspace-issue") {
		t.Fatalf("claude issue-manager plugin skill content = %q", string(issuePluginSkill))
	}
	workspaceAppPluginSkill, err := os.ReadFile(filepath.Join(pluginDir, "skills", "workspace-app", "SKILL.md"))
	if err != nil {
		t.Fatalf("claude workspace-app plugin skill missing: %v", err)
	}
	if !strings.Contains(string(workspaceAppPluginSkill), "mention://workspace-app") {
		t.Fatalf("claude workspace-app plugin skill content = %q", string(workspaceAppPluginSkill))
	}
}

func TestDefaultPreparerClaudePlanModeWritesSessionConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	userClaudeDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(userClaudeDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userClaudeDir, "settings.json"), []byte(`{
  "model": "sonnet",
  "env": {
    "ANTHROPIC_BASE_URL": "https://anthropic.proxy.test"
  },
  "permissions": {
    "allow": ["Read"],
    "defaultMode": "default"
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}

	stateDir := t.TempDir()
	cwd := t.TempDir()

	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "claude-code",
		Cwd:            cwd,
		PlanMode:       true,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}

	configDir := envValue(prepared.Env, claudeConfigDirEnv)
	if configDir == "" {
		t.Fatalf("prepared env = %#v, want %s", prepared.Env, claudeConfigDirEnv)
	}
	if rel, err := filepath.Rel(cwd, configDir); err == nil && !strings.HasPrefix(rel, "..") {
		t.Fatalf("claude config dir = %q, want outside cwd %q", configDir, cwd)
	}
	content, err := os.ReadFile(filepath.Join(configDir, "settings.json"))
	if err != nil {
		t.Fatalf("read claude settings: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(content, &settings); err != nil {
		t.Fatalf("claude settings JSON = %q: %v", string(content), err)
	}
	if got := settings["model"]; got != "sonnet" {
		t.Fatalf("claude settings model = %#v, want preserved user setting", got)
	}
	env, _ := settings["env"].(map[string]any)
	if got := env["ANTHROPIC_BASE_URL"]; got != "https://anthropic.proxy.test" {
		t.Fatalf("claude settings env base URL = %#v, want preserved user env", got)
	}
	permissions, _ := settings["permissions"].(map[string]any)
	if got := permissions["defaultMode"]; got != "plan" {
		t.Fatalf("claude settings permissions.defaultMode = %#v, want plan", got)
	}
	allow, _ := permissions["allow"].([]any)
	if len(allow) != 1 || allow[0] != "Read" {
		t.Fatalf("claude settings permissions.allow = %#v, want preserved user permissions", permissions["allow"])
	}
}

func TestDefaultPreparerCleanupRemovesClaudeSystemPromptRuntimeRoot(t *testing.T) {
	stateDir := t.TempDir()
	cwd := t.TempDir()
	preparer := NewDefaultPreparer(stateDir)
	prepared, err := preparer.Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "claude-code",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	systemPromptPath := envValue(prepared.Env, claudeSystemPromptFileEnv)
	if _, err := os.Stat(systemPromptPath); err != nil {
		t.Fatalf("claude system prompt missing before cleanup: %v", err)
	}
	pluginDir := envValue(prepared.Env, claudePluginDirEnv)
	if _, err := os.Stat(filepath.Join(pluginDir, ".claude-plugin", "plugin.json")); err != nil {
		t.Fatalf("claude plugin manifest missing before cleanup: %v", err)
	}
	issueSkillPath := filepath.Join(cwd, ".claude", "skills", "issue-manager", "SKILL.md")
	if _, err := os.Stat(issueSkillPath); err != nil {
		t.Fatalf("claude cwd issue-manager skill missing before cleanup: %v", err)
	}
	if _, err := os.Stat(filepath.Join(cwd, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("cwd CLAUDE.md exists after prepare, err = %v", err)
	}

	if err := preparer.Cleanup(t.Context(), CleanupInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
	}); err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}
	if _, err := os.Stat(systemPromptPath); !os.IsNotExist(err) {
		t.Fatalf("claude system prompt still exists, err = %v", err)
	}
	if _, err := os.Stat(pluginDir); !os.IsNotExist(err) {
		t.Fatalf("claude plugin dir still exists, err = %v", err)
	}
	if _, err := os.Stat(issueSkillPath); !os.IsNotExist(err) {
		t.Fatalf("claude cwd issue-manager skill still exists, err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(cwd, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("cwd CLAUDE.md exists after cleanup, err = %v", err)
	}
}

func TestDefaultPreparerGeminiUsesSessionScopedHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	userGeminiDir := filepath.Join(home, ".gemini")
	if err := os.MkdirAll(userGeminiDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userGeminiDir, "settings.json"), []byte(`{"model":{"name":"gemini-test"}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	stateDir := t.TempDir()
	cwd := t.TempDir()
	geminiPath := filepath.Join(cwd, "GEMINI.md")
	if err := os.WriteFile(geminiPath, []byte("user gemini guidance\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	prepared, err := NewDefaultPreparer(stateDir).Prepare(t.Context(), PrepareInput{
		WorkspaceID:    "workspace-1",
		AgentSessionID: "session-1",
		Provider:       "gemini",
		Cwd:            cwd,
	})
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	content, err := os.ReadFile(geminiPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "user gemini guidance\n" {
		t.Fatalf("cwd GEMINI.md content = %q, want user guidance unchanged", string(content))
	}
	if _, err := os.Stat(filepath.Join(cwd, ".gemini")); !os.IsNotExist(err) {
		t.Fatalf("cwd .gemini exists after prepare, err = %v", err)
	}
	geminiHome := envValue(prepared.Env, "HOME")
	if geminiHome == "" {
		t.Fatalf("prepared env = %#v, want HOME", prepared.Env)
	}
	if rel, err := filepath.Rel(cwd, geminiHome); err == nil && !strings.HasPrefix(rel, "..") {
		t.Fatalf("gemini home = %q, want outside cwd %q", geminiHome, cwd)
	}
	sessionGemini, err := os.ReadFile(filepath.Join(geminiHome, ".gemini", "GEMINI.md"))
	if err != nil {
		t.Fatalf("session GEMINI.md missing: %v", err)
	}
	if !strings.Contains(string(sessionGemini), "nextop issue list") {
		t.Fatalf("session GEMINI.md content = %q", string(sessionGemini))
	}
	settings, err := os.ReadFile(filepath.Join(geminiHome, ".gemini", "settings.json"))
	if err != nil {
		t.Fatalf("session gemini settings missing: %v", err)
	}
	if !strings.Contains(string(settings), "gemini-test") {
		t.Fatalf("session gemini settings = %q", string(settings))
	}
	skill, err := os.ReadFile(filepath.Join(geminiHome, ".gemini", "skills", "nextop-cli", "SKILL.md"))
	if err != nil {
		t.Fatalf("session gemini skill missing: %v", err)
	}
	if !strings.Contains(string(skill), "nextop agent sessions") {
		t.Fatalf("session gemini skill = %q", string(skill))
	}
	issueSkill, err := os.ReadFile(filepath.Join(geminiHome, ".gemini", "skills", "issue-manager", "SKILL.md"))
	if err != nil {
		t.Fatalf("session gemini issue-manager skill missing: %v", err)
	}
	if !strings.Contains(string(issueSkill), "mention://workspace-issue") {
		t.Fatalf("session gemini issue-manager skill = %q", string(issueSkill))
	}
	workspaceAppSkill, err := os.ReadFile(filepath.Join(geminiHome, ".gemini", "skills", "workspace-app", "SKILL.md"))
	if err != nil {
		t.Fatalf("session gemini workspace-app skill missing: %v", err)
	}
	if !strings.Contains(string(workspaceAppSkill), "mention://workspace-app") {
		t.Fatalf("session gemini workspace-app skill = %q", string(workspaceAppSkill))
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, item := range env {
		if strings.HasPrefix(item, prefix) {
			return strings.TrimPrefix(item, prefix)
		}
	}
	return ""
}

func writeSidecarTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
