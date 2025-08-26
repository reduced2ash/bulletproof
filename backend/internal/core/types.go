package core

import "time"

type ConnectRequest struct {
	Provider    string            `json:"provider"` // "warp" | "gool" | "psiphon"
	ExitCountry string            `json:"exitCountry,omitempty"`
	Server      string            `json:"server,omitempty"`
	Port        int               `json:"port,omitempty"`
	Options     map[string]string `json:"options,omitempty"`
}

type Status struct {
    Connected   bool      `json:"connected"`
    Provider    string    `json:"provider,omitempty"`
    Since       time.Time `json:"since,omitempty"`
    ExitIP      string    `json:"exitIp,omitempty"`
    ExitCountry string    `json:"exitCountry,omitempty"`
    Message     string    `json:"message,omitempty"`
    Integration string    `json:"integration,omitempty"`
    Bind        string    `json:"bind,omitempty"`          // local SOCKS bind
    PacEnabled  bool      `json:"pacEnabled,omitempty"`
    SingBox     bool      `json:"singBox,omitempty"`       // sing-box active
}

type Provider interface {
	Name() string
	Connect(req ConnectRequest) error
	Disconnect() error
	Status() Status
}
