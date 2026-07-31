import React, { useState, useEffect, useCallback, useRef } from 'react';
import Settings from './Settings';
import Tools from './Tools';
import Navbar from './Navbar';
import bulletproofLogo from './assets/icon.png';
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
  <main className="page connection-page">
    <header className="page-header">
      <div>
        <span className="page-kicker">Runtime</span>
        <h1>Connection</h1>
        <p>Local tunnel and route state.</p>
      </div>
      <button
        type="button"
        className={`primary-button connection-button ${connected ? 'disconnect' : ''}`}
        onClick={onToggle}
        disabled={connecting}
        aria-pressed={connected}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2.5v7" />
          <path d="M5.4 5.2a7 7 0 1 0 9.2 0" />
        </svg>
        {connecting ? 'Starting tunnel' : connected ? 'Disconnect' : 'Connect'}
      </button>
    </header>

    <section
      className={`connection-summary ${connected ? 'is-connected' : connecting ? 'is-pending' : 'is-idle'}`}
      aria-live="polite"
    >
      <div className="connection-summary-main">
        <div
          className={`route-orb-mark ${connected ? 'is-connected' : connecting ? 'is-pending' : 'is-idle'}`}
          role="img"
          aria-label={`Route ${connecting ? 'waiting' : connected ? 'live' : 'idle'}`}
        >
          <span className="route-orb-label">Route</span>
          <span className="route-orb" aria-hidden="true">
            <span className="route-orb-ring route-orb-ring-primary" />
            <span className="route-orb-ring route-orb-ring-secondary" />
            <span className="route-orb-core" />
            <span className="route-orb-signal" />
          </span>
          <span className="route-orb-status">{connecting ? 'Waiting' : connected ? 'Live' : 'Idle'}</span>
        </div>
        <div className="connection-copy">
          <div className="status-line">
            <span className="status-caption">Secure tunnel</span>
            <span className={`state-badge ${connected ? 'is-connected' : connecting ? 'is-pending' : 'is-idle'}`}>
              {connecting ? 'Starting' : connected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <h2>{connecting ? 'Establishing route' : connected ? 'Tunnel active' : 'Tunnel inactive'}</h2>
          <p className="status-message">
            {message || (connected ? 'Traffic is routed through the local client.' : 'Ready to connect.')}
          </p>
        </div>
      </div>
      <div className="route-map" role="img" aria-label={`Route: local device through ${provider} to ${exitCountry}`}>
        <div className="route-node">
          <span className="route-marker" aria-hidden="true" />
          <span className="route-node-copy"><strong>Local</strong><small>{integration === 'direct' ? 'App only' : integration.toUpperCase()}</small></span>
        </div>
        <div className={`route-link ${connected ? 'is-live' : ''}`} aria-hidden="true">
          <span className="route-link-label">{integration}</span>
          <span className="route-link-line" />
        </div>
        <div className="route-node">
          <span className="route-marker" aria-hidden="true" />
          <span className="route-node-copy"><strong>{provider}</strong><small>Provider</small></span>
        </div>
        <div className={`route-link ${connected ? 'is-live' : ''}`} aria-hidden="true">
          <span className="route-link-label">{tunEnabled ? 'TUN' : pacEnabled ? 'PAC' : 'SOCKS'}</span>
          <span className="route-link-line" />
        </div>
        <div className="route-node route-node-exit">
          <span className="route-marker" aria-hidden="true" />
          <span className="route-node-copy"><strong>{exitCountry}</strong><small>Exit</small></span>
        </div>
      </div>
    </section>

    <section className="runtime-section">
      <div className="section-heading">
        <h2>Runtime details</h2>
        <span>{connected ? 'Live session' : 'No active session'}</span>
      </div>
      <dl className="runtime-grid">
        <div className="runtime-item">
          <dt>SOCKS bind</dt>
          <dd className="runtime-value-inline">
            <code title={bind}>{bind || 'not assigned'}</code>
            {bind && (
              <button type="button" className="copy-button" onClick={() => onCopyBind(bind)}>
                Copy
              </button>
            )}
          </dd>
        </div>
        <div className="runtime-item">
          <dt>Port</dt>
          <dd><span className={`inline-state ${listening ? 'ok' : 'muted'}`} />{listening ? 'Listening' : 'Not listening'}</dd>
        </div>
        <div className="runtime-item">
          <dt>Latency</dt>
          <dd>{latencyMs != null ? `${Math.round(latencyMs)} ms` : 'not measured'}</dd>
        </div>
        <div className="runtime-item">
          <dt>Public IP</dt>
          <dd><code>{ipInfo?.ip || 'not available'}</code></dd>
        </div>
        <div className="runtime-item">
          <dt>Backend state</dt>
          <dd title={message}>{message || (connected ? 'Connected' : 'Idle')}</dd>
        </div>
        <div className="runtime-item">
          <dt>ISP / ASN</dt>
          <dd title={`${ipInfo?.isp || ''} ${ipInfo?.asn || ''}`.trim()}>
            {ipInfo?.isp || 'not available'}{ipInfo?.asn ? ` · ${ipInfo.asn}` : ''}
          </dd>
        </div>
      </dl>
    </section>

    {lastError && (
      <section className="inline-alert" role="status" aria-live="polite">
        <div>
          <strong>Last error</strong>
          <span title={lastError}>{lastError}</span>
        </div>
      </section>
    )}

    <div className="page-actions">
      <button type="button" className="text-button" onClick={onGoTools}>Open diagnostics</button>
      <button type="button" className="text-button" onClick={onGoSettings}>Configure route</button>
    </div>
  </main>
);

