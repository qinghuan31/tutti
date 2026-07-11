package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
)

const (
	ExitSuccess       = 0
	ExitInvokeFailure = 1
	ExitUsage         = 2

	prefixHelpGroupPreviewLimit = 5
)

type Options struct {
	JSON bool
}

type StaticCommand struct {
	Name    string
	Summary string
	Run     func(context.Context, []string, Options, io.Writer, io.Writer) int
}

func (r Runner) RunArgs(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	options, rest := parseGlobalOptions(args)
	if len(rest) == 0 || rest[0] == "help" || rest[0] == "--help" || rest[0] == "-h" {
		r.PrintHelp(ctx, stdout)
		return ExitSuccess
	}
	for _, command := range r.StaticCommands {
		if command.Name == rest[0] && command.Run != nil {
			return command.Run(ctx, rest[1:], options, stdout, stderr)
		}
	}
	return r.Run(ctx, rest, options, stdout, stderr)
}

func parseGlobalOptions(args []string) (Options, []string) {
	var options Options
	rest := make([]string, 0, len(args))
	for _, arg := range args {
		if arg == "--json" {
			options.JSON = true
			continue
		}
		rest = append(rest, arg)
	}
	return options, rest
}

type Runner struct {
	Client             CatalogClient
	CommandName        string
	InvokeContext      InvokeContext
	IncludeIntegration bool
	StaticCommands     []StaticCommand
}

func (r Runner) Run(ctx context.Context, args []string, options Options, stdout io.Writer, stderr io.Writer) int {
	commandName := r.commandName()
	if r.Client == nil {
		fmt.Fprintf(stderr, "%s %s: catalog client is not configured\n", commandName, strings.Join(args, " "))
		return ExitInvokeFailure
	}
	capabilities, err := r.Client.ListCapabilities(ctx, valueOrZero(r.InvokeContext.WorkspaceID), CapabilityListOptions{
		IncludeIntegration: r.IncludeIntegration,
	})
	if err != nil {
		fmt.Fprintf(stderr, "%s %s: %v\n", commandName, strings.Join(args, " "), err)
		return ExitInvokeFailure
	}
	command, commandArgs, ok := matchCapability(capabilities.Commands, args)
	if !ok {
		if prefix, help := commandHelpPrefix(args); help {
			if printCommandPrefixHelp(stdout, commandName, prefix, capabilities.Commands) {
				return ExitSuccess
			}
		}
		if printCommandPrefixHelp(stdout, commandName, args, capabilities.Commands) {
			return ExitUsage
		}
		fmt.Fprintf(stderr, "unknown command: %s\n", strings.Join(args, " "))
		return ExitUsage
	}
	if isCommandHelpRequest(commandArgs) {
		printDynamicCommandHelp(stdout, commandName, command)
		return ExitSuccess
	}
	input, err := parseCommandInput(command, commandArgs)
	if err != nil {
		fmt.Fprintf(stderr, "%s %s: %v\n", commandName, strings.Join(command.Path, " "), err)
		return ExitUsage
	}
	outputMode := command.Output.DefaultMode
	if options.JSON {
		outputMode = "json"
	}
	request := InvokeRequest{OutputMode: &outputMode, Context: &r.InvokeContext}
	if len(input) > 0 {
		request.Input = &input
	}
	response, err := r.Client.Invoke(ctx, command.ID, request)
	if err != nil {
		fmt.Fprintf(stderr, "%s %s: %v\n", commandName, strings.Join(command.Path, " "), err)
		return ExitInvokeFailure
	}
	if response.Output == nil {
		return ExitSuccess
	}
	return RenderOutput(stdout, stderr, *response.Output, options.JSON)
}

func RenderOutput(stdout io.Writer, stderr io.Writer, output CommandOutput, jsonOutput bool) int {
	if jsonOutput {
		return writeDynamicJSON(stdout, stderr, output)
	}
	return writeCommandOutput(stdout, stderr, output)
}

func (r Runner) PrintHelp(ctx context.Context, stdout io.Writer) {
	var commands []Capability
	if r.Client != nil {
		capabilities, err := r.Client.ListCapabilities(ctx, valueOrZero(r.InvokeContext.WorkspaceID), CapabilityListOptions{
			IncludeIntegration: r.IncludeIntegration,
		})
		if err == nil {
			commands = capabilities.Commands
		}
	}
	printHelp(stdout, r.commandName(), r.StaticCommands, commands)
}

