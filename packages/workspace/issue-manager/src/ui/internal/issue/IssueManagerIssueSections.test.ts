import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const issueSectionsSource = readFileSync(
  new URL("./IssueManagerIssueSections.tsx", import.meta.url),
  "utf8"
);
const subtaskBoardSource = readFileSync(
  new URL("./IssueManagerSubtaskBoard.tsx", import.meta.url),
  "utf8"
);

test("execution outputs render as clickable file rows without trailing open buttons", () => {
  assert.match(issueSectionsSource, /FileIcon/);
  assert.match(issueSectionsSource, /--folder/);
  assert.match(issueSectionsSource, /output\.path/);
  assert.match(issueSectionsSource, /formatIssueManagerTimestamp/);
  assert.match(issueSectionsSource, /void onOpen\(\{/);
  assert.match(
    issueSectionsSource,
    /aria-label=\{copy\.t\("actions\.openReference"\)\}/
  );
  assert.doesNotMatch(issueSectionsSource, /ArrowRightIcon/);
  assert.doesNotMatch(
    issueSectionsSource,
    /copy\.t\("actions\.openReference"\)\}\s*<ArrowRightIcon/
  );
});

test("execution output file icon container is borderless", () => {
  assert.match(
    issueSectionsSource,
    /rounded-md bg-\[color-mix\(in_srgb,var\(--folder\)_12%,transparent\)\] text-\[var\(--folder\)\]/
  );
  assert.doesNotMatch(
    issueSectionsSource,
    /rounded-md border border-\[var\(--line-2\)\] bg-\[color-mix\(in_srgb,var\(--folder\)_12%,transparent\)\]/
  );
});

test("subtask board cards keep stable borderless background", () => {
  const boardColumnStart = subtaskBoardSource.indexOf(
    "function IssueManagerSubtaskBoardColumn"
  );
  const boardColumnEnd = subtaskBoardSource.indexOf(
    "function resolveIssueManagerBoardColumnClassName"
  );
  const boardColumnSource = subtaskBoardSource.slice(
    boardColumnStart,
    boardColumnEnd
  );

  assert.match(boardColumnSource, /bg-\[var\(--background-fronted\)\]/);
  assert.match(boardColumnSource, /rounded-\[8px\]/);
  assert.doesNotMatch(boardColumnSource, /border border-\[var\(--line-2\)\]/);
  assert.doesNotMatch(boardColumnSource, /hover:bg/);
  assert.doesNotMatch(boardColumnSource, /bg-transparency-actived/);
});

test("subtask board accepts same-column ordering and allowed status moves", () => {
  assert.match(issueSectionsSource, /onMoveTask=\{onMoveTask\}/);
  assert.match(
    subtaskBoardSource,
    /sourceStatus: IssueManagerSubtaskBoardStatus/
  );
  assert.match(
    subtaskBoardSource,
    /input\.sourceStatus === input\.targetStatus/
  );
  assert.match(
    subtaskBoardSource,
    /function canIssueManagerCrossColumnDropTaskStatus/
  );
  assert.match(
    subtaskBoardSource,
    /targetStatus === "not_started" \|\|[\s\S]*targetStatus === "completed"/
  );
  assert.match(
    subtaskBoardSource,
    /targetStatus === "not_started" \|\|[\s\S]*targetStatus === "pending_acceptance"/
  );
  assert.match(subtaskBoardSource, /draggable/);
  assert.match(subtaskBoardSource, /data-issue-manager-board-card-task-id/);
  assert.match(subtaskBoardSource, /dataset\.issueManagerBoardCardTaskId/);
  assert.match(subtaskBoardSource, /data-task-status-drop-target/);
  assert.match(subtaskBoardSource, /void onMoveTask\(\{/);
  assert.match(subtaskBoardSource, /targetIndex/);
  assert.match(subtaskBoardSource, /targetStatus: status/);
  assert.doesNotMatch(subtaskBoardSource, /hasIssueManagerTaskStatusDragData/);
});

test("subtask board keeps the source card mounted during same-column preview", () => {
  assert.match(
    subtaskBoardSource,
    /function orderIssueManagerTasksForSameColumnDropPreview/
  );
  assert.match(subtaskBoardSource, /const movingTask/);
  assert.match(subtaskBoardSource, /const nextTasks/);
  assert.match(
    subtaskBoardSource,
    /nextTasks\.splice\(targetIndex, 0, movingTask\)/
  );
  assert.match(subtaskBoardSource, /const renderTasks/);
  assert.match(subtaskBoardSource, /isSameColumnDropPreview/);
  assert.match(subtaskBoardSource, /activeDropPreviewDragState/);
  assert.match(subtaskBoardSource, /\{renderTasks\.map\(\(task, index\) =>/);
  assert.doesNotMatch(
    subtaskBoardSource,
    /tasks\.filter\(\(task\) => task\.taskId !== dragState\.taskId\)/
  );
});

test("subtask board keeps drop preview stable during fast in-column drags", () => {
  assert.match(subtaskBoardSource, /function isLeavingIssueManagerBoardColumn/);
  assert.match(
    subtaskBoardSource,
    /event\.currentTarget\.getBoundingClientRect\(\)/
  );
  assert.match(subtaskBoardSource, /event\.clientX >= rect\.left/);
  assert.match(subtaskBoardSource, /event\.clientY <= rect\.bottom/);
});

test("subtask board shows opaque drag card with soft shadow and colored drop preview", () => {
  assert.match(
    subtaskBoardSource,
    /issueManagerSubtaskDragShadow = "var\(--shadow-soft\)"/
  );
  assert.match(subtaskBoardSource, /boxShadow = issueManagerSubtaskDragShadow/);
  assert.match(subtaskBoardSource, /opacity = "1"/);
  assert.doesNotMatch(subtaskBoardSource, /opacity = "0\.96"/);
  assert.match(subtaskBoardSource, /transition-shadow/);
  assert.doesNotMatch(subtaskBoardSource, /transition-\[box-shadow,opacity\]/);
  assert.match(subtaskBoardSource, /event\.dataTransfer\.setDragImage/);
  assert.match(
    subtaskBoardSource,
    /isDraggingTask && issueManagerSubtaskDragShadowClassName/
  );
  assert.doesNotMatch(subtaskBoardSource, /shadow-panel/);
  assert.match(subtaskBoardSource, /data-task-status-drop-preview/);
  assert.match(
    subtaskBoardSource,
    /function resolveIssueManagerBoardPlaceholderClassName/
  );
});

test("subtask board uses tutti purple for in review status color", () => {
  const inReviewColorSource = subtaskBoardSource.slice(
    subtaskBoardSource.indexOf(
      "function resolveIssueManagerBoardPlaceholderClassName"
    ),
    subtaskBoardSource.indexOf("function resolveIssueManagerBoardDotClassName")
  );

  assert.match(inReviewColorSource, /var\(--tutti-purple\)_24%/);
  assert.match(inReviewColorSource, /var\(--tutti-purple\)_18%/);
  assert.match(inReviewColorSource, /var\(--tutti-purple\)_12%/);
  assert.match(inReviewColorSource, /var\(--tutti-purple\)_8%/);
  assert.match(
    subtaskBoardSource,
    /case "pending_acceptance":[\s\S]*?return "bg-\[var\(--tutti-purple\)\]"/
  );
  assert.doesNotMatch(
    inReviewColorSource,
    /pending_acceptance":[\s\S]*?state-warning/
  );
});

test("subtask board keeps dropped cards in the target column while status refreshes", () => {
  assert.match(subtaskBoardSource, /type IssueManagerSubtaskOptimisticDrop/);
  assert.match(
    subtaskBoardSource,
    /groupIssueManagerSubtasksByStatus\(tasks, optimisticDrop\)/
  );
  assert.match(subtaskBoardSource, /setOptimisticDrop\(null\)/);
  assert.match(subtaskBoardSource, /onOptimisticDropChange\(\{/);
  assert.match(subtaskBoardSource, /isIssueManagerOptimisticDropSettled/);
  assert.match(subtaskBoardSource, /const optimisticTask = tasks\.find/);
  assert.match(
    subtaskBoardSource,
    /resolveIssueManagerSubtaskBoardStatus\(optimisticTask\.status\) !==[\s\S]*optimisticDrop\.status/
  );
  assert.match(subtaskBoardSource, /return false/);
  assert.match(subtaskBoardSource, /onMoveTask\(\{[\s\S]*\}\)\.catch/);
});

test("subtask board animates pushed cards with reduced-motion support", () => {
  assert.match(subtaskBoardSource, /useIssueManagerBoardLayoutAnimation/);
  assert.match(
    subtaskBoardSource,
    /issueManagerBoardLayoutAnimationDurationMs = 180/
  );
  assert.match(subtaskBoardSource, /getBoundingClientRect/);
  assert.match(subtaskBoardSource, /element\.animate/);
  assert.match(subtaskBoardSource, /didScrollSinceLastLayout/);
  assert.match(subtaskBoardSource, /activeVisualTopByKey/);
  assert.match(subtaskBoardSource, /animation\.cancel\(\)/);
  assert.match(
    subtaskBoardSource,
    /activeVisualTopByKey\.get\(key\) \?\? previousRect\.top/
  );
  assert.match(subtaskBoardSource, /translate3d\(0, \$\{deltaY\}px, 0\)/);
  assert.match(subtaskBoardSource, /prefers-reduced-motion: reduce/);
  assert.match(
    subtaskBoardSource,
    /data-issue-manager-board-layout-item=\{`task:\$\{status\}:\$\{task\.taskId\}`\}/
  );
  assert.doesNotMatch(
    subtaskBoardSource,
    /data-issue-manager-board-layout-item=\{`task:\$\{task\.taskId\}`\}/
  );
});
