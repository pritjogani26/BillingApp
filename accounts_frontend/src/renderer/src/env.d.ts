/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    minimize: () => void
    maximize: () => void
    close: () => void
    saveInvoicePDF?: (
      htmlContent: string,
      filename: string
    ) => Promise<{ success: boolean; filePath?: string; reason?: string }>
    selectBackupSavePath?: (
      filename: string
    ) => Promise<{ canceled: boolean; filePath?: string }>
    saveBackupFile?: (
      filePath: string,
      fileData: ArrayBuffer
    ) => Promise<{ success: boolean; reason?: string }>
    openFileLocation?: (
      filePath: string
    ) => Promise<{ success: boolean; reason?: string }>
  }
  electron?: {
    process: {
      versions: {
        electron: string
        chrome: string
        node: string
      }
    }
  }
}
