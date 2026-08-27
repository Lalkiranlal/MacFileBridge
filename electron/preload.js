const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop integration APIs to the renderer window
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  showItemInFolder: (fullPath) => ipcRenderer.send('show-item-in-folder', fullPath),
  openExternalUrl: (url) => ipcRenderer.send('open-external-url', url),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
});
