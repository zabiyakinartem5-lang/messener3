const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('messengerDesktop', {
  saveServer: (url) => ipcRenderer.invoke('messenger:save-server', url),
  currentServer: () => ipcRenderer.invoke('messenger:current-server')
});
