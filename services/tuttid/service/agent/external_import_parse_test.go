package agent

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseCodexJSONLUsesFirstUserEventAsTitle(t *testing.T) {
	cwd := t.TempDir()
	session, ok, err := parseCodexJSONL(
		filepath.Join(cwd, "rollout.jsonl"),
		strings.NewReader(testAgentJSONL(t,
			map[string]any{
				"timestamp": "2026-06-18T00:00:00Z",
				"type":      "session_meta",
				"payload":   map[string]any{"id": "codex-title", "cwd": cwd},
			},
			map[string]any{
				"timestamp": "2026-06-18T00:00:01Z",
				"type":      "response_item",
				"payload": map[string]any{
					"type":    "message",
					"role":    "user",
					"content": []any{map[string]any{"type": "input_text", "text": "<environment_context>\n</environment_context>"}},
				},
			},
			map[string]any{
				"timestamp": "2026-06-18T00:00:02Z",
				"type":      "event_msg",
				"payload": map[string]any{
					"type":    "user_message",
					"message": "Tell me the plan",
				},
			},
		)),
	)
	if err != nil {
		t.Fatalf("parseCodexJSONL error = %v", err)
	}
	if !ok {
		t.Fatal("parseCodexJSONL ok = false")
	}
	if session.Title != "Tell me the plan" {
		t.Fatalf("title = %q, want first user message", session.Title)
	}
}

func TestParseCodexJSONLPreservesToolCallStructure(t *testing.T) {
	cwd := t.TempDir()
	session, ok, err := parseCodexJSONL(
		filepath.Join(cwd, "rollout.jsonl"),
		strings.NewReader(testAgentJSONL(t,
			map[string]any{
				"timestamp": "2026-06-18T00:00:00Z",
				"type":      "session_meta",
				"payload":   map[string]any{"id": "codex-tools", "cwd": cwd},
			},
			map[string]any{
				"timestamp": "2026-06-18T00:00:01Z",
				"type":      "response_item",
				"payload": map[string]any{
					"type":    "message",
					"id":      "user-1",
					"role":    "user",
					"content": []any{map[string]any{"type": "input_text", "text": "Check status"}},
				},
			},
			map[string]any{
				"timestamp": "2026-06-18T00:00:02Z",
				"type":      "response_item",
				"payload": map[string]any{
					"type":      "function_call",
					"id":        "call-item-1",
					"name":      "exec_command",
					"call_id":   "call-status",
					"arguments": `{"cmd":"git status --short","workdir":"/repo"}`,
				},
			},
			map[string]any{
				"timestamp": "2026-06-18T00:00:03Z",
				"type":      "response_item",
				"payload": map[string]any{
					"type":    "function_call_output",
					"call_id": "call-status",
					"output":  "Chunk ID: abc\nOutput:\n M file.go\n",
				},
			},
		)),
	)
	if err != nil {
		t.Fatalf("parseCodexJSONL error = %v", err)
	}
	if !ok {
		t.Fatal("parseCodexJSONL ok = false")
	}
	if len(session.Messages) != 3 {
		t.Fatalf("messages = %#v, want user plus tool lifecycle", session.Messages)
	}
	started := session.Messages[1]
	if started.Role != "assistant" || started.Kind != "tool_call" || started.Status != "running" {
		t.Fatalf("started tool message = %#v", started)
	}
	if started.MessageIDSeed != "toolcall:call-status" {
		t.Fatalf("started message seed = %q, want tool call seed", started.MessageIDSeed)
	}
	if started.Payload["toolName"] != "exec_command" {
		t.Fatalf("started payload = %#v, want tool name", started.Payload)
	}
	input, _ := started.Payload["input"].(map[string]any)
	if input["cmd"] != "git status --short" {
		t.Fatalf("started input = %#v, want command", input)
	}
	completed := session.Messages[2]
	if completed.Role != "assistant" || completed.Kind != "tool_call" || completed.Status != "completed" {
		t.Fatalf("completed tool message = %#v", completed)
	}
	if completed.MessageIDSeed != started.MessageIDSeed {
		t.Fatalf("completed message seed = %q, want %q", completed.MessageIDSeed, started.MessageIDSeed)
	}
	output, _ := completed.Payload["output"].(map[string]any)
	if output["output"] != "Chunk ID: abc\nOutput:\n M file.go" {
		t.Fatalf("completed output = %#v, want command output", output)
	}
}

func testAgentJSONL(t *testing.T, items ...map[string]any) string {
	t.Helper()
	var builder strings.Builder
	for _, item := range items {
		encoded, err := json.Marshal(item)
		if err != nil {
			t.Fatalf("marshal jsonl item error = %v", err)
		}
		builder.Write(encoded)
		builder.WriteByte('\n')
	}
	return builder.String()
}
