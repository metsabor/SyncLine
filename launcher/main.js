const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');

// ==========================================
// НАСТРОЙКИ ДЛЯ СТАБИЛЬНОСТИ И ПРОИЗВОДИТЕЛЬНОСТИ
// ==========================================

// Отключаем только кэш GPU, но не само ускорение
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('ignore-certificate-errors');

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
});

let mainWindow;

function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: Math.min(1100, width),
    height: Math.min(720, height),
    minWidth: 850,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false // не тормозим в фоне
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))
    .then(() => console.log('✅ Страница загружена'))
    .catch(err => console.error('❌ Ошибка загрузки index.html:', err));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2000);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('❌ Ошибка загрузки страницы:', errorDescription, 'код:', errorCode);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC ОБРАБОТЧИКИ
// ==========================================

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Выберите файлы для отправки в SyncLine'
  });
  return result.filePaths;
});