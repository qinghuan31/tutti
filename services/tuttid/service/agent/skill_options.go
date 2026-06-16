package agent

import (
	"bufio"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
)

const (
	composerSkillSourceProject       = "project"
	composerSkillSourcePersonal      = "personal"
	composerSkillSourcePlugin        = "plugin"
	composerSkillSourceSystem        = "system"
	composerSkillSourceTuttiInjected = "tutti-injected"
)

var hiddenTuttiProviderSkills = map[string]struct{}{
	"tutti-cli":     {},
	"issue-manager": {},
	"workspace-app": {},
}

func discoverComposerSkillOptions(provider string, cwd string, env []string) []ComposerSkillOption {
	switch agentprovider.Normalize(provider) {
	case agentprovider.Codex:
		return discoverCodexComposerSkills(cwd, env)
	case agentprovider.ClaudeCode:
		return discoverClaudeCodeComposerSkills(cwd, env)
	default:
		return nil
	}
}

func discoverCodexComposerSkills(cwd string, env []string) []ComposerSkillOption {
	roots := make([]composerSkillRoot, 0)
	roots = append(roots, ancestorSkillRoots(cwd, ".codex", "skills", composerSkillSourceProject)...)
	if userHome, err := os.UserHomeDir(); err == nil && strings.TrimSpace(userHome) != "" {
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(userHome, ".agents", "skills"),
			sourceKind: composerSkillSourcePersonal,
		})
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(userHome, ".codex", "skills"),
			sourceKind: composerSkillSourcePersonal,
		})
	}
	if codexHome := envValue(env, "CODEX_HOME"); codexHome != "" {
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(codexHome, "skills", ".system"),
			sourceKind: composerSkillSourceSystem,
		})
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(codexHome, "skills"),
			sourceKind: composerSkillSourceTuttiInjected,
		})
	}
	return discoverProviderSkillRoots(roots, codexSkillTrigger)
}

func discoverClaudeCodeComposerSkills(cwd string, env []string) []ComposerSkillOption {
	roots := make([]composerSkillRoot, 0)
	roots = append(roots, ancestorSkillRoots(cwd, ".claude", "skills", composerSkillSourceProject)...)
	if userHome, err := os.UserHomeDir(); err == nil && strings.TrimSpace(userHome) != "" {
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(userHome, ".claude", "skills"),
			sourceKind: composerSkillSourcePersonal,
		})
	}
	if pluginDir := envValue(env, "TUTTI_CLAUDE_PLUGIN_DIR"); pluginDir != "" {
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(pluginDir, "skills"),
			sourceKind: composerSkillSourcePlugin,
			pluginName: claudePluginName(pluginDir),
		})
	}
	return discoverProviderSkillRoots(roots, claudeCodeSkillTrigger)
}

type composerSkillRoot struct {
	path       string
	sourceKind string
	pluginName string
}

type skillTriggerFunc func(composerSkillRoot, string) string

