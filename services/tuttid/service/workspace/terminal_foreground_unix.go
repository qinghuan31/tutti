//go:build !windows

package workspace

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

func (s *terminalRuntimeSession) foregroundProcess() (terminalForegroundProcess, bool) {
	s.mu.Lock()
	terminalRuntime, ok := s.runtime.(*unixTerminalRuntime)
	shell := s.shell
	s.mu.Unlock()
	if !ok {
		return terminalForegroundProcess{}, false
	}
	file := terminalRuntime.file
	process := terminalRuntime.command.Process

	if file == nil || process == nil {
		return terminalForegroundProcess{}, false
	}

	foregroundPgrp, err := unix.IoctlGetInt(int(file.Fd()), unix.TIOCGPGRP)
	if err != nil || foregroundPgrp <= 0 {
		return terminalForegroundProcess{}, false
	}
	shellPgrp, err := unix.Getpgid(process.Pid)
	if err != nil || shellPgrp <= 0 {
		return terminalForegroundProcess{}, false
	}
	if foregroundPgrp == shellPgrp {
		return terminalForegroundProcess{
			hasForegroundProcess: false,
		}, true
	}

	return terminalForegroundProcess{
		hasForegroundProcess: true,
		leaderCommand:        foregroundProcessGroupLeaderCommand(foregroundPgrp, shell),
	}, true
}

func foregroundProcessGroupLeaderCommand(pgrp int, fallback string) *string {
	output, err := exec.Command("ps", "-o", "comm=", "-p", strconv.Itoa(pgrp)).Output()
	if err != nil {
		return nil
	}
	command := strings.TrimSpace(string(output))
	if command == "" || command == fallback {
		return nil
	}
	base := command
	if slash := strings.LastIndex(base, "/"); slash >= 0 {
		base = base[slash+1:]
	}
	if base == "" {
		return nil
	}
	label := fmt.Sprintf("%s (pid %d)", base, pgrp)
	return &label
}
