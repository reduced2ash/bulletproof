import React, { useEffect, useState } from 'react';

const PingTest = () => {
  const [host, setHost] = useState('google.com');
  const [result, setResult] = useState<any>(null);

  const handlePing = async () => {
    // @ts-ignore
    const response = await window.electron.ping(host);
    setResult(response);
  };

  return (
    <div className="tool-card">
      <div className="tool-header">
        <h3>Ping Test</h3>
        <div className="tool-actions">
          <button className="btn btn-ghost" onClick={() => setResult(null)}>Clear</button>
        </div>
      </div>
      <div className="input-row">
        <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className="form-input" placeholder="Enter host e.g. google.com" />
        <button onClick={handlePing} className="btn btn-amber">Ping</button>
      </div>
      {result && (
        <div className="tool-output">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

const SpeedTest = () => {
  const [result, setResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const handleSpeedTest = async () => {
    setTesting(true);
    // @ts-ignore
    const response = await window.electron.speedTest();
    setResult(response);
    setTesting(false);
  };

  return (
    <div className="tool-card">
      <div className="tool-header">
        <h3>Speed Test</h3>
      </div>
      <div className="tool-actions">
        <button onClick={handleSpeedTest} disabled={testing} className="btn btn-amber">
          {testing ? 'Testing…' : 'Run Speed Test'}
        </button>
        <button className="btn btn-ghost" onClick={() => setResult(null)}>Clear</button>
      </div>
      {result && (
        <div className="tool-output">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

const NetworkScanner = () => (
  <div className="tool-card">
    <div className="tool-header">
      <h3>Network Scanner</h3>
    </div>
    <p className="tool-section-title">This feature is not yet implemented.</p>
  </div>
);

const ProxyTest: React.FC<{ initialBind?: string }> = ({ initialBind }) => {
  const [bind, setBind] = useState(initialBind || '127.0.0.1:8086');
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    // @ts-ignore
    const out = await window.electron.proxyTest(bind);
    setRes(out);
    setLoading(false);
  };
  useEffect(() => {
    if (initialBind) setBind(initialBind);
    else {
      // Try to read current bind from backend
      (async () => {
        try {
          // @ts-ignore
          const st = await window.electron.status();
          if (st?.bind) setBind(st.bind);
        } catch {}
      })();
    }
  }, [initialBind]);

  return (
    <div className="tool-card">
      <div className="tool-header">
        <h3>Proxy Test</h3>
        <div className="tool-actions">
          <button className="btn btn-ghost" onClick={() => setRes(null)}>Clear</button>
        </div>
      </div>
      <div className="input-row">
        <input type="text" className="form-input" value={bind} onChange={e=>setBind(e.target.value)} />
        <button className="btn btn-amber" onClick={run} disabled={loading}>{loading ? 'Testing…' : 'Test via SOCKS'}</button>
      </div>
      {res && (
        <div className="tool-output">
          <pre>{JSON.stringify(res, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

const Diagnostics = () => {
  const [diag, setDiag] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    // @ts-ignore
    const res = await window.electron.diag();
    setDiag(res);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="tool-card">
      <div className="tool-header">
        <h3>Diagnostics</h3>
        <div className="tool-actions">
          <button className="btn btn-ghost" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>
      <div className="tool-output">
        <pre>{JSON.stringify(diag, null, 2)}</pre>
      </div>
    </div>
  );
};

export default function Tools({ initialBind }: { initialBind?: string }) {
  return (
    <div className="tools-stack">
      <PingTest />
      <SpeedTest />
      <ProxyTest initialBind={initialBind} />
      <Diagnostics />
      <NetworkScanner />
    </div>
  );
}