func discoverProviderSkillRoots(
	roots []composerSkillRoot,
	triggerFor skillTriggerFunc,
) []ComposerSkillOption {
	options := make([]ComposerSkillOption, 0)
	seen := map[string]struct{}{}
	for _, root := range roots {
		for _, option := range discoverProviderSkillRoot(root, triggerFor) {
			key := option.Trigger
			if key == "" {
				key = option.Name
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			options = append(options, option)
		}
	}
	sort.SliceStable(options, func(left, right int) bool {
		if options[left].SourceKind != options[right].SourceKind {
			return skillSourceRank(options[left].SourceKind) < skillSourceRank(options[right].SourceKind)
		}
		return options[left].Name < options[right].Name
	})
	return options
}

func discoverProviderSkillRoot(
	root composerSkillRoot,
	triggerFor skillTriggerFunc,
) []ComposerSkillOption {
	entries, err := os.ReadDir(root.path)
	if err != nil {
		return nil
	}
	options := make([]ComposerSkillOption, 0, len(entries))
	for _, entry := range entries {
		name := strings.TrimSpace(entry.Name())
		if name == "" {
			continue
		}
		if strings.HasPrefix(name, ".") {
			continue
		}
		sourcePath := filepath.Join(root.path, name)
		sourceInfo, err := os.Stat(sourcePath)
		if err != nil || !sourceInfo.IsDir() {
			continue
		}
		if shouldHideComposerSkill(root, name) {
			continue
		}
		skillPath := filepath.Join(sourcePath, "SKILL.md")
		info, err := os.Stat(skillPath)
		if err != nil || info.IsDir() {
			continue
		}
		metadata, ok := readSkillMetadata(skillPath)
		if !ok {
			slog.Warn(
				"composer skill skipped; invalid frontmatter",
				"error_code", "skill_frontmatter_invalid",
				"skillName", name,
				"skillPath", skillPath,
				"sourceKind", root.sourceKind,
				"reason", "missing_delimited_yaml_frontmatter",
			)
			continue
		}
		if metadata.name != "" {
			name = metadata.name
		}
		if shouldHideComposerSkill(root, name) {
			continue
		}
		trigger := strings.TrimSpace(triggerFor(root, name))
		if trigger == "" {
			continue
		}
		options = append(options, ComposerSkillOption{
			Name:        name,
			Trigger:     trigger,
			SourceKind:  root.sourceKind,
			Description: metadata.description,
			PluginName:  root.pluginName,
		})
	}
	return options
}

func ancestorSkillRoots(cwd string, parent string, child string, sourceKind string) []composerSkillRoot {
	current := strings.TrimSpace(cwd)
	if current == "" {
		return nil
	}
	abs, err := filepath.Abs(current)
	if err == nil {
		current = abs
	}
	info, err := os.Stat(current)
	if err == nil && !info.IsDir() {
		current = filepath.Dir(current)
	}
	roots := make([]composerSkillRoot, 0)
	for {
		roots = append(roots, composerSkillRoot{
			path:       filepath.Join(current, parent, child),
			sourceKind: sourceKind,
		})
		next := filepath.Dir(current)
		if next == current {
			break
		}
		current = next
	}
	return roots
}

type skillMetadata struct {
	name        string
	description string
}

func readSkillMetadata(path string) (skillMetadata, bool) {
	file, err := os.Open(path)
	if err != nil {
		return skillMetadata{}, false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() || strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff")) != "---" {
		return skillMetadata{}, false
	}
	lines := make([]string, 0)
	foundEnd := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			foundEnd = true
			break
		}
		lines = append(lines, line)
	}
	if err := scanner.Err(); err != nil {
		return skillMetadata{}, false
	}
	if !foundEnd {
		return skillMetadata{}, false
	}

	metadata := skillMetadata{}
	for index := 0; index < len(lines); index++ {
		line := strings.TrimSpace(lines[index])
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		normalizedValue := strings.Trim(strings.TrimSpace(value), `"'`)
		switch strings.TrimSpace(key) {
		case "name":
			metadata.name = normalizedValue
		case "description":
			if isYAMLBlockScalar(normalizedValue) {
				description, nextIndex := readYAMLBlockScalar(lines, index+1, normalizedValue)
				metadata.description = description
				index = nextIndex - 1
			} else {
				metadata.description = normalizedValue
			}
		}
	}
	return metadata, true
}

func isYAMLBlockScalar(value string) bool {
	return strings.HasPrefix(value, ">") || strings.HasPrefix(value, "|")
}

func readYAMLBlockScalar(lines []string, start int, scalar string) (string, int) {
	values := make([]string, 0)
	index := start
	for ; index < len(lines); index++ {
		line := lines[index]
		if strings.TrimSpace(line) == "" {
			continue
		}
		if !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
			break
		}
		values = append(values, strings.TrimSpace(line))
	}
	if strings.HasPrefix(scalar, "|") {
		return strings.Join(values, "\n"), index
	}
	return strings.Join(values, " "), index
}

func codexSkillTrigger(_ composerSkillRoot, name string) string {
	return "$" + strings.TrimSpace(name)
}

func claudeCodeSkillTrigger(root composerSkillRoot, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if root.sourceKind == composerSkillSourcePlugin && strings.TrimSpace(root.pluginName) != "" {
		return "/" + strings.TrimSpace(root.pluginName) + ":" + name
	}
	return "/" + name
}

func shouldHideComposerSkill(root composerSkillRoot, name string) bool {
	if root.sourceKind == composerSkillSourceTuttiInjected {
		return true
	}
	if _, ok := hiddenTuttiProviderSkills[strings.TrimSpace(name)]; ok {
		return true
	}
	return false
}

func composerSkillOptionsRuntimeContext(options []ComposerSkillOption) []map[string]any {
	if len(options) == 0 {
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(options))
	for _, option := range options {
		value := map[string]any{
			"name":       option.Name,
			"trigger":    option.Trigger,
			"sourceKind": option.SourceKind,
		}
		if option.Description != "" {
			value["description"] = option.Description
		}
		if option.PluginName != "" {
			value["pluginName"] = option.PluginName
		}
		result = append(result, value)
	}
	return result
}

func withComposerSkillOptionsRuntimeContext(
	runtimeContext map[string]any,
	options []ComposerSkillOption,
) map[string]any {
	if len(options) == 0 {
		return runtimeContext
	}
	if runtimeContext == nil {
		runtimeContext = map[string]any{}
	}
	runtimeContext["skills"] = composerSkillOptionsRuntimeContext(options)
	return runtimeContext
}

func skillSourceRank(sourceKind string) int {
	switch sourceKind {
	case composerSkillSourceProject:
		return 0
	case composerSkillSourcePersonal:
		return 1
	case composerSkillSourcePlugin:
		return 2
	case composerSkillSourceSystem:
		return 3
	default:
		return 9
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(entry, prefix))
		}
	}
	return ""
}

func claudePluginName(pluginDir string) string {
	pluginDir = strings.TrimSpace(pluginDir)
	if pluginDir == "" {
		return ""
	}
	return strings.TrimSpace(filepath.Base(pluginDir))
}
