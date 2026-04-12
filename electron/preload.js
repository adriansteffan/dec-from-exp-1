import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  directoryExists: (path) => ipcRenderer.invoke('directory-exists', { path }),
  createDirectory: (path) => ipcRenderer.invoke('create-directory', { path }),
  saveFile: (filename, data, directory) => ipcRenderer.invoke('save-file', { filename, data, directory }),
  readFile: (filename) => ipcRenderer.invoke('read-file', { filename }),
  listFiles: () => ipcRenderer.invoke('list-files'),
});
