import React, { useEffect, useState } from 'react';

type Provider = 'warp' | 'gool' | 'psiphon';

interface SettingsProps {
  demo?: boolean;
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

interface IdentityInfo {
  exists: boolean;
  deviceId?: string;
  accountId?: string;
  publicKey?: string;
  path?: string;
  hasPrivateKey: boolean;
  hasToken: boolean;
}


const parseIdentity = (value: unknown): IdentityInfo | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    exists: record.exists === true,
    deviceId: typeof record.deviceId === 'string' ? record.deviceId : undefined,
    accountId: typeof record.accountId === 'string' ? record.accountId : undefined,
    publicKey: typeof record.publicKey === 'string' ? record.publicKey : undefined,
    path: typeof record.path === 'string' ? record.path : undefined,
    hasPrivateKey: record.hasPrivateKey === true,
    hasToken: record.hasToken === true,
  };
};

export default function Settings({
  demo = false,
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
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [loadingId, setLoadingId] = useState(false);

  const loadIdentity = async () => {
    if (demo) {
      setIdentity(null);
      return;
    }
    setLoadingId(true);
    try {
      // @ts-ignore
      const response = await window.electron.identity();
      setIdentity(parseIdentity(response));
    } catch {
      setIdentity(null);
    } finally {
      setLoadingId(false);
    }
  };

  useEffect(() => { void loadIdentity(); }, [demo]);

  const resetIdentity = async () => {
    if (demo) {
      setIdentity(null);
      return;
    }
    // @ts-ignore
    await window.electron.identityReset();
    await loadIdentity();
  };

  return (
    <main className="page settings-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">Configuration</span>
          <h1>Settings</h1>
          <p>Routing, provider, and local identity.</p>
        </div>
      </header>

      <section className="settings-section">
        <div className="settings-intro">
          <span className="section-label">Routing</span>
          <h2>Route mode</h2>
          <p>Choose the system boundary.</p>
        </div>
        <div className="choice-list">
          <label className={`choice-row ${integration === 'direct' ? 'selected' : ''}`}>
            <input type="radio" value="direct" checked={integration === 'direct'} onChange={() => setIntegration('direct')} />
            <span className="choice-copy"><strong>Direct</strong><span>Application proxy only</span></span>
            <code>SOCKS5</code>
          </label>
          <label className={`choice-row ${integration === 'pac' ? 'selected' : ''}`}>
            <input type="radio" value="pac" checked={integration === 'pac'} onChange={() => setIntegration('pac')} />
            <span className="choice-copy"><strong>System proxy</strong><span>OS proxy configuration</span></span>
            <code>PAC</code>
          </label>
          <label className={`choice-row ${integration === 'tun' ? 'selected' : ''}`}>
            <input type="radio" value="tun" checked={integration === 'tun'} onChange={() => setIntegration('tun')} />
            <span className="choice-copy"><strong>TUN</strong><span>Full-device routing</span></span>
            <code>TUN</code>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <span className="section-label">Transport</span>
          <h2>Provider</h2>
          <p>Select the active engine.</p>
        </div>
        <div className="choice-list">
          <label className={`choice-row ${provider === 'warp' ? 'selected' : ''}`}>
            <input type="radio" value="warp" checked={provider === 'warp'} onChange={() => setProvider('warp')} />
            <span className="choice-copy"><strong>WARP</strong><span>Cloudflare route</span></span>
            <code>warp</code>
          </label>
          <label className={`choice-row ${provider === 'gool' ? 'selected' : ''}`}>
            <input type="radio" value="gool" checked={provider === 'gool'} onChange={() => setProvider('gool')} />
            <span className="choice-copy"><strong>Gool</strong><span>Fast-start route</span></span>
            <code>gool</code>
          </label>
          <label className={`choice-row ${provider === 'psiphon' ? 'selected' : ''}`}>
            <input type="radio" value="psiphon" checked={provider === 'psiphon'} onChange={() => setProvider('psiphon')} />
            <span className="choice-copy"><strong>Psiphon</strong><span>Circumvention route</span></span>
            <code>psiphon</code>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <span className="section-label">Endpoint</span>
          <h2>Connection</h2>
          <p>Empty fields use automatic selection.</p>
        </div>
        <div className="form-grid">
          <label className="form-field form-field-wide">
            <span>Server</span>
            <input type="text" className="form-input" placeholder="Automatic" value={server} onChange={(event) => setServer(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Port</span>
            <input type="number" className="form-input" placeholder="Auto" value={port || ''} onChange={(event) => setPort(parseInt(event.target.value || '0', 10))} />
          </label>
          <label className="form-field">
            <span>Exit country</span>
            <select className="form-input" value={exitCountry} onChange={(event) => setExitCountry(event.target.value)}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="DE">Germany</option>
              <option value="JP">Japan</option>
            </select>
          </label>
          <label className="form-field">
            <span>License</span>
            <select className="form-input" value={license} onChange={(event) => setLicense(event.target.value as 'free' | 'warp+')}>
              <option value="free">Free</option>
              <option value="warp+">WARP+</option>
            </select>
          </label>
          <label className="form-field form-field-wide">
            <span>WARP / WARP+ key</span>
            <input type="text" className="form-input" value={warpKey} placeholder="Optional license key" onChange={(event) => setWarpKey(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="settings-section identity-section">
        <div className="settings-intro">
          <span className="section-label">Local state</span>
          <h2>WARP identity</h2>
          <p>Stored only on this device.</p>
        </div>
        <div>
          {loadingId ? (
            <div className="identity-loading" aria-label="Loading identity">
              <span />
              <span />
              <span />
            </div>
          ) : identity?.exists ? (
            <dl className="identity-grid">
              <div><dt>Device ID</dt><dd title={identity.deviceId}><code>{identity.deviceId || 'n/a'}</code></dd></div>
              <div><dt>Account ID</dt><dd title={identity.accountId}><code>{identity.accountId || 'n/a'}</code></dd></div>
              <div><dt>Public key</dt><dd title={identity.publicKey}><code>{identity.publicKey ? `${identity.publicKey.slice(0, 22)}…` : 'n/a'}</code></dd></div>
              <div><dt>Path</dt><dd title={identity.path}><code>{identity.path || 'n/a'}</code></dd></div>
              <div><dt>Private key</dt><dd><span className={`badge ${identity.hasPrivateKey ? 'ok' : 'warn'}`}>{identity.hasPrivateKey ? 'Present' : 'Missing'}</span></dd></div>
              <div><dt>Token</dt><dd><span className={`badge ${identity.hasToken ? 'ok' : 'warn'}`}>{identity.hasToken ? 'Present' : 'Missing'}</span></dd></div>
            </dl>
          ) : (
            <p className="empty-note">No local identity. One is created on first connection.</p>
          )}
          <div className="tool-actions">
            <button type="button" className="secondary-button" onClick={loadIdentity}>Refresh</button>
            <button type="button" className="danger-button" onClick={resetIdentity}>Reset identity</button>
          </div>
        </div>
      </section>
    </main>
  );
}
