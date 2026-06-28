import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI & {
      ipcRenderer: {
        invoke(channel: string, ...args: unknown[]): Promise<unknown>
        send(channel: string, ...args: unknown[]): void
        on(channel: string, callback: (...args: unknown[]) => void): void
        removeAllListeners(channel: string): void
      }
    }
    api: {
      ipcRenderer: {
        invoke(channel: string, ...args: unknown[]): Promise<unknown>
        send(channel: string, ...args: unknown[]): void
        on(channel: string, callback: (...args: unknown[]) => void): void
        removeAllListeners(channel: string): void
      }
    }
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      saveInvoicePDF: (
        htmlContent: string,
        filename: string
      ) => Promise<{ success: boolean; filePath?: string; reason?: string }>
      selectBackupSavePath: (
        filename: string
      ) => Promise<{ canceled: boolean; filePath?: string }>
      saveBackupFile: (
        filePath: string,
        fileData: ArrayBuffer
      ) => Promise<{ success: boolean; reason?: string }>
      openFileLocation: (
        filePath: string
      ) => Promise<{ success: boolean; reason?: string }>
    }
  }
}