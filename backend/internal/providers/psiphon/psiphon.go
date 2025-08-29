package psiphon

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
)

type provider struct{
    st core.Status
    eng *warpplus.Engine
    sb  *singbox.Engine
    wantPAC bool
}

func New() core.Provider { return &provider{} }

func (p *provider) Name() string { return "psiphon" }

func (p *provider) Connect(req core.ConnectRequest) error {
    stateDir := req.Options["stateDir"]
    baseCfg := warpplus.Config{
        Bin:      req.Options["bin"],
        Key:      req.Options["key"],
        Endpoint: endpointFrom(req),
        Bind:     bindFrom(req),
        Mode:     "psiphon",
        Country:  req.ExitCountry,
        CacheDir: stateDir,
        LogPath:  filepath.Join(stateDir, "warp-plus.log"),
        DNS:      firstNonEmpty(req.Options["dns"], os.Getenv("WARPPLUS_DNS")),
        IPv4Only: os.Getenv("WARPPLUS_IPV4") == "1" || os.Getenv("WARPPLUS_IPV4") == "true",
        IPv6Only: os.Getenv("WARPPLUS_IPV6") == "1" || os.Getenv("WARPPLUS_IPV6") == "true",
        Verbose:  os.Getenv("WARPPLUS_VERBOSE") == "1" || os.Getenv("WARPPLUS_VERBOSE") == "true",
    }
    urls := candidateTestURLs(req)
    var lastErr error
    var usedURL string
    for _, u := range urls {
        cfg := baseCfg
        cfg.TestURL = u
        eng := warpplus.New(cfg)
        if err := eng.Start(context.Background()); err != nil {
            lastErr = err
            continue
        }
        if err := waitPort(cfg.Bind, 45*time.Second); err != nil {
            _ = eng.Stop()
            lastErr = err
            continue
        }
        p.eng = eng
        usedURL = u
        lastErr = nil
        break
    }
    if p.eng == nil {
        if lastErr == nil { lastErr = fmt.Errorf("failed to open SOCKS with any testURL") }
        p.st = core.Status{Connected: false, Provider: p.Name(), Message: "engine started but SOCKS not ready"}
        return lastErr
    }
    switch req.Options["integration"] {
    case "pac":
        p.wantPAC = true
        _ = proxy.EnablePAC(context.Background(), "http://127.0.0.1:4765/proxy.pac")
    case "tun":
        p.sb = singbox.New(singbox.Config{SocksAddr: baseCfg.Bind, StateDir: stateDir})
        if err := p.sb.Start(context.Background()); err != nil {
            p.st = core.Status{Connected: false, Provider: p.Name(), Message: "sing-box failed: " + err.Error()}
            return err
        }
    }
    msg := "connected"
    if usedURL != "" { msg = "connected (probe=" + usedURL + ")" }
    p.st = core.Status{Connected: true, Provider: p.Name(), Message: msg, ExitCountry: req.ExitCountry, Integration: req.Options["integration"], Bind: baseCfg.Bind, PacEnabled: p.wantPAC, SingBox: p.sb != nil}
    return nil
}

func (p *provider) Disconnect() error {
    if p.sb != nil { _ = p.sb.Stop(); p.sb = nil }
    if p.wantPAC { _ = proxy.DisablePAC(context.Background()); p.wantPAC = false }
    if p.eng != nil { _ = p.eng.Stop() }
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

func candidateTestURLs(req core.ConnectRequest) []string {
    out := make([]string, 0, 16)
    add := func(u string) { if u != "" && !contains(out, u) { out = append(out, u) } }
    add(req.Options["testURL"]) 
    add(os.Getenv("WARPPLUS_TEST_URL"))
    if list := os.Getenv("WARPPLUS_TEST_URLS"); list != "" {
        for _, p := range splitAndTrim(list, ',') { add(p) }
    }
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
