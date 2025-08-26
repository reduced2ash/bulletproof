package core

import (
    "context"
    "errors"
    "sync"
    "time"

    "bulletproof/backend/internal/warpreg"
)

type Manager struct {
	mu        sync.RWMutex
	providers map[string]Provider
	active    Provider
	status    Status
	store     *Store
}

func NewManager(stateDir string, providers map[string]Provider) *Manager {
	return &Manager{providers: providers, store: NewStore(stateDir)}
}

func (m *Manager) Init(ctx context.Context) error {
	return nil
}

func (m *Manager) Connect(ctx context.Context, req ConnectRequest) (Status, error) {
    m.mu.Lock()
    defer m.mu.Unlock()

    p, ok := m.providers[req.Provider]
    if !ok {
        return Status{}, errors.New("unknown provider")
    }
    if req.Options == nil { req.Options = map[string]string{} }
    req.Options["stateDir"] = m.store.Dir()
    // Ensure WARP identity exists for warp-based providers.
    switch req.Provider {
    case "warp", "gool", "psiphon":
        if _, err := warpreg.EnsureIdentity(ctx, m.store.Dir()); err != nil {
            m.status = Status{Connected: false, Provider: req.Provider, Message: "registration failed: " + err.Error()}
            return m.status, err
        }
    }
	if m.active != nil {
		_ = m.active.Disconnect()
	}
	if err := p.Connect(req); err != nil {
		m.status = Status{Connected: false, Provider: req.Provider, Message: err.Error()}
		return m.status, err
	}
	m.active = p
	st := p.Status()
	st.Connected = true
	st.Since = time.Now()
	m.status = st
	return m.status, nil
}

func (m *Manager) Disconnect(ctx context.Context) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active == nil {
		m.status = Status{}
		return m.status, nil
	}
	_ = m.active.Disconnect()
	m.active = nil
	m.status = Status{}
	return m.status, nil
}

func (m *Manager) Status(ctx context.Context) Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.active != nil {
		return m.active.Status()
	}
	return m.status
}

func (m *Manager) Close(ctx context.Context) error { return nil }

// StateDir returns the manager's state directory path.
func (m *Manager) StateDir() string { return m.store.Dir() }
