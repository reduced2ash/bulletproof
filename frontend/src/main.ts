
let backendProc: ReturnType<typeof spawn> | null = null;

// Ensure the spawned backend is terminated reliably across platforms
function killBackendTree() {
  try {
    if (!backendProc || !backendProc.pid) return;
    const pid = backendProc.pid;
    // Attempt graceful termination first
    try { backendProc.kill(); } catch {}
    // Platform-specific harder kill of the process tree
    if (process.platform === 'win32') {
      try {
        const cp = require('child_process');
        cp.spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      } catch {}
    } else {
      try {
        // Try to kill the whole process group, if supported
        try { process.kill(-pid, 'SIGTERM'); } catch {}
        // Fallback: pkill children by parent PID
        const cp = require('child_process');
        cp.spawnSync('pkill', ['-P', String(pid)], { stdio: 'ignore' });
      } catch {}
    }
  } catch {}
}

function resolveBackendBinary(): string {
  const custom = process.env.BACKEND_BIN;
  if (custom) return custom;
  const path = require('path');
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'bulletproofd.exe' : 'bulletproofd';
  // dev: project root is one level up from frontend; binary under ../backend
  return path.join(process.cwd(), '..', 'backend', bin);
}

function resolveWarpPlusBinary(): string | null {
  try {
    const path = require('path');
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'warp-plus.exe' : 'warp-plus';
    const resRoot = process.resourcesPath || process.cwd();
    const plat = process.platform; // darwin|win32|linux
    const arch = process.arch;     // x64|arm64
    const candidate = path.join(resRoot, 'bin', `${plat}-${arch}`, binName);
    const fs = require('fs');
    if (fs.existsSync(candidate)) return candidate;
    // fallback to project tree during dev
    const devCandidate = path.join(process.cwd(), 'resources', 'bin', `${plat}-${arch}`, binName);
    if (fs.existsSync(devCandidate)) return devCandidate;
  } catch {}
  return null;
}

function resolveSingBoxBinary(): string | null {
  try {
    const path = require('path');
    const isWin = process.platform === 'win32';
    const binNameCandidates = isWin ? ['sb-helper.exe', 'sing-box.exe'] : ['sb-helper', 'sing-box'];
    const resRoot = process.resourcesPath || process.cwd();
    const plat = process.platform;
    const arch = process.arch;
    for (const binName of binNameCandidates) {
      const candidate = path.join(resRoot, 'bin', `${plat}-${arch}`, binName);
      const fs = require('fs');
      if (fs.existsSync(candidate)) return candidate;
      const devCandidate = path.join(process.cwd(), 'resources', 'bin', `${plat}-${arch}`, binName);
      if (fs.existsSync(devCandidate)) return devCandidate;
    }
  } catch {}
  return null;
}

function startBackend() {
  try {
    const bin = resolveBackendBinary();
    const fs = require('fs');
    if (!fs.existsSync(bin)) {
      console.error('Backend binary not found at', bin);
      return;
    }
    const warpPlusBin = resolveWarpPlusBinary();
    const env = { ...process.env } as any;
    if (warpPlusBin) env.WARPPLUS_BIN = warpPlusBin;
    // Prefer IPv4 endpoints and HTTPS test URL; enable verbose logs for diagnostics
    if (!env.WARPPLUS_IPV4) env.WARPPLUS_IPV4 = '1';
    if (!env.WARPPLUS_VERBOSE) env.WARPPLUS_VERBOSE = '1';
    if (!env.WARPPLUS_TEST_URL) env.WARPPLUS_TEST_URL = 'https://1.1.1.1/cdn-cgi/trace';
    // Allow shim to do direct fallback so we always have a responsive listener
    if (!env.BP_SOCKS_DIRECT_FALLBACK) env.BP_SOCKS_DIRECT_FALLBACK = '1';
    const singBoxBin = resolveSingBoxBinary();
    if (singBoxBin) env.SINGBOX_BIN = singBoxBin;

    // Log resolution diagnostics
    console.log('[bp] cwd=', process.cwd());
    console.log('[bp] resourcesPath=', process.resourcesPath);
    console.log('[bp] backend bin=', bin);
    console.log('[bp] warp-plus bin=', warpPlusBin || '(none)');
    if (process.platform === 'darwin' && warpPlusBin) {
      try {
        const cp = require('child_process');
        const { status } = cp.spawnSync('xattr', ['-p', 'com.apple.quarantine', warpPlusBin], { stdio: 'ignore' });
        if (status === 0) {
          console.warn('[bp] warp-plus has quarantine attribute. If execution fails, run: xattr -d com.apple.quarantine', warpPlusBin);
        }
      } catch {}
    }
    console.log('[bp] sing-box bin=', singBoxBin || '(none)');
    console.log('[bp] env overrides: WARPPLUS_IPV4=', env.WARPPLUS_IPV4, ' WARPPLUS_VERBOSE=', env.WARPPLUS_VERBOSE, ' BP_SOCKS_DIRECT_FALLBACK=', env.BP_SOCKS_DIRECT_FALLBACK);

    backendProc = spawn(bin, ['-addr', '127.0.0.1:4765'], { stdio: 'inherit', env });
    backendProc.on('exit', (code, signal) => {
      console.log('[bp] backend exit code=', code, 'signal=', signal);
      backendProc = null;
    });
  } catch (e) {
    console.error('Failed to spawn backend:', e);
  }
}

