package agentsessionstore

import "testing"

func TestSessionMessageUpdateFromActivityUpdateUsesLifecycleTimeBeforeSeq(t *testing.T) {
	t.Parallel()

	update := SessionMessageUpdateFromActivityUpdate(WorkspaceAgentMessageUpdate{
		MessageID:       "message-1",
		Seq:             42,
		TurnID:          "turn-1",
		Role:            "assistant",
		Kind:            "text",
		StartedAtUnixMS: 1717200001000,
	})

	if update.OccurredAtUnixMS != 1717200001000 {
		t.Fatalf("OccurredAtUnixMS = %d, want lifecycle timestamp", update.OccurredAtUnixMS)
	}
}
