import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      saveInvoicePDF: (
        htmlContent: string,
        filename: string
      ) => Promise<{ success: boolean; filePath?: string; reason?: string }>
    }
  }
}
