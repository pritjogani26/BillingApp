import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, unlink } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// ── Keep a reference so IPC handlers can access it ──────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 650,
    frame: false,
    backgroundColor: '#F1F5F9',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('http:') || details.url.startsWith('https:')) {
      shell.openExternal(details.url)
      return { action: 'deny' }
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false
        }
      }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()   // ← register ONCE here, not inside createWindow()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers (registered once at app startup) ────────────────────────────
function registerIpcHandlers(): void {

  // Window controls
  ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
  })

  // ── PDF Download via printToPDF ──────────────────────────────────────────
  // Renderer calls: window.electronAPI.saveInvoicePDF(htmlContent, filename)
  // Flow:
  //   1. Show Save dialog
  //   2. Open hidden BrowserWindow, load HTML as data URL
  //   3. printToPDF → write bytes to disk
  //   4. Open saved file with default PDF viewer
  ipcMain.handle('save-invoice-pdf', async (_event, { htmlContent, filename }) => {

    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null

    // 1. Ask user where to save
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Save Invoice PDF',
      defaultPath: join(app.getPath('downloads'), filename),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })

    if (canceled || !filePath) {
      return { success: false, reason: 'cancelled' }
    }

    // 2. Create a hidden off-screen window to render the HTML
    const pdfWin = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        contextIsolation: true,
        sandbox: false
      }
    })

    const tempFilePath = join(app.getPath('temp'), `invoice_${Date.now()}.html`)

    try {
      // 3. Write HTML to temporary file
      await new Promise<void>((resolve, reject) => {
        writeFile(tempFilePath, htmlContent, { encoding: 'utf8' }, (err) => (err ? reject(err) : resolve()))
      })

      // 4. Load the temp HTML file
      await pdfWin.loadFile(tempFilePath)

      // 5. Settle delay — lets Courier New and background fills render
      await new Promise((resolve) => setTimeout(resolve, 600))

      // 6. Generate PDF bytes
      const pdfData = await pdfWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,   // required for #e8e8e8 gstin strip, #d0d0d0 headers
        margins: {
          marginType: 'custom',
          top: 0.4,              // inches (≈ 10mm)
          bottom: 0.4,
          left: 0.4,
          right: 0.4
        }
      })

      // 7. Write to disk
      await new Promise<void>((resolve, reject) => {
        writeFile(filePath, pdfData, (err) => (err ? reject(err) : resolve()))
      })

      // 8. Open in default PDF viewer
      shell.openPath(filePath)

      return { success: true, filePath }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, reason: message }
    } finally {
      pdfWin.destroy()
      // Clean up temporary HTML file
      unlink(tempFilePath, (err) => {
        if (err) {
          console.error('Failed to delete temp HTML print file:', err)
        }
      })
    }
  })
}