import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Fallback bridge: if preload didn't inject window.electron (packaged quirks),
// provide minimal HTTP-backed implementations so the app remains functional.
try {
  const g: any = window as any;
  if (!g.electron) {
    const api = async (path: string, init?: RequestInit) => {
      const res = await fetch(`http://127.0.0.1:4765${path}`, init);
      return res.json();
    };
    g.electron = {
      status: () => api('/v1/status'),
      connect: (payload: any) => api('/v1/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) }),
      disconnect: () => api('/v1/disconnect', { method: 'POST' }),
      proxyTest: (bind?: string) => {
        const url = new URL('http://127.0.0.1:4765/v1/test/socks');
        if (bind) url.searchParams.set('bind', bind);
        return fetch(url.toString()).then(r => r.json());
      },
      probePort: async (bind?: string) => {
        try {
          const diag = await api('/v1/diag');
          return { listening: !!diag?.socks?.listening };
        } catch { return { listening: false }; }
      },
      identity: () => api('/v1/identity'),
      identityReset: () => api('/v1/identity/reset', { method: 'POST' }),
      diag: () => api('/v1/diag'),
      // Optional dev-only utilities; return errors if UI tries to call them
      ping: async () => ({ error: 'ping unavailable without preload' }),
      speedTest: async () => ({ error: 'speed test unavailable without preload' }),
    };
    // eslint-disable-next-line no-console
    console.log('[bp] preload bridge missing; installed HTTP fallback');
  }
} catch {}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
