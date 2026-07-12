//go:build windows

package workspace

import (
	"errors"
	"os/exec"
)

func describeTerminalExit(err error) (*int, *string) {
	var terminalErr terminalExitError
	if errors.As(err, &terminalErr) {
		return &terminalErr.code, nil
	}
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		return nil, nil
	}

	code := exitErr.ExitCode()
	if code < 0 {
		return nil, nil
	}
	return &code, nil
}
