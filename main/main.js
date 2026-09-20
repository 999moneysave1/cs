const path = require('path')
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Stealth mode (Zoom, Teams, Google Meet स्क्रीन शेयर में नहीं दिखेगा)
  mainWindow.setContentProtection(true)

  const port = process.argv[2] || 8888
  mainWindow.loadURL(`http://localhost:${port}/home`)

  // 1. IPC Handler (फ्रंटएंड से मूवमेंट कमांड के लिए)
  ipcMain.on('move-window', (event, { dx, dy }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      mainWindow.setPosition(x + dx, y + dy)
    }
  })

  // 2. Global Shortcuts: बिना ऐप पर फोकस किए भी Alt + Arrow से स्मूथ मूवमेंट
  const moveStep = 30 // हर बार 30px खिसकेगा

  globalShortcut.register('Alt+Up', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      mainWindow.setPosition(x, y - moveStep)
    }
  })

  globalShortcut.register('Alt+Down', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      mainWindow.setPosition(x, y + moveStep)
    }
  })

  globalShortcut.register('Alt+Left', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      mainWindow.setPosition(x - moveStep, y)
    }
  })

  globalShortcut.register('Alt+Right', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      mainWindow.setPosition(x + moveStep, y)
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})