func (r Runner) commandName() string {
	if name := strings.TrimSpace(r.CommandName); name != "" {
		return name
	}
	return "tutti"
}

func matchCapability(commands []Capability, args []string) (Capability, []string, bool) {
	var matchedCommand Capability
	var matchedArgs []string
	matchedLength := -1
	for _, command := range commands {
		if len(args) < len(command.Path) {
			continue
		}
		matched := true
		for index, segment := range command.Path {
			if args[index] != segment {
				matched = false
				break
			}
		}
		if matched && len(command.Path) > matchedLength {
			matchedCommand = command
			matchedArgs = args[len(command.Path):]
			matchedLength = len(command.Path)
		}
	}
	if matchedLength >= 0 {
		return matchedCommand, matchedArgs, true
	}
	return Capability{}, nil, false
}

func isCommandHelpRequest(args []string) bool {
	return len(args) == 1 && (args[0] == "--help" || args[0] == "-h")
}

func commandHelpPrefix(args []string) ([]string, bool) {
	if len(args) == 0 {
		return nil, false
	}
	last := args[len(args)-1]
	if last != "--help" && last != "-h" {
		return nil, false
	}
	prefix := args[:len(args)-1]
	if len(prefix) == 0 {
		return nil, false
	}
	return prefix, true
}

func writeCommandOutput(stdout io.Writer, stderr io.Writer, output CommandOutput) int {
	switch output.Kind {
	case "plain", "markdown":
		writeCommandWarnings(stderr, valueOrZero(output.Warnings))
		fmt.Fprintln(stdout, valueOrZero(output.Text))
		return 0
	case "table":
		writeCommandWarnings(stderr, valueOrZero(output.Warnings))
		writeTable(stdout, valueOrZero(output.Columns), valueOrZero(output.Rows))
		return 0
	case "json":
		return writeDynamicJSON(stdout, stderr, output)
	default:
		return writeJSON(stdout, stderr, output)
	}
}

func writeDynamicJSON(stdout io.Writer, stderr io.Writer, output CommandOutput) int {
	if warnings := valueOrZero(output.Warnings); len(warnings) > 0 {
		envelope := map[string]any{
			"warnings": warnings,
		}
		if value := valueOrZero(output.Value); len(value) > 0 {
			envelope["value"] = value
		} else if output.Rows != nil {
			envelope["rows"] = *output.Rows
		} else {
			envelope["output"] = output
		}
		return writeJSON(stdout, stderr, envelope)
	}
	if value := valueOrZero(output.Value); len(value) > 0 {
		return writeJSON(stdout, stderr, value)
	}
	if output.Rows != nil {
		return writeJSON(stdout, stderr, *output.Rows)
	}
	return writeJSON(stdout, stderr, output)
}

func writeCommandWarnings(stderr io.Writer, warnings []CommandWarning) {
	for _, warning := range warnings {
		message := strings.TrimSpace(warning.Message)
		if message == "" {
			message = strings.TrimSpace(warning.Code)
		}
		if message != "" {
			fmt.Fprintf(stderr, "warning: %s\n", message)
		}
	}
}

