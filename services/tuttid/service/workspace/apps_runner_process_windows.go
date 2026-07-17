//go:build windows

package workspace

import (
	"errors"
	"fmt"
	"os/exec"
	"unsafe"

	"golang.org/x/sys/windows"
)

func prepareAppProcessCommand(*exec.Cmd) {}

func interruptAppProcess(command *exec.Cmd) error {
	return killAppProcess(command)
}

func killAppProcess(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	if err := terminateWindowsProcessTree(uint32(command.Process.Pid)); err == nil {
		return nil
	}
	return command.Process.Kill()
}

func terminateWindowsProcessTree(rootPID uint32) error {
	pids, err := windowsProcessTree(rootPID)
	if err != nil {
		return err
	}
	var terminateErr error
	for index := len(pids) - 1; index >= 0; index-- {
		pid := pids[index]
		handle, openErr := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.SYNCHRONIZE, false, pid)
		if openErr != nil {
			if errors.Is(openErr, windows.ERROR_INVALID_PARAMETER) {
				continue
			}
			terminateErr = errors.Join(terminateErr, openErr)
			continue
		}
		if err := windows.TerminateProcess(handle, 1); err != nil && !errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			terminateErr = errors.Join(terminateErr, err)
		}
		waitStatus, waitErr := windows.WaitForSingleObject(handle, 2000)
		terminateErr = errors.Join(terminateErr, waitErr)
		if waitErr == nil && waitStatus == uint32(windows.WAIT_TIMEOUT) {
			terminateErr = errors.Join(terminateErr, fmt.Errorf("timed out waiting for process %d to exit", pid))
		}
		_ = windows.CloseHandle(handle)
	}
	return terminateErr
}

func windowsProcessTree(rootPID uint32) ([]uint32, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snapshot)

	children := make(map[uint32][]uint32)
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	if err := windows.Process32First(snapshot, &entry); err != nil {
		return nil, err
	}
	for {
		children[entry.ParentProcessID] = append(children[entry.ParentProcessID], entry.ProcessID)
		if err := windows.Process32Next(snapshot, &entry); err != nil {
			if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
				break
			}
			return nil, err
		}
	}

	result := []uint32{rootPID}
	for index := 0; index < len(result); index++ {
		result = append(result, children[result[index]]...)
	}
	return result, nil
}
