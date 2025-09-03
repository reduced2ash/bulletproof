package warp

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "net"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "time"

    "bulletproof/backend/internal/core"
    "bulletproof/backend/internal/engine/singbox"
    "bulletproof/backend/internal/engine/warpplus"
    "bulletproof/backend/internal/net/shimsocks"
    "bulletproof/backend/internal/system/proxy"
)

type provider struct{
    st core.Status
    eng *warpplus.Engine
    sb  *singbox.Engine
    wantPAC bool
    ss  *shimsocks.Server
}

func New() core.Provider { return &provider{} }

func (p *provider) Name() string { return "warp" }

func (p *provider) Connect(req core.ConnectRequest) error {
    stateDir := req.Options["stateDir"]
    // Resolve a stable, available public bind (persist across runs). Use req.Options["bind"]
    // if provided; otherwise try last persisted bind, then scan 8087-8090.
    // We intentionally avoid 8086 here because the bundled warp-plus prefers 127.0.0.1:8086
    // for its internal SOCKS listener across versions.
    publicBind, err := choosePublicBind(stateDir, bindFrom(req))
    if err != nil { return err }
    // where warp-plus actually listens; many builds ignore --bind and stick to 127.0.0.1:8086.
    // Use the canonical port so readiness checks work and avoid collisions by not using 8086 for publicBind.
    warpBind := altBind("127.0.0.1:8086", 8086)

    baseCfg := warpplus.Config{
        Bin:      req.Options["bin"],
        Key:      req.Options["key"],
        Endpoint: endpointFrom(req),
        Bind:     warpBind,
        Mode:     modeFromProvider(req.Provider),
        Country:  req.ExitCountry,
        CacheDir: stateDir,
        LogPath:  filepath.Join(stateDir, "warp-plus.log"),
        DNS:      firstNonEmpty(req.Options["dns"], os.Getenv("WARPPLUS_DNS")),
        IPv4Only: os.Getenv("WARPPLUS_IPV4") == "1" || os.Getenv("WARPPLUS_IPV4") == "true",
        IPv6Only: os.Getenv("WARPPLUS_IPV6") == "1" || os.Getenv("WARPPLUS_IPV6") == "true",
        Verbose:  os.Getenv("WARPPLUS_VERBOSE") == "1" || os.Getenv("WARPPLUS_VERBOSE") == "true",
    }
    // Start the shim SOCKS immediately so the listening port is available.
    allowDirect := os.Getenv("BP_SOCKS_DIRECT_FALLBACK") == "1" || os.Getenv("BP_SOCKS_DIRECT_FALLBACK") == "true"
    p.ss = shimsocks.New(shimsocks.Config{ListenAddr: publicBind, UpstreamSocks: warpBind, AllowDirectFallback: allowDirect})
    if err := p.ss.Start(context.Background()); err != nil {
        p.st = core.Status{Connected: false, Provider: p.Name(), Message: "shim socks failed: " + err.Error()}
        return err
    }
    // Persist chosen public bind for next time.
    _ = persistBind(stateDir, publicBind)

    // Launch warp-plus attempts in the background to avoid blocking the HTTP call.
    var usedURL string
    go func() {
        urls := candidateTestURLs(req)
        // First phase: try provided/default test URLs.
        var lastErr error
        for _, u := range urls {
            cfg := baseCfg
            cfg.TestURL = u
            eng := warpplus.New(cfg)
            if err := eng.Start(context.Background()); err != nil { lastErr = err; continue }
            if err := waitPort(cfg.Bind, 45*time.Second); err != nil { _ = eng.Stop(); lastErr = err; continue }
            p.eng = eng
            usedURL = u
            lastErr = nil
            break
        }
        // Second phase: scan endpoints and retry in combination with a shorter URL list.
        if p.eng == nil {
            eps, scanErr := warpplus.Scan(context.Background(), baseCfg.Bin)
            if scanErr == nil && len(eps) > 0 {
                maxEP := len(eps)
                if maxEP > 15 { maxEP = 15 }
                scanURLs := candidateTestURLs(req)
                if len(scanURLs) > 3 { scanURLs = scanURLs[:3] }
                for i := 0; i < maxEP && p.eng == nil; i++ {
                    for _, u := range scanURLs {
                        cfg := baseCfg
                        cfg.Endpoint = eps[i].Address
                        cfg.TestURL = u
                        eng := warpplus.New(cfg)
                        if err := eng.Start(context.Background()); err != nil { lastErr = err; continue }
                        if err := waitPort(cfg.Bind, 35*time.Second); err != nil { _ = eng.Stop(); lastErr = err; continue }
                        p.eng = eng
                        usedURL = u + ", ep=" + cfg.Endpoint
                        lastErr = nil
                        break
                    }
                }
            }
            if p.eng == nil && lastErr != nil {
                // Surface a hint in status for troubleshooting; shim still serves.
                p.st.Message = "shim active; warp pending: " + lastErr.Error()
            }
        }
        // Once warp-plus SOCKS is up, update status to reflect ready.
        if p.eng != nil {
            // In parallel, detect early handshake success to surface better status while SOCKS warms.
            go detectHandshake(filepath.Join(stateDir, "warp-plus.log"), &p.st)
            if err := waitPort(warpBind, 3*time.Minute); err == nil {
                p.st.Message = "connected (warp active)"
            }
        }
    }()
    // Integration mode: direct (default), pac, or tun via sing-box
    switch req.Options["integration"] {
    case "pac":
        p.wantPAC = true
        _ = proxy.EnablePAC(context.Background(), "http://127.0.0.1:4765/proxy.pac")
    case "tun":
        // Sing-box should point to public (shim) SOCKS
        p.sb = singbox.New(singbox.Config{SocksAddr: publicBind, StateDir: stateDir})
        if err := p.sb.Start(context.Background()); err != nil {
            p.st = core.Status{Connected: false, Provider: p.Name(), Message: "sing-box failed: " + err.Error()}
            return err
        }
    default:
        // direct: app uses SOCKS 127.0.0.1:8086; no system changes
    }
    msg := "connected (shim; warp warming)"
    if usedURL != "" { msg = "connected (probe=" + usedURL + ")" }
    p.st = core.Status{Connected: true, Provider: p.Name(), Message: msg, ExitCountry: req.ExitCountry, Integration: req.Options["integration"], Bind: publicBind, PacEnabled: p.wantPAC, SingBox: p.sb != nil}
    return nil
}

