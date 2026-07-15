const { app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// ==========================================
// НАСТРОЙКИ ДЛЯ СТАБИЛЬНОСТИ И ПРОИЗВОДИТЕЛЬНОСТИ
// ==========================================
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('ignore-certificate-errors');

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
});

let mainWindow = null;
let tray = null;
let isQuiting = false;

// Путь к иконке для трея
const ICON_PATH = path.join(__dirname, 'src', 'assets', 'images', 'icon.ico');
// Путь к звуку уведомления (передаётся в рендер)
const SOUND_PATH = path.join(__dirname, 'src', 'assets', 'sounds', 'notification.mp3');

// ==========================================
// СОЗДАНИЕ ГЛАВНОГО ОКНА
// ==========================================
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
      backgroundThrottling: false
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

  // ==========================================
  // ПОВЕДЕНИЕ ПРИ ЗАКРЫТИИ ОКНА (СВЁРТЫВАНИЕ В ТРЕЙ)
  // ==========================================
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide(); // прячем в трей
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Создаём трей после того, как окно готово
  createTray();
}

// ==========================================
// СОЗДАНИЕ ТРЕЯ
// ==========================================
function createTray() {
  let trayIcon;
  if (fs.existsSync(ICON_PATH)) {
    trayIcon = nativeImage.createFromPath(ICON_PATH);
  } else {
    // Если иконки нет — используем стандартную (можно создать фолбэк)
    trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать SyncLine',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Выйти',
      click: () => {
        isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('SyncLine');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// ==========================================
// IPC ОБРАБОТЧИКИ
// ==========================================

// Управление окном
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
  if (mainWindow) mainWindow.hide(); // вместо close — hide
});

// Выбор файлов (для аватарки, файлов и т.д.)
ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Выберите файлы для отправки в SyncLine'
  });
  return result.filePaths;
});

// ==========================================
// УВЕДОМЛЕНИЯ И ЗВУК
// ==========================================

// Отправка уведомления из рендера
ipcMain.handle('send-notification', (event, { title, body, silent = false }) => {
  // Если окно активно и в фокусе — не показываем уведомление, только звук
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
    if (!silent) playNotificationSound();
    return;
  }

  // Показываем нативное уведомление
  const notification = new Notification({
    title: title || 'SyncLine',
    body: body || 'Новое сообщение',
    icon: ICON_PATH,
    silent: silent,
    sound: silent ? null : 'default' // звук будет отдельно
  });

  notification.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();

  // Воспроизводим звук (если не silent)
  if (!silent) playNotificationSound();
});

// Воспроизведение звука из рендера
ipcMain.handle('play-sound', () => {
  playNotificationSound();
});

// Функция воспроизведения звука (передаём сигнал в рендер)
function playNotificationSound() {
  if (mainWindow) {
    mainWindow.webContents.send('play-notification-sound');
  }
}

// ==========================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Не выходим, пока приложение не закрыто через трей
  // Вместо этого остаёмся в фоне
  // (но на macOS обычно выход при закрытии всех окон)
  if (process.platform === 'darwin') {
    app.quit();
  }
});

// При выходе из приложения (через трей или quit)
app.on('before-quit', () => {
  isQuiting = true;
});