// Simple client for the Bulletproof backend, proxied via IPC (avoids CORS)
export async function bpStatus() {
  // @ts-ignore
  return window.electron.status();
}

export interface ConnectPayload {
  provider: 'warp'|'gool'|'psiphon';
  server?: string;
  port?: number;
  exitCountry?: string;
  options?: { key?: string; bind?: string; bin?: string };
}

export async function bpConnect(payload: ConnectPayload) {
  // @ts-ignore
  return window.electron.connect(payload);
}

export async function bpDisconnect() {
  // @ts-ignore
  return window.electron.disconnect();
}
