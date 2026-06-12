import assert from "node:assert/strict";
import test from "node:test";
import type { IssueManagerIssueSummary } from "../../../contracts/index.ts";
import type { IssueManagerI18nRuntime } from "../../../i18n/issueManagerI18n.ts";
import {
  buildIssueManagerStatusCounts,
  resolveIssueManagerStatusCounts,
  resolveIssueManagerShellContentViewState,
  resolveIssueManagerSidebarViewState
} from "./IssueManagerShellState.ts";

test("sidebar view state prefers loading when the first list request is in flight", () => {
  assert.deepEqual(
    resolveIssueManagerSidebarViewState({
      copy: createCopy(),
      issues: {
        error: null,
        isLoading: true,
        value: []
      }
    }),
    {
      kind: "loading"
    }
  );
});

test("sidebar view state keeps empty state while a resolved list refreshes", () => {
  assert.deepEqual(
    resolveIssueManagerSidebarViewState({
      copy: createCopy(),
      issues: {
        error: null,
        hasResolved: true,
        isLoading: true,
        value: []
      }
    }),
    {
      body: "messages.noIssuesForFilterBody",
      kind: "empty",
      title: "messages.noIssuesForFilterTitle"
    }
  );
});

test("sidebar view state prefers error over empty when the request fails", () => {
  assert.deepEqual(
    resolveIssueManagerSidebarViewState({
      copy: createCopy(),
      issues: {
        error: "Workspace issues request failed.",
        isLoading: false,
        value: []
      }
    }),
    {
      kind: "error",
      retryLabel: "actions.refresh",
      title: "messages.issueRefreshFailed"
    }
  );
});

test("sidebar view state falls back to empty only when there is no error", () => {
  assert.deepEqual(
    resolveIssueManagerSidebarViewState({
      copy: createCopy(),
      issues: {
        error: null,
        isLoading: false,
        value: []
      }
    }),
    {
      body: "messages.noIssuesForFilterBody",
      kind: "empty",
      title: "messages.noIssuesForFilterTitle"
    }
  );
});

test("sidebar view state keeps rendered issues when data is available", () => {
  const issues = [
    createIssueSummary({
      issueId: "issue-1",
      title: "Plan migration"
    })
  ];

  assert.deepEqual(
    resolveIssueManagerSidebarViewState({
      copy: createCopy(),
      issues: {
        error: null,
        isLoading: false,
        value: issues
      }
    }),
    {
      issues,
      kind: "list"
    }
  );
});

test("buildIssueManagerStatusCounts includes all issues and status buckets", () => {
  const issues = [
    createIssueSummary({
      issueId: "issue-1",
      status: "running",
      title: "Plan migration"
    }),
    createIssueSummary({
      issueId: "issue-2",
      status: "completed",
      title: "Port renderer"
    })
  ];

  assert.deepEqual(buildIssueManagerStatusCounts(issues), {
    all: 2,
    canceled: 0,
    completed: 1,
    failed: 0,
    in_progress: 0,
    not_started: 0,
    pending_acceptance: 0,
    running: 1
  });
});

test("resolveIssueManagerStatusCounts prefers backend totals over current filtered issues", () => {
  assert.deepEqual(
    resolveIssueManagerStatusCounts({
      error: null,
      isLoading: false,
      statusCounts: {
        all: 2,
        canceled: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        notStarted: 2,
        pendingAcceptance: 0,
        running: 0
      },
      value: []
    }),
    {
      all: 2,
      canceled: 0,
      completed: 0,
      failed: 0,
      in_progress: 0,
      not_started: 2,
      pending_acceptance: 0,
      running: 0
    }
  );
});

test("resolveIssueManagerStatusCounts maps backend in-progress totals", () => {
  assert.deepEqual(
    resolveIssueManagerStatusCounts({
      error: null,
      isLoading: false,
      statusCounts: {
        all: 3,
        canceled: 0,
        completed: 0,
        failed: 0,
        inProgress: 3,
        notStarted: 0,
        pendingAcceptance: 0,
        running: 0
      },
      value: []
    }),
    {
      all: 3,
      canceled: 0,
      completed: 0,
      failed: 0,
      in_progress: 3,
      not_started: 0,
      pending_acceptance: 0,
      running: 0
    }
  );
});

test("shell content view state prefers issue editing over task flows", () => {
  assert.deepEqual(
    resolveIssueManagerShellContentViewState({
      issueEditorMode: "edit",
      selectedIssue: createIssueSummary({
        issueId: "issue-1",
        title: "Plan migration"
      }),
      selectedTaskPresent: true,
      taskEditorMode: "edit"
    }),
    {
      isIssueEditing: true,
      isTaskCreating: false,
      isTaskDrawerOpen: false,
      showBottomBar: false
    }
  );
});

test("shell content view state opens the task drawer for selected tasks in read mode", () => {
  assert.deepEqual(
    resolveIssueManagerShellContentViewState({
      issueEditorMode: "read",
      selectedIssue: createIssueSummary({
        issueId: "issue-1",
        title: "Plan migration"
      }),
      selectedTaskPresent: true,
      taskEditorMode: "read"
    }),
    {
      isIssueEditing: false,
      isTaskCreating: false,
      isTaskDrawerOpen: true,
      showBottomBar: true
    }
  );
});

test("shell content view state keeps the bottom bar while editing a selected task", () => {
  assert.deepEqual(
    resolveIssueManagerShellContentViewState({
      issueEditorMode: "read",
      selectedIssue: createIssueSummary({
        issueId: "issue-1",
        title: "Plan migration"
      }),
      selectedTaskPresent: true,
      taskEditorMode: "edit"
    }),
    {
      isIssueEditing: false,
      isTaskCreating: false,
      isTaskDrawerOpen: true,
      showBottomBar: true
    }
  );
});

function createCopy(): IssueManagerI18nRuntime {
  return {
    t(key: string) {
      return key;
    }
  } as IssueManagerI18nRuntime;
}

function createIssueSummary(
  input: Pick<IssueManagerIssueSummary, "issueId" | "title"> &
    Partial<Pick<IssueManagerIssueSummary, "status">>
): IssueManagerIssueSummary {
  return {
    creatorUserId: "local",
    issueId: input.issueId,
    status: input.status ?? "not_started",
    title: input.title,
    topicId: "topic-1",
    workspaceId: "workspace-1"
  };
}
