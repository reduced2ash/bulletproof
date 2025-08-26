package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"bulletproof/backend/internal/api"
	"bulletproof/backend/internal/core"
	"bulletproof/backend/internal/providers/gool"
	"bulletproof/backend/internal/providers/psiphon"
	"bulletproof/backend/internal/providers/warp"
)

func main() {
	var (
		addr  = flag.String("addr", "127.0.0.1:4765", "HTTP listen address")
		state = flag.String("state", "./state", "state dir for configs/logs")
	)
	flag.Parse()

	if err := os.MkdirAll(*state, 0o755); err != nil {
		log.Fatalf("create state dir: %v", err)
	}

	providers := map[string]core.Provider{
		"warp":    warp.New(),
		"gool":    gool.New(),
		"psiphon": psiphon.New(),
	}

	mgr := core.NewManager(*state, providers)
	if err := mgr.Init(context.Background()); err != nil {
		log.Fatalf("manager init: %v", err)
	}

	hs := &http.Server{Addr: *addr, Handler: api.NewHTTP(mgr)}

	go func() {
		log.Printf("bulletproofd listening on http://%s", *addr)
		if err := hs.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")
	if err := hs.Shutdown(context.Background()); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	if err := mgr.Close(context.Background()); err != nil {
		log.Printf("manager close error: %v", err)
	}
}
