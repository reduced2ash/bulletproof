//go:build !darwin
// +build !darwin

package proxy

import (
    "context"
    "errors"
)

func EnablePAC(ctx context.Context, pacURL string) error { return errors.New("PAC control not implemented for this OS") }
func DisablePAC(ctx context.Context) error { return errors.New("PAC control not implemented for this OS") }

