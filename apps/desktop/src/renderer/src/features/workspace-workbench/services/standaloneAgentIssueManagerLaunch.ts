import type { IssueManagerOpenActivationPayload } from "@tutti-os/workspace-issue-manager/workbench";
import type { WorkbenchHostActivation } from "@tutti-os/workbench-surface";
import type { WorkspaceIssueManagerLaunchRequest } from "./workspaceIssueManagerLaunchCoordinator.ts";

// Value mirror of issueManagerOpenActivationType. Keeping the stable protocol
// literal local lets the Node test runner load this pure coordinator without
// pulling the Issue Manager React workbench barrel.
const standaloneAgentIssueManagerOpenActivationType = "open-workspace-issue";

export interface StandaloneAgentIssueManagerOpenRequest {
  activation: WorkbenchHostActivation<IssueManagerOpenActivationPayload> | null;
  requestID: string;
}

export function createStandaloneAgentIssueManagerOpenRequest(
  request: WorkspaceIssueManagerLaunchRequest,
  sequence: number
): StandaloneAgentIssueManagerOpenRequest {
  const issueId = request.issueId?.trim() || "";
  return {
    activation: issueId
      ? {
          payload: {
            issueId,
            ...(request.mode ? { mode: request.mode } : {}),
            ...(request.outputDir ? { outputDir: request.outputDir } : {}),
            ...(request.runId ? { runId: request.runId } : {}),
            ...(request.taskId ? { taskId: request.taskId } : {}),
            ...(request.topicId ? { topicId: request.topicId } : {})
          },
          sequence,
          type: standaloneAgentIssueManagerOpenActivationType
        }
      : null,
    requestID: `standalone-agent-issue-${sequence}`
  };
}
