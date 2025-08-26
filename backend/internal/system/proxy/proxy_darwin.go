//go:build darwin
// +build darwin

package proxy

import (
    "context"
    "errors"
    "os/exec"
    "strings"
)

// EnablePAC sets the Auto Proxy URL for all network services on macOS.
func EnablePAC(ctx context.Context, pacURL string) error {
    services, err := listServices(ctx)
    if err != nil { return err }
    for _, s := range services {
        if s == "" || strings.HasPrefix(s, "*") { continue }
        _ = run(ctx, "networksetup", "-setautoproxyurl", s, pacURL)
        _ = run(ctx, "networksetup", "-setautoproxystate", s, "on")
    }
    return nil
}

// DisablePAC clears the Auto Proxy URL for all services on macOS.
func DisablePAC(ctx context.Context) error {
    services, err := listServices(ctx)
    if err != nil { return err }
    for _, s := range services {
        if s == "" || strings.HasPrefix(s, "*") { continue }
        _ = run(ctx, "networksetup", "-setautoproxystate", s, "off")
    }
    return nil
}

func listServices(ctx context.Context) ([]string, error) {
    out, err := exec.CommandContext(ctx, "networksetup", "-listallnetworkservices").CombinedOutput()
    if err != nil { return nil, err }
    lines := strings.Split(string(out), "\n")
    if len(lines) == 0 { return nil, errors.New("no services") }
    // First line is a header
    if strings.HasPrefix(lines[0], "An asterisk (*) shows") { lines = lines[1:] }
    return lines, nil
}

func run(ctx context.Context, name string, args ...string) error {
    cmd := exec.CommandContext(ctx, name, args...)
    return cmd.Run()
}

