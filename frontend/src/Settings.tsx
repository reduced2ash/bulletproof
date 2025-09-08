import React, { useEffect, useState } from 'react';

type Provider = 'warp' | 'gool' | 'psiphon';

interface SettingsProps {
  provider: Provider;
  setProvider: (p: Provider) => void;
  integration: 'direct'|'pac'|'tun';
  setIntegration: (m: 'direct'|'pac'|'tun') => void;
  server: string;
  setServer: (s: string) => void;
  port: number;
  setPort: (p: number) => void;
  warpKey: string;
  setWarpKey: (k: string) => void;
  exitCountry: string;
  setExitCountry: (c: string) => void;
  license: 'free' | 'warp+';
  setLicense: (l: 'free' | 'warp+') => void;
}

export default function Settings({
  provider,
  setProvider,
  integration,
  setIntegration,
  server,
  setServer,
  port,
  setPort,
  exitCountry,
  setExitCountry,
  warpKey,
  setWarpKey,
  license,
  setLicense,
}: SettingsProps) {
  const [identity, setIdentity] = useState<any>(null);
  const [loadingId, setLoadingId] = useState(false);

  const loadIdentity = async () => {
    setLoadingId(true);
    // @ts-ignore
    const res = await window.electron.identity();
    setIdentity(res);
    setLoadingId(false);
  };

  useEffect(() => { loadIdentity(); }, []);

  const resetIdentity = async () => {
    // @ts-ignore
    await window.electron.identityReset();
    await loadIdentity();
  };

  return (
    <div className="settings-stack">
      <div className="tool-card">
        <div className="tool-header"><h3>🔧 Integration Mode</h3></div>
        <p className="subtitle">Choose how Bulletproof integrates with your system.</p>
        <div className="radio-group">
          <label>
            <input type="radio" value="direct" checked={integration === 'direct'} onChange={() => setIntegration('direct')} />
            🧩 Direct (in‑app proxy)
            <p className="radio-description">Use the app’s SOCKS proxy only; no system changes.</p>
          </label>
          <label>
            <input type="radio" value="pac" checked={integration === 'pac'} onChange={() => setIntegration('pac')} />
            🌐 System Proxy (PAC)
            <p className="radio-description">Sets OS proxy via PAC to route through the local SOCKS.</p>
          </label>
          <label>
            <input type="radio" value="tun" checked={integration === 'tun'} onChange={() => setIntegration('tun')} />
            🛡️ TUN (Sing‑Box)
            <p className="radio-description">Creates a TUN interface and forwards traffic via SOCKS.</p>
          </label>
        </div>
      </div>

      <div className="tool-card">
        <div className="tool-header"><h3>🔌 Connection Method</h3></div>
        <p className="subtitle">Select the protocol/provider for your connection.</p>
        <div className="radio-group">
          <label>
            <input type="radio" value="warp" checked={provider === 'warp'} onChange={() => setProvider('warp')} />
            🌀 WARP
            <p className="radio-description">Cloudflare’s modern optimized protocol (WARP/WARP+).</p>
          </label>
          <label>
            <input type="radio" value="gool" checked={provider === 'gool'} onChange={() => setProvider('gool')} />
            🚀 Gool
            <p className="radio-description">A performance‑focused mode with quick startup.</p>
          </label>
          <label>
            <input type="radio" value="psiphon" checked={provider === 'psiphon'} onChange={() => setProvider('psiphon')} />
            🛰️ Psiphon
            <p className="radio-description">Robust circumvention via Psiphon routing.</p>
          </label>
        </div>
      </div>

      <div className="tool-card">
        <div className="tool-header"><h3>🌍 Connection Settings</h3></div>
        <p className="subtitle">Optional server/port; leave empty to auto‑select.</p>
        <div className="input-row">
          <div style={{ flex: 1 }}>
            <label className="form-label" htmlFor="server-address">Server</label>
            <input type="text" id="server-address" className="form-input" placeholder="auto (leave empty)" value={server} onChange={(e) => setServer(e.target.value)} />
          </div>
          <div style={{ width: 120 }}>
            <label className="form-label" htmlFor="server-port">Port</label>
            <input type="number" id="server-port" className="form-input" placeholder="auto" value={port || ''} onChange={(e) => setPort(parseInt(e.target.value || '0', 10))} />
          </div>
        </div>
        <div className="input-row">
          <div style={{ flex: 1 }}>
            <label className="form-label" htmlFor="exit-country">Exit Country</label>
            <select id="exit-country" className="form-input" value={exitCountry} onChange={(e) => setExitCountry(e.target.value)}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="DE">Germany</option>
              <option value="JP">Japan</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label" htmlFor="license-type">License</label>
            <select id="license-type" className="form-input" value={license} onChange={(e) => setLicense((e.target.value as 'free' | 'warp+'))}>
              <option value="free">Free</option>
              <option value="warp+">WARP+</option>
            </select>
          </div>
        </div>
        <div className="input-row">
          <div style={{ flex: 1 }}>
            <label className="form-label" htmlFor="warp-key">WARP/WARP+ Key</label>
            <input type="text" id="warp-key" className="form-input" value={warpKey} placeholder="e.g., EABCD-..." onChange={(e) => setWarpKey(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="tool-card">
        <div className="tool-header"><h3>🆔 WARP Identity</h3></div>
        <p className="subtitle">Device identity is stored locally and created on first connect.</p>
        {loadingId ? (
          <p className="subtitle">Loading…</p>
        ) : identity?.exists ? (
          <div className="kv" style={{ marginTop: 6 }}>
            <div className="k">Device ID</div><div className="v" title={identity.deviceId}>{identity.deviceId}</div>
            <div className="k">Account ID</div><div className="v" title={identity.accountId || '—'}>{identity.accountId || '—'}</div>
            <div className="k">Public Key</div><div className="v" title={identity.publicKey}>{(identity.publicKey || '').slice(0, 24)}…</div>
            <div className="k">Path</div><div className="v" title={identity.path}>{identity.path}</div>
            <div className="k">Private Key</div><div className="v">{identity.hasPrivateKey ? <span className="badge ok">Present</span> : <span className="badge warn">Missing</span>}</div>
            <div className="k">Token</div><div className="v">{identity.hasToken ? <span className="badge ok">Present</span> : <span className="badge warn">Missing</span>}</div>
          </div>
        ) : (
          <p className="subtitle">No identity yet. It will be created automatically on first connect.</p>
        )}
        <div className="tool-actions" style={{ marginTop: 8 }}>
          <button className="btn" onClick={loadIdentity}>Refresh</button>
          <button className="btn btn-danger" onClick={resetIdentity}>Reset Identity</button>
        </div>
      </div>
    </div>
  );
}