func (p *provider) Disconnect() error {
    if p.sb != nil { _ = p.sb.Stop(); p.sb = nil }
    if p.wantPAC { _ = proxy.DisablePAC(context.Background()); p.wantPAC = false }
    if p.eng != nil { _ = p.eng.Stop() }
    if p.ss != nil { _ = p.ss.Stop(); p.ss = nil }
    p.st = core.Status{}
    return nil
}

func (p *provider) Status() core.Status { return p.st }

func endpointFrom(req core.ConnectRequest) string {
    if req.Server == "" { return "" }
    if req.Port > 0 { return req.Server + ":" + strconv.Itoa(req.Port) }
    return req.Server
}

func bindFrom(req core.ConnectRequest) string {
    if b := req.Options["bind"]; b != "" { return b }
    return "127.0.0.1:8087"
}

// choosePublicBind selects a bind address, preferring:
// 1) explicit requested bind if provided and available (excluding 8086);
// 2) last persisted bind from state if available (excluding 8086);
// 3) first free port in 8087..8090 on localhost.
func choosePublicBind(stateDir string, requested string) (string, error) {
    // helper to test listen
    tryListen := func(addr string) bool {
        ln, err := net.Listen("tcp", addr)
        if err != nil { return false }
        _ = ln.Close()
        return true
    }
    // 1) requested
    if requested != "" && !strings.HasSuffix(requested, ":8086") && tryListen(requested) {
        return requested, nil
    }
    // 2) last persisted
    if last, ok := loadBind(stateDir); ok && !strings.HasSuffix(last, ":8086") && tryListen(last) {
        return last, nil
    }
    // 3) scan range
    host := "127.0.0.1"
    for p := 8087; p <= 8090; p++ {
        addr := net.JoinHostPort(host, strconv.Itoa(p))
        if tryListen(addr) { return addr, nil }
    }
    return "", errors.New("no available port in 8087-8090")
}

