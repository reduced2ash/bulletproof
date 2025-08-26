package singbox

import (
    "context"
    "encoding/json"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
    "sync"
)

// Runner abstracts process spawn for testability.
type Runner interface {
    Start(ctx context.Context, name string, args ...string) (Process, error)
}

// Process represents a started child process.
type Process interface {
    Wait() error
    Kill() error
}

type execRunner struct{}

func (execRunner) Start(ctx context.Context, name string, args ...string) (Process, error) {
    cmd := exec.CommandContext(ctx, name, args...)
    if err := cmd.Start(); err != nil {
        return nil, err
    }
    return &execProcess{cmd: cmd}, nil
}

type execProcess struct{ cmd *exec.Cmd }

func (p *execProcess) Wait() error { return p.cmd.Wait() }
func (p *execProcess) Kill() error { return p.cmd.Process.Kill() }

// Config for starting sing-box in TUN mode that forwards to a local SOCKS5.
type Config struct {
    Bin       string // path to sing-box/sb-helper (optional; auto-detect)
    SocksAddr string // local SOCKS5, e.g. 127.0.0.1:8086
    StateDir  string // where to place generated config
    LogPath   string // reserved for future use
}

// Engine supervises a sing-box process running with a generated config.
type Engine struct {
    cfg    Config
    run    Runner
    mu     sync.RWMutex
    proc   Process
    active bool
    lastErr error
    configPath string
}

func New(cfg Config) *Engine { return &Engine{cfg: cfg, run: execRunner{}} }

func defaultBin() string {
    if b := os.Getenv("SINGBOX_BIN"); b != "" { return b }
    // Prefer sb-helper name if distributed as helper, else fallback to sing-box
    if runtime.GOOS == "windows" {
        // Try helper first
        return "sb-helper.exe"
    }
    return "sb-helper"
}

// Start writes a minimal TUN->SOCKS configuration and starts sing-box.
func (e *Engine) Start(ctx context.Context) error {
    e.mu.Lock()
    defer e.mu.Unlock()
    if e.active { return nil }

    if e.cfg.SocksAddr == "" { e.cfg.SocksAddr = "127.0.0.1:8086" }
    if e.cfg.StateDir == "" { return fmt.Errorf("missing StateDir") }
    if err := os.MkdirAll(e.cfg.StateDir, 0o755); err != nil { return err }

    cfgPath := filepath.Join(e.cfg.StateDir, "singbox.json")
    if err := writeConfig(cfgPath, e.cfg.SocksAddr); err != nil { e.lastErr = err; return err }
    e.configPath = cfgPath

    bin := e.cfg.Bin
    if bin == "" { bin = defaultBin() }

    // Try running as `sb-helper -c` or `sing-box run -c` depending on binary.
    args := []string{}
    base := filepath.Base(bin)
    if base == "sing-box" || base == "sing-box.exe" {
        args = append(args, "run", "-c", cfgPath)
    } else {
        args = append(args, "-c", cfgPath)
    }

    proc, err := e.run.Start(ctx, bin, args...)
    if err != nil { e.lastErr = err; return err }
    e.proc = proc
    e.active = true
    go func() {
        err := proc.Wait()
        e.mu.Lock()
        defer e.mu.Unlock()
        e.lastErr = err
        e.active = false
        e.proc = nil
    }()
    return nil
}

func (e *Engine) Stop() error {
    e.mu.Lock()
    defer e.mu.Unlock()
    if !e.active || e.proc == nil { return nil }
    return e.proc.Kill()
}

func (e *Engine) Active() bool { e.mu.RLock(); defer e.mu.RUnlock(); return e.active }
func (e *Engine) LastError() error { e.mu.RLock(); defer e.mu.RUnlock(); return e.lastErr }

// writeConfig writes a minimal config that exposes a TUN device and forwards all traffic
// to a local SOCKS5 proxy at socksAddr.
func writeConfig(path string, socksAddr string) error {
    // split host:port
    host, port := "127.0.0.1", 8086
    if h, p, ok := splitHostPort(socksAddr); ok { host, port = h, p }
    cfg := map[string]any{
        "log": map[string]any{"disabled": true},
        "dns": map[string]any{"servers": []any{"https://1.1.1.1/dns-query"}},
        "inbounds": []any{
            map[string]any{
                "type": "tun",
                "inet4_address": "172.19.0.1/30",
                "auto_route": true,
                "strict_route": false,
                "stack": "gvisor",
                "sniff": true,
            },
        },
        "outbounds": []any{
            map[string]any{
                "type": "socks",
                "server": host,
                "server_port": port,
                "version": "5",
            },
            map[string]any{"type":"direct","tag":"direct"},
            map[string]any{"type":"block","tag":"block"},
        },
        "route": map[string]any{
            "auto_route": true,
            "final": "socks-out",
        },
    }
    // Tag the first outbound so route.final can reference it (older versions ignore unknown tag)
    if outs, ok := cfg["outbounds"].([]any); ok && len(outs) > 0 {
        if m, ok := outs[0].(map[string]any); ok { m["tag"] = "socks-out" }
    }
    b, _ := json.MarshalIndent(cfg, "", "  ")
    return os.WriteFile(path, b, 0o644)
}

func splitHostPort(addr string) (string, int, bool) {
    var host string
    var port int
    n, err := fmt.Sscanf(addr, "%[^:]:%d", &host, &port)
    if err != nil || n != 2 { return "", 0, false }
    return host, port, true
}

