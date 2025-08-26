// Tell TypeScript that we've added a custom 'electron' object to the window
export interface IElectronAPI {
  ping: (host: string) => Promise<any>;
  speedTest: () => Promise<any>;
  connect: (provider: 'warp'|'gool'|'psiphon', exitCountry?: string) => Promise<any>;
  disconnect: () => Promise<any>;
  status: () => Promise<any>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

// Declare the module for fast-speedtest-api since it has no official types
declare module 'fast-speedtest-api';
