const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  getSources: () => ipcRenderer.invoke('picker:get-sources'),
  select: (id) => ipcRenderer.send('picker:selected', id),
  cancel: () => ipcRenderer.send('picker:cancelled'),
});
