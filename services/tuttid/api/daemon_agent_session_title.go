package api

import (
	"context"

	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	"github.com/tutti-os/tutti/services/tuttid/apierrors"
)

func (api DaemonAPI) UpdateWorkspaceAgentSessionTitle(ctx context.Context, request tuttigenerated.UpdateWorkspaceAgentSessionTitleRequestObject) (tuttigenerated.UpdateWorkspaceAgentSessionTitleResponseObject, error) {
	if api.AgentSessionService == nil {
		return tuttigenerated.UpdateWorkspaceAgentSessionTitle503JSONResponse{
			ServiceUnavailableErrorJSONResponse: agentSessionServiceUnavailableError(),
		}, nil
	}
	if request.Body == nil {
		return tuttigenerated.UpdateWorkspaceAgentSessionTitle400JSONResponse{
			InvalidRequestErrorJSONResponse: invalidRequestError(apierrors.EmptyBody(apierrors.WithDeveloperMessage("empty body"))),
		}, nil
	}
	session, err := api.AgentSessionService.UpdateTitle(
		ctx,
		string(request.WorkspaceID),
		string(request.AgentSessionID),
		request.Body.Title,
	)
	if err != nil {
		return writeUpdateWorkspaceAgentSessionTitleError(err), nil
	}
	return tuttigenerated.UpdateWorkspaceAgentSessionTitle200JSONResponse{
		Session: generatedAgentSession(session),
	}, nil
}
