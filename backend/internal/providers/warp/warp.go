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
	"sync"
	"time"

	"bulletproof/backend/internal/core"
	"bulletproof/backend/internal/engine/singbox"
	"bulletproof/backend/internal/engine/warpplus"
	"bulletproof/backend/internal/net/shimsocks"
	"bulletproof/backend/internal/system/proxy"
)

type provider struct {
	mu      sync.RWMutex
	st      core.Status
	eng     *warpplus.Engine
	sb      *singbox.Engine
	wantPAC bool
	ss      *shimsocks.Server
}

func New() core.Provider { return &provider{} }

func (p *provider) Name() string { return "warp" }

func (p *provider) setStatus(st core.Status) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.st = st
}

func (p *provider) updateStatus(fn func(*core.Status)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	fn(&p.st)
}

func (p *provider) setEngine(eng *warpplus.Engine) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eng = eng
}

func (p *provider) currentEngine() *warpplus.Engine {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.eng
}

func (p *provider) registerEngine(eng *warpplus.Engine, probeMsg string) {
	p.setEngine(eng)
	if probeMsg != "" {
		p.updateStatus(func(st *core.Status) { st.Message = probeMsg })
	}
	go p.monitorEngine(eng)
}

func (p *provider) monitorEngine(eng *warpplus.Engine) {
	<-eng.Done()
	err := eng.LastError()
	p.mu.Lock()
	if p.eng != eng {
		p.mu.Unlock()
		return
	}
	p.eng = nil
	msg := "warp process exited"
	if err != nil {
		msg = "warp process exited: " + err.Error()
	}
	st := p.st
	st.Connected = false
	st.Message = msg
	p.st = st
	p.mu.Unlock()
}

func (p *provider) Connect(req core.ConnectRequest) error {
	stateDir := req.Options["stateDir"]
	publicBind, err := choosePublicBind(stateDir, bindFrom(req))
	if err != nil {
		return err
	}
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

	allowDirect := os.Getenv("BP_SOCKS_DIRECT_FALLBACK") == "1" || os.Getenv("BP_SOCKS_DIRECT_FALLBACK") == "true"
	ss := shimsocks.New(shimsocks.Config{ListenAddr: publicBind, UpstreamSocks: warpBind, AllowDirectFallback: allowDirect})
	if err := ss.Start(context.Background()); err != nil {
		p.setStatus(core.Status{Connected: false, Provider: p.Name(), Message: "shim socks failed: " + err.Error()})
		return err
	}
	p.mu.Lock()
	p.ss = ss
	p.mu.Unlock()

	_ = persistBind(stateDir, publicBind)

	integration := req.Options["integration"]
	pacEnabled := false
	tunEnabled := false
	switch integration {
	case "pac":
		if err := proxy.EnablePAC(context.Background(), "http://127.0.0.1:4765/proxy.pac"); err == nil {
			p.mu.Lock()
			p.wantPAC = true
			p.mu.Unlock()
			pacEnabled = true
		}
	case "tun":
		sb := singbox.New(singbox.Config{SocksAddr: publicBind, StateDir: stateDir})
		if err := sb.Start(context.Background()); err != nil {
			_ = ss.Stop()
			p.mu.Lock()
			if p.ss == ss {
				p.ss = nil
			}
			p.mu.Unlock()
			p.setStatus(core.Status{Connected: false, Provider: p.Name(), Message: "sing-box failed: " + err.Error()})
			return err
		}
		p.mu.Lock()
		p.sb = sb
		p.mu.Unlock()
		tunEnabled = true
	}

	p.setStatus(core.Status{
		Connected:   true,
		Provider:    p.Name(),
		Message:     "connected (shim; warp warming)",
		ExitCountry: req.ExitCountry,
		Integration: integration,
		Bind:        publicBind,
		PacEnabled:  pacEnabled,
		SingBox:     tunEnabled,
	})

	p.launchWarp(req, baseCfg, stateDir, warpBind)
	return nil
}

