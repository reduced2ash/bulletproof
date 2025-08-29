package warp

import (
    "context"
    "fmt"
    "net"
    "path/filepath"
    "strconv"
    "time"
    "os"
    "strings"

    "bulletproof/backend/internal/core"
    "bulletproof/backend/internal/engine/warpplus"
    "bulletproof/backend/internal/engine/singbox"
    "bulletproof/backend/internal/system/proxy"
    "bulletproof/backend/internal/net/shimsocks"
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
    // Public bind is the port apps/system will use. We'll run a shim SOCKS server there.
    publicBind := bindFrom(req)
    warpBind := altBind(publicBind, 18086) // where warp-plus actually listens; avoid collision

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
    // Try one or more test URLs to coax warp-plus into opening SOCKS in restrictive networks.
    urls := candidateTestURLs(req)
    var lastErr error
    var usedURL string
    for i, u := range urls {
        cfg := baseCfg
        cfg.TestURL = u
        eng := warpplus.New(cfg)
        if err := eng.Start(context.Background()); err != nil {
            lastErr = err
            continue
        }
        // Wait for warp-bind to open (not publicBind, which shim owns)
        if err := waitPort(cfg.Bind, 45*time.Second); err != nil {
            _ = eng.Stop()
            lastErr = err
            continue
        }
        // Success
        p.eng = eng
        usedURL = u
        lastErr = nil
        break
    _ = i // silence unused warning if build tags strip loops
    }
    if p.eng == nil {
        // Fallback: scan for endpoints and retry with them.
        eps, scanErr := warpplus.Scan(context.Background(), baseCfg.Bin)
        if scanErr == nil && len(eps) > 0 {
            // Limit attempts to avoid long stalls.
            maxEP := len(eps)
            if maxEP > 15 { maxEP = 15 }
            // Try a shorter URL list in scan mode (first 3 candidates).
            scanURLs := candidateTestURLs(req)
            if len(scanURLs) > 3 { scanURLs = scanURLs[:3] }
            for i := 0; i < maxEP; i++ {
                for _, u := range scanURLs {
                    cfg := baseCfg
                    cfg.Endpoint = eps[i].Address
                    cfg.TestURL = u
                    eng := warpplus.New(cfg)
                    if err := eng.Start(context.Background()); err != nil { lastErr = err; continue }
                    if err := waitPort(cfg.Bind, 35*time.Second); err != nil { _ = eng.Stop(); lastErr = err; continue }
                    p.eng = eng
                    usedURL = u
                    // include endpoint in message
                    usedURL = u + ", ep=" + cfg.Endpoint
                    lastErr = nil
                    break
                }
                if p.eng != nil { break }
            }
        } else if scanErr != nil {
            lastErr = scanErr
        }
        if p.eng == nil {
            if lastErr == nil { lastErr = fmt.Errorf("failed to open SOCKS with any testURL or scanned endpoint") }
            p.st = core.Status{Connected: false, Provider: p.Name(), Message: "engine started but SOCKS not ready"}
            return lastErr
        }
    }
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
    // Background: once warp-plus SOCKS is up, update status to reflect ready.
    go func() {
        ready := waitPort(warpBind, 3*time.Minute) == nil
        if ready {
            p.st.Message = "connected (warp active)"
        }
    }()
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
    return "127.0.0.1:8086"
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
