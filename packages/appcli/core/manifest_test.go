package core

import "testing"

func TestValidateManifestRejectsReservedHandlerPath(t *testing.T) {
	err := ValidateManifest(Manifest{
		SchemaVersion: ManifestSchemaVersion,
		Scope:         "automation",
		Commands: []ManifestCommand{{
			Path:    []string{"run"},
			Summary: "Run automation",
			Output:  ManifestCommandOutput{DefaultMode: OutputModeJSON, JSON: true},
			Handler: ManifestCommandHandler{Kind: "http", Method: "POST", Path: "/run"},
		}},
	})
	if err == nil {
		t.Fatal("ValidateManifest() error = nil, want handler path error")
	}
}

func TestBuildCommandsBuildsAppCapability(t *testing.T) {
	manifest := Manifest{
		SchemaVersion: ManifestSchemaVersion,
		Scope:         "automation",
		Description:   "Automation commands",
		Commands: []ManifestCommand{{
			Path:        []string{"run"},
			Summary:     "Run automation",
			Description: "Runs a job",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{"name": map[string]any{"type": "string"}}},
			Output:      ManifestCommandOutput{DefaultMode: OutputModeJSON, JSON: true},
			Handler:     ManifestCommandHandler{Kind: "http", Method: "POST", Path: "/tutti/cli/run"},
		}},
	}

	commands := BuildCommands(manifest, CommandBuildOptions{
		AppID:             "automation-app",
		AppName:           "Automation",
		IconURL:           "data:image/png;base64,abc",
		AppDescription:    "Test app",
		DocumentationFile: "COMMANDS.md",
		DocumentationPath: "/tmp/COMMANDS.md",
	})

	if len(commands) != 1 {
		t.Fatalf("commands = %#v", commands)
	}
	capability := commands[0].Capability
	if capability.ID != "app.automation-app.automation.run" || capability.Path[0] != "automation" {
		t.Fatalf("capability = %#v", capability)
	}
	if capability.Source.AppID != "automation-app" || capability.Source.CLIDescription != "Automation commands" {
		t.Fatalf("capability source = %#v", capability.Source)
	}
}
