import React from 'react';

interface NavbarProps {
  activePage: string;
  onPageChange: (page: string) => void;
}

export default function Navbar({ activePage, onPageChange }: NavbarProps) {
  return (
    <nav className="navbar" role="tablist" aria-label="Primary">
      <button
        type="button"
        className={`nav-item ${activePage === 'main' ? 'active' : ''}`}
        onClick={() => onPageChange('main')}
        aria-selected={activePage === 'main'}
        role="tab"
      >
        <span className="nav-icon" aria-hidden>🔌</span>
        <span className="nav-label">Connect</span>
      </button>
      <button
        type="button"
        className={`nav-item ${activePage === 'tools' ? 'active' : ''}`}
        onClick={() => onPageChange('tools')}
        aria-selected={activePage === 'tools'}
        role="tab"
      >
        <span className="nav-icon" aria-hidden>🛠️</span>
        <span className="nav-label">Tools</span>
      </button>
      <button
        type="button"
        className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
        onClick={() => onPageChange('settings')}
        aria-selected={activePage === 'settings'}
        role="tab"
      >
        <span className="nav-icon" aria-hidden>⚙️</span>
        <span className="nav-label">Settings</span>
      </button>
    </nav>
  );
}