func bindPath(stateDir string) string { return filepath.Join(stateDir, "socks-bind.json") }

func persistBind(stateDir, bind string) error {
    b, _ := json.Marshal(map[string]string{"bind": bind})
    return os.WriteFile(bindPath(stateDir), b, 0o644)
}

func loadBind(stateDir string) (string, bool) {
    b, err := os.ReadFile(bindPath(stateDir))
    if err != nil { return "", false }
    var m map[string]string
    if json.Unmarshal(b, &m) != nil { return "", false }
    v := m["bind"]
    if v == "" { return "", false }
    return v, true
}

func firstNonEmpty(values ...string) string {
    for _, v := range values {
        if v != "" { return v }
    }
    return ""
}

// candidateTestURLs returns a list of test URLs to try in order.
// Priority: explicit request option, WARPPLUS_TEST_URL, WARPPLUS_TEST_URLS (comma-separated), then a small default set.
func candidateTestURLs(req core.ConnectRequest) []string {
    out := make([]string, 0, 16)
    add := func(u string) { if u != "" && !contains(out, u) { out = append(out, u) } }
    // Highest priority: explicit request option; then env overrides.
    add(req.Options["testURL"])
    add(os.Getenv("WARPPLUS_TEST_URL"))
    if list := os.Getenv("WARPPLUS_TEST_URLS"); list != "" {
        for _, p := range splitAndTrim(list, ',') { add(p) }
    }
    // Reasonable defaults: Cloudflare connectivity, popular captive portal checks, IP literals.
    defaults := []string{
        "http://connectivity.cloudflareclient.com/cdn-cgi/trace",
        "http://connectivitycheck.gstatic.com/generate_204",
        "http://1.1.1.1/cdn-cgi/trace",
        "https://1.1.1.1/cdn-cgi/trace",
        "http://detectportal.firefox.com/success.txt",
        "http://neverssl.com/",
        "http://cp.cloudflare.com/",
        "http://example.com/",
    }
    for _, d := range defaults { add(d) }
    return out
}

func splitAndTrim(s string, sep rune) []string {
    out := make([]string, 0, 8)
    cur := make([]rune, 0, len(s))
    flush := func() {
        if len(cur) == 0 { return }
        str := string(cur)
        // trim spaces
        str = strings.TrimSpace(str)
        if str != "" { out = append(out, str) }
        cur = cur[:0]
    }
    for _, r := range s {
        if r == sep { flush(); continue }
        cur = append(cur, r)
    }
    flush()
    return out
}

func contains(list []string, v string) bool {
    for _, x := range list { if x == v { return true } }
    return false
}

func modeFromProvider(p string) string {
    switch p {
    case "warp":
        return "warp"
    case "gool":
        return "gool"
    case "psiphon":
        return "psiphon"
    default:
        return "warp"
    }
}

// altBind returns a sibling address with the same host and a different port.
// If base is "127.0.0.1:8086" and alt is 18086, returns "127.0.0.1:18086".
func altBind(base string, port int) string {
    host, _, err := net.SplitHostPort(base)
    if err != nil { return fmt.Sprintf("127.0.0.1:%d", port) }
    return net.JoinHostPort(host, strconv.Itoa(port))
}

func waitPort(addr string, timeout time.Duration) error {
    if addr == "" { addr = "127.0.0.1:8086" }
    deadline := time.Now().Add(timeout)
    for time.Now().Before(deadline) {
        c, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
        if err == nil {
            c.Close()
            return nil
        }
        time.Sleep(250 * time.Millisecond)
    }
    return fmt.Errorf("timeout waiting for %s", addr)
}

// detectHandshake polls the warp-plus log for "handshake complete" to improve user-facing status
// while the upstream SOCKS may still be warming up or gated by connectivity tests.
func detectHandshake(logPath string, st *core.Status) {
    deadline := time.Now().Add(2 * time.Minute)
    for time.Now().Before(deadline) {
        b, err := os.ReadFile(logPath)
        if err == nil && strings.Contains(string(b), "handshake complete") {
            st.Message = "connected (warp handshake ok; warming)"
            return
        }
        time.Sleep(1500 * time.Millisecond)
    }
}
