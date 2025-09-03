package api

import (
    "encoding/json"
    "log"
    "net/http"
    "os"
    "net"
    "time"

    "bulletproof/backend/internal/core"
    "bulletproof/backend/internal/engine/warpplus"
    "bulletproof/backend/internal/net/socks5"
    "bulletproof/backend/internal/system/proxy"
    "bulletproof/backend/internal/warpreg"
)

type httpAPI struct{ mgr *core.Manager }

func NewHTTP(mgr *core.Manager) http.Handler {
    mux := http.NewServeMux()
    h := &httpAPI{mgr: mgr}

	mux.HandleFunc("/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
    mux.HandleFunc("/v1/status", h.status)
    mux.HandleFunc("/v1/connect", h.connect)
    mux.HandleFunc("/v1/disconnect", h.disconnect)
    mux.HandleFunc("/v1/ping", h.ping)
    mux.HandleFunc("/v1/scan", h.scan)
    mux.HandleFunc("/v1/proxy/enable", h.proxyEnable)
    mux.HandleFunc("/v1/proxy/disable", h.proxyDisable)
    mux.HandleFunc("/proxy.pac", h.servePAC)
    mux.HandleFunc("/v1/identity", h.identity)
    mux.HandleFunc("/v1/identity/reset", h.identityReset)
    mux.HandleFunc("/v1/diag", h.diag)
    mux.HandleFunc("/v1/test/socks", h.testSocks)

	return withCORS(mux)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *httpAPI) status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.mgr.Status(r.Context()))
}

func (h *httpAPI) connect(w http.ResponseWriter, r *http.Request) {
	var req core.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	st, err := h.mgr.Connect(r.Context(), req)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *httpAPI) disconnect(w http.ResponseWriter, r *http.Request) {
	st, _ := h.mgr.Disconnect(r.Context())
	writeJSON(w, http.StatusOK, st)
}

func (h *httpAPI) ping(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, map[string]string{"pong": "ok"})
}

// scan returns a list of candidate WARP endpoints using warp-plus --scan.
func (h *httpAPI) scan(w http.ResponseWriter, r *http.Request) {
    type reqT struct { Bin string `json:"bin"` }
    var body reqT
    _ = json.NewDecoder(r.Body).Decode(&body)
    ctx := r.Context()
    eps, err := warpplus.Scan(ctx, body.Bin)
    if err != nil { writeErr(w, http.StatusBadRequest, err); return }
    writeJSON(w, http.StatusOK, eps)
}