func writeJSON(stdout io.Writer, stderr io.Writer, value any) int {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fmt.Fprintf(stderr, "encode output: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, string(encoded))
	return 0
}

func writeTable(stdout io.Writer, columns []TableColumn, rows []map[string]any) {
	if len(columns) == 0 {
		for _, row := range rows {
			fmt.Fprintln(stdout, row)
		}
		return
	}
	widths := make([]int, len(columns))
	for index, column := range columns {
		widths[index] = len(column.Label)
		for _, row := range rows {
			width := len(fmt.Sprint(row[column.Key]))
			if width > widths[index] {
				widths[index] = width
			}
		}
	}
	for index, column := range columns {
		if index > 0 {
			fmt.Fprint(stdout, "  ")
		}
		fmt.Fprintf(stdout, "%-*s", widths[index], column.Label)
	}
	fmt.Fprintln(stdout)
	for index := range columns {
		if index > 0 {
			fmt.Fprint(stdout, "  ")
		}
		fmt.Fprint(stdout, strings.Repeat("-", widths[index]))
	}
	fmt.Fprintln(stdout)
	for _, row := range rows {
		for index, column := range columns {
			if index > 0 {
				fmt.Fprint(stdout, "  ")
			}
			fmt.Fprintf(stdout, "%-*s", widths[index], fmt.Sprint(row[column.Key]))
		}
		fmt.Fprintln(stdout)
	}
}

func printHelp(stdout io.Writer, commandName string, staticCommands []StaticCommand, commands []Capability) {
	fmt.Fprintf(stdout, "Usage: %s [--json] <command>\n", commandName)
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Commands:")
	rows := make([]helpCommandRow, 0, len(staticCommands)+len(commands))
	for _, command := range staticCommands {
		rows = append(rows, helpCommandRow{Name: command.Name, Summary: command.Summary})
	}
	rows = append(rows, rootHelpRows(commands)...)
	printHelpRows(stdout, rows)
	printIntegrationOnlyNotice(stdout, commands)
}

func printCommandPrefixHelp(stdout io.Writer, commandName string, prefix []string, commands []Capability) bool {
	matches := matchingPrefixCommands(commands, prefix)
	if len(matches) == 0 {
		return false
	}
	fmt.Fprintf(stdout, "Usage: %s %s <command> [--json]\n", commandName, strings.Join(prefix, " "))
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Commands:")
	printHelpRows(stdout, prefixHelpRows(prefix, matches))
	printIntegrationOnlyNotice(stdout, matches)
	fmt.Fprintln(stdout)
	fmt.Fprintf(stdout, "Use \"%s %s <command> --help\" for command details.\n", commandName, strings.Join(prefix, " "))
	printDocumentationHints(stdout, matches)
	return true
}

func printDynamicCommandHelp(stdout io.Writer, commandName string, command Capability) {
	flags := commandFlags(valueOrZero(command.InputSchema))
	fmt.Fprintf(stdout, "Usage: %s %s [--json]", commandName, strings.Join(command.Path, " "))
	for _, flag := range flags {
		if flag.Required {
			fmt.Fprintf(stdout, " --%s <value>", flag.Name)
			continue
		}
		fmt.Fprintf(stdout, " [--%s <value>]", flag.Name)
	}
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout)
	if strings.TrimSpace(command.Summary) != "" {
		fmt.Fprintln(stdout, command.Summary)
	}
	description := valueOrZero(command.Description)
	if strings.TrimSpace(description) != "" && description != command.Summary {
		if strings.TrimSpace(command.Summary) != "" {
			fmt.Fprintln(stdout)
		}
		fmt.Fprintln(stdout, description)
	}
	printIntegrationOnlyNotice(stdout, []Capability{command})
	if len(flags) == 0 {
		printDocumentationHints(stdout, []Capability{command})
		return
	}
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Flags:")
	width := 0
	for _, flag := range flags {
		if len(flag.Name) > width {
			width = len(flag.Name)
		}
	}
	for _, flag := range flags {
		required := ""
		if flag.Required {
			required = "  required"
		}
		description := ""
		if flag.Description != "" {
			description = "  " + flag.Description
		}
		fmt.Fprintf(stdout, "  --%-*s  %s%s%s\n", width, flag.Name, flag.Type, required, description)
		if len(flag.Values) > 0 {
			fmt.Fprintf(stdout, "      Values: %s\n", strings.Join(flag.Values, ", "))
		}
		if flag.HasDefault {
			fmt.Fprintf(stdout, "      Default: %s\n", flag.Default)
		}
	}
	printDocumentationHints(stdout, []Capability{command})
}

type helpCommandRow struct {
	Name                    string
	Summary                 string
	IntegrationOnly         bool
	IncludesIntegrationOnly bool
	Children                []helpCommandRow
	RemainingChildren       int
}

