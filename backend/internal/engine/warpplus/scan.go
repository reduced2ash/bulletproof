package warpplus

import (
    "bufio"
    "context"
    "os"
    "os/exec"
    "regexp"
    "runtime"
)

type Endpoint struct {
    Address string // ip:port
    Score   int    // optional quality metric if available; 0 if unknown
}

var reScan = regexp.MustCompile(`(?m)^([0-9\.]+:[0-9]+)(?:\s+(\d+))?$`)

// Scan invokes warp-plus with --scan and parses endpoints from stdout.
// Note: This relies on warp-plus exposing a scan mode. If not available,
// callers can ignore errors and fall back to user-provided endpoints.
func Scan(ctx context.Context, bin string) ([]Endpoint, error) {
    if bin == "" {
        // Prefer env if provided (same behavior as Engine default)
        if env := os.Getenv("WARPPLUS_BIN"); env != "" { bin = env }
    }
    if bin == "" {
        if runtime.GOOS == "windows" { bin = "warp-plus.exe" } else { bin = "warp-plus" }
    }
    cmd := exec.CommandContext(ctx, bin, "--scan")
    stdout, err := cmd.StdoutPipe()
    if err != nil { return nil, err }
    if err := cmd.Start(); err != nil { return nil, err }
    defer cmd.Wait()

    eps := make([]Endpoint, 0, 32)
    sc := bufio.NewScanner(stdout)
    for sc.Scan() {
        line := sc.Text()
        m := reScan.FindStringSubmatch(line)
        if len(m) == 0 { continue }
        ep := Endpoint{Address: m[1]}
        eps = append(eps, ep)
    }
    return eps, nil
}
