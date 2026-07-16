package agent

import "testing"

func TestMatchesSessionSearchUsesTitleOnly(t *testing.T) {
	title := "Fix Release Search"
	session := Session{
		ID:       "session-needle",
		Provider: "provider-needle",
		Cwd:      "/workspace/cwd-needle",
		Title:    &title,
	}

	tests := []struct {
		name  string
		query string
		want  bool
	}{
		{name: "empty query", query: "", want: true},
		{name: "title substring", query: "release", want: true},
		{name: "title tokens ignore case and whitespace", query: "  SEARCH fix  ", want: true},
		{name: "all title tokens are required", query: "release missing", want: false},
		{name: "session id is excluded", query: "session-needle", want: false},
		{name: "provider is excluded", query: "provider-needle", want: false},
		{name: "working directory is excluded", query: "cwd-needle", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := matchesSessionSearch(session, test.query); got != test.want {
				t.Fatalf("matchesSessionSearch() = %v, want %v", got, test.want)
			}
		})
	}
}
