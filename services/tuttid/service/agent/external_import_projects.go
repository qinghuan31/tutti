package agent

import (
	"context"
	"sort"
)

// ExternalImportValidProjectPaths returns the canonical paths of the selected
// projects that contain at least one valid importable session, without importing
// anything. The register-only import path uses it to avoid surfacing empty
// projects. Returned paths are canonical (see canonicalExistingDir), matching
// ImportExternalSessions.ProjectPaths so callers can register them directly.
func (*Service) ExternalImportValidProjectPaths(ctx context.Context, input ExternalImportInput) ([]string, error) {
	selections := normalizeExternalImportSelections(input.Projects)
	if len(selections) == 0 {
		return nil, nil
	}
	data := scanExternalAgentSessions(ctx, providersFromExternalImportSelections(selections))
	valid := map[string]struct{}{}
	for _, session := range data.sessions {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if projectPath, ok := matchingExternalImportProject(session, selections); ok {
			valid[projectPath] = struct{}{}
		}
	}
	return sortedStringSet(valid), nil
}

func sortedStringSet(values map[string]struct{}) []string {
	out := make([]string, 0, len(values))
	for value := range values {
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
