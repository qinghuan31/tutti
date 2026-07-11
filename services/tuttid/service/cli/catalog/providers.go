package catalog

import (
	"context"

	agenttargetbiz "github.com/tutti-os/tutti/services/tuttid/biz/agenttarget"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	agentcontextcli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/agentcontext"
	browsercli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/browser"
	computercli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/computer"
	diagnosticscli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/diagnostics"
	issuemanagercli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/issuemanager"
	referencescli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/references"
	"github.com/tutti-os/tutti/services/tuttid/service/cli/providers/refresolve"
	workbenchappscli "github.com/tutti-os/tutti/services/tuttid/service/cli/providers/workbenchapps"
)

type Dependencies struct {
	Workspaces      cliservice.WorkspaceCatalog
	Issues          issuemanagercli.IssueManager
	AppReferences   refresolve.AppReferences
	IssueOutputs    referencescli.IssueOutputs
	AppLauncher     workbenchappscli.AppLauncher
	WorkbenchLaunch workbenchappscli.WorkbenchNodeLaunchPublisher
	AgentSessions   agentcontextcli.AgentSessions
	AgentLaunch     agentcontextcli.AgentGUILaunchPublisher
	AgentTargets    agentcontextcli.AgentTargetLister
	Preferences     agentcontextcli.DesktopPreferencesReader
	Browser         browsercli.BrowserService
	Computer        computercli.ComputerService
}

func Providers(dependencies Dependencies) []cliservice.Provider {
	return providers(dependencies, false)
}

func CanonicalProviders() []cliservice.Provider {
	return providers(Dependencies{}, true)
}

func providers(dependencies Dependencies, includeUnavailable bool) []cliservice.Provider {
	agentTargets := dependencies.AgentTargets
	if includeUnavailable && agentTargets == nil {
		agentTargets = staticAgentTargets{}
	}
	result := []cliservice.Provider{
		diagnosticscli.NewProvider(),
		issuemanagercli.NewProvider(dependencies.Workspaces, dependencies.Issues, dependencies.AppReferences),
		referencescli.NewProvider(dependencies.Workspaces, dependencies.AppReferences, dependencies.IssueOutputs),
		workbenchappscli.NewProvider(dependencies.Workspaces, dependencies.AppLauncher, dependencies.WorkbenchLaunch),
		agentcontextcli.NewProviderWithAgentTargets(
			dependencies.Workspaces,
			dependencies.AgentSessions,
			dependencies.AgentLaunch,
			agentTargets,
			dependencies.Preferences,
		),
	}
	if includeUnavailable || dependencies.Browser != nil {
		result = append(result, browsercli.NewProvider(dependencies.Workspaces, dependencies.Browser))
	}
	if includeUnavailable || dependencies.Computer != nil {
		result = append(result, computercli.NewProvider(dependencies.Workspaces, dependencies.Computer))
	}
	return result
}

type staticAgentTargets struct{}

func (staticAgentTargets) List(context.Context) ([]agenttargetbiz.Target, error) {
	return nil, nil
}
