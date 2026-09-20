import { BrowserWindow } from 'electron'
import path from 'path'

export const createWindow = (windowName: string, options: any): BrowserWindow => {
  const win = new BrowserWindow({
    width: 460,
    height: 640,
    frame: false,             // Frameless window
    transparent: true,        // Background transparent
    alwaysOnTop: true,        // Screen par hamesha upar rahegi
    skipTaskbar: true,        // Taskbar me show nahi hogi
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    ...options,
  })

  // Stealth Protection: Zoom/Meet screen sharing se window ko hide rakhega
  win.setContentProtection(true)

  return win
}

export default createWindow