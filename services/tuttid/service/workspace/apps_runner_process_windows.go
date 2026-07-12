//go:build windows

package workspace

import (
	"os/exec"
	"strconv"
)

func prepareAppProcessCommand(*exec.Cmd) {}

func interruptAppProcess(command *exec.Cmd) error {
	return killAppProcess(command)
}

func killAppProcess(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	if err := exec.Command("taskkill", "/PID", strconv.Itoa(command.Process.Pid), "/T", "/F").Run(); err == nil {
		return nil
	}
	return command.Process.Kill()
}
