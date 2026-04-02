import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: object) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options?: object) => ipcRenderer.invoke('dialog:openDirectory', options),
  getPythonPort: () => ipcRenderer.invoke('python:getPort')
})
