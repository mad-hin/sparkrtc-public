import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { PythonBridge } from './python-bridge'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SparkRTC Testbed',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // In dev, load from vite dev server; in prod, load built HTML
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers for native operations
ipcMain.handle('dialog:openFile', async (_event, options) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openDirectory', async (_event, options) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    ...options,
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('python:getPort', () => {
  return pythonBridge?.getPort() ?? null
})

app.whenReady().then(async () => {
  // Start Python backend
  pythonBridge = new PythonBridge()
  try {
    await pythonBridge.start()
    console.log(`Python backend started on port ${pythonBridge.getPort()}`)
  } catch (err) {
    console.error('Failed to start Python backend:', err)
  }

  createWindow()
})

app.on('window-all-closed', () => {
  pythonBridge?.stop()
  app.quit()
})

app.on('before-quit', () => {
  pythonBridge?.stop()
})
