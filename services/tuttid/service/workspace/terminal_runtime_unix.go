//go:build !windows

package workspace

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

type unixTerminalRuntime struct {
	command *exec.Cmd
	file    *os.File
}

func startTerminalRuntime(shell string, args []string, cwd string, env []string, cols int, rows int) (terminalRuntime, error) {
	command := exec.Command(shell, args...)
	command.Dir = cwd
	command.Env = env
	file, err := pty.StartWithSize(command, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, err
	}
	return &unixTerminalRuntime{command: command, file: file}, nil
}

func (r *unixTerminalRuntime) Close() error {
	return r.file.Close()
}

func (r *unixTerminalRuntime) Kill() error {
	if r.command.Process == nil {
		return nil
	}
	return r.command.Process.Kill()
}

func (r *unixTerminalRuntime) Read(data []byte) (int, error) {
	return r.file.Read(data)
}

func (r *unixTerminalRuntime) Resize(cols int, rows int) error {
	return pty.Setsize(r.file, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (r *unixTerminalRuntime) Wait() error {
	return r.command.Wait()
}

func (r *unixTerminalRuntime) Write(data []byte) (int, error) {
	return r.file.Write(data)
}
