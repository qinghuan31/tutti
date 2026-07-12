//go:build windows

package workspace

import (
	"context"
	"fmt"
	"sync"
	"syscall"

	"github.com/UserExistsError/conpty"
)

type windowsTerminalRuntime struct {
	console   *conpty.ConPty
	closeOnce sync.Once
}

type terminalExitError struct {
	code int
}

func (e terminalExitError) Error() string {
	return fmt.Sprintf("terminal exited with code %d", e.code)
}

func startTerminalRuntime(shell string, args []string, cwd string, env []string, cols int, rows int) (terminalRuntime, error) {
	commandLine := syscall.EscapeArg(shell)
	for _, arg := range args {
		commandLine += " " + syscall.EscapeArg(arg)
	}
	console, err := conpty.Start(
		commandLine,
		conpty.ConPtyDimensions(cols, rows),
		conpty.ConPtyEnv(env),
		conpty.ConPtyWorkDir(cwd),
	)
	if err != nil {
		return nil, err
	}
	return &windowsTerminalRuntime{console: console}, nil
}

func (r *windowsTerminalRuntime) Close() error {
	var closeErr error
	r.closeOnce.Do(func() {
		closeErr = r.console.Close()
	})
	return closeErr
}

func (r *windowsTerminalRuntime) Kill() error {
	return r.Close()
}

func (r *windowsTerminalRuntime) Read(data []byte) (int, error) {
	return r.console.Read(data)
}

func (r *windowsTerminalRuntime) Resize(cols int, rows int) error {
	return r.console.Resize(cols, rows)
}

func (r *windowsTerminalRuntime) Wait() error {
	code, err := r.console.Wait(context.Background())
	if err != nil {
		return err
	}
	if code != 0 {
		return terminalExitError{code: int(code)}
	}
	return nil
}

func (r *windowsTerminalRuntime) Write(data []byte) (int, error) {
	return r.console.Write(data)
}
