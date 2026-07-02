package agentruntime

import (
	"strings"
	"testing"
	"time"

	agentsessionstore "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity"
	activityshared "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity/events"
)

func hasActivityMessage(events []activityshared.Event, role activityshared.MessageRole, content string) bool {
	for _, event := range events {
		if event.Type != activityshared.EventMessageAppended && event.Type != activityshared.EventMessageCreated {
			continue
		}
		if role != "" && event.Payload.Role != role {
			continue
		}
		if strings.TrimSpace(event.Payload.Content) == content {
			return true
		}
	}
	return false
}

func activityMessagesWithRole(events []activityshared.Event, role activityshared.MessageRole) []activityshared.Event {
	var out []activityshared.Event
	for _, event := range events {
		if (event.Type == activityshared.EventMessageAppended || event.Type == activityshared.EventMessageCreated) && (role == "" || event.Payload.Role == role) {
			out = append(out, event)
		}
	}
	return out
}

func activityEventsWithType(events []activityshared.Event, eventType activityshared.EventType) []activityshared.Event {
	var out []activityshared.Event
	for _, event := range events {
		if event.Type == eventType {
			out = append(out, event)
		}
	}
	return out
}

func hasStreamCallEvent(events []StreamEvent, callType string, status string) bool {
	for _, event := range events {
		if event.EventType != StreamEventMessageUpdate {
			continue
		}
		update, ok := event.Data.(agentsessionstore.WorkspaceAgentMessageUpdate)
		if !ok {
			continue
		}
		if update.Kind != "tool_call" {
			continue
		}
		if callType != "" && asString(update.Payload["callType"]) != callType {
			continue
		}
		if status != "" && update.Status != status && asString(update.Payload["status"]) != status {
			continue
		}
		return true
	}
	return false
}

func hasStreamMessageEvent(events []StreamEvent, role string, content string) bool {
	for _, event := range events {
		if event.EventType != StreamEventMessageUpdate {
			continue
		}
		update, ok := event.Data.(agentsessionstore.WorkspaceAgentMessageUpdate)
		if !ok {
			continue
		}
		if role != "" && update.Role != role {
			continue
		}
		if content != "" && asString(update.Payload["content"]) != content {
			continue
		}
		return true
	}
	return false
}

func reportsWithTimelineItem(reports []agentsessionstore.ReportActivityInput, itemType string) []agentsessionstore.ReportActivityInput {
	var out []agentsessionstore.ReportActivityInput
	for _, report := range reports {
		for _, update := range report.MessageUpdates {
			if messageUpdateMatchesLegacyItemType(update, itemType) {
				out = append(out, report)
				break
			}
		}
	}
	return out
}

func approvalMessageUpdates(events []StreamEvent) []agentsessionstore.WorkspaceAgentMessageUpdate {
	var out []agentsessionstore.WorkspaceAgentMessageUpdate
	for _, event := range events {
		if event.EventType != StreamEventMessageUpdate {
			continue
		}
		update, ok := event.Data.(agentsessionstore.WorkspaceAgentMessageUpdate)
		if !ok || asString(update.Payload["callType"]) != "approval" {
			continue
		}
		out = append(out, update)
	}
	return out
}

func waitForCondition(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition was not met")
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func containsCommandSequence(values []string, sequence []string) bool {
	if len(sequence) == 0 {
		return true
	}
	for index := 0; index+len(sequence) <= len(values); index++ {
		match := true
		for offset := range sequence {
			if values[index+offset] != sequence[offset] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