func rootHelpRows(commands []Capability) []helpCommandRow {
	type group struct {
		count            int
		integrationCount int
		summary          string
		description      string
	}
	groups := map[string]group{}
	for _, command := range commands {
		if len(command.Path) == 0 {
			continue
		}
		name := command.Path[0]
		if name == "status" {
			continue
		}
		current := groups[name]
		current.count++
		if isIntegrationCapability(command) {
			current.integrationCount++
		}
		if len(command.Path) == 1 && current.summary == "" {
			current.summary = command.Summary
		}
		if current.description == "" {
			current.description = commandScopeDescription(command)
		}
		groups[name] = current
	}
	names := make([]string, 0, len(groups))
	for name := range groups {
		names = append(names, name)
	}
	sort.Strings(names)
	rows := make([]helpCommandRow, 0, len(names))
	for _, name := range names {
		item := groups[name]
		summary := item.summary
		if summary == "" {
			summary = fmt.Sprintf("%d commands", item.count)
		}
		if item.description != "" && item.count > 0 {
			summary = fmt.Sprintf("%s  %d commands", item.description, item.count)
		}
		rows = append(rows, helpCommandRow{
			Name:                    name,
			Summary:                 summary,
			IntegrationOnly:         item.count > 0 && item.integrationCount == item.count,
			IncludesIntegrationOnly: item.integrationCount > 0 && item.integrationCount < item.count,
		})
	}
	return rows
}

func commandScopeDescription(command Capability) string {
	description := strings.TrimSpace(valueOrZero(command.Source.CLIDescription))
	if description != "" {
		return description
	}
	return strings.TrimSpace(valueOrZero(command.Source.AppDescription))
}

func matchingPrefixCommands(commands []Capability, prefix []string) []Capability {
	result := make([]Capability, 0)
	for _, command := range commands {
		if len(command.Path) <= len(prefix) {
			continue
		}
		matched := true
		for index, segment := range prefix {
			if command.Path[index] != segment {
				matched = false
				break
			}
		}
		if matched {
			result = append(result, command)
		}
	}
	sort.SliceStable(result, func(left, right int) bool {
		return strings.Join(result[left].Path, " ") < strings.Join(result[right].Path, " ")
	})
	return result
}

func prefixHelpRows(prefix []string, commands []Capability) []helpCommandRow {
	type group struct {
		count            int
		integrationCount int
		summary          string
	}
	groups := map[string]group{}
	for _, command := range commands {
		if len(command.Path) <= len(prefix) {
			continue
		}
		remaining := command.Path[len(prefix):]
		name := remaining[0]
		current := groups[name]
		current.count++
		if isIntegrationCapability(command) {
			current.integrationCount++
		}
		if len(remaining) == 1 && current.summary == "" {
			current.summary = command.Summary
		}
		groups[name] = current
	}
	names := make([]string, 0, len(groups))
	for name := range groups {
		names = append(names, name)
	}
	sort.Strings(names)
	rows := make([]helpCommandRow, 0, len(names))
	for _, name := range names {
		item := groups[name]
		summary := item.summary
		if summary == "" {
			summary = fmt.Sprintf("%d commands", item.count)
		}
		if item.count == 1 {
			if required := requiredFlagSummaryForPrefixCommand(prefix, name, commands); required != "" {
				summary = summary + "  required: " + required
			}
		}
		rows = append(rows, helpCommandRow{
			Name:                    name,
			Summary:                 summary,
			IntegrationOnly:         item.count > 0 && item.integrationCount == item.count,
			IncludesIntegrationOnly: item.integrationCount > 0 && item.integrationCount < item.count,
			Children:                prefixHelpChildRows(prefix, name, commands, prefixHelpGroupPreviewLimit),
			RemainingChildren:       prefixHelpRemainingChildCount(prefix, name, commands, prefixHelpGroupPreviewLimit),
		})
	}
	return rows
}

func prefixHelpChildRows(prefix []string, name string, commands []Capability, limit int) []helpCommandRow {
	if limit <= 0 {
		return nil
	}
	childPrefix := append(append([]string(nil), prefix...), name)
	leaves := make([]Capability, 0)
	for _, command := range commands {
		if len(command.Path) != len(childPrefix)+1 {
			continue
		}
		if !pathHasPrefix(command.Path, childPrefix) {
			continue
		}
		leaves = append(leaves, command)
	}
	sort.SliceStable(leaves, func(left, right int) bool {
		return strings.Join(leaves[left].Path, " ") < strings.Join(leaves[right].Path, " ")
	})
	if len(leaves) > limit {
		leaves = leaves[:limit]
	}
	rows := make([]helpCommandRow, 0, len(leaves))
	for _, command := range leaves {
		childName := command.Path[len(childPrefix)]
		summary := strings.TrimSpace(command.Summary)
		if required := requiredFlagSummary(command); required != "" {
			summary = summary + "  required: " + required
		}
		rows = append(rows, helpCommandRow{
			Name:            childName,
			Summary:         summary,
			IntegrationOnly: isIntegrationCapability(command),
		})
	}
	return rows
}

