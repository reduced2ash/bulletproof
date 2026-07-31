import React, { useEffect, useState } from 'react';

const errorResult = (error: unknown) => ({
  error: error instanceof Error ? error.message : 'Unknown error',
});

const stringifyResult = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);

const readLatency = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const latency = record.time ?? record.avg;
  if (typeof latency === 'number' || typeof latency === 'string') return `${latency} ms`;
  return null;
};

const PingTest = () => {
  const [host, setHost] = useState('google.com');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const latency = readLatency(result);

  const handlePing = async () => {
    setLoading(true);
    try {
      const response = await window.electron.ping(host);
      setResult(response);
    } catch (error: unknown) {
      setResult(errorResult(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="tool-section">
      <div className="tool-intro">
        <span className="section-label">ICMP</span>
        <h2>Ping</h2>
        <p>Host latency.</p>
      </div>
      <div className="tool-body">
        <div className="command-row">
          <label className="sr-only" htmlFor="ping-host">Host</label>
          <input id="ping-host" type="text" value={host} onChange={(event) => setHost(event.target.value)} className="form-input" placeholder="Host" />
          <button type="button" onClick={handlePing} className="primary-button compact" disabled={loading}>{loading ? 'Pinging' : 'Run'}</button>
          <button type="button" className="secondary-button compact" onClick={() => setResult(null)} disabled={result === null}>Clear</button>
        </div>
        {latency && <span className="result-summary">{latency}</span>}
        {result !== null && <pre className="tool-output">{stringifyResult(result)}</pre>}
      </div>
    </section>
  );
};

const SpeedTest = () => {
  const [result, setResult] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);

  const handleSpeedTest = async () => {
    setTesting(true);
    try {
      const response = await window.electron.speedTest();
      setResult(response);
    } catch (error: unknown) {
      setResult(errorResult(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="tool-section">
      <div className="tool-intro">
        <span className="section-label">Throughput</span>
        <h2>Speed test</h2>
        <p>Token required.</p>
      </div>
      <div className="tool-body">
        <div className="tool-actions">
          <button type="button" onClick={handleSpeedTest} disabled={testing} className="primary-button compact">
            {testing ? 'Testing' : 'Run test'}
          </button>
          <button type="button" className="secondary-button compact" onClick={() => setResult(null)} disabled={result === null}>Clear</button>
        </div>
        {result !== null && <pre className="tool-output">{stringifyResult(result)}</pre>}
      </div>
    </section>
  );
};

const ProxyTest: React.FC<{ initialBind?: string }> = ({ initialBind }) => {
  const [bind, setBind] = useState(initialBind || '127.0.0.1:8086');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const response = await window.electron.proxyTest(bind);
      setResult(response);
    } catch (error: unknown) {
      setResult(errorResult(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialBind) {
      setBind(initialBind);
      return;
    }
    void (async () => {
      try {
        const status = await window.electron.status();
        if (typeof status === 'object' && status !== null && 'bind' in status && typeof status.bind === 'string') {
          setBind(status.bind);
        }
      } catch {}
    })();
  }, [initialBind]);

  return (
    <section className="tool-section">
      <div className="tool-intro">
        <span className="section-label">SOCKS5</span>
        <h2>Proxy test</h2>
        <p>Request via this bind.</p>
      </div>
      <div className="tool-body">
        <div className="command-row">
          <label className="sr-only" htmlFor="proxy-bind">SOCKS bind</label>
          <input id="proxy-bind" type="text" className="form-input mono-input" value={bind} onChange={(event) => setBind(event.target.value)} />
          <button type="button" className="primary-button compact" onClick={run} disabled={loading}>{loading ? 'Testing' : 'Run'}</button>
          <button type="button" className="secondary-button compact" onClick={() => setResult(null)} disabled={result === null}>Clear</button>
        </div>
        {result !== null && <pre className="tool-output">{stringifyResult(result)}</pre>}
      </div>
    </section>
  );
};

const Diagnostics = ({ demo = false }: { demo?: boolean }) => {
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const response = await window.electron.diag();
      setDiagnostics(response);
    } catch (error: unknown) {
      setDiagnostics(errorResult(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!demo) void load();
  }, [demo]);

  const copy = async () => {
    if (diagnostics === null) return;
    try {
      await navigator.clipboard.writeText(stringifyResult(diagnostics));
    } catch {}
  };

  return (
    <section className="tool-section">
      <div className="tool-intro">
        <span className="section-label">Snapshot</span>
        <h2>Diagnostics</h2>
        <p>Runtime snapshot.</p>
      </div>
      <div className="tool-body">
        <div className="tool-actions">
          <button type="button" className="primary-button compact" onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</button>
          <button type="button" className="secondary-button compact" onClick={copy} disabled={diagnostics === null}>Copy JSON</button>
        </div>
        {diagnostics !== null && <pre className="tool-output">{stringifyResult(diagnostics)}</pre>}
      </div>
    </section>
  );
};

export default function Tools({ initialBind, demo = false }: { initialBind?: string; demo?: boolean }) {
  return (
    <main className="page tools-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">Network tools</span>
          <h1>Diagnostics</h1>
          <p>Direct checks against the current route.</p>
        </div>
      </header>
      <div className="tool-list">
        <PingTest />
        <SpeedTest />
        <ProxyTest initialBind={initialBind} />
        <Diagnostics demo={demo} />
      </div>
    </main>
  );
}
