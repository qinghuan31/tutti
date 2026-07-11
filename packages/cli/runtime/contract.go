package runtime

import (
	"embed"
	"encoding/json"
	"fmt"
)

const (
	ManifestVersion  = "1.0.0"
	GeneratorVersion = "1.0.0"
	CorpusVersion    = "1.0.0"
)

type CanonicalManifest struct {
	ManifestVersion  string            `json:"manifestVersion"`
	GeneratorVersion string            `json:"generatorVersion"`
	CorpusVersion    string            `json:"corpusVersion"`
	Commands         []ManifestCommand `json:"commands"`
}

type ManifestCommand struct {
	Capability Capability        `json:"capability"`
	Conditions CommandConditions `json:"conditions"`
}

type CommandConditions struct {
	RegistrationGates     []string                  `json:"registrationGates,omitempty"`
	ProviderAvailability  []string                  `json:"providerAvailability,omitempty"`
	IntegrationVisibility []string                  `json:"integrationVisibility,omitempty"`
	RequestContext        []RequestContextCondition `json:"requestContext,omitempty"`
}

type RequestContextCondition struct {
	ID       string `json:"id"`
	Required bool   `json:"required"`
}

//go:embed contract/canonical_manifest.json testvectors/*.json
var assets embed.FS

func LoadCanonicalManifest() (CanonicalManifest, error) {
	content, err := assets.ReadFile("contract/canonical_manifest.json")
	if err != nil {
		return CanonicalManifest{}, fmt.Errorf("read embedded canonical manifest: %w", err)
	}
	var manifest CanonicalManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return CanonicalManifest{}, fmt.Errorf("decode embedded canonical manifest: %w", err)
	}
	if manifest.ManifestVersion != ManifestVersion {
		return CanonicalManifest{}, fmt.Errorf("unsupported manifest version %q", manifest.ManifestVersion)
	}
	if manifest.GeneratorVersion != GeneratorVersion {
		return CanonicalManifest{}, fmt.Errorf("unsupported generator version %q", manifest.GeneratorVersion)
	}
	if manifest.CorpusVersion != CorpusVersion {
		return CanonicalManifest{}, fmt.Errorf("manifest corpus version %q does not match runtime corpus %q", manifest.CorpusVersion, CorpusVersion)
	}
	return manifest, nil
}

func SelectManifestCommands(manifest CanonicalManifest, snapshot GateSnapshot) ([]ManifestCommand, error) {
	knownRegistration, knownProviders, knownContext := knownConditions(manifest)
	if err := validateConditionStates("registration gate", knownRegistration, snapshot.RegistrationGates); err != nil {
		return nil, err
	}
	if err := validateConditionStates("provider availability", knownProviders, snapshot.ProviderAvailability); err != nil {
		return nil, err
	}
	if err := validateConditionStates("request context", knownContext, snapshot.RequestContext); err != nil {
		return nil, err
	}
	commands := make([]ManifestCommand, 0, len(manifest.Commands))
	for _, command := range manifest.Commands {
		if conditionDisabled(snapshot.RegistrationGates, command.Conditions.RegistrationGates) ||
			conditionDisabled(snapshot.ProviderAvailability, command.Conditions.ProviderAvailability) ||
			requiredContextMissing(snapshot.RequestContext, command.Conditions.RequestContext) ||
			(!snapshot.IncludeIntegration && len(command.Conditions.IntegrationVisibility) > 0) {
			continue
		}
		commands = append(commands, command)
	}
	if len(commands) != snapshot.ExpectedCommandCount {
		return nil, fmt.Errorf("gate snapshot %q selected %d commands, expected %d", snapshot.Name, len(commands), snapshot.ExpectedCommandCount)
	}
	return commands, nil
}

func knownConditions(manifest CanonicalManifest) (map[string]struct{}, map[string]struct{}, map[string]struct{}) {
	registration := map[string]struct{}{}
	providers := map[string]struct{}{}
	requestContext := map[string]struct{}{}
	for _, command := range manifest.Commands {
		for _, condition := range command.Conditions.RegistrationGates {
			registration[condition] = struct{}{}
		}
		for _, condition := range command.Conditions.ProviderAvailability {
			providers[condition] = struct{}{}
		}
		for _, condition := range command.Conditions.RequestContext {
			requestContext[condition.ID] = struct{}{}
		}
	}
	return registration, providers, requestContext
}

func validateConditionStates(label string, known map[string]struct{}, states map[string]bool) error {
	for condition := range known {
		if _, ok := states[condition]; !ok {
			return fmt.Errorf("gate snapshot is missing %s %q", label, condition)
		}
	}
	for condition := range states {
		if _, ok := known[condition]; !ok {
			return fmt.Errorf("gate snapshot contains unknown %s %q", label, condition)
		}
	}
	return nil
}

func conditionDisabled(states map[string]bool, conditions []string) bool {
	for _, condition := range conditions {
		if !states[condition] {
			return true
		}
	}
	return false
}

func requiredContextMissing(states map[string]bool, conditions []RequestContextCondition) bool {
	for _, condition := range conditions {
		if condition.Required && !states[condition.ID] {
			return true
		}
	}
	return false
}
