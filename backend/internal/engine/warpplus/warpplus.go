package warpplus

import (
    "context"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
    "strings"
    "sync"
)

// Runner abstracts command start for testability.
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
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    if err := cmd.Start(); err != nil {
        return nil, err
    }
    return &execProcess{cmd: cmd}, nil
}

type execProcess struct{ cmd *exec.Cmd }

func (p *execProcess) Wait() error { return p.cmd.Wait() }
func (p *execProcess) Kill() error { return p.cmd.Process.Kill() }

// Config for starting warp-plus.
type Config struct {
    Bin       string // path to warp-plus (optional; auto-detect by default)
    Key       string // WARP or WARP+ key (optional)
    Endpoint  string // e.g., 188.114.xxx.xxx:1002 (optional; engine may auto-pick if empty)
    Bind      string // local bind, default 127.0.0.1:8086
    Mode      string // "warp" | "gool" | "psiphon"
    Country   string // exit country for psiphon/cfon
    CacheDir     string // directory for engine state/cache (recommended)
    LogPath      string // optional log file for stdout/stderr
    TestURL      string // override connectivity test URL
    IPv4Only     bool   // force IPv4 endpoints
    IPv6Only     bool   // force IPv6 endpoints
    Verbose      bool   // enable verbose logging
}

// Engine supervises a warp-plus process.
type Engine struct {
    cfg    Config
    run    Runner
    mu     sync.RWMutex
    proc   Process
    active bool
    lastErr error
}

func New(cfg Config) *Engine { return &Engine{cfg: cfg, run: execRunner{}} }

func defaultBin() string {
    if b := os.Getenv("WARPPLUS_BIN"); b != "" { return b }
    if runtime.GOOS == "windows" { return "warp-plus.exe" }
    return "warp-plus"
}

func (e *Engine) Start(ctx context.Context) error {
    e.mu.Lock()
    defer e.mu.Unlock()
    if e.active {
        return nil
    }
    bin := e.cfg.Bin
    if bin == "" { bin = defaultBin() }

    args := []string{}
    if e.cfg.Verbose {
        args = append(args, "--verbose")
    }
    // Bind SOCKS5
    bind := e.cfg.Bind
    if bind == "" { bind = "127.0.0.1:8086" }
    args = append(args, "--bind", bind)
    if e.cfg.IPv4Only { args = append(args, "-4") }
    if e.cfg.IPv6Only { args = append(args, "-6") }
    if e.cfg.Key != "" {
        args = append(args, "--key", e.cfg.Key)
    }
    if e.cfg.Endpoint != "" {
        args = append(args, "--endpoint", e.cfg.Endpoint)
    }
    if e.cfg.CacheDir != "" {
        args = append(args, "--cache-dir", e.cfg.CacheDir)
    }
    if e.cfg.TestURL != "" {
        args = append(args, "--test-url", e.cfg.TestURL)
    }
    switch strings.ToLower(e.cfg.Mode) {
    case "warp", "":
        // no extra flags
    case "gool":
        args = append(args, "--gool")
    case "psiphon", "cfon":
        args = append(args, "--cfon")
        if e.cfg.Country != "" {
            args = append(args, "--country", e.cfg.Country)
        }
    default:
        return fmt.Errorf("unknown mode: %s", e.cfg.Mode)
    }

    // If LogPath specified, wrap runner to write to file and annotate command line.
    if e.cfg.LogPath != "" {
        e.run = &fileRunner{logPath: e.cfg.LogPath}
    }
    proc, err := e.run.Start(ctx, bin, args...)
    if err != nil {
        e.lastErr = err
        return err
    }
    e.proc = proc
    e.active = true

    // Monitor process in background
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

// fileRunner writes stdout/stderr to a single append-only file.
type fileRunner struct{ logPath string }

func (f *fileRunner) Start(ctx context.Context, name string, args ...string) (Process, error) {
    // lazy imports: use stdlib already imported above
    // ensure directory exists
    if err := os.MkdirAll(filepath.Dir(f.logPath), 0o755); err != nil { return nil, err }
    lf, err := os.OpenFile(f.logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
    if err != nil { return nil, err }
    // annotate command line for diagnostics
    _, _ = lf.WriteString("bulletproofd: starting warp-plus: " + name + " " + strings.Join(args, " ") + "\n")

    cmd := exec.CommandContext(ctx, name, args...)
    cmd.Env = sanitizeEnv(os.Environ())
    cmd.Stdout = lf
    cmd.Stderr = lf
    if err := cmd.Start(); err != nil { return nil, err }
    return &execProcess{cmd: cmd}, nil
}

// sanitizeEnv removes potentially conflicting variables that some CLI parsers
// may treat as flags (e.g., IDENTITY). This helps avoid errors like
// "unknown flag \"identity\"" from third-party binaries.
func sanitizeEnv(in []string) []string {
    out := make([]string, 0, len(in))
    for _, kv := range in {
        // drop any env var whose key equals "IDENTITY" (case-insensitive)
        // or ends with "_IDENTITY" to be safe (e.g., WGCF_IDENTITY)
        upper := strings.ToUpper(kv)
        if strings.HasPrefix(upper, "IDENTITY=") || strings.Contains(upper, "_IDENTITY=") {
            continue
        }
        out = append(out, kv)
    }
    return out
}