// proxyEnable enables system-wide PAC to route through local SOCKS5.
// Currently implemented for macOS only; other OSes return not implemented.
func (h *httpAPI) proxyEnable(w http.ResponseWriter, r *http.Request) {
    bind := r.URL.Query().Get("bind")
    if bind == "" { bind = "127.0.0.1:8086" }
    if err := proxy.EnablePAC(r.Context(), "http://127.0.0.1:4765/proxy.pac"); err != nil {
        writeErr(w, http.StatusNotImplemented, err)
        return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status":"enabled","bind":bind})
}

func (h *httpAPI) proxyDisable(w http.ResponseWriter, r *http.Request) {
    if err := proxy.DisablePAC(r.Context()); err != nil {
        writeErr(w, http.StatusNotImplemented, err)
        return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status":"disabled"})
}

// servePAC returns a PAC file that sends all traffic through SOCKS5 at 127.0.0.1:8086.
func (h *httpAPI) servePAC(w http.ResponseWriter, r *http.Request) {
    bind := r.URL.Query().Get("bind")
    if bind == "" { bind = "127.0.0.1:8086" }
    pac := "function FindProxyForURL(url, host) { return \"SOCKS5 " + bind + "; DIRECT\"; }"
    w.Header().Set("Content-Type", "application/x-ns-proxy-autoconfig")
    w.WriteHeader(http.StatusOK)
    _, _ = w.Write([]byte(pac))
}

// identity returns current identity status (sanitized) or ensures/creates one if requested.
func (h *httpAPI) identity(w http.ResponseWriter, r *http.Request) {
    stDir := h.mgr.StateDir()
    id, ok, err := warpreg.Load(stDir)
    if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
    type resp struct {
        Exists       bool   `json:"exists"`
        DeviceID     string `json:"deviceId,omitempty"`
        AccountID    string `json:"accountId,omitempty"`
        PublicKey    string `json:"publicKey,omitempty"`
        HasPrivate   bool   `json:"hasPrivateKey"`
        HasToken     bool   `json:"hasToken"`
        Path         string `json:"path"`
    }
    out := resp{Exists: ok, Path: warpreg.Path(stDir)}
    if ok {
        out.DeviceID = id.DeviceID
        out.AccountID = id.AccountID
        out.PublicKey = id.PublicKey
        out.HasPrivate = id.PrivateKey != ""
        out.HasToken = id.Token != ""
    }
    writeJSON(w, http.StatusOK, out)
}

func (h *httpAPI) identityReset(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        w.WriteHeader(http.StatusMethodNotAllowed)
        return
    }
    if err := warpreg.Reset(h.mgr.StateDir()); err != nil {
        writeErr(w, http.StatusInternalServerError, err)
        return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status":"reset"})
}

// diag returns a snapshot for E2E smoke checks.
func (h *httpAPI) diag(w http.ResponseWriter, r *http.Request) {
    st := h.mgr.Status(r.Context())
    id, ok, _ := warpreg.Load(h.mgr.StateDir())
    // quick socks listen probe
    socks := "127.0.0.1:8086"
    if st.Bind != "" { socks = st.Bind }
    listening := probeTCP(socks, 350*time.Millisecond)
    // also probe warp-plus internal bind if using shim (canonical 8086 on same host)
    warpBind := ""
    if host, _, err := net.SplitHostPort(socks); err == nil {
        warpBind = net.JoinHostPort(host, "8086")
    }
    warpUp := false
    if warpBind != "" { warpUp = probeTCP(warpBind, 250*time.Millisecond) }
    type idOut struct {
        Exists     bool   `json:"exists"`
        DeviceID   string `json:"deviceId,omitempty"`
        AccountID  string `json:"accountId,omitempty"`
        PublicKey  string `json:"publicKey,omitempty"`
        Path       string `json:"path"`
    }
    out := map[string]any{
        "status": st,
        "identity": idOut{
            Exists: ok,
            DeviceID: id.DeviceID,
            AccountID: id.AccountID,
            PublicKey: id.PublicKey,
            Path: warpreg.Path(h.mgr.StateDir()),
        },
        "env": map[string]string{
            "WARPPLUS_BIN": os.Getenv("WARPPLUS_BIN"),
            "SINGBOX_BIN": os.Getenv("SINGBOX_BIN"),
        },
        "paths": map[string]string{
            "warpLog": h.mgr.StateDir()+"/warp-plus.log",
            "singboxConfig": h.mgr.StateDir()+"/singbox.json",
        },
        "socks": map[string]any{
            "bind": socks,
            "listening": listening,
            "warpBind": warpBind,
            "warpListening": warpUp,
        },
    }
    writeJSON(w, http.StatusOK, out)
}

// probeTCP returns true if a TCP connect to addr succeeds within timeout.
func probeTCP(addr string, timeout time.Duration) bool {
    d := net.Dialer{Timeout: timeout}
    c, err := d.Dial("tcp", addr)
    if err == nil {
        c.Close()
        return true
    }
    return false
}

// testSocks performs a simple HTTP GET via the local SOCKS5 proxy to confirm connectivity.
// Query params: bind (default 127.0.0.1:8086) host (default ip-api.com) path (default /json)
func (h *httpAPI) testSocks(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query()
    bind := q.Get("bind")
    if bind == "" { bind = "127.0.0.1:8086" }
    host := q.Get("host")
    if host == "" { host = "ip-api.com" }
    path := q.Get("path")
    if path == "" { path = "/json" }
    stLine, body, err := socks5.HTTPGetVia(r.Context(), bind, host, path, 4096)
    if err != nil { writeErr(w, http.StatusBadRequest, err); return }
    writeJSON(w, http.StatusOK, map[string]any{"status": stLine, "body": body})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Println("writeJSON:", err)
	}
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}
