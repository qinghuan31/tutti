package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	cliruntime "github.com/tutti-os/tutti/packages/cli/runtime"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	clicatalog "github.com/tutti-os/tutti/services/tuttid/service/cli/catalog"
)

const canonicalCommandCount = 55

func main() {
	output := flag.String("output", "../../packages/cli/runtime/contract/canonical_manifest.json", "generated manifest path")
	check := flag.Bool("check", false, "fail if the generated manifest is stale")
	flag.Parse()

	content, err := generate()
	if err != nil {
		fatal(err)
	}
	if *check {
		existing, err := os.ReadFile(*output)
		if err != nil {
			fatal(fmt.Errorf("read generated manifest: %w", err))
		}
		normalizedExisting, err := normalizedJSON(existing)
		if err != nil {
			fatal(fmt.Errorf("normalize generated manifest: %w", err))
		}
		normalizedContent, err := normalizedJSON(content)
		if err != nil {
			fatal(fmt.Errorf("normalize canonical manifest: %w", err))
		}
		if !bytes.Equal(normalizedExisting, normalizedContent) {
			fatal(fmt.Errorf("%s is stale; run pnpm generate:cli-contract", *output))
		}
		return
	}
	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		fatal(fmt.Errorf("create manifest directory: %w", err))
	}
	if err := os.WriteFile(*output, content, 0o644); err != nil {
		fatal(fmt.Errorf("write generated manifest: %w", err))
	}
}

func normalizedJSON(content []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(content, &value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func generate() ([]byte, error) {
	providers := clicatalog.CanonicalProviders()

	commands := make([]cliruntime.ManifestCommand, 0, canonicalCommandCount)
	ids := map[string]struct{}{}
	paths := map[string]struct{}{}
	for _, provider := range providers {
		for _, command := range provider.Commands() {
			manifestCommand := runtimeCommand(command.Capability)
			id := strings.TrimSpace(manifestCommand.Capability.ID)
			path := strings.Join(manifestCommand.Capability.Path, " ")
			if id == "" || path == "" {
				return nil, fmt.Errorf("provider %q produced an empty id or path", provider.AppID())
			}
			if _, exists := ids[id]; exists {
				return nil, fmt.Errorf("duplicate canonical command id %q", id)
			}
			if _, exists := paths[path]; exists {
				return nil, fmt.Errorf("duplicate canonical command path %q", path)
			}
			ids[id] = struct{}{}
			paths[path] = struct{}{}
			commands = append(commands, manifestCommand)
		}
	}
	if len(commands) != canonicalCommandCount {
		return nil, fmt.Errorf("canonical command count = %d, want %d", len(commands), canonicalCommandCount)
	}
	sort.Slice(commands, func(left, right int) bool {
		return commands[left].Capability.ID < commands[right].Capability.ID
	})
	manifest := cliruntime.CanonicalManifest{
		ManifestVersion:  cliruntime.ManifestVersion,
		GeneratorVersion: cliruntime.GeneratorVersion,
		CorpusVersion:    cliruntime.CorpusVersion,
		Commands:         commands,
	}
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode canonical manifest: %w", err)
	}
	return append(content, '\n'), nil
}

func runtimeCommand(capability cliservice.Capability) cliruntime.ManifestCommand {
	var table *cliruntime.TableOutput
	if capability.Output.Table != nil {
		columns := make([]cliruntime.TableColumn, 0, len(capability.Output.Table.Columns))
		for _, column := range capability.Output.Table.Columns {
			columns = append(columns, cliruntime.TableColumn{Key: column.Key, Label: column.Label})
		}
		table = &cliruntime.TableOutput{Columns: columns}
	}
	visibility := string(cliservice.NormalizeCapabilityVisibility(capability.Visibility))
	source := runtimeCapabilitySource(capability.Source)
	defaultMode := string(capability.Output.DefaultMode)
	if defaultMode == "" {
		defaultMode = string(cliservice.OutputModeTable)
	}
	return cliruntime.ManifestCommand{
		Capability: cliruntime.Capability{
			ID:          capability.ID,
			Path:        capability.Path,
			Summary:     capability.Summary,
			Description: stringPointerIfNotEmpty(capability.Description),
			Visibility:  &visibility,
			InputSchema: mapPointerIfNotEmpty(capability.InputSchema),
			Output: cliruntime.CapabilityOutput{
				DefaultMode: defaultMode,
				JSON:        capability.Output.JSON,
				Table:       table,
			},
			Source: source,
		},
		Conditions: cliruntime.CommandConditions{
			RegistrationGates:     capability.Conditions.RegistrationGates,
			ProviderAvailability:  capability.Conditions.ProviderAvailability,
			IntegrationVisibility: capability.Conditions.IntegrationVisibility,
			RequestContext:        runtimeRequestContext(capability.Conditions.RequestContext),
		},
	}
}

func runtimeRequestContext(conditions []cliservice.RequestContextCondition) []cliruntime.RequestContextCondition {
	result := make([]cliruntime.RequestContextCondition, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, cliruntime.RequestContextCondition{ID: condition.ID, Required: condition.Required})
	}
	return result
}

func runtimeCapabilitySource(source cliservice.CapabilitySource) cliruntime.CapabilitySource {
	if source.Kind != cliservice.CapabilitySourceApp {
		return cliruntime.CapabilitySource{Kind: string(cliservice.CapabilitySourceBuiltin)}
	}
	return cliruntime.CapabilitySource{
		Kind:              string(cliservice.CapabilitySourceApp),
		AppID:             stringPointerIfNotEmpty(source.AppID),
		AppName:           stringPointerIfNotEmpty(source.AppName),
		IconURL:           stringPointerIfNotEmpty(source.IconURL),
		CLIDescription:    stringPointerIfNotEmpty(source.CLIDescription),
		AppDescription:    stringPointerIfNotEmpty(source.AppDescription),
		DocumentationFile: stringPointerIfNotEmpty(source.DocumentationFile),
		DocumentationPath: stringPointerIfNotEmpty(source.DocumentationPath),
	}
}

func stringPointerIfNotEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func mapPointerIfNotEmpty(value map[string]any) *map[string]any {
	if len(value) == 0 {
		return nil
	}
	return &value
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
