package core

import (
	"errors"
	"testing"
)

func TestNormalizeInputIgnoresUnknownAndCoercesScalars(t *testing.T) {
	input, err := NormalizeInput(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"count":   map[string]any{"type": "integer"},
			"dry-run": map[string]any{"type": "boolean"},
			"name":    map[string]any{"type": "string"},
		},
		"required": []any{"count"},
	}, map[string]any{
		"count":   "2",
		"dry-run": "true",
		"name":    "daily",
		"unknown": "x",
	})
	if err != nil {
		t.Fatalf("NormalizeInput() error = %v", err)
	}
	if input["count"] != int64(2) || input["dry-run"] != true || input["name"] != "daily" {
		t.Fatalf("input = %#v", input)
	}
	if _, ok := input["unknown"]; ok {
		t.Fatalf("unknown input was forwarded: %#v", input)
	}
}

func TestNormalizeInputRequiresRequiredProperties(t *testing.T) {
	_, err := NormalizeInput(map[string]any{
		"type":       "object",
		"properties": map[string]any{"name": map[string]any{"type": "string"}},
		"required":   []any{"name"},
	}, map[string]any{})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("NormalizeInput() error = %v, want ErrInvalidInput", err)
	}
}
