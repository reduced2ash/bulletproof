package warpplus

import (
    "context"
    "reflect"
    "testing"
)

type fakeProc struct{}
func (fakeProc) Wait() error { return nil }
func (fakeProc) Kill() error { return nil }

type fakeRunner struct{ name string; args []string }
func (f *fakeRunner) Start(ctx context.Context, name string, args ...string) (Process, error) {
    f.name = name
    f.args = append([]string{}, args...)
    return fakeProc{}, nil
}

func TestArgs_Warp(t *testing.T) {
    e := New(Config{Bind: "127.0.0.1:8086", Key: "abc", Endpoint: "1.2.3.4:1002", Mode: "warp"})
    fr := &fakeRunner{}
    e.run = fr
    if err := e.Start(context.Background()); err != nil { t.Fatal(err) }
    want := []string{"--bind", "127.0.0.1:8086", "--key", "abc", "--endpoint", "1.2.3.4:1002"}
    if !reflect.DeepEqual(fr.args, want) { t.Fatalf("args mismatch\nwant=%v\n got=%v", want, fr.args) }
}

func TestArgs_Gool(t *testing.T) {
    e := New(Config{Bind: "127.0.0.1:8086", Mode: "gool"})
    fr := &fakeRunner{}
    e.run = fr
    if err := e.Start(context.Background()); err != nil { t.Fatal(err) }
    want := []string{"--bind", "127.0.0.1:8086", "--gool"}
    if !reflect.DeepEqual(fr.args, want) { t.Fatalf("args mismatch\nwant=%v\n got=%v", want, fr.args) }
}

func TestArgs_Psiphon(t *testing.T) {
    e := New(Config{Bind: "127.0.0.1:8086", Mode: "psiphon", Country: "DE"})
    fr := &fakeRunner{}
    e.run = fr
    if err := e.Start(context.Background()); err != nil { t.Fatal(err) }
    want := []string{"--bind", "127.0.0.1:8086", "--cfon", "--country", "DE"}
    if !reflect.DeepEqual(fr.args, want) { t.Fatalf("args mismatch\nwant=%v\n got=%v", want, fr.args) }
}

