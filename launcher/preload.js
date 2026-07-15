/**
 * SyncLine — Preload Script (Мост между рендером и основным процессом)
 * Версия: 3.5 — Дивергентный апгрейд
 */

const { contextBridge, ipcRenderer } = require('electron');

// ==========================================
// МОСТ ДЛЯ РЕНДЕР-ПРОЦЕССА
// ==========================================
contextBridge.exposeInMainWorld('electronAPI', {
  // ---- Управление окном ----
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // ---- Выбор файлов (для аватарки, вложений и т.д.) ----
  selectFiles: () => ipcRenderer.invoke('dialog-open-file'),

  // ---- Уведомления и звук ----
  sendNotification: (title, body, silent = false) => {
    ipcRenderer.invoke('send-notification', { title, body, silent });
  },
  playSound: () => ipcRenderer.invoke('play-sound'),

  // ---- Подписка на события из основного процесса ----
  onPlayNotificationSound: (callback) => {
    ipcRenderer.on('play-notification-sound', callback);
  },

  // ---- Выход из приложения (опционально) ----
  quitApp: () => ipcRenderer.send('quit-app'),
});

// ==========================================
// ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ
// ==========================================
console.log('✅ Preload: мост успешно инициализирован');