const App: React.FC = () => {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isDemo = searchParams.get('demo') === '1';
  const demoPage = searchParams.get('page') || 'main';
  const isCapture = searchParams.get('capture') === '1';
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
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
  const [connected, setConnected] = useState(isDemo ? true : false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string>(isDemo ? 'Connected through WARP' : '');
  const [bind, setBind] = useState<string>(isDemo ? '127.0.0.1:8087' : '');
  const [pacEnabled, setPacEnabled] = useState<boolean>(false);
  const [tunEnabled, setTunEnabled] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(isDemo);
  const [latencyMs, setLatencyMs] = useState<number | null>(isDemo ? 23 : null);
  const [ipInfo, setIpInfo] = useState<{ ip?: string; country?: string; isp?: string; asn?: string } | null>(isDemo ? { ip: '203.0.113.42', country: 'US', isp: 'Documentation network', asn: 'AS64500' } : null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ t: number; text: string; kind?: 'info'|'success'|'error' }>>([]);
  const [toast, setToast] = useState<{ text: string; kind?: 'info'|'success'|'error' } | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const eventsRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, kind: 'info'|'success'|'error' = 'info') => {
    setToast({ text, kind });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
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

  useEffect(() => { if (!isDemo) refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    if (isDemo) return;
    const id = setInterval(() => { refreshStatus(); }, 2000);
    return () => clearInterval(id);
  }, [refreshStatus, isDemo]);

  // Probe port and latency periodically when connected
  useEffect(() => {
    if (isDemo) return;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const chosenBind = bind || '127.0.0.1:8086';
        const probe = await bpProbePort(chosenBind);
        setListening(!!probe?.listening);
      } catch { setListening(false); }
      try {
        // @ts-ignore
        const res = await window.electron.ping('1.1.1.1');
        const value = res?.time ?? res?.avg ?? null;
        const latency = typeof value === 'string' ? parseFloat(value) : (typeof value === 'number' ? value : null);
        setLatencyMs(latency !== null && Number.isFinite(latency) ? latency : null);
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
      timer = window.setInterval(tick, 4000);
    } else {
      setListening(false);
      setLatencyMs(null);
      setIpInfo(null);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [connected, bind, isDemo]);

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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnecting(false);
      setMessage(errorMessage);
      setLastError(errorMessage);
      pushEvent(errorMessage, 'error');
    }
  }, [connecting, connected, buildPayload]);

  useEffect(() => {
    if (isDemo) {
      if (demoPage === 'tools' || demoPage === 'settings' || demoPage === 'main') setActivePage(demoPage);
      pushEvent('Connected · 127.0.0.1:8087', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'tools':
        return <Tools initialBind={bind} demo={isDemo} />;
      case 'settings':
        return (
          <Settings
            demo={isDemo}
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
    <div className="app-shell">
      <header className={`titlebar ${isMac ? 'platform-mac' : 'platform-overlay'} ${isCapture ? 'is-capture' : ''}`}>
        <div className="project-lockup">
          <img className="project-logo" src={bulletproofLogo} alt="" aria-hidden="true" />
          <strong>Bulletproof</strong>
        </div>
        <div className="header-actions" ref={eventsRef}>
          <span className={`header-status ${connecting ? 'pending' : connected ? 'connected' : 'offline'}`}>
            <span className="status-light" aria-hidden="true" />
            {connecting ? 'Connecting' : connected ? 'Connected' : 'Offline'}
          </span>
          <button
            type="button"
            className="events-button"
            aria-label={`Recent events, ${events.length}`}
            aria-haspopup="menu"
            aria-expanded={eventsOpen}
            title="Recent events"
            onClick={() => setEventsOpen(v => !v)}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 5h10" />
              <path d="M4 9h10" />
              <path d="M4 13h7" />
            </svg>
            <span className="event-count">{events.length}</span>
          </button>
          {eventsOpen && (
            <div className="events-dropdown" role="menu">
              <div className="events-header">Recent events</div>
              {events.length === 0 ? (
                <div className="events-empty">No events recorded.</div>
              ) : (
                <ul className="event-list">
                  {events.map((e, idx) => (
                    <li key={e.t + '-' + idx} className={`event-item ${e.kind || 'info'}`}>
                      <span className="event-dot" aria-hidden="true" />
                      <span className="event-text" title={e.text}>{e.text}</span>
                      <time className="event-time">{new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="app-body">
        <Navbar activePage={activePage} onPageChange={setActivePage} />
        <div className={`page-content ${activePage === 'main' ? 'connection-content' : ''}`}>{renderPage()}</div>
      </div>

      {toast && (
        <div className="toast-container" aria-live="polite" aria-atomic="true">
          <div className={`toast ${toast.kind || 'info'}`}>{toast.text}</div>
        </div>
      )}
    </div>
  );
};

export default App;
