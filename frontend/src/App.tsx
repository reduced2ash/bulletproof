import React, { useState, useEffect, useCallback, useRef } from 'react';
import Settings from './Settings';
import Tools from './Tools';
import Navbar from './Navbar';
import { bpConnect, bpDisconnect, ConnectPayload, bpProxyTest, bpProbePort } from './backendClient';

type Provider = 'warp' | 'gool' | 'psiphon';

type MainProps = {
  connected: boolean;
  connecting: boolean;
  message: string;
  bind: string;
  provider: Provider;
  integration: 'direct'|'pac'|'tun';
  exitCountry: string;
  pacEnabled: boolean;
  tunEnabled: boolean;
  listening: boolean;
  latencyMs: number | null;
  ipInfo?: { ip?: string; country?: string; isp?: string; asn?: string } | null;
  lastError?: string | null;
  onToggle: () => void;
  onGoTools: () => void;
  onGoSettings: () => void;
  onCopyBind: (text: string) => void;
};

const flagFor = (cc: string) => {
  const code = (cc || '').toUpperCase();
  if (code.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
};

const MainPage: React.FC<MainProps> = ({
  connected,
  connecting,
  message,
  bind,
  provider,
  integration,
  exitCountry,
  pacEnabled,
  tunEnabled,
  listening,
  latencyMs,
  ipInfo,
  lastError,
  onToggle,
  onGoTools,
  onGoSettings,
  onCopyBind,
}) => (
  <main className="app-main">
    <div className={`dial ${connected ? 'on' : 'off'} ${connecting ? 'pulse' : ''}`}> 
      <div
        className={`toggle-switch ${connected ? 'on' : 'off'} ${connecting ? 'loading' : ''}`}
        onClick={() => { if (!connecting) onToggle(); }}
        role="button"
        aria-pressed={connected}
        aria-label={connected ? 'Disconnect' : 'Connect'}
      >
        <div className="toggle-handle" />
      </div>
    </div>

    <div className="status-text">
      {connecting ? (
        <span className="loading-row"><span className="spinner" />Connecting…</span>
      ) : (
        <span>{message || (connected ? (bind ? `Connected · ${bind}` : 'Connected') : 'Not Connected')}</span>
      )}
    </div>

    <div className="status-chips" aria-label="Connection details">
      <div className="chip" title={`Provider: ${provider}`}>
        <span className="chip-icon" aria-hidden>{provider === 'warp' ? '🌀' : provider === 'gool' ? '🚀' : '🛰️'}</span>
        <span className="chip-label">{provider.toUpperCase()}</span>
      </div>
      <div className="chip" title={`Integration: ${integration}`}>
        <span className="chip-icon" aria-hidden>{integration === 'direct' ? '🧩' : integration === 'pac' ? '🌐' : '🛡️'}</span>
        <span className="chip-label">{integration.toUpperCase()}</span>
      </div>
      <div className="chip" title={`Exit Country: ${exitCountry}`}>
        <span className="chip-icon" aria-hidden>{flagFor(exitCountry)}</span>
        <span className="chip-label">{exitCountry}</span>
      </div>
      {pacEnabled && (
        <div className="chip chip-on" title="System PAC Enabled"><span className="chip-icon">📜</span><span className="chip-label">PAC</span></div>
      )}
      {tunEnabled && (
        <div className="chip chip-on" title="TUN Active"><span className="chip-icon">🛡️</span><span className="chip-label">TUN</span></div>
      )}
    </div>

    <div className="status-grid">
      <div className="status-card">
        <div className="status-title"><span aria-hidden>🔗</span> SOCKS Bind</div>
        <div className="status-value mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ellipsis" title={bind}>{bind || '—'}</span>
          {bind && (
            <button
              className="icon-btn"
              title="Copy bind"
              onClick={() => onCopyBind(bind)}
              aria-label="Copy bind"
            >⧉</button>
          )}
        </div>
      </div>
      <div className="status-card">
        <div className="status-title"><span aria-hidden>{listening ? '🟢' : '🔴'}</span> Port</div>
        <div className="status-value">{listening ? 'Listening' : 'Not listening'}</div>
      </div>
      <div className="status-card">
        <div className="status-title"><span aria-hidden>⚡</span> Latency</div>
        <div className="status-value">{latencyMs != null ? `${Math.round(latencyMs)} ms` : '—'}</div>
      </div>
      <div className="status-card">
        <div className="status-title"><span aria-hidden>💬</span> State</div>
        <div className="status-value ellipsis" title={message}>{message || (connected ? 'Connected' : 'Idle')}</div>
      </div>
      <div className="status-card">
        <div className="status-title"><span aria-hidden>🌍</span> Public IP</div>
        <div className="status-value mono">{ipInfo?.ip || '—'}</div>
      </div>
      <div className="status-card">
        <div className="status-title"><span aria-hidden>🏷️</span> ISP/ASN</div>
        <div className="status-value ellipsis" title={`${ipInfo?.isp || ''} ${ipInfo?.asn || ''}`.trim()}>
          {(ipInfo?.isp || '—')}{ipInfo?.asn ? ` · ${ipInfo.asn}` : ''}
        </div>
      </div>
    </div>

    {lastError && (
      <div className="status-card error" role="status" aria-live="polite" style={{ width: 'calc(100% - 16px)' }}>
        <div className="status-title"><span aria-hidden>❗</span> Last Error</div>
        <div className="status-value ellipsis" title={lastError}>{lastError}</div>
      </div>
    )}

    
  </main>
);

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<'main' | 'tools' | 'settings'>('main');

  // Lifted settings state
  const [provider, setProvider] = useState<Provider>('warp');
  const [integration, setIntegration] = useState<'direct'|'pac'|'tun'>('direct');
  // Leave empty by default so backend auto-selects endpoints
  const [server, setServer] = useState<string>('');
  const [port, setPort] = useState<number>(0);
  const [warpKey, setWarpKey] = useState<string>('');
  const [exitCountry, setExitCountry] = useState<string>('US');
  const [license, setLicense] = useState<'free' | 'warp+'>('free');
  // Connection state lifted so it survives navigation
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [bind, setBind] = useState<string>('');
  const [pacEnabled, setPacEnabled] = useState<boolean>(false);
  const [tunEnabled, setTunEnabled] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [ipInfo, setIpInfo] = useState<{ ip?: string; country?: string; isp?: string; asn?: string } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ t: number; text: string; kind?: 'info'|'success'|'error' }>>([]);
  const [toast, setToast] = useState<{ text: string; kind?: 'info'|'success'|'error' } | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const eventsRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((text: string, kind: 'info'|'success'|'error' = 'info') => {
    setToast({ text, kind });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const pushEvent = useCallback((text: string, kind: 'info'|'success'|'error' = 'info') => {
    setEvents((prev) => {
      const next = [{ t: Date.now(), text, kind }, ...prev];
      return next.slice(0, 3);
    });
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!eventsOpen) return;
      const el = eventsRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setEventsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [eventsOpen]);

  const buildPayload = (): ConnectPayload => ({
    provider,
    server: server || undefined,
    port: port || undefined,
    exitCountry,
    // Do not send bind; backend selects/persists an available one and returns it in status
    options: { key: warpKey || undefined, integration },
  });

  // Status polling to keep UI updated (e.g., "warp warming" -> "warp active")
  const refreshStatus = useCallback(async () => {
    try {
      // @ts-ignore
      const st = await window.electron.status();
      if (st && !st.error) {
        setConnected(!!st.connected);
        if (st.bind || st.Bind) setBind(st.bind || st.Bind);
        if (st.message) {
          setMessage(st.message);
          const m = (st.message || '').toLowerCase();
          if (/fail|error|timeout|denied|not ready/.test(m)) setLastError(st.message);
        }
        if (typeof st.pacEnabled === 'boolean') setPacEnabled(!!st.pacEnabled);
        if (typeof st.PacEnabled === 'boolean') setPacEnabled(!!st.PacEnabled);
        if (typeof st.singBox === 'boolean') setTunEnabled(!!st.singBox);
        if (typeof st.SingBox === 'boolean') setTunEnabled(!!st.SingBox);
      }
    } catch {}
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    const id = setInterval(() => { refreshStatus(); }, 2000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Probe port and latency periodically when connected
  useEffect(() => {
    let timer: any;
    const tick = async () => {
      try {
        const chosenBind = bind || '127.0.0.1:8086';
        const probe = await bpProbePort(chosenBind);
        setListening(!!probe?.listening);
      } catch { setListening(false); }
      try {
        // @ts-ignore
        const res = await window.electron.ping('1.1.1.1');
        const v = (res?.time ?? res?.avg ?? null);
        const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : null);
        setLatencyMs(Number.isFinite(n as number) ? (n as number) : null);
      } catch { setLatencyMs(null); }
      try {
        // @ts-ignore
        const out = await window.electron.proxyTest(bind || undefined);
        const body = out?.body;
        if (body && typeof body === 'string') {
          try {
            const j = JSON.parse(body);
            setIpInfo({ ip: j?.query, country: j?.countryCode || j?.country, isp: j?.isp, asn: j?.as || j?.asname });
          } catch {}
        }
      } catch {}
    };
    if (connected) {
      tick();
      timer = setInterval(tick, 4000);
    } else {
      setListening(false);
      setLatencyMs(null);
      setIpInfo(null);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [connected, bind]);

  const pollUntilConnected = async (timeoutMs = 75000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // @ts-ignore
      const st = await window.electron.status();
      if (st?.connected) return st;
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  };

  const handleToggle = useCallback(async () => {
    if (connecting) return;
    try {
      if (!connected) {
        setConnecting(true);
        setMessage('Connecting…');
        setLastError(null);
        pushEvent('Connecting…', 'info');
        const res = await bpConnect(buildPayload());
        if (res && (res.error || res.Error)) {
          setMessage(res.error || res.Error || 'Connect failed');
          setLastError(res.error || res.Error || 'Connect failed');
          pushEvent(res.error || res.Error || 'Connect failed', 'error');
          setConnecting(false);
          return;
        }
        const st = await pollUntilConnected();
        if (st) {
          const chosenBind = st?.bind || st?.Bind || '';
          if (chosenBind) setBind(chosenBind);
          try {
            const probe = await bpProbePort(chosenBind);
            if (!probe?.listening) {
              setMessage('Port not listening yet…');
              await new Promise(r => setTimeout(r, 800));
            }
          } catch {}
          try {
            const test = await bpProxyTest(chosenBind);
            if (test && !test.error) {
              setConnected(true);
              setMessage(st?.message || `Connected · ${chosenBind}`);
              pushEvent(`Connected · ${chosenBind}`, 'success');
            } else {
              setMessage(st?.message || 'Connected (probe failed)');
              setLastError(test?.error || 'Proxy probe failed');
              pushEvent(test?.error || 'Proxy probe failed', 'error');
              setConnected(true);
            }
          } catch {
            setConnected(true);
            setMessage(st?.message || 'Connected');
            pushEvent('Connected', 'success');
          }
        } else {
          setMessage('Connection timed out');
          setLastError('Connection timed out');
          pushEvent('Connection timed out', 'error');
        }
        setConnecting(false);
      } else {
        setConnecting(true);
        const out = await bpDisconnect();
        if (out && (out.error || out.Error)) setLastError(out.error || out.Error);
        setConnected(false);
        setBind('');
        setMessage('Disconnected');
        pushEvent('Disconnected', 'info');
        setConnecting(false);
      }
    } catch (e: any) {
      setConnecting(false);
      setMessage(e?.message || 'Error');
      setLastError(e?.message || 'Unknown error');
      pushEvent(e?.message || 'Unknown error', 'error');
    }
  }, [connecting, connected, buildPayload]);

  const renderPage = () => {
    switch (activePage) {
      case 'tools':
        return <Tools initialBind={bind} />;
      case 'settings':
        return (
          <Settings
            provider={provider}
            setProvider={setProvider}
            integration={integration}
            setIntegration={setIntegration}
            server={server}
            setServer={setServer}
            port={port}
            setPort={setPort}
            warpKey={warpKey}
            setWarpKey={setWarpKey}
            exitCountry={exitCountry}
            setExitCountry={setExitCountry}
            license={license}
            setLicense={setLicense}
          />
        );
      default:
        return (
          <MainPage
            connected={connected}
            connecting={connecting}
            message={message}
            bind={bind}
            provider={provider}
            integration={integration}
            exitCountry={exitCountry}
            pacEnabled={pacEnabled}
            tunEnabled={tunEnabled}
            listening={listening}
            latencyMs={latencyMs}
            ipInfo={ipInfo}
            lastError={lastError}
            onToggle={handleToggle}
            onGoTools={() => setActivePage('tools')}
            onGoSettings={() => setActivePage('settings')}
            onCopyBind={(text) => {
              (async () => {
                try { await navigator.clipboard.writeText(text); showToast('Copied bind', 'success'); }
                catch { showToast('Copy failed', 'error'); }
              })();
            }}
          />
        );
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <div className="brand-row">
          <h1>Bulletproof</h1>
          <div className="header-actions" ref={eventsRef}>
            <div className={`header-pill ${connecting ? 'connecting' : (connected ? 'on' : 'off')}`}>
              <span className={`dot ${connecting ? 'amber' : (connected ? 'green' : 'gray')}`} aria-hidden />
              <span className="label">{connecting ? 'Connecting…' : (connected ? 'Connected' : 'Offline')}</span>
            </div>
            <button
              type="button"
              className="icon-btn events-btn"
              aria-haspopup="menu"
              aria-expanded={eventsOpen}
              title="Recent Events"
              onClick={() => setEventsOpen(v => !v)}
            >📝</button>
            {eventsOpen && (
              <div className="events-dropdown" role="menu">
                <div className="events-header">Recent Events</div>
                {events.length === 0 ? (
                  <div className="events-empty">No events yet</div>
                ) : (
                  <ul className="event-list">
                    {events.map((e, idx) => (
                      <li key={e.t + '-' + idx} className={`event-item ${e.kind || 'info'}`}>
                        <span className="event-dot" aria-hidden />
                        <span className="event-text" title={e.text}>{e.text}</span>
                        <span className="event-time" aria-hidden>{new Date(e.t).toLocaleTimeString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="header-sub">
          <span className="sub-item" title={`Provider: ${provider}`}>{provider === 'warp' ? '🌀' : provider === 'gool' ? '🚀' : '🛰️'} {provider.toUpperCase()}</span>
          <span className="dot-sep" aria-hidden>•</span>
          <span className="sub-item" title={`Integration: ${integration}`}>{integration === 'direct' ? '🧩' : integration === 'pac' ? '🌐' : '🛡️'} {integration.toUpperCase()}</span>
          <span className="dot-sep" aria-hidden>•</span>
          <span className="sub-item" title={`Exit Country: ${exitCountry}`}>{flagFor(exitCountry)} {exitCountry}</span>
        </div>
        <div className="header-beam" aria-hidden />
      </header>

      <div className="page-content">{renderPage()}</div>

      <Navbar activePage={activePage} onPageChange={setActivePage} />

      {toast && (
        <div className="toast-container" aria-live="polite" aria-atomic="true">
          <div className={`toast ${toast.kind || 'info'}`}>{toast.text}</div>
        </div>
      )}
    </div>
  );
};

export default App;
