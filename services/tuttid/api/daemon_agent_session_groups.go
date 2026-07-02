package api

import (
	"context"

	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
)

func (api DaemonAPI) ListWorkspaceAgentSessionGroups(ctx context.Context, request tuttigenerated.ListWorkspaceAgentSessionGroupsRequestObject) (tuttigenerated.ListWorkspaceAgentSessionGroupsResponseObject, error) {
	if api.AgentSessionService == nil {
		return tuttigenerated.ListWorkspaceAgentSessionGroups503JSONResponse{
			ServiceUnavailableErrorJSONResponse: agentSessionServiceUnavailableError(),
		}, nil
	}
	input := agentservice.ListSessionGroupsInput{}
	if request.Params.SessionLimit != nil {
		if *request.Params.SessionLimit <= 0 || *request.Params.SessionLimit > listWorkspaceAgentSessionsLimitMax {
			return writeListWorkspaceAgentSessionGroupsError(agentservice.ErrInvalidArgument), nil
		}
		input.SessionLimit = *request.Params.SessionLimit
	}
	if request.Params.VisibleOnly != nil {
		input.VisibleOnly = *request.Params.VisibleOnly
	}
	groups, err := api.AgentSessionService.ListGroups(ctx, string(request.WorkspaceID), input)
	if err != nil {
		return writeListWorkspaceAgentSessionGroupsError(err), nil
	}
	return tuttigenerated.ListWorkspaceAgentSessionGroups200JSONResponse{
		Groups:      generatedAgentSessionGroups(groups),
		WorkspaceId: string(request.WorkspaceID),
	}, nil
}

func generatedAgentSessionGroups(groups []agentservice.SessionGroup) []tuttigenerated.WorkspaceAgentSessionGroup {
	result := make([]tuttigenerated.WorkspaceAgentSessionGroup, 0, len(groups))
	for _, group := range groups {
		generatedGroup := tuttigenerated.WorkspaceAgentSessionGroup{
			Cwd:                          group.CWD,
			HasMore:                      group.HasMore,
			LatestSessionUpdatedAtUnixMs: group.LatestSessionUpdatedAtUnixMS,
			SessionCount:                 group.SessionCount,
			Sessions:                     generatedAgentSessions(group.Sessions),
		}
		if group.NextCursor != "" {
			generatedGroup.NextCursor = optionalStringPointer(group.NextCursor)
		}
		result = append(result, generatedGroup)
	}
	return result
}
