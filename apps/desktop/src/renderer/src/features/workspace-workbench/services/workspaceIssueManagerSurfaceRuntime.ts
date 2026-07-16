import type { IssueManagerFeature } from "@tutti-os/workspace-issue-manager/core";
import type { WorkbenchContribution } from "@tutti-os/workbench-surface";

export interface WorkspaceIssueManagerSurfaceRuntime {
  feature: IssueManagerFeature;
}

const workspaceIssueManagerSurfaceRuntimeByContribution = new WeakMap<
  WorkbenchContribution,
  WorkspaceIssueManagerSurfaceRuntime
>();

export function getWorkspaceIssueManagerSurfaceRuntime(
  contribution: WorkbenchContribution
): WorkspaceIssueManagerSurfaceRuntime | null {
  return (
    workspaceIssueManagerSurfaceRuntimeByContribution.get(contribution) ?? null
  );
}

export function registerWorkspaceIssueManagerSurfaceRuntime(
  contribution: WorkbenchContribution,
  runtime: WorkspaceIssueManagerSurfaceRuntime
): void {
  workspaceIssueManagerSurfaceRuntimeByContribution.set(contribution, runtime);
}
