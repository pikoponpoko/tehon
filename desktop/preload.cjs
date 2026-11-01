const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tehonDesktop", {
  checkUpdate: () => ipcRenderer.invoke("tehon:check-update"),
});
