package agentsidecar

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const claudeSystemPromptFileEnv = "NEXTOP_CLAUDE_SYSTEM_PROMPT_FILE"
const claudePluginDirEnv = "NEXTOP_CLAUDE_PLUGIN_DIR"
const claudeConfigDirEnv = "CLAUDE_CONFIG_DIR"
const claudeSkillListingBudgetEnv = "SLASH_COMMAND_TOOL_CHAR_BUDGET"
const claudeSkillListingBudgetChars = "20000"

type ClaudeCodePreparer struct{}

func (ClaudeCodePreparer) Provider() string {
	return "claude-code"
}

func (ClaudeCodePreparer) Prepare(_ context.Context, input ProviderPrepareInput) (ProviderPrepareResult, error) {
	if err := cleanupClaudeLegacyProjectSkills(input.Cwd); err != nil {
		return ProviderPrepareResult{}, err
	}
	systemPromptPath := filepath.Join(input.RuntimeRoot, "claude-system-prompt.md")
	if err := os.MkdirAll(filepath.Dir(systemPromptPath), 0o700); err != nil {
		return ProviderPrepareResult{}, fmt.Errorf("create claude system prompt directory: %w", err)
	}
	if err := os.WriteFile(systemPromptPath, []byte(nextopCLIPolicy(input.PrepareInput)), 0o600); err != nil {
		return ProviderPrepareResult{}, fmt.Errorf("write claude system prompt: %w", err)
	}
	pluginDir := filepath.Join(input.RuntimeRoot, "claude-plugin", "nextop-cli")
	if err := installClaudeNextopPlugin(pluginDir, input.PrepareInput); err != nil {
		return ProviderPrepareResult{}, err
	}
	projectSkillRoot := providerSkillRoot(input.Cwd, input.Provider)
	if projectSkillRoot != "" {
		skillPaths, err := installProviderNativeSkillSpecs(
			projectSkillRoot,
			claudeProjectSkills(input.PrepareInput),
		)
		if err != nil {
			return ProviderPrepareResult{}, fmt.Errorf("install claude project skills: %w", err)
		}
		if input.Manifest != nil {
			for _, skillPath := range skillPaths {
				input.Manifest.RecordManagedFile(skillPath, "provider-skill", true)
			}
		}
	}
	if input.Manifest != nil {
		input.Manifest.RecordManagedFile(systemPromptPath, "provider-system-prompt", true)
		input.Manifest.RecordManagedFile(pluginDir, "provider-plugin", true)
	}
	env := []string{
		claudeSystemPromptFileEnv + "=" + systemPromptPath,
		claudePluginDirEnv + "=" + pluginDir,
		claudeSkillListingBudgetEnv + "=" + claudeSkillListingBudgetChars,
	}
	if input.PlanMode {
		configDir := filepath.Join(input.RuntimeRoot, "claude-config")
		if err := installClaudePlanSettings(configDir); err != nil {
			return ProviderPrepareResult{}, err
		}
		if input.Manifest != nil {
			input.Manifest.RecordManagedFile(configDir, "provider-config", true)
		}
		env = append(env, claudeConfigDirEnv+"="+configDir)
	}
	return ProviderPrepareResult{
		Cwd: input.Cwd,
		Env: env,
	}, nil
}

func claudeProjectSkills(input PrepareInput) []providerSkillSpec {
	skills := providerSkills(input)
	filtered := make([]providerSkillSpec, 0, len(skills))
	for _, skill := range skills {
		if skill.baseName == workspaceAppSkillName {
			continue
		}
		filtered = append(filtered, skill)
	}
	return filtered
}

func installClaudePlanSettings(configDir string) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create claude config directory: %w", err)
	}
	settings := readUserClaudeSettings()
	permissions, _ := settings["permissions"].(map[string]any)
	if permissions == nil {
		permissions = map[string]any{}
	}
	permissions["defaultMode"] = "plan"
	settings["permissions"] = permissions
	content, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("encode claude plan settings: %w", err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "settings.json"), append(content, '\n'), 0o600); err != nil {
		return fmt.Errorf("write claude plan settings: %w", err)
	}
	return nil
}

func readUserClaudeSettings() map[string]any {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return map[string]any{}
	}
	content, err := os.ReadFile(filepath.Join(home, ".claude", "settings.json"))
	if err != nil {
		return map[string]any{}
	}
	var settings map[string]any
	if err := json.Unmarshal(content, &settings); err != nil || settings == nil {
		return map[string]any{}
	}
	return settings
}

func installClaudeNextopPlugin(pluginDir string, input PrepareInput) error {
	manifestDir := filepath.Join(pluginDir, ".claude-plugin")
	if err := os.MkdirAll(manifestDir, 0o700); err != nil {
		return fmt.Errorf("create claude plugin manifest directory: %w", err)
	}
	manifest := map[string]any{
		"name":        "nextop-cli",
		"version":     "0.1.0",
		"description": "Nextop CLI skill for AgentGUI sessions.",
		"author": map[string]string{
			"name": "Nextop",
		},
	}
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode claude plugin manifest: %w", err)
	}
	if err := os.WriteFile(filepath.Join(manifestDir, "plugin.json"), append(content, '\n'), 0o600); err != nil {
		return fmt.Errorf("write claude plugin manifest: %w", err)
	}
	if _, err := installProviderNativeSkills(filepath.Join(pluginDir, "skills"), input); err != nil {
		return fmt.Errorf("install claude nextop skill plugin: %w", err)
	}
	return nil
}

func cleanupClaudeLegacyProjectSkills(cwd string) error {
	skillRoot := providerSkillRoot(cwd, "claude-code")
	if strings.TrimSpace(skillRoot) == "" {
		return nil
	}
	entries, err := os.ReadDir(skillRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read claude project skills: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := strings.TrimSpace(entry.Name())
		if !isLegacyNextopProviderSkillDir(name) {
			continue
		}
		skillPath := filepath.Join(skillRoot, name, "SKILL.md")
		content, err := os.ReadFile(skillPath)
		if err != nil || !isLegacyNextopProviderSkillContent(string(content)) {
			continue
		}
		if err := os.RemoveAll(filepath.Join(skillRoot, name)); err != nil {
			return fmt.Errorf("remove legacy claude nextop skill %s: %w", name, err)
		}
	}
	return nil
}

func isLegacyNextopProviderSkillDir(name string) bool {
	name = strings.TrimSpace(name)
	for _, base := range []string{nextopSkillName, issueManagerSkillName, workspaceAppSkillName} {
		if name == base || name == base+"-nextop" {
			return true
		}
		suffix, ok := strings.CutPrefix(name, base+"-nextop-")
		if !ok {
			continue
		}
		index, err := strconv.Atoi(suffix)
		if err == nil && index >= 2 && index <= 99 {
			return true
		}
	}
	return false
}

func isLegacyNextopProviderSkillContent(content string) bool {
	for _, marker := range []string{
		"description: Use for `mention://agent-session?...` links, Nextop CLI command syntax",
		"description: Use for Nextop CLI command syntax and daemon context lookup",
		"description: Use for `mention://workspace-issue?...` links",
		"description: Use for `mention://workspace-app?...` links",
	} {
		if strings.Contains(content, marker) {
			return true
		}
	}
	return false
}
