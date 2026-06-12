package workspace

import (
	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	nextopgenerated "github.com/tutti-os/tutti/services/nextopd/api/generated"
)

func GeneratedIssueManagerIssueFromDomain(item workspaceissues.Issue) nextopgenerated.IssueManagerIssue {
	return nextopgenerated.IssueManagerIssue{
		IssueId:                item.IssueID,
		WorkspaceId:            item.WorkspaceID,
		TopicId:                item.TopicID,
		Title:                  item.Title,
		Content:                item.Content,
		Status:                 nextopgenerated.IssueManagerStatus(item.Status),
		TaskCount:              item.TaskCount,
		NotStartedCount:        item.NotStartedCount,
		RunningCount:           item.RunningCount,
		PendingAcceptanceCount: item.PendingAcceptanceCount,
		CompletedCount:         item.CompletedCount,
		FailedCount:            item.FailedCount,
		CanceledCount:          item.CanceledCount,
		CreatorUserId:          item.CreatorUserID,
		CreatorDisplayName:     item.CreatorDisplayName,
		CreatorAvatarUrl:       item.CreatorAvatarURL,
		CreatedAtUnix:          unixSecondsFromMillis(item.CreatedAtUnixMS),
		UpdatedAtUnix:          unixSecondsFromMillis(item.UpdatedAtUnixMS),
	}
}

func GeneratedIssueManagerTopicFromDomain(item workspaceissues.Topic) nextopgenerated.IssueManagerTopic {
	return nextopgenerated.IssueManagerTopic{
		TopicId:            item.TopicID,
		WorkspaceId:        item.WorkspaceID,
		Title:              item.Title,
		Summary:            item.Summary,
		IsDefault:          item.IsDefault,
		PinnedAtUnix:       unixSecondsFromMillis(item.PinnedAtUnixMS),
		LastActivityAtUnix: unixSecondsFromMillis(item.LastActivityAtUnixMS),
		CreatedAtUnix:      unixSecondsFromMillis(item.CreatedAtUnixMS),
		UpdatedAtUnix:      unixSecondsFromMillis(item.UpdatedAtUnixMS),
	}
}

