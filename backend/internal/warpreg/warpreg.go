package warpreg

import (
    "context"
    "crypto/ecdh"
    "crypto/rand"
    "encoding/base64"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "time"
)

type Identity struct {
    DeviceID    string `json:"id"`
    Token       string `json:"token"`
    AccountID   string `json:"account_id,omitempty"`
    PrivateKey  string `json:"private_key"` // base64 X25519 private key
    PublicKey   string `json:"public_key"`  // base64 X25519 public key
    License     string `json:"license,omitempty"`
}

const identityFile = "warp_identity.json"

func identityPath(stateDir string) string { return filepath.Join(stateDir, identityFile) }

// Path returns the identity file path in the given state dir.
func Path(stateDir string) string { return identityPath(stateDir) }

// Load returns the saved identity if present.
func Load(stateDir string) (Identity, bool, error) {
    b, err := os.ReadFile(identityPath(stateDir))
    if err != nil {
        if os.IsNotExist(err) { return Identity{}, false, nil }
        return Identity{}, false, err
    }
    var id Identity
    if err := json.Unmarshal(b, &id); err != nil {
        return Identity{}, false, err
    }
    if id.DeviceID == "" { return Identity{}, false, nil }
    return id, true, nil
}

// Reset removes the saved identity; next connect will re-register.
func Reset(stateDir string) error {
    if err := os.Remove(identityPath(stateDir)); err != nil && !os.IsNotExist(err) {
        return err
    }
    return nil
}

// EnsureIdentity loads an existing identity or registers a new WARP device via Cloudflare /reg.
func EnsureIdentity(ctx context.Context, stateDir string) (Identity, error) {
    // Load existing
    if b, err := os.ReadFile(identityPath(stateDir)); err == nil && len(b) > 0 {
        var id Identity
        if json.Unmarshal(b, &id) == nil && id.DeviceID != "" {
            return id, nil
        }
    }
    // Register new
    id, err := Register(ctx)
    if err != nil { return Identity{}, err }
    // Persist
    if err := os.MkdirAll(stateDir, 0o755); err != nil { return Identity{}, err }
    if err := os.WriteFile(identityPath(stateDir), mustJSON(id), 0o600); err != nil { return Identity{}, err }
    return id, nil
}

// Register creates a new device identity using Cloudflare’s registration endpoint.
// Note: endpoint version may change; v0a0 is widely accepted and forwards internally.
func Register(ctx context.Context) (Identity, error) {
    // Generate X25519 key pair
    x := ecdh.X25519()
    priv, err := x.GenerateKey(rand.Reader)
    if err != nil { return Identity{}, err }
    pub := priv.PublicKey()
    privRaw := priv.Bytes()
    pubRaw := pub.Bytes()
    privB64 := base64.StdEncoding.EncodeToString(privRaw)
    pubB64 := base64.StdEncoding.EncodeToString(pubRaw)

    body := map[string]any{
        "install_id":   "",
        "key":          pubB64,
        "fcm_token":    "",
        "model":        "Bulletproof",
        "serial_number": fmt.Sprintf("bp-%d", time.Now().UnixNano()),
        "locale":       "en_US",
    }
    payload, _ := json.Marshal(body)

    req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.cloudflareclient.com/v0a0/reg", io.NopCloser(bytesReader(payload)))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("User-Agent", "okhttp/3.12.1")
    resp, err := http.DefaultClient.Do(req)
    if err != nil { return Identity{}, err }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 {
        b, _ := io.ReadAll(resp.Body)
        return Identity{}, fmt.Errorf("reg failed: %s", string(b))
    }
    var out struct {
        ID     string `json:"id"`
        Token  string `json:"token"`
        Account struct{ ID string `json:"id"` } `json:"account"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
        return Identity{}, err
    }
    if out.ID == "" || out.Token == "" { return Identity{}, errors.New("invalid reg response") }
    return Identity{
        DeviceID:  out.ID,
        Token:     out.Token,
        AccountID: out.Account.ID,
        PrivateKey: privB64,
        PublicKey:  pubB64,
    }, nil
}

// Helper to avoid importing bytes for a small reader.
type br struct{ b []byte; i int }
func bytesReader(b []byte) *br { return &br{b:b} }
func (r *br) Read(p []byte) (int, error) {
    if r.i >= len(r.b) { return 0, io.EOF }
    n := copy(p, r.b[r.i:])
    r.i += n
    return n, nil
}

func mustJSON(v any) []byte { b, _ := json.MarshalIndent(v, "", "  "); return b }
