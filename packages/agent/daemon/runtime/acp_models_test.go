package agentruntime

import (
	"encoding/json"
	"testing"
)

func TestApplyACPModelsResultProjectsModelConfigOption(t *testing.T) {
	state := newACPLiveState()
	applyACPModelsResult(&state, json.RawMessage(`{
		"models": {
			"availableModels": [
				{"modelId":"auto-gemini-3","name":"Auto (Gemini 3)","description":"Routes automatically"},
				{"modelId":"gemini-3-pro-preview","name":"Gemini 3 Pro"}
			],
			"currentModelId":"auto-gemini-3"
		}
	}`))

	if !state.modelsAPI {
		t.Fatal("modelsAPI = false, want true")
	}
	options := extractModelOptionsFromRuntimeDescriptorsForTest(state.configOptionDescriptors)
	if len(options) != 2 {
		t.Fatalf("model options = %#v, want two", options)
	}
	if options[0]["value"] != "auto-gemini-3" || options[0]["label"] != "Auto (Gemini 3)" {
		t.Fatalf("first model option = %#v", options[0])
	}
	if state.configOptions["model"] != "auto-gemini-3" {
		t.Fatalf("current model = %#v, want auto-gemini-3", state.configOptions["model"])
	}
}

func extractModelOptionsFromRuntimeDescriptorsForTest(descriptors []map[string]any) []map[string]any {
	for _, descriptor := range descriptors {
		if descriptor["id"] != "model" {
			continue
		}
		raw, _ := descriptor["options"].([]any)
		result := make([]map[string]any, 0, len(raw))
		for _, item := range raw {
			if option, ok := item.(map[string]any); ok {
				result = append(result, option)
			}
		}
		return result
	}
	return nil
}
