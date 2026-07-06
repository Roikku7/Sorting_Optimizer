const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
  selectJsonFile: () => ipcRenderer.invoke("select-json-file"),
  runAnalysis: (filePath) => ipcRenderer.invoke("run-analysis", filePath),
  loadSortedRunes: () => ipcRenderer.invoke("load-sorted-runes"),
  getIconPath: (name) => ipcRenderer.invoke("get-icon-path", name)
});
