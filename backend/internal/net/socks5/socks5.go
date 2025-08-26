package socks5

import (
    "bufio"
    "context"
    "errors"
    "fmt"
    "net"
    "strings"
    "time"
)

// DialVia dials targetHost:targetPort through a SOCKS5 proxy at socksAddr.
// Only supports no-auth and domain-name addressing for simplicity.
func DialVia(ctx context.Context, socksAddr, targetHost string, targetPort int) (net.Conn, error) {
    d := net.Dialer{}
    conn, err := d.DialContext(ctx, "tcp", socksAddr)
    if err != nil { return nil, err }
    br := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))

    // greeting: version 5, 1 method, no-auth (0x00)
    if _, err := br.Write([]byte{0x05, 0x01, 0x00}); err != nil { conn.Close(); return nil, err }
    if err := br.Flush(); err != nil { conn.Close(); return nil, err }

    // response: version, method
    resp := make([]byte, 2)
    if _, err := br.Read(resp); err != nil { conn.Close(); return nil, err }
    if resp[0] != 0x05 || resp[1] != 0x00 { conn.Close(); return nil, errors.New("socks5 no-auth not accepted") }

    // connect request
    host := targetHost
    if len(host) > 255 { host = host[:255] }
    req := []byte{0x05, 0x01, 0x00, 0x03, byte(len(host))}
    req = append(req, []byte(host)...)
    req = append(req, byte((targetPort>>8)&0xff), byte(targetPort&0xff))
    if _, err := br.Write(req); err != nil { conn.Close(); return nil, err }
    if err := br.Flush(); err != nil { conn.Close(); return nil, err }

    // connect response: ver, rep, rsv, atyp, bnd.addr, bnd.port
    h := make([]byte, 4)
    if _, err := br.Read(h); err != nil { conn.Close(); return nil, err }
    if h[1] != 0x00 { conn.Close(); return nil, fmt.Errorf("socks5 connect failed: 0x%02x", h[1]) }
    var toRead int
    switch h[3] {
    case 0x01: toRead = 4
    case 0x03:
        l := make([]byte, 1); if _, err := br.Read(l); err != nil { conn.Close(); return nil, err }
        toRead = int(l[0])
    case 0x04: toRead = 16
    default: conn.Close(); return nil, errors.New("socks5: unknown atyp")
    }
    if toRead > 0 { tmp := make([]byte, toRead); if _, err := br.Read(tmp); err != nil { conn.Close(); return nil, err } }
    // read port
    if _, err := br.Read(make([]byte, 2)); err != nil { conn.Close(); return nil, err }

    // set deadlines off; caller can manage via ctx
    _ = conn.SetDeadline(time.Time{})
    return conn, nil
}

// HTTPGetVia performs a simple HTTP GET via SOCKS5 and returns status line and body (first up to maxBytes).
func HTTPGetVia(ctx context.Context, socksAddr, urlHost, urlPath string, maxBytes int) (string, string, error) {
    if !strings.HasPrefix(urlPath, "/") { urlPath = "/" + urlPath }
    conn, err := DialVia(ctx, socksAddr, urlHost, 80)
    if err != nil { return "", "", err }
    defer conn.Close()
    br := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))
    req := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: bp/1\r\nConnection: close\r\n\r\n", urlPath, urlHost)
    if _, err := br.WriteString(req); err != nil { return "", "", err }
    if err := br.Flush(); err != nil { return "", "", err }
    // read status line
    status, err := br.ReadString('\n')
    if err != nil { return "", "", err }
    // skip headers
    for {
        line, err := br.ReadString('\n')
        if err != nil { return status, "", nil }
        if line == "\r\n" { break }
    }
    // read body up to maxBytes
    if maxBytes <= 0 { maxBytes = 4096 }
    buf := make([]byte, maxBytes)
    n, _ := br.Read(buf)
    return strings.TrimSpace(status), string(buf[:n]), nil
}

