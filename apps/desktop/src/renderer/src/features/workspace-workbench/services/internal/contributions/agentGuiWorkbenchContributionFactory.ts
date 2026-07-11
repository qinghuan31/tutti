import type { DesktopWorkbenchContributionFactory } from "../workspaceWorkbenchContributionFactory";
import { createWorkspaceAgentGuiContribution } from "../workspaceAgentGuiContribution.ts";

export const agentGuiWorkbenchContributionFactory: DesktopWorkbenchContributionFactory =
  {
    id: "workspace-agent-gui",
    order: 25,
    create(context) {
      return createWorkspaceAgentGuiContribution({
        agentProviderStatusService: context.agentProviderStatusService,
        appCenterService: context.appCenterService,
        appI18n: context.appI18n,
        computerUseApi: context.computerUseApi,
        dockIconUrls: context.dockIcons.agents,
        unifiedDockIconUrl: context.dockIcons.agentUnified,
        dockPreviewCache: context.dockPreviewCache,
        defaultAgentProvider: context.defaultAgentProvider,
        defaultAgentTargetId: context.defaultAgentTargetId,
        hostFilesApi: context.hostFilesApi,
        hostWindowApi: context.hostWindowApi,
        i18n: context.i18n,
        onCapabilitySettingsRequest: context.onCapabilitySettingsRequest,
        agents: context.agents,
        agentsLoading: context.agentsLoading,
        renderAgentsEmpty: context.renderAgentsEmpty,
        comingSoonAgentProviders: context.comingSoonAgentProviders,
        tuttidClient: context.tuttidClient,
        platformApi: context.platformApi,
        reporterService: context.reporterService,
        richTextAtService: context.richTextAtService,
        runtimeApi: context.runtimeApi,
        workspaceAgentActivityService: context.workspaceAgentActivityService,
        workspaceFileManagerService: context.workspaceFileManagerService,
        workspaceUserProjectService: context.workspaceUserProjectService,
        workspaceId: context.workspaceId
      });
    }
  };
