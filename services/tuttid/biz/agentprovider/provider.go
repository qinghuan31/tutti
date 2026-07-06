package agentprovider

import "strings"

const (
	ClaudeCode = "claude-code"
	Codex      = "codex"
	Cursor     = "cursor"
	Gemini     = "gemini"
	Hermes     = "hermes"
	Nexight    = "nexight"
	OpenClaw   = "openclaw"
	TuttiAgent = "tutti-agent"
)

var allProviders = []string{
	ClaudeCode,
	Codex,
	TuttiAgent,
	Cursor,
	Nexight,
	Gemini,
	Hermes,
	OpenClaw,
}

func All() []string {
	return append([]string(nil), allProviders...)
}

func Normalize(provider string) string {
	switch strings.TrimSpace(strings.ToLower(provider)) {
	case "claude", ClaudeCode:
		return ClaudeCode
	case Codex:
		return Codex
	case TuttiAgent:
		return TuttiAgent
	case "cursor-agent", "cursor-cli", Cursor:
		return Cursor
	case "gemini-cli", Gemini:
		return Gemini
	case "hermes-agent", Hermes:
		return Hermes
	case "tutti", Nexight:
		return Nexight
	case "open-claw", OpenClaw:
		return OpenClaw
	default:
		return ""
	}
}

func IsSupported(provider string) bool {
	return Normalize(provider) != ""
}

func SupportsComposerSettings(provider string) bool {
	switch Normalize(provider) {
	case ClaudeCode, Codex, Gemini, TuttiAgent:
		return true
	default:
		return false
	}
}
