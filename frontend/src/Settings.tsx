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
    <div className="settings-content">
      <div className="form-group">
        <label className="form-label">Integration Mode</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="direct"
              checked={integration === 'direct'}
              onChange={() => setIntegration('direct')}
            />
            Direct (in-app proxy)
            <p className="radio-description">Use app’s SOCKS proxy only; no system changes.</p>
          </label>
          <label>
            <input
              type="radio"
              value="pac"
              checked={integration === 'pac'}
              onChange={() => setIntegration('pac')}
            />
            System Proxy (PAC)
            <p className="radio-description">Sets OS proxy via PAC to route through SOCKS.</p>
          </label>
          <label>
            <input
              type="radio"
              value="tun"
              checked={integration === 'tun'}
              onChange={() => setIntegration('tun')}
            />
            TUN (Sing-Box)
            <p className="radio-description">Creates a TUN interface and forwards via SOCKS.</p>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Connection Method</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="warp"
              checked={provider === 'warp'}
              onChange={() => setProvider('warp')}
            />
            WARP
            <p className="radio-description">Uses Cloudflare's modern, optimized protocol.</p>
          </label>
          <label>
            <input
              type="radio"
              value="gool"
              checked={provider === 'gool'}
              onChange={() => setProvider('gool')}
            />
            Gool
            <p className="radio-description">A protocol designed for performance and efficiency.</p>
          </label>
          <label>
            <input
              type="radio"
              value="psiphon"
              checked={provider === 'psiphon'}
              onChange={() => setProvider('psiphon')}
            />
            Psiphon
            <p className="radio-description">A robust censorship circumvention tool.</p>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="server-address">Server Address</label>
        <input
          type="text"
          id="server-address"
          className="form-input"
          value={server}
          onChange={(e) => setServer(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="server-port">Port</label>
        <input
          type="number"
          id="server-port"
          className="form-input"
          value={port}
          onChange={(e) => setPort(parseInt(e.target.value || '0', 10))}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="warp-key">WARP/WARP+ Key</label>
        <input
          type="text"
          id="warp-key"
          className="form-input"
          value={warpKey}
          placeholder="e.g., EABCD-..."
          onChange={(e) => setWarpKey(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="exit-country">Exit Country</label>
        <select
          id="exit-country"
          className="form-input"
          value={exitCountry}
          onChange={(e) => setExitCountry(e.target.value)}
        >
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="DE">Germany</option>
          <option value="JP">Japan</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="license-type">License</label>
        <select
          id="license-type"
          className="form-input"
          value={license}
          onChange={(e) => setLicense((e.target.value as 'free' | 'warp+'))}
        >
          <option value="free">Free</option>
          <option value="warp+">WARP+</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">WARP Identity</label>
        <div className="identity-box">
          {loadingId ? (
            <p>Loading…</p>
          ) : identity?.exists ? (
            <>
              <p>Device ID: {identity.deviceId}</p>
              <p>Account ID: {identity.accountId || '—'}</p>
              <p>Public Key: {identity.publicKey?.slice(0, 12)}…</p>
              <p>Path: {identity.path}</p>
            </>
          ) : (
            <p>No identity yet. It will be created on first connect.</p>
          )}
          <div className="tool-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={loadIdentity}>Refresh</button>
            <button className="btn btn-amber" onClick={resetIdentity}>Reset Identity</button>
          </div>
        </div>
      </div>
    </div>
  );
}
