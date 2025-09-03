import React, { useState, useEffect, useCallback } from 'react';
import Settings from './Settings';
import Tools from './Tools';
import Navbar from './Navbar';
import { bpConnect, bpDisconnect, ConnectPayload, bpProxyTest, bpProbePort } from './backendClient';

type Provider = 'warp' | 'gool' | 'psiphon';

type MainProps = { connected: boolean; connecting: boolean; message: string; bind: string; onToggle: () => void };
const MainPage: React.FC<MainProps> = ({ connected, connecting, message, bind, onToggle }) => (
  <main className="app-main">
    <div
      className={`toggle-switch ${connected ? 'on' : 'off'} ${connecting ? 'loading' : ''}`}
      onClick={() => { if (!connecting) onToggle(); }}
    >
      <div className="toggle-handle" />
    </div>
    <div className="status-text">
      {connecting ? (
        <span className="loading-row"><span className="spinner" />Connecting…</span>
      ) : (
        <span>{message || (connected ? (bind ? `Connected · ${bind}` : 'Connected') : 'Not Connected')}</span>
      )}
    </div>
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
        if (st.message) setMessage(st.message);
      }
    } catch {}
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    const id = setInterval(() => { refreshStatus(); }, 2000);
    return () => clearInterval(id);
  }, [refreshStatus]);

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
        const res = await bpConnect(buildPayload());
        if (res && (res.error || res.Error)) {
          setMessage(res.error || res.Error || 'Connect failed');
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
            } else {
              setMessage(st?.message || 'Connected (probe failed)');
              setConnected(true);
            }
          } catch {
            setConnected(true);
            setMessage(st?.message || 'Connected');
          }
        } else {
          setMessage('Connection timed out');
        }
        setConnecting(false);
      } else {
        setConnecting(true);
        await bpDisconnect();
        setConnected(false);
        setBind('');
        setMessage('Disconnected');
        setConnecting(false);
      }
    } catch (e: any) {
      setConnecting(false);
      setMessage(e?.message || 'Error');
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
            onToggle={handleToggle}
          />
        );
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Bulletproof</h1>
      </header>

      <div className="page-content">{renderPage()}</div>

      <Navbar activePage={activePage} onPageChange={setActivePage} />
    </div>
  );
};

export default App;
