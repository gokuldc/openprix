const { contextBridge, ipcRenderer } = require('electron');

// 🔥 Changed from 'api' to 'electronHost' to avoid namespace collisions
contextBridge.exposeInMainWorld('electronHost', {
    os: {
        pickFile: () => ipcRenderer.invoke('os:pick-file'),
        openFile: (filePath) => ipcRenderer.invoke('os:open-file', filePath),
        getBase64: (filePath) => ipcRenderer.invoke('os:get-base64', filePath),
        pickDirectory: () => ipcRenderer.invoke('os:pick-directory')
    },
    system: {
        connectToServer: (url) => ipcRenderer.send('connect-to-server', url)
    }
});