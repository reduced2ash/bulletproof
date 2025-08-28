package psiphon

import (
    "context"
    "fmt"
    "net"
    "path/filepath"
    "strconv"
    "time"

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
    cfg := warpplus.Config{
        Bin:      req.Options["bin"],
        Key:      req.Options["key"],
        Endpoint: endpointFrom(req),
        Bind:     bindFrom(req),
        Mode:     "psiphon",
        Country:  req.ExitCountry,
        CacheDir: stateDir,
        LogPath:  filepath.Join(stateDir, "warp-plus.log"),
    }
    p.eng = warpplus.New(cfg)
    if err := p.eng.Start(context.Background()); err != nil {
        p.st = core.Status{Connected: false, Provider: p.Name(), Message: err.Error()}
        return err
    }
    if err := waitPort(cfg.Bind, 60*time.Second); err != nil {
        p.st = core.Status{Connected: false, Provider: p.Name(), Message: "engine started but SOCKS not ready"}
        return err
    }
    switch req.Options["integration"] {
    case "pac":
        p.wantPAC = true
        _ = proxy.EnablePAC(context.Background(), "http://127.0.0.1:4765/proxy.pac")
    case "tun":
        p.sb = singbox.New(singbox.Config{SocksAddr: cfg.Bind, StateDir: stateDir})
        if err := p.sb.Start(context.Background()); err != nil {
            p.st = core.Status{Connected: false, Provider: p.Name(), Message: "sing-box failed: " + err.Error()}
            return err
        }
    }
    p.st = core.Status{Connected: true, Provider: p.Name(), Message: "connected", ExitCountry: req.ExitCountry, Integration: req.Options["integration"], Bind: cfg.Bind, PacEnabled: p.wantPAC, SingBox: p.sb != nil}
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
