import React from 'react';

type Page = 'main' | 'tools' | 'settings';

interface NavbarProps {
  activePage: Page;
  onPageChange: (page: Page) => void;
}

export default function Navbar({ activePage, onPageChange }: NavbarProps) {
  return (
    <nav className="navbar" aria-label="Workspace">
      <span className="sidebar-label">Workspace</span>
      <button
        type="button"
        className={`nav-item ${activePage === 'main' ? 'active' : ''}`}
        onClick={() => onPageChange('main')}
        aria-current={activePage === 'main' ? 'page' : undefined}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2.5v6" />
          <path d="M6.2 4.8a7 7 0 1 0 7.6 0" />
        </svg>
        <span>Connection</span>
      </button>
      <button
        type="button"
        className={`nav-item ${activePage === 'tools' ? 'active' : ''}`}
        onClick={() => onPageChange('tools')}
        aria-current={activePage === 'tools' ? 'page' : undefined}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4.5h8" />
          <path d="M14 4.5h3" />
          <path d="M3 10h3" />
          <path d="M9 10h8" />
          <path d="M3 15.5h10" />
          <path d="M16 15.5h1" />
          <circle cx="12.5" cy="4.5" r="1.5" />
          <circle cx="7.5" cy="10" r="1.5" />
          <circle cx="14.5" cy="15.5" r="1.5" />
        </svg>
        <span>Diagnostics</span>
      </button>
      <button
        type="button"
        className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
        onClick={() => onPageChange('settings')}
        aria-current={activePage === 'settings' ? 'page' : undefined}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3" />
          <path d="M10 2.5v2" />
          <path d="M10 15.5v2" />
          <path d="m4.7 4.7 1.4 1.4" />
          <path d="m13.9 13.9 1.4 1.4" />
          <path d="M2.5 10h2" />
          <path d="M15.5 10h2" />
          <path d="m4.7 15.3 1.4-1.4" />
          <path d="m13.9 6.1 1.4-1.4" />
        </svg>
        <span>Settings</span>
      </button>
      <div className="sidebar-meta">
        <span className="sidebar-meta-label">Runtime</span>
        <span>local only</span>
      </div>
    </nav>
  );
}