func prefixHelpRemainingChildCount(prefix []string, name string, commands []Capability, limit int) int {
	if limit <= 0 {
		return 0
	}
	childPrefix := append(append([]string(nil), prefix...), name)
	count := 0
	for _, command := range commands {
		if len(command.Path) == len(childPrefix)+1 && pathHasPrefix(command.Path, childPrefix) {
			count++
		}
	}
	if count <= limit {
		return 0
	}
	return count - limit
}

func pathHasPrefix(path []string, prefix []string) bool {
	if len(path) < len(prefix) {
		return false
	}
	for index, segment := range prefix {
		if path[index] != segment {
			return false
		}
	}
	return true
}

func requiredFlagSummaryForPrefixCommand(prefix []string, name string, commands []Capability) string {
	for _, command := range commands {
		if len(command.Path) != len(prefix)+1 {
			continue
		}
		if command.Path[len(prefix)] != name {
			continue
		}
		return requiredFlagSummary(command)
	}
	return ""
}

func requiredFlagSummary(command Capability) string {
	flags := commandFlags(valueOrZero(command.InputSchema))
	required := make([]string, 0)
	for _, flag := range flags {
		if flag.Required {
			required = append(required, "--"+flag.Name+" <value>")
		}
	}
	return strings.Join(required, " ")
}

func printHelpRows(stdout io.Writer, rows []helpCommandRow) {
	width := 0
	for _, row := range rows {
		if len(row.Name) > width {
			width = len(row.Name)
		}
	}
	for _, row := range rows {
		summary := row.Summary
		switch {
		case row.IntegrationOnly:
			summary += " [integration-only]"
		case row.IncludesIntegrationOnly:
			summary += " [includes integration-only]"
		}
		fmt.Fprintf(stdout, "  %-*s  %s\n", width, row.Name, summary)
		printHelpChildRows(stdout, row)
	}
}

func printHelpChildRows(stdout io.Writer, row helpCommandRow) {
	if len(row.Children) == 0 && row.RemainingChildren == 0 {
		return
	}
	childWidth := 0
	for _, child := range row.Children {
		if len(child.Name) > childWidth {
			childWidth = len(child.Name)
		}
	}
	for _, child := range row.Children {
		summary := child.Summary
		if child.IntegrationOnly {
			summary += " [integration-only]"
		}
		fmt.Fprintf(stdout, "    %-*s  %s\n", childWidth, child.Name, summary)
	}
	if row.RemainingChildren > 0 {
		fmt.Fprintf(stdout, "    ...   %d more commands\n", row.RemainingChildren)
	}
}

func printIntegrationOnlyNotice(stdout io.Writer, commands []Capability) {
	if !hasIntegrationCapability(commands) {
		return
	}
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Integration-only commands are app-runtime plumbing. Do not expose or forward them as ordinary user or Agent actions; prefer public app commands.")
}

func hasIntegrationCapability(commands []Capability) bool {
	for _, command := range commands {
		if isIntegrationCapability(command) {
			return true
		}
	}
	return false
}

func isIntegrationCapability(command Capability) bool {
	return strings.TrimSpace(valueOrZero(command.Visibility)) == "integration"
}

func printDocumentationHints(stdout io.Writer, commands []Capability) {
	hints := documentationHints(commands)
	if len(hints) == 0 {
		return
	}
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "More documentation:")
	for _, hint := range hints {
		fmt.Fprintf(stdout, "  %s\n", hint.File)
	}
}

type documentationHint struct {
	File string
}

func documentationHints(commands []Capability) []documentationHint {
	seen := map[string]struct{}{}
	hints := make([]documentationHint, 0)
	for _, command := range commands {
		file := strings.TrimSpace(valueOrZero(command.Source.DocumentationPath))
		if file == "" {
			file = strings.TrimSpace(valueOrZero(command.Source.DocumentationFile))
		}
		if file == "" {
			continue
		}
		if _, ok := seen[file]; ok {
			continue
		}
		seen[file] = struct{}{}
		hints = append(hints, documentationHint{File: file})
	}
	sort.SliceStable(hints, func(left, right int) bool {
		return hints[left].File < hints[right].File
	})
	return hints
}

func valueOrZero[T any](value *T) T {
	if value == nil {
		var zero T
		return zero
	}
	return *value
}