func GeneratedIssueManagerTopicsFromDomain(items []workspaceissues.Topic) []nextopgenerated.IssueManagerTopic {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerTopic{}
	}
	result := make([]nextopgenerated.IssueManagerTopic, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerTopicFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerTopicListResponseFromDomain(list workspaceissues.TopicList) nextopgenerated.IssueManagerTopicListResponse {
	return nextopgenerated.IssueManagerTopicListResponse{
		Topics: GeneratedIssueManagerTopicsFromDomain(list.Items),
	}
}

func GeneratedIssueManagerTopicResponseFromDomain(item workspaceissues.Topic) nextopgenerated.IssueManagerTopicResponse {
	return nextopgenerated.IssueManagerTopicResponse{
		Topic: GeneratedIssueManagerTopicFromDomain(item),
	}
}

func GeneratedIssueManagerIssueListResponseFromDomain(list workspaceissues.IssueList) nextopgenerated.IssueManagerIssueListResponse {
	return nextopgenerated.IssueManagerIssueListResponse{
		Issues:        GeneratedIssueManagerIssuesFromDomain(list.Items),
		NextPageToken: stringPointerIfNotEmpty(list.NextPageToken),
		TotalCount:    list.TotalCount,
		StatusCounts:  GeneratedIssueManagerStatusCountsFromDomain(list.StatusCounts),
	}
}

func GeneratedIssueManagerIssueResponseFromDomain(item workspaceissues.Issue) nextopgenerated.IssueManagerIssueResponse {
	return nextopgenerated.IssueManagerIssueResponse{
		Issue: GeneratedIssueManagerIssueFromDomain(item),
	}
}

func GeneratedIssueManagerIssueDetailResponseFromDomain(detail workspaceissues.IssueDetail) nextopgenerated.IssueManagerIssueDetailResponse {
	return nextopgenerated.IssueManagerIssueDetailResponse{
		Issue:         GeneratedIssueManagerIssueFromDomain(detail.Issue),
		Tasks:         GeneratedIssueManagerTasksFromDomain(detail.Tasks),
		ContextRefs:   GeneratedIssueManagerContextRefsFromDomain(detail.ContextRefs),
		LatestRun:     latestRunPointer(detail.LatestRun),
		RecentRuns:    GeneratedIssueManagerRunsFromDomain(detail.RecentRuns),
		LatestOutputs: GeneratedIssueManagerRunOutputsFromDomain(detail.LatestOutputs),
	}
}

func GeneratedIssueManagerIssuesFromDomain(items []workspaceissues.Issue) []nextopgenerated.IssueManagerIssue {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerIssue{}
	}
	result := make([]nextopgenerated.IssueManagerIssue, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerIssueFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerTaskFromDomain(item workspaceissues.Task) nextopgenerated.IssueManagerTask {
	return nextopgenerated.IssueManagerTask{
		TaskId:             item.TaskID,
		IssueId:            item.IssueID,
		WorkspaceId:        item.WorkspaceID,
		Title:              item.Title,
		Content:            item.Content,
		Status:             nextopgenerated.IssueManagerStatus(item.Status),
		Priority:           nextopgenerated.IssueManagerPriority(item.Priority),
		SortIndex:          item.SortIndex,
		DueAtUnix:          unixSecondsFromMillis(item.DueAtUnixMS),
		CreatorUserId:      item.CreatorUserID,
		CreatorDisplayName: item.CreatorDisplayName,
		CreatorAvatarUrl:   item.CreatorAvatarURL,
		LatestRunId:        item.LatestRunID,
		CreatedAtUnix:      unixSecondsFromMillis(item.CreatedAtUnixMS),
		UpdatedAtUnix:      unixSecondsFromMillis(item.UpdatedAtUnixMS),
	}
}

func GeneratedIssueManagerTaskListResponseFromDomain(list workspaceissues.TaskList) nextopgenerated.IssueManagerTaskListResponse {
	return nextopgenerated.IssueManagerTaskListResponse{
		Tasks:         GeneratedIssueManagerTasksFromDomain(list.Items),
		NextPageToken: stringPointerIfNotEmpty(list.NextPageToken),
		TotalCount:    list.TotalCount,
		StatusCounts:  GeneratedIssueManagerStatusCountsFromDomain(list.StatusCounts),
	}
}

func GeneratedIssueManagerTaskResponseFromDomain(item workspaceissues.Task) nextopgenerated.IssueManagerTaskResponse {
	return nextopgenerated.IssueManagerTaskResponse{
		Task: GeneratedIssueManagerTaskFromDomain(item),
	}
}

func GeneratedIssueManagerTaskDetailResponseFromDomain(detail workspaceissues.TaskDetail) nextopgenerated.IssueManagerTaskDetailResponse {
	return nextopgenerated.IssueManagerTaskDetailResponse{
		Task:          GeneratedIssueManagerTaskFromDomain(detail.Task),
		ContextRefs:   GeneratedIssueManagerContextRefsFromDomain(detail.ContextRefs),
		LatestRun:     latestRunPointer(detail.LatestRun),
		RecentRuns:    GeneratedIssueManagerRunsFromDomain(detail.RecentRuns),
		LatestOutputs: GeneratedIssueManagerRunOutputsFromDomain(detail.LatestOutputs),
	}
}

func GeneratedIssueManagerTasksFromDomain(items []workspaceissues.Task) []nextopgenerated.IssueManagerTask {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerTask{}
	}
	result := make([]nextopgenerated.IssueManagerTask, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerTaskFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerRunFromDomain(item workspaceissues.Run) nextopgenerated.IssueManagerRun {
	return nextopgenerated.IssueManagerRun{
		RunId:              item.RunID,
		TaskId:             stringPointerIfNotEmpty(item.TaskID),
		IssueId:            item.IssueID,
		WorkspaceId:        item.WorkspaceID,
		RequesterUserId:    item.RequesterUserID,
		AgentUserId:        item.AgentUserID,
		AgentSessionId:     item.AgentSessionID,
		AgentProvider:      item.AgentProvider,
		Status:             nextopgenerated.IssueManagerStatus(item.Status),
		Summary:            item.Summary,
		ErrorMessage:       item.ErrorMessage,
		OutputDir:          item.OutputDir,
		ExecutionDirectory: item.ExecutionDirectory,
		CreatedAtUnix:      unixSecondsFromMillis(item.CreatedAtUnixMS),
		StartedAtUnix:      unixSecondsFromMillis(item.StartedAtUnixMS),
		CompletedAtUnix:    unixSecondsFromMillis(item.CompletedAtUnixMS),
		UpdatedAtUnix:      unixSecondsFromMillis(item.UpdatedAtUnixMS),
	}
}

func GeneratedIssueManagerRunResponseFromDomain(item workspaceissues.Run) nextopgenerated.IssueManagerRunResponse {
	return nextopgenerated.IssueManagerRunResponse{
		Run: GeneratedIssueManagerRunFromDomain(item),
	}
}

func GeneratedIssueManagerRunListResponseFromDomain(items []workspaceissues.Run) nextopgenerated.IssueManagerRunListResponse {
	return nextopgenerated.IssueManagerRunListResponse{
		Runs: GeneratedIssueManagerRunsFromDomain(items),
	}
}

func GeneratedIssueManagerRunEnvelopeFromDomain(detail workspaceissues.RunDetail) nextopgenerated.IssueManagerRunEnvelope {
	return nextopgenerated.IssueManagerRunEnvelope{
		Run:     GeneratedIssueManagerRunFromDomain(detail.Run),
		Outputs: GeneratedIssueManagerRunOutputsFromDomain(detail.Outputs),
	}
}

func GeneratedIssueManagerRunsFromDomain(items []workspaceissues.Run) []nextopgenerated.IssueManagerRun {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerRun{}
	}
	result := make([]nextopgenerated.IssueManagerRun, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerRunFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerRunOutputFromDomain(item workspaceissues.RunOutput) nextopgenerated.IssueManagerRunOutput {
	return nextopgenerated.IssueManagerRunOutput{
		OutputId:      item.OutputID,
		RunId:         item.RunID,
		TaskId:        stringPointerIfNotEmpty(item.TaskID),
		IssueId:       item.IssueID,
		WorkspaceId:   item.WorkspaceID,
		Path:          item.Path,
		DisplayName:   item.DisplayName,
		MediaType:     item.MediaType,
		SizeBytes:     item.SizeBytes,
		CreatedAtUnix: unixSecondsFromMillis(item.CreatedAtUnixMS),
	}
}

func latestRunPointer(item *workspaceissues.Run) *nextopgenerated.IssueManagerRun {
	if item == nil {
		return nil
	}
	value := GeneratedIssueManagerRunFromDomain(*item)
	return &value
}

func GeneratedIssueManagerRunOutputsFromDomain(items []workspaceissues.RunOutput) []nextopgenerated.IssueManagerRunOutput {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerRunOutput{}
	}
	result := make([]nextopgenerated.IssueManagerRunOutput, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerRunOutputFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerContextRefsResponseFromDomain(items []workspaceissues.ContextRef) nextopgenerated.IssueManagerContextRefsResponse {
	return nextopgenerated.IssueManagerContextRefsResponse{
		ContextRefs: GeneratedIssueManagerContextRefsFromDomain(items),
	}
}

func GeneratedIssueManagerContextRefsFromDomain(items []workspaceissues.ContextRef) []nextopgenerated.IssueManagerContextRef {
	if len(items) == 0 {
		return []nextopgenerated.IssueManagerContextRef{}
	}
	result := make([]nextopgenerated.IssueManagerContextRef, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedIssueManagerContextRefFromDomain(item))
	}
	return result
}

func GeneratedIssueManagerContextRefFromDomain(item workspaceissues.ContextRef) nextopgenerated.IssueManagerContextRef {
	if item.ParentKind == workspaceissues.ContextRefParentTask {
		ref := nextopgenerated.IssueManagerContextRef{}
		_ = ref.FromIssueManagerTaskContextRef(nextopgenerated.IssueManagerTaskContextRef{
			ContextRefId:  item.ContextRefID,
			WorkspaceId:   item.WorkspaceID,
			IssueId:       item.IssueID,
			TaskId:        item.TaskID,
			ParentKind:    nextopgenerated.IssueManagerTaskContextRefParentKindTask,
			RefType:       item.RefType,
			Path:          item.Path,
			DisplayName:   item.DisplayName,
			CreatedAtUnix: unixSecondsFromMillis(item.CreatedAtUnixMS),
		})
		return ref
	}

	ref := nextopgenerated.IssueManagerContextRef{}
	_ = ref.FromIssueManagerIssueContextRef(nextopgenerated.IssueManagerIssueContextRef{
		ContextRefId:  item.ContextRefID,
		WorkspaceId:   item.WorkspaceID,
		IssueId:       item.IssueID,
		ParentKind:    nextopgenerated.IssueManagerIssueContextRefParentKindIssue,
		RefType:       item.RefType,
		Path:          item.Path,
		DisplayName:   item.DisplayName,
		CreatedAtUnix: unixSecondsFromMillis(item.CreatedAtUnixMS),
	})
	return ref
}

func GeneratedIssueManagerStatusCountsFromDomain(counts workspaceissues.StatusCounts) nextopgenerated.IssueManagerStatusCounts {
	return nextopgenerated.IssueManagerStatusCounts{
		All:               counts.All,
		NotStarted:        counts.NotStarted,
		Running:           counts.Running,
		InProgress:        counts.InProgress,
		PendingAcceptance: counts.PendingAcceptance,
		Completed:         counts.Completed,
		Failed:            counts.Failed,
		Canceled:          counts.Canceled,
	}
}

func UnixMillisFromSeconds(value int64) int64 {
	if value <= 0 {
		return 0
	}
	return value * 1000
}

func unixSecondsFromMillis(value int64) int64 {
	if value <= 0 {
		return 0
	}
	return value / 1000
}

func stringPointerIfNotEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