async function waitForHealth(timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:4765/v1/health');
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
}

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import ping from 'ping';
import Speedtest from 'fast-speedtest-api';
import { spawn } from 'child_process';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function cleanup() {
  try { killBackendTree(); } catch {}
}

ipcMain.handle('ping', async (event, host) => {
  try {
    const result = await ping.promise.probe(host);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: 'An unknown error occurred' };
  }
});

ipcMain.handle('speed-test', async () => {
  try {
    const speedtest = new Speedtest({
      token: "your_token_here", // This needs a real token to work
      verbose: false,
      timeout: 10000,
      https: true,
      urlCount: 5,
      bufferSize: 8,
      unit: Speedtest.UNITS.Mbps,
    });
    const speed = await speedtest.getSpeed();
    return { speed };
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: 'An unknown error occurred' };
  }
});

// Backend proxy to avoid CORS issues in renderer
ipcMain.handle('bp-status', async () => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/status');
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'backend status failed' };
  }
});

ipcMain.handle('bp-diag', async () => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/diag');
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'backend diag failed' };
  }
});

ipcMain.handle('bp-connect', async (_evt, payload: any) => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'backend connect failed' };
  }
});

ipcMain.handle('bp-disconnect', async () => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/disconnect', { method: 'POST' });
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'backend disconnect failed' };
  }
});

ipcMain.handle('bp-proxy-test', async (_evt, bind?: string) => {
  try {
    const url = new URL('http://127.0.0.1:4765/v1/test/socks');
    if (bind) url.searchParams.set('bind', bind);
    const res = await fetch(url.toString());
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'proxy test failed' };
  }
});

// Simple TCP probe to confirm a listening socket exists before flipping UI state
ipcMain.handle('bp-probe-port', async (_evt, bind?: string) => {
  const net = require('net');
  const addr = bind || '127.0.0.1:8086';
  const [host, portStr] = addr.split(':');
  const port = parseInt(portStr || '8086', 10);
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: 800 }, () => {
      try { sock.end(); } catch {}
      resolve({ listening: true });
    });
    sock.on('error', () => { resolve({ listening: false }); });
    sock.on('timeout', () => { try { sock.destroy(); } catch {}; resolve({ listening: false }); });
  });
});

ipcMain.handle('bp-identity', async () => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/identity');
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'identity read failed' };
  }
});

ipcMain.handle('bp-identity-reset', async () => {
  try {
    const res = await fetch('http://127.0.0.1:4765/v1/identity/reset', { method: 'POST' });
    return await res.json();
  } catch (e:any) {
    return { error: e?.message || 'identity reset failed' };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    resizable: false,
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false // Don't show the window initially
  });

  // Diagnostics for blank-screen issues
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('did-fail-load:', code, desc);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('render-process-gone:', details);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('renderer did-finish-load');
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.on('close', (event) => {
    if (app.quitting) {
      mainWindow = null;
      return;
    }
    // In development, closing the window should fully quit to avoid lingering processes
    if (isDev) {
      event.preventDefault();
      app.quitting = true;
      app.quit();
      return;
    }
    // In production, default to tray-minimize behavior
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      try { mainWindow?.webContents.openDevTools({ mode: 'detach' }); } catch {}
    }
  });
}

function createTray() {
  const devIconPath = path.join(process.cwd(), 'src', 'assets', 'icon.png');
  const prodIconPath = path.join(process.resourcesPath || process.cwd(), 'assets', 'icon.png');
  const iconPath = isDev ? devIconPath : prodIconPath;

  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn('Tray icon missing or failed to load at', iconPath);
    icon = nativeImage.createEmpty();
  }
  try {
    tray = new Tray(icon);
  } catch (e) {
    console.error('Failed to create Tray:', e);
    tray = null;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Start on Boot',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Bulletproof VPN');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

app.on('ready', async () => {
  // Start backend in the background and give it a moment to become healthy
  console.log('Starting backend…');
  startBackend();
  waitForHealth(5000).then(() => console.log('Backend healthy')).catch(() => console.warn('Backend health check timed out'));

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS it's common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => { cleanup(); });
app.on('will-quit', () => { cleanup(); });

// When running via a dev server, ensure we also clean up on signals
process.on('SIGINT', () => { app.quitting = true; cleanup(); app.quit(); });
process.on('SIGTERM', () => { app.quitting = true; cleanup(); app.quit(); });
process.on('exit', () => { cleanup(); });
