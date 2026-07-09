package computer

import (
	"context"
)

func (s *computerSession) adaptToolCall(ctx context.Context, tool string, args map[string]any) (ToolResult, error) {
	return s.callTool(ctx, tool, args)
}
