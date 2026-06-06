import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose a typed ipcRenderer to the renderer process
const api = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
    send: (channel: string, ...args: unknown[]) =>
      ipcRenderer.send(channel, ...args),
    on: (channel: string, callback: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => callback(...args)),
    removeAllListeners: (channel: string) =>
      ipcRenderer.removeAllListeners(channel),
  },
}

const customElectronAPI = {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  saveInvoicePDF: (htmlContent: string, filename: string) =>
    ipcRenderer.invoke('save-invoice-pdf', { htmlContent, filename })
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', customElectronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.electronAPI = customElectronAPI
}