package shimsocks

import (
    "bufio"
    "context"
    "errors"
    "io"
    "net"
    "strconv"
    "sync"
    "time"

    sockscli "bulletproof/backend/internal/net/socks5"
)

// Config defines how the shim SOCKS5 server behaves.
type Config struct {
    // ListenAddr is the local address to bind, e.g. 127.0.0.1:8086
    ListenAddr string
    // UpstreamSocks is an optional upstream SOCKS5 proxy (warp-plus) like 127.0.0.1:18086.
    // If set and reachable, all connections are proxied through it.
    UpstreamSocks string
    // AllowDirectFallback controls whether to dial directly if UpstreamSocks is not reachable.
    AllowDirectFallback bool
}

// Server is a minimal SOCKS5 no-auth server with optional upstream chaining.
type Server struct {
    cfg Config
    ln  net.Listener
    mu  sync.Mutex
    wg  sync.WaitGroup
    stop chan struct{}
}

func New(cfg Config) *Server { return &Server{cfg: cfg, stop: make(chan struct{})} }

func (s *Server) Start(ctx context.Context) error {
    ln, err := net.Listen("tcp", s.cfg.ListenAddr)
    if err != nil { return err }
    s.mu.Lock(); s.ln = ln; s.mu.Unlock()
    s.wg.Add(1)
    go func() {
        defer s.wg.Done()
        for {
            conn, err := ln.Accept()
            if err != nil {
                select {
                case <-s.stop:
                    return
                default:
                }
                // transient error; continue
                continue
            }
            s.wg.Add(1)
            go func(c net.Conn) { defer s.wg.Done(); s.handleConn(ctx, c) }(conn)
        }
    }()
    return nil
}

func (s *Server) Stop() error {
    s.mu.Lock()
    if s.ln != nil { _ = s.ln.Close() }
    s.mu.Unlock()
    close(s.stop)
    done := make(chan struct{})
    go func(){ s.wg.Wait(); close(done) }()
    select {
    case <-done:
    case <-time.After(2 * time.Second):
    }
    return nil
}

func (s *Server) handleConn(ctx context.Context, c net.Conn) {
    defer c.Close()
    br := bufio.NewReadWriter(bufio.NewReader(c), bufio.NewWriter(c))
    // greeting: version, nmethods, methods...
    h := make([]byte, 2)
    if _, err := io.ReadFull(br, h); err != nil { return }
    if h[0] != 0x05 { return }
    n := int(h[1])
    if n > 0 { tmp := make([]byte, n); if _, err := io.ReadFull(br, tmp); err != nil { return } }
    // reply: no-auth
    if _, err := br.Write([]byte{0x05, 0x00}); err != nil { return }
    if err := br.Flush(); err != nil { return }

    // request: ver, cmd, rsv, atyp, dst...
    req := make([]byte, 4)
    if _, err := io.ReadFull(br, req); err != nil { return }
    if req[0] != 0x05 || req[1] != 0x01 { // only CONNECT
        // reply command not supported
        _ = writeReply(br, 0x07, 0x01, nil)
        return
    }
    atyp := req[3]
    var host string
    switch atyp {
    case 0x01: // IPv4
        addr := make([]byte, 4); if _, err := io.ReadFull(br, addr); err != nil { return }
        host = net.IP(addr).String()
    case 0x03: // domain
        l := make([]byte, 1); if _, err := io.ReadFull(br, l); err != nil { return }
        name := make([]byte, int(l[0])); if _, err := io.ReadFull(br, name); err != nil { return }
        host = string(name)
    case 0x04: // IPv6
        addr := make([]byte, 16); if _, err := io.ReadFull(br, addr); err != nil { return }
        host = net.IP(addr).String()
    default:
        _ = writeReply(br, 0x08, 0x01, nil)
        return
    }
    portb := make([]byte, 2)
    if _, err := io.ReadFull(br, portb); err != nil { return }
    port := int(portb[0])<<8 | int(portb[1])

    // Try upstream socks first if configured and reachable
    var upstream net.Conn
    var err error
    ctxDial, cancel := context.WithTimeout(ctx, 4*time.Second)
    defer cancel()
    if s.cfg.UpstreamSocks != "" && probeTCP(s.cfg.UpstreamSocks, 500*time.Millisecond) {
        upstream, err = sockscli.DialVia(ctxDial, s.cfg.UpstreamSocks, host, port)
    } else if s.cfg.AllowDirectFallback {
        d := net.Dialer{Timeout: 4 * time.Second}
        upstream, err = d.DialContext(ctxDial, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
    } else {
        err = errors.New("upstream not ready")
    }
    if err != nil {
        _ = writeReply(br, 0x01, atyp, nil) // general failure
        return
    }
    defer upstream.Close()

    // reply success
    if err := writeReply(br, 0x00, 0x01, []byte{0,0,0,0}); err != nil { return }

    // bidirectional copy
    done := make(chan struct{}, 2)
    go proxyCopy(upstream, br.Reader, done)
    go proxyCopy(br.Writer, upstream, done)
    <-done
}

func writeReply(br *bufio.ReadWriter, rep byte, atyp byte, bndAddr []byte) error {
    // ver, rep, rsv
    h := []byte{0x05, rep, 0x00}
    // addr
    switch atyp {
    case 0x01:
        if bndAddr == nil || len(bndAddr) != 4 { bndAddr = []byte{0,0,0,0} }
        h = append(h, 0x01)
        h = append(h, bndAddr...)
    case 0x04:
        if bndAddr == nil || len(bndAddr) != 16 { bndAddr = make([]byte,16) }
        h = append(h, 0x04)
        h = append(h, bndAddr...)
    default:
        h = append(h, 0x01)
        h = append(h, []byte{0,0,0,0}...)
    }
    // port 0
    h = append(h, 0x00, 0x00)
    if _, err := br.Write(h); err != nil { return err }
    return br.Flush()
}

func proxyCopy(dst io.Writer, src io.Reader, done chan struct{}) {
    _, _ = io.Copy(dst, src)
    done <- struct{}{}
}

func probeTCP(addr string, timeout time.Duration) bool {
    d := net.Dialer{Timeout: timeout}
    c, err := d.Dial("tcp", addr)
    if err == nil { c.Close(); return true }
    return false
}
