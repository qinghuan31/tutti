//go:build darwin

package workspace

import (
	"fmt"
	"strings"
	"testing"
)

func TestFinderRecentSpotlightQueryKeepsOlderOpenedFiles(t *testing.T) {
	if strings.Contains(finderRecentSpotlightQuery, "$time") {
		t.Fatalf("query = %q, want no rolling date window", finderRecentSpotlightQuery)
	}
	if !strings.Contains(finderRecentSpotlightQuery, "kMDItemLastUsedDate == *") {
		t.Fatalf("query = %q, want all opened files", finderRecentSpotlightQuery)
	}
}

func TestFinderRecentSpotlightQueryExcludesFinderNoise(t *testing.T) {
	for _, predicate := range []string{
		"kMDItemContentTypeTree != 'public.folder'",
		"kMDItemFSName != '*.download'cd",
	} {
		if !strings.Contains(finderRecentSpotlightQuery, predicate) {
			t.Fatalf("query = %q, want predicate %q", finderRecentSpotlightQuery, predicate)
		}
	}
}

func TestParseSpotlightRecentCandidatesKeepsUnrankedResultsPastOldCap(t *testing.T) {
	const candidateCount = 450
	var output strings.Builder
	for index := 0; index < candidateCount; index++ {
		fmt.Fprintf(&output, "/workspace/file-%03d.txt\n", index)
	}

	paths, err := parseSpotlightRecentCandidates(strings.NewReader(output.String()))
	if err != nil {
		t.Fatalf("parseSpotlightRecentCandidates: %v", err)
	}
	if len(paths) != candidateCount {
		t.Fatalf("candidate count = %d, want %d", len(paths), candidateCount)
	}
	if got := paths[candidateCount-1]; got != "/workspace/file-449.txt" {
		t.Fatalf("last candidate = %q, want final unranked Spotlight hit", got)
	}
}
