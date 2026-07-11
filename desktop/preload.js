const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  platform: process.platform,

  // Token persistence — saves to native electron-store so it survives app restarts
  saveToken: (token) => ipcRenderer.send('token:save', token),
  clearToken: () => ipcRenderer.send('token:clear'),
  onRestoreToken: (callback) => ipcRenderer.once('token:restore', (_, token) => callback(token)),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  version: require('./package.json').version,
});
