package agentextension

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
)

type ComposerProfile struct {
	SchemaVersion   string          `json:"schemaVersion"`
	Model           json.RawMessage `json:"model"`
	Permission      json.RawMessage `json:"permission"`
	PermissionModes []struct {
		RuntimeID string `json:"runtimeId"`
		Semantic  string `json:"semantic"`
	} `json:"permissionModes"`
	Skills *struct {
		Invocation    string `json:"invocation"`
		TriggerPrefix string `json:"triggerPrefix"`
		Roots         []struct {
			Scope string `json:"scope"`
			Path  string `json:"path"`
		} `json:"roots"`
	} `json:"skills,omitempty"`
}

func (m *Manager) LoadComposerProfile(installationID string) (ComposerProfile, error) {
	installation, err := m.loadInstallationByID(strings.TrimSpace(installationID))
	if err != nil {
		return ComposerProfile{}, err
	}
	if installation.Manifest.Profiles.Composer == "" {
		return ComposerProfile{}, nil
	}
	var profile ComposerProfile
	path := filepath.Join(installation.PackageDir, filepath.FromSlash(installation.Manifest.Profiles.Composer))
	if err := readJSON(path, &profile); err != nil {
		return ComposerProfile{}, err
	}
	if err := validateComposerProfile(profile); err != nil {
		return ComposerProfile{}, err
	}
	return profile, nil
}

func loadComposerModes(installation Installation) (map[string]string, string, error) {
	if installation.Manifest.Profiles.Composer == "" {
		return nil, "", nil
	}
	var profile ComposerProfile
	path := filepath.Join(installation.PackageDir, filepath.FromSlash(installation.Manifest.Profiles.Composer))
	if err := readJSON(path, &profile); err != nil {
		return nil, "", err
	}
	if err := validateComposerProfile(profile); err != nil {
		return nil, "", err
	}
	modes := map[string]string{}
	planMode := ""
	for _, mode := range profile.PermissionModes {
		runtimeID := strings.TrimSpace(mode.RuntimeID)
		if runtimeID == "" {
			return nil, "", errors.New("composer permission runtimeId is required")
		}
		modes[strings.ToLower(runtimeID)] = runtimeID
		switch strings.TrimSpace(mode.Semantic) {
		case "ask-before-write":
			modes["read-only"] = runtimeID
		case "accept-edits":
			modes["auto"] = runtimeID
		case "full-access":
			modes["full-access"] = runtimeID
		case "read-only":
			modes["plan"] = runtimeID
			planMode = runtimeID
		default:
			return nil, "", errors.New("composer permission semantic is unsupported")
		}
	}
	return modes, planMode, nil
}

func validateComposerProfile(profile ComposerProfile) error {
	if profile.SchemaVersion != "tutti.agent.composer.v1" {
		return errors.New("unsupported composer profile schema")
	}
	if profile.Skills == nil {
		return nil
	}
	if profile.Skills.Invocation != "textTrigger" && profile.Skills.Invocation != "promptItem" {
		return errors.New("composer skill invocation is unsupported")
	}
	if profile.Skills.TriggerPrefix != "/" && profile.Skills.TriggerPrefix != "$" {
		return errors.New("composer skill triggerPrefix is unsupported")
	}
	if len(profile.Skills.Roots) == 0 {
		return errors.New("composer skills require at least one root")
	}
	for _, root := range profile.Skills.Roots {
		if root.Scope != "workspace" && root.Scope != "user" {
			return errors.New("composer skill root scope is unsupported")
		}
		cleaned := filepath.Clean(strings.TrimSpace(root.Path))
		if cleaned == "." || filepath.IsAbs(cleaned) || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
			return errors.New("composer skill root path must be a safe relative path")
		}
	}
	return nil
}

func loadToolAliases(installation Installation) (map[string]string, error) {
	if installation.Manifest.Profiles.Tools == "" {
		return nil, nil
	}
	var profile struct {
		SchemaVersion string `json:"schemaVersion"`
		Tools         []struct {
			Match struct {
				IDs []string `json:"ids"`
			} `json:"match"`
			CanonicalID  string          `json:"canonicalId"`
			Category     string          `json:"category"`
			Presentation json.RawMessage `json:"presentation"`
			FileEffect   json.RawMessage `json:"fileEffect"`
			Command      json.RawMessage `json:"command"`
		} `json:"tools"`
	}
	path := filepath.Join(installation.PackageDir, filepath.FromSlash(installation.Manifest.Profiles.Tools))
	if err := readJSON(path, &profile); err != nil {
		return nil, err
	}
	if profile.SchemaVersion != "tutti.agent.tools.v1" {
		return nil, errors.New("unsupported tool profile schema")
	}
	aliases := map[string]string{}
	for _, tool := range profile.Tools {
		canonical := strings.TrimSpace(tool.CanonicalID)
		if canonical == "" {
			return nil, errors.New("tool profile canonicalId is required")
		}
		for _, id := range tool.Match.IDs {
			normalized := strings.ToLower(strings.TrimSpace(id))
			if normalized == "" {
				return nil, errors.New("tool profile id is required")
			}
			aliases[normalized] = canonical
		}
	}
	return aliases, nil
}
