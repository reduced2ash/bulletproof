// Tell TypeScript that we've added a custom 'electron' object to the window
export interface IElectronAPI {
  ping: (host: string) => Promise<any>;
  speedTest: () => Promise<any>;
  connect: (provider: 'warp'|'gool'|'psiphon', exitCountry?: string) => Promise<any>;
  disconnect: () => Promise<any>;
  status: () => Promise<any>;
  proxyTest: (bind?: string) => Promise<{ error?: string; body?: string; [key: string]: unknown }>;
  probePort: (bind?: string) => Promise<{ listening?: boolean }>;
  diag: () => Promise<unknown>;
  identity: () => Promise<unknown>;
  identityReset: () => Promise<unknown>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
