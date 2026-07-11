package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/tutti-os/tutti/apps/cli/internal/daemon"
	"github.com/tutti-os/tutti/apps/cli/internal/defaults"
	cliruntime "github.com/tutti-os/tutti/packages/cli/runtime"
)

func RunWithProgram(ctx context.Context, program string, args []string, stdout io.Writer, stderr io.Writer) int {
	return newRunner(displayCommandName(program)).RunArgs(ctx, args, stdout, stderr)
}

func displayCommandName(program string) string {
	name := filepath.Base(strings.TrimSpace(program))
	if name == "." || name == "" {
		name = "tutti"
	}
	if strings.EqualFold(name, "tutti") && isDevelopmentCLI(program) {
		return "tutti-dev"
	}
	return name
}

func isDevelopmentCLI(program string) bool {
	cleanProgram := filepath.Clean(program)
	devBuildSegment := "build" + string(filepath.Separator) + "dev" + string(filepath.Separator)
	if strings.HasPrefix(cleanProgram, devBuildSegment) ||
		strings.Contains(cleanProgram, string(filepath.Separator)+devBuildSegment) {
		return true
	}
	return defaults.ResolveDefaultsFromEnv().Runtime.Env == "development"
}

func runStatus(ctx context.Context, commandName string, args []string, options cliruntime.Options, stdout io.Writer, stderr io.Writer) int {
	if len(args) != 0 {
		fmt.Fprintf(stderr, "usage: %s status [--json]\n", commandName)
		return cliruntime.ExitUsage
	}
	client, err := discoverClient()
	if err != nil {
		fmt.Fprintf(stderr, "%s status: %v\n", commandName, err)
		return cliruntime.ExitInvokeFailure
	}
	health, err := client.GetHealth(ctx)
	if err != nil {
		fmt.Fprintf(stderr, "%s status: %v\n", commandName, err)
		return cliruntime.ExitInvokeFailure
	}

	if options.JSON {
		return writeJSON(stdout, stderr, health)
	}

	fmt.Fprintf(stdout, "service: %s\nstatus: %s\n", health.Service, health.Status)
	return cliruntime.ExitSuccess
}

func newRunner(commandName string) cliruntime.Runner {
	return cliruntime.Runner{
		Client:             &lazyCatalogClient{},
		CommandName:        commandName,
		InvokeContext:      cliInvokeContextFromEnv(),
		IncludeIntegration: includeIntegrationCapabilitiesFromEnv(),
		StaticCommands: []cliruntime.StaticCommand{{
			Name:    "status",
			Summary: "Show local tuttid status",
			Run: func(ctx context.Context, args []string, options cliruntime.Options, stdout io.Writer, stderr io.Writer) int {
				return runStatus(ctx, commandName, args, options, stdout, stderr)
			},
		}},
	}
}

type lazyCatalogClient struct {
	client *daemon.Client
	err    error
}

func (client *lazyCatalogClient) ListCapabilities(ctx context.Context, workspaceID string, options cliruntime.CapabilityListOptions) (cliruntime.CapabilityList, error) {
	resolved, err := client.resolve()
	if err != nil {
		return cliruntime.CapabilityList{}, err
	}
	return resolved.ListCapabilities(ctx, workspaceID, options)
}

func (client *lazyCatalogClient) Invoke(ctx context.Context, commandID string, request cliruntime.InvokeRequest) (cliruntime.InvokeResponse, error) {
	resolved, err := client.resolve()
	if err != nil {
		return cliruntime.InvokeResponse{}, err
	}
	return resolved.Invoke(ctx, commandID, request)
}

func (client *lazyCatalogClient) resolve() (*daemon.Client, error) {
	if client.client == nil && client.err == nil {
		client.client, client.err = discoverClient()
	}
	return client.client, client.err
}

func includeIntegrationCapabilitiesFromEnv() bool {
	return strings.TrimSpace(os.Getenv("TUTTI_APP_ID")) != "" &&
		strings.TrimSpace(os.Getenv("TUTTI_CLI")) != ""
}

func cliInvokeContextFromEnv() cliruntime.InvokeContext {
	return cliruntime.InvokeContext{
		Source:          "cli",
		WorkspaceID:     optionalString(strings.TrimSpace(os.Getenv("TUTTI_WORKSPACE_ID"))),
		ParentCommandID: optionalString(strings.TrimSpace(os.Getenv("TUTTI_APP_CLI_PARENT_COMMAND_ID"))),
		AgentSessionID:  optionalString(strings.TrimSpace(os.Getenv("TUTTI_AGENT_SESSION_ID"))),
	}
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func discoverClient() (*daemon.Client, error) {
	endpoint, err := daemon.DiscoverEndpoint()
	if err != nil {
		return nil, err
	}
	return daemon.NewClient(endpoint)
}

func writeJSON(stdout io.Writer, stderr io.Writer, value any) int {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fmt.Fprintf(stderr, "encode output: %v\n", err)
		return cliruntime.ExitInvokeFailure
	}
	fmt.Fprintln(stdout, string(encoded))
	return cliruntime.ExitSuccess
}
