import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe, limited API to the renderer process
contextBridge.exposeInMainWorld('electron', {
  ping: (host: string) => ipcRenderer.invoke('ping', host),
  speedTest: () => ipcRenderer.invoke('speed-test'),
  connect: (payload: any) => ipcRenderer.invoke('bp-connect', payload),
  disconnect: () => ipcRenderer.invoke('bp-disconnect'),
  proxyTest: (bind?: string) => ipcRenderer.invoke('bp-proxy-test', bind),
  status: () => ipcRenderer.invoke('bp-status'),
  diag: () => ipcRenderer.invoke('bp-diag'),
  identity: () => ipcRenderer.invoke('bp-identity'),
  identityReset: () => ipcRenderer.invoke('bp-identity-reset'),
});