func (p *provider) launchWarp(req core.ConnectRequest, baseCfg warpplus.Config, stateDir, warpBind string) {
	go func() {
		urls := candidateTestURLs(req)
		var lastErr error
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
			p.registerEngine(eng, "connected (probe="+u+")")
			lastErr = nil
			break
		}

		if p.currentEngine() == nil {
			eps, scanErr := warpplus.Scan(context.Background(), baseCfg.Bin)
			if scanErr == nil && len(eps) > 0 {
				maxEP := len(eps)
				if maxEP > 15 {
					maxEP = 15
				}
				scanURLs := candidateTestURLs(req)
				if len(scanURLs) > 3 {
					scanURLs = scanURLs[:3]
				}
				for i := 0; i < maxEP && p.currentEngine() == nil; i++ {
					for _, u := range scanURLs {
						cfg := baseCfg
						cfg.Endpoint = eps[i].Address
						cfg.TestURL = u
						eng := warpplus.New(cfg)
						if err := eng.Start(context.Background()); err != nil {
							lastErr = err
							continue
						}
						if err := waitPort(cfg.Bind, 35*time.Second); err != nil {
							_ = eng.Stop()
							lastErr = err
							continue
						}
						p.registerEngine(eng, "connected (probe="+u+", ep="+cfg.Endpoint+")")
						lastErr = nil
						break
					}
				}
			} else if scanErr != nil {
				lastErr = scanErr
			}
		}

		eng := p.currentEngine()
		if eng == nil {
			if lastErr != nil {
				p.updateStatus(func(st *core.Status) { st.Message = "shim active; warp pending: " + lastErr.Error() })
			} else {
				p.updateStatus(func(st *core.Status) { st.Message = "shim active; warp pending" })
			}
			return
		}

		logPath := filepath.Join(stateDir, "warp-plus.log")
		go detectHandshake(logPath, func(msg string) {
			p.updateStatus(func(st *core.Status) { st.Message = msg })
		})

		if err := waitPort(warpBind, 3*time.Minute); err == nil {
			p.updateStatus(func(st *core.Status) { st.Message = "connected (warp active)" })
		} else {
			p.updateStatus(func(st *core.Status) { st.Message = "warp warmup timed out: " + err.Error() })
		}
	}()
}

func (p *provider) Disconnect() error {
	p.mu.Lock()
	eng := p.eng
	p.eng = nil
	sb := p.sb
	p.sb = nil
	ss := p.ss
	p.ss = nil
	wantPAC := p.wantPAC
	p.wantPAC = false
	p.st = core.Status{}
	p.mu.Unlock()

	if sb != nil {
		_ = sb.Stop()
	}
	if wantPAC {
		_ = proxy.DisablePAC(context.Background())
	}
	if eng != nil {
		_ = eng.Stop()
	}
	if ss != nil {
		_ = ss.Stop()
	}
	return nil
}

func (p *provider) Status() core.Status {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.st
}

func endpointFrom(req core.ConnectRequest) string {
	if req.Server == "" {
		return ""
	}
	if req.Port > 0 {
		return req.Server + ":" + strconv.Itoa(req.Port)
	}
	return req.Server
}

func bindFrom(req core.ConnectRequest) string {
	if b := req.Options["bind"]; b != "" {
		return b
	}
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
		if err != nil {
			return false
		}
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
		if tryListen(addr) {
			return addr, nil
		}
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
	if err != nil {
		return "", false
	}
	var m map[string]string
	if json.Unmarshal(b, &m) != nil {
		return "", false
	}
	v := m["bind"]
	if v == "" {
		return "", false
	}
	return v, true
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// candidateTestURLs returns a list of test URLs to try in order.
// Priority: explicit request option, WARPPLUS_TEST_URL, WARPPLUS_TEST_URLS (comma-separated), then a small default set.
func candidateTestURLs(req core.ConnectRequest) []string {
	out := make([]string, 0, 16)
	add := func(u string) {
		if u != "" && !contains(out, u) {
			out = append(out, u)
		}
	}
	// Highest priority: explicit request option; then env overrides.
	add(req.Options["testURL"])
	add(os.Getenv("WARPPLUS_TEST_URL"))
	if list := os.Getenv("WARPPLUS_TEST_URLS"); list != "" {
		for _, p := range splitAndTrim(list, ',') {
			add(p)
		}
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
	for _, d := range defaults {
		add(d)
	}
	return out
}

func splitAndTrim(s string, sep rune) []string {
	out := make([]string, 0, 8)
	cur := make([]rune, 0, len(s))
	flush := func() {
		if len(cur) == 0 {
			return
		}
		str := string(cur)
		// trim spaces
		str = strings.TrimSpace(str)
		if str != "" {
			out = append(out, str)
		}
		cur = cur[:0]
	}
	for _, r := range s {
		if r == sep {
			flush()
			continue
		}
		cur = append(cur, r)
	}
	flush()
	return out
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
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
	if err != nil {
		return fmt.Sprintf("127.0.0.1:%d", port)
	}
	return net.JoinHostPort(host, strconv.Itoa(port))
}

func waitPort(addr string, timeout time.Duration) error {
	if addr == "" {
		addr = "127.0.0.1:8086"
	}
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
func detectHandshake(logPath string, update func(string)) {
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		b, err := os.ReadFile(logPath)
		if err == nil && strings.Contains(string(b), "handshake complete") {
			update("connected (warp handshake ok; warming)")
			return
		}
		time.Sleep(1500 * time.Millisecond)
	}
}
