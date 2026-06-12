import type {
  IssueManagerIssueSummary,
  IssueManagerStatusCounts
} from "../../../contracts/index.ts";
import type { IssueManagerI18nRuntime } from "../../../i18n/issueManagerI18n.ts";
import type { AsyncCollectionState } from "../../../services/controllerTypes.ts";
import type { IssueManagerEditorMode } from "../../../services/controllerModel.ts";

export const issueManagerStatusFilters = [
  "all",
  "not_started",
  "running",
  "in_progress",
  "pending_acceptance",
  "completed",
  "failed",
  "canceled"
] as const;

export type IssueManagerSidebarViewState =
  | {
      kind: "loading";
    }
  | {
      kind: "error";
      retryLabel: string;
      title: string;
    }
  | {
      body: string;
      kind: "empty";
      title: string;
    }
  | {
      issues: readonly IssueManagerIssueSummary[];
      kind: "list";
    };

export function resolveIssueManagerSidebarViewState(input: {
  copy: IssueManagerI18nRuntime;
  issues: AsyncCollectionState<IssueManagerIssueSummary[]>;
}): IssueManagerSidebarViewState {
  if (
    input.issues.isLoading &&
    input.issues.value.length === 0 &&
    input.issues.hasResolved !== true
  ) {
    return {
      kind: "loading"
    };
  }

  if (input.issues.error) {
    return {
      kind: "error",
      retryLabel: input.copy.t("actions.refresh"),
      title: input.copy.t("messages.issueRefreshFailed")
    };
  }

  if (input.issues.value.length === 0) {
    return {
      body: input.copy.t("messages.noIssuesForFilterBody"),
      kind: "empty",
      title: input.copy.t("messages.noIssuesForFilterTitle")
    };
  }

  return {
    issues: input.issues.value,
    kind: "list"
  };
}

export function buildIssueManagerStatusCounts(
  issues: readonly IssueManagerIssueSummary[]
): Record<(typeof issueManagerStatusFilters)[number], number> {
  const counts: Record<(typeof issueManagerStatusFilters)[number], number> = {
    all: issues.length,
    canceled: 0,
    completed: 0,
    failed: 0,
    in_progress: 0,
    not_started: 0,
    pending_acceptance: 0,
    running: 0
  };

  for (const issue of issues) {
    if (issue.status in counts) {
      counts[issue.status as keyof typeof counts] += 1;
    }
  }

  return counts;
}

export function resolveIssueManagerStatusCounts(
  input: AsyncCollectionState<IssueManagerIssueSummary[]>
): Record<(typeof issueManagerStatusFilters)[number], number> {
  return input.statusCounts
    ? mapIssueManagerStatusCounts(input.statusCounts)
    : buildIssueManagerStatusCounts(input.value);
}

function mapIssueManagerStatusCounts(
  counts: IssueManagerStatusCounts
): Record<(typeof issueManagerStatusFilters)[number], number> {
  return {
    all: counts.all,
    canceled: counts.canceled,
    completed: counts.completed,
    failed: counts.failed,
    in_progress: counts.inProgress,
    not_started: counts.notStarted,
    pending_acceptance: counts.pendingAcceptance,
    running: counts.running
  };
}

export interface IssueManagerShellContentViewState {
  isIssueEditing: boolean;
  isTaskCreating: boolean;
  isTaskDrawerOpen: boolean;
  showBottomBar: boolean;
}

export function resolveIssueManagerShellContentViewState(input: {
  issueEditorMode: IssueManagerEditorMode;
  selectedIssue: IssueManagerIssueSummary | null;
  selectedTaskPresent: boolean;
  taskEditorMode: IssueManagerEditorMode;
}): IssueManagerShellContentViewState {
  const isIssueEditing = input.issueEditorMode !== "read";
  const isTaskCreating = !isIssueEditing && input.taskEditorMode === "create";
  const isTaskDrawerOpen =
    !isIssueEditing &&
    !isTaskCreating &&
    (input.taskEditorMode === "edit" || input.selectedTaskPresent);

  return {
    isIssueEditing,
    isTaskCreating,
    isTaskDrawerOpen,
    showBottomBar:
      input.selectedIssue !== null &&
      input.issueEditorMode === "read" &&
      input.taskEditorMode !== "create"
  };
}
