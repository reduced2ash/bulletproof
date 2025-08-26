package core

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Store struct{ dir string }

func NewStore(dir string) *Store { return &Store{dir: dir} }

func (s *Store) Dir() string { return s.dir }

func (s *Store) write(name string, v any) error {
	p := filepath.Join(s.dir, name)
	f, err := os.Create(p)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(v)
}

func (s *Store) read(name string, v any) error {
	p := filepath.Join(s.dir, name)
	f, err := os.Open(p)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}
