const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
  selectJsonFile: () => ipcRenderer.invoke("select-json-file"),
  runAnalysis: (filePath) => ipcRenderer.invoke("run-analysis", filePath),
  getIconPath: (name) => ipcRenderer.invoke("get-icon-path", name),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings)
});
