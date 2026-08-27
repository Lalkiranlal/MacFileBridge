const { app, BrowserWindow, shell, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let tray = null;
let serverInstance = null;
const SERVER_PORT = 54321;

// Register custom protocol scheme (e.g. macfilebridge://open)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('macfilebridge', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('macfilebridge');
}

function startBackendServer() {
  try {
    const backend = require('../server/server.js');
    serverInstance = backend.server;
  } catch (err) {
    console.error('Error starting in-process backend server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    title: 'MacFileBridge PRO',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#F6F8F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // Load the studio URL from local Express server
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`).catch(() => {
    // Fallback directly to local file if server is still spinning up
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    }, 800);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// macOS Custom Protocol Handler (macfilebridge://)
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Lifecycle
app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    try { serverInstance.close(); } catch (e) {}
  }
});

// IPC Handlers
ipcMain.on('show-item-in-folder', (event, fullPath) => {
  shell.showItemInFolder(fullPath);
});

ipcMain.on('open-external-url', (event, url) => {
  shell.openExternal(url);
});
