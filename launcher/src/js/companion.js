/**
 * SyncLine — Companion Manager (Чаты, Музыка, Бот-уведомитель)
 * Версия: 3.5 — Дивергентный апгрейд
 */

class CompanionManager {
  constructor() {
    this.activeChat = null;
    this.contextTargetId = null;
    this.actionState = { type: null, msgId: null };
    this.chatToDelete = null;
    this.blockedUsers = [];
    this.verifiedUsers = [];
    this.isInitialized = false; // защита от двойной инициализации

    if (window.settingsManager) {
      this.blockedUsers = window.settingsManager.settings.blockedUsers || [];
      this.verifiedUsers = window.settingsManager.settings.verifiedUsers || [];
    }

    // ===== СИСТЕМНЫЕ ЧАТЫ =====
    this.systemChats = [
      {
        id: 'bot',
        username: 'SyncLine Bot',
        name: 'SyncLine Bot',
        status: '🤖 Системный',
        isSaved: true,
        messages: [
          {
            id: 1,
            text: 'Я буду уведомлять вас о попытках входа в аккаунт. Если это не вы — игнорируйте.',
            type: 'incoming',
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          }
        ],
        pinned: false,
        notificationsMuted: false,
        avatar: null,
        bio: 'Официальный бот SyncLine',
        lastSeen: Date.now()
      },
      {
        id: 'saved',
        username: 'Избранное',
        name: 'Избранное',
        status: '📁 Хранилище',
        isSaved: true,
        messages: [],
        pinned: false,
        notificationsMuted: false,
        avatar: null,
        bio: '',
        lastSeen: Date.now()
      }
    ];

    this.userChats = [];
    this.loadChatsFromStorage();
    this.chats = [...this.systemChats, ...this.userChats];

    // ===== МУЗЫКА (ДЕМО-ТРЕКИ ИЗ ИНТЕРНЕТА) =====
    this.playlist = [
      { title: 'Chill Vibes', artist: 'SyncLine Radio', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      { title: 'Electronic Dream', artist: 'SyncLine Radio', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
      { title: 'Lo-Fi Study', artist: 'SyncLine Radio', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }
    ];
    this.currentTrackIndex = 0;
    this.audio = new Audio();
    this.isPlaying = false;

    // ===== ИНИЦИАЛИЗАЦИЯ (ТОЛЬКО ОДИН РАЗ) =====
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.initEvents();
      this.initAudioPlayer();
      this.startPresenceSimulation();
      this.renderChatList();
      this.loadPlaylist();
    }
  }

  // ==========================================
  // ЗАГРУЗКА ЧАТОВ
  // ==========================================
  loadChatsFromStorage() {
    const saved = localStorage.getItem('syncline_chats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const systemIds = ['bot', 'saved'];
        this.userChats = parsed.filter(c => !systemIds.includes(c.id));
      } catch(e) {
        this.userChats = [];
      }
    } else {
      this.userChats = [];
    }
  }

  saveChatsToStorage() {
    const systemIds = ['bot', 'saved'];
    const toSave = this.chats.filter(c => !systemIds.includes(c.id));
    localStorage.setItem('syncline_chats', JSON.stringify(toSave));
  }

  // ==========================================
  // МУЗЫКАЛЬНЫЙ ПЛЕЕР (РАБОЧИЙ)
  // ==========================================
  loadPlaylist() {
    // Загружаем сохранённый плейлист из localStorage (если есть)
    const saved = localStorage.getItem('syncline_playlist');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          this.playlist = parsed;
        }
      } catch(e) {}
    }
    if (this.playlist.length > 0) {
      this.updatePlayerUI(this.playlist[0]);
    }
  }

  savePlaylist() {
    localStorage.setItem('syncline_playlist', JSON.stringify(this.playlist));
  }

  initAudioPlayer() {
    // Кнопка загрузки своих MP3
    const fileInput = document.getElementById('music-file-input');
    const loadBtn = document.getElementById('btn-load-music');
    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        files.forEach(file => {
          const url = URL.createObjectURL(file);
          this.playlist.push({
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Локальный файл',
            url: url
          });
        });
        this.savePlaylist();
        showCustomToast(`Добавлено треков: ${files.length}`, 'success');
        if (!this.audio.src) {
          this.playTrack(this.playlist.length - files.length);
        }
        fileInput.value = '';
      });
    }

    // Кнопки управления
    const playBtn = document.getElementById('btn-play-pause');
    const nextBtn = document.getElementById('btn-next-track');
    const prevBtn = document.getElementById('btn-prev-track');

    if (playBtn) {
      // Убираем старые обработчики, чтобы не дублировалось
      const newPlayBtn = playBtn.cloneNode(true);
      playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
      newPlayBtn.addEventListener('click', () => this.togglePlay());
    }

    if (nextBtn) {
      const newNextBtn = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
      newNextBtn.addEventListener('click', () => this.nextTrack());
    }

    if (prevBtn) {
      const newPrevBtn = prevBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
      newPrevBtn.addEventListener('click', () => this.prevTrack());
    }

    // Прогресс-бар
    const progressBar = document.getElementById('player-progress-container');
    if (progressBar) {
      const newProgressBar = progressBar.cloneNode(true);
      progressBar.parentNode.replaceChild(newProgressBar, progressBar);
      newProgressBar.addEventListener('click', (e) => {
        if (!this.audio.duration) return;
        const rect = newProgressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = percent * this.audio.duration;
      });
    }

    // События аудио
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    this.audio.addEventListener('ended', () => this.nextTrack());
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayPauseIcon(true);
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayPauseIcon(false);
    });
  }

  playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentTrackIndex = index;
    const track = this.playlist[index];
    this.audio.src = track.url;
    this.audio.play().catch(() => {
      showCustomToast('⚠️ Не удалось воспроизвести трек. Проверьте интернет.', 'error');
    });
    this.updatePlayerUI(track);
  }

  togglePlay() {
    if (this.playlist.length === 0) {
      showCustomToast('Нет треков. Загрузите музыку или используйте демо.', 'warning');
      return;
    }
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  nextTrack() {
    if (this.playlist.length === 0) return;
    const next = (this.currentTrackIndex + 1) % this.playlist.length;
    this.playTrack(next);
  }

  prevTrack() {
    if (this.playlist.length === 0) return;
    const prev = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
    this.playTrack(prev);
  }

  updateProgress() {
    const progress = document.querySelector('.player-progress-fill');
    const currentTimeEl = document.getElementById('player-current-time');
    if (progress && this.audio.duration) {
      const percent = (this.audio.currentTime / this.audio.duration) * 100;
      progress.style.width = percent + '%';
    }
    if (currentTimeEl) {
      currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }
  }

  updateDuration() {
    const durationEl = document.getElementById('player-total-duration');
    if (durationEl && this.audio.duration) {
      durationEl.textContent = this.formatTime(this.audio.duration);
    }
  }

  updatePlayerUI(track) {
    const title = document.getElementById('player-track-title');
    const artist = document.getElementById('player-track-artist');
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = track.artist;
    document.querySelector('.player-progress-fill').style.width = '0%';
    document.getElementById('player-current-time').textContent = '0:00';
    this.updateDuration();
  }

  updatePlayPauseIcon(playing) {
    const icon = document.querySelector('.player-btn.play-pause i');
    if (icon) {
      icon.className = playing ? 'fa-solid fa-circle-pause' : 'fa-solid fa-circle-play';
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  // ==========================================
  // ОТПРАВКА КОДА ПРИ ВХОДЕ (БОТ-УВЕДОМИТЕЛЬ)
  // ==========================================
  sendLoginCode(email) {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const botChat = this.chats.find(c => c.id === 'bot');
    if (botChat) {
      const msg = `🔐 Попытка входа в аккаунт ${email}\nВаш код подтверждения: **${code}**\nЕсли это не вы — игнорируйте.`;
      botChat.messages.push({
        id: Date.now(),
        text: msg,
        type: 'incoming',
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      this.saveChatsToStorage();
      this.renderMessages();
      this.renderChatList();
      // Также показываем тост
      showCustomToast(`Код отправлен в чат с ботом: ${code}`, 'info');
    }
  }

  // ==========================================
  // ОТПРАВКА СООБЩЕНИЙ И ФАЙЛОВ
  // ==========================================
  sendMessage() {
    const input = document.getElementById('input-message');
    const text = input.value.trim();
    if (!text || !this.activeChat) return;

    const newMsg = {
      id: Date.now(),
      text: text,
      type: 'outgoing',
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };

    if (this.actionState.type === 'reply' && this.actionState.msgId) {
      const repliedMsg = this.activeChat.messages.find(m => m.id === this.actionState.msgId);
      if (repliedMsg) {
        newMsg.replyText = repliedMsg.text || repliedMsg.fileName || 'Файл';
      }
      this.clearAction();
    }

    if (this.actionState.type === 'edit' && this.actionState.msgId) {
      const editMsg = this.activeChat.messages.find(m => m.id === this.actionState.msgId);
      if (editMsg && editMsg.type === 'outgoing') {
        editMsg.text = text;
        showCustomToast('✏️ Сообщение изменено', 'success');
        this.clearAction();
        this.renderMessages();
        this.saveChatsToStorage();
        input.value = '';
        return;
      } else {
        showCustomToast('Нельзя редактировать чужие сообщения', 'error');
        this.clearAction();
        return;
      }
    }

    this.activeChat.messages.push(newMsg);
    input.value = '';
    this.renderMessages();
    this.renderChatList();
    this.saveChatsToStorage();
  }

  sendFileMessage(filePath, comment = '', isOneTime = false) {
    if (!this.activeChat) return;
    const fileName = filePath.split('\\').pop().split('/').pop();

    const newMsg = {
      id: Date.now(),
      text: comment || `Файл: ${fileName}`,
      type: 'file',
      fileName: fileName,
      path: filePath,
      isOneTime: isOneTime,
      isBurned: false,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };

    this.activeChat.messages.push(newMsg);
    this.renderMessages();
    this.saveChatsToStorage();
    showCustomToast(`📎 Файл "${fileName}" отправлен${isOneTime ? ' (одноразовый)' : ''}`, 'success');
  }

  viewOneTime(msgId) {
    const msg = this.activeChat?.messages.find(m => m.id === msgId);
    if (!msg || msg.isBurned || !msg.isOneTime) return;
    showCustomToast(`👁️ Просмотр одноразового файла: ${msg.fileName}`, 'info');
    msg.isBurned = true;
    this.saveChatsToStorage();
    this.renderMessages();
  }

  // ==========================================
  // ОТРИСОВКА СООБЩЕНИЙ
  // ==========================================
  renderMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px; margin: 10px 0;">Защищенное соединение</div>`;

    if (this.activeChat && this.activeChat.messages) {
      this.activeChat.messages.forEach(msgData => this.appendMessageToDOM(msgData));
    }
    container.scrollTop = container.scrollHeight;
  }

  appendMessageToDOM(msgData) {
    const container = document.getElementById('messages-container');
    const msg = document.createElement('div');
    msg.className = `message-bubble ${msgData.type === 'incoming' ? 'incoming' : 'outgoing'}`;
    msg.dataset.id = msgData.id;

    if (msgData.isSystemDeleted) {
      msg.className = 'message-bubble system deleted';
      msg.innerHTML = `<span class="deleted-text"><i class="fa-solid fa-trash-can"></i> Сообщение удалено</span>`;
      container.appendChild(msg);
      return;
    }

    let contentHtml = '';

    if (msgData.replyText) {
      contentHtml += `<div class="msg-reply-box"><i class="fa-solid fa-reply"></i> ${msgData.replyText}</div>`;
    }

    if (msgData.isOneTime) {
      if (msgData.isBurned) {
        contentHtml += `<div class="burned-media"><i class="fa-solid fa-fire-extinguisher"></i> Файл удалён (одноразовый просмотр)</div>`;
      } else {
        contentHtml += `<button class="one-time-media-btn" onclick="window.companionManager.viewOneTime(${msgData.id})"><i class="fa-solid fa-fire"></i> Открыть файл</button>`;
      }
    } else if (msgData.type === 'file' || msgData.type === 'image' || msgData.type === 'video') {
      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(msgData.fileName);
      const isVideo = /\.(mp4|webm|avi|mov|mkv)$/i.test(msgData.fileName);
      let mediaHtml = '';
      if (isImage) {
        mediaHtml = `<div class="file-thumbnail" onclick="window.companionManager.openMedia('${msgData.path}','image')"><i class="fa-solid fa-image"></i> ${msgData.fileName}</div>`;
      } else if (isVideo) {
        mediaHtml = `<div class="file-thumbnail" onclick="window.companionManager.openMedia('${msgData.path}','video')"><i class="fa-solid fa-video"></i> ${msgData.fileName}</div>`;
      } else {
        mediaHtml = `<div class="file-attachment"><i class="fa-solid fa-file"></i><div class="file-info"><span class="file-name">${msgData.fileName}</span><span class="file-size">Файл</span></div></div>`;
      }
      contentHtml += mediaHtml;
    } else {
      contentHtml += `<div>${msgData.text}</div>`;
    }

    msg.innerHTML = `${contentHtml}<div class="msg-meta"><span>${msgData.time}</span> <span class="msg-ticks"><i class="fa-solid fa-check-double"></i></span></div>`;

    if (msgData.reactions && Object.keys(msgData.reactions).length > 0) {
      const reactionsHtml = Object.entries(msgData.reactions)
        .map(([emoji, count]) => `<span class="reaction-badge" data-msg="${msgData.id}" data-emoji="${emoji}">${emoji} ${count}</span>`)
        .join('');
      msg.innerHTML += `<div class="reactions-container">${reactionsHtml}</div>`;
    }

    msg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.contextTargetId = msgData.id;
      const menu = document.getElementById('message-context-menu');
      const isFile = (msgData.type === 'file' || msgData.type === 'image' || msgData.type === 'video' || msgData.isOneTime);
      const isOutgoing = (msgData.type === 'outgoing');

      document.getElementById('ctx-download').style.display = isFile ? 'flex' : 'none';
      document.getElementById('ctx-edit').style.display = isOutgoing ? 'flex' : 'none';
      document.getElementById('ctx-delete').style.display = isOutgoing ? 'flex' : 'none';

      const menuWidth = 180;
      const menuHeight = 200;
      const maxX = window.innerWidth - menuWidth;
      const maxY = window.innerHeight - menuHeight;
      menu.style.display = 'flex';
      menu.style.left = Math.min(e.pageX, maxX) + 'px';
      menu.style.top = Math.min(e.pageY, maxY) + 'px';
    });

    container.appendChild(msg);
  }

  openMedia(path, type) {
    const modal = document.getElementById('modal-media');
    const img = document.getElementById('media-image-view');
    const video = document.getElementById('media-video-view');
    const placeholder = document.getElementById('media-placeholder');

    img.style.display = 'none';
    video.style.display = 'none';
    placeholder.style.display = 'none';

    if (type === 'image') {
      img.src = path;
      img.style.display = 'block';
    } else if (type === 'video') {
      video.src = path;
      video.style.display = 'block';
    } else {
      placeholder.style.display = 'block';
    }

    modal.style.display = 'flex';
  }

  // ==========================================
  // РЕАКЦИИ
  // ==========================================
  addReaction(msgId, emoji) {
    const msg = this.activeChat?.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = 0;
    msg.reactions[emoji]++;
    this.saveChatsToStorage();
    this.renderMessages();
  }

  // ==========================================
  // КОНТЕКСТНЫЕ ДЕЙСТВИЯ
  // ==========================================
  setupAction(type) {
    const msgData = this.activeChat?.messages.find(m => m.id === this.contextTargetId);
    if (!msgData) return;

    if (type === 'edit' && msgData.type !== 'outgoing') {
      showCustomToast('Нельзя редактировать чужие сообщения', 'error');
      return;
    }

    this.actionState = { type: type, msgId: msgData.id };
    const area = document.getElementById('action-preview-area');
    area.style.display = 'flex';
    document.getElementById('action-text').textContent = msgData.text || msgData.fileName || 'Файл';

    if (type === 'edit') {
      document.getElementById('action-icon').className = 'fa-solid fa-pen';
      document.getElementById('action-title').textContent = 'Изменение';
      document.getElementById('input-message').value = msgData.text || '';
    } else if (type === 'reply') {
      document.getElementById('action-icon').className = 'fa-solid fa-reply';
      document.getElementById('action-title').textContent = 'Ответ';
      document.getElementById('input-message').value = '';
    }

    document.getElementById('message-context-menu').style.display = 'none';
    document.getElementById('input-message').focus();
  }

  clearAction() {
    this.actionState = { type: null, msgId: null };
    document.getElementById('action-preview-area').style.display = 'none';
    document.getElementById('input-message').value = '';
  }

  pinMessage() {
    const msgData = this.activeChat?.messages.find(m => m.id === this.contextTargetId);
    if (msgData) {
      this.activeChat.pinnedMsg = msgData;
      document.getElementById('pinned-message-area').style.display = 'flex';
      document.getElementById('pinned-message-text').textContent = msgData.text || msgData.fileName || 'Файл';
      showCustomToast('📌 Сообщение закреплено', 'success');
      this.saveChatsToStorage();
    }
    document.getElementById('message-context-menu').style.display = 'none';
  }

  deleteMessageAtAll() {
    const msgData = this.activeChat?.messages.find(m => m.id === this.contextTargetId);
    if (msgData && msgData.type === 'outgoing') {
      msgData.isSystemDeleted = true;
      this.saveChatsToStorage();
      this.renderMessages();
      showCustomToast('🗑️ Сообщение удалено', 'warning');
    } else {
      showCustomToast('Нельзя удалить это сообщение', 'error');
    }
    document.getElementById('message-context-menu').style.display = 'none';
  }

  // ==========================================
  // УПРАВЛЕНИЕ ЧАТАМИ
  // ==========================================
  renderChatList(filter = '') {
    const container = document.getElementById('chat-list-container');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...this.chats].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

    const visible = sorted.filter(c => {
      if (c.isSaved) return true;
      return !this.blockedUsers.includes(c.username);
    });

    const filtered = visible.filter(c => c.username.toLowerCase().includes(filter.toLowerCase()));

    if (filtered.length === 0 && filter) {
      const notFound = document.createElement('div');
      notFound.className = 'glass-panel';
      notFound.style.padding = '12px';
      notFound.style.textAlign = 'center';
      notFound.style.color = 'var(--text-muted)';
      notFound.innerHTML = `<i class="fa-solid fa-user-slash"></i> Пользователь "${filter}" не найден`;
      container.appendChild(notFound);
      return;
    }

    filtered.forEach(chat => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chat-item-wrapper';
      wrapper.dataset.chatId = chat.id;

      const item = document.createElement('div');
      item.className = `chat-item ${this.activeChat?.id === chat.id ? 'active' : ''}`;

      const isBlocked = this.blockedUsers.includes(chat.username);
      const isVerified = this.verifiedUsers.includes(chat.username);
      const ava = chat.isSaved ? (chat.id === 'bot' ? '🤖' : '<i class="fa-solid fa-bookmark"></i>') : chat.name[0];
      let statusBadge = '';
      if (chat.pinned) statusBadge += '📌 ';
      if (chat.notificationsMuted) statusBadge += '🔕 ';

      item.innerHTML = `
        <div class="user-avatar" style="width:38px; height:38px; background: ${isBlocked ? 'var(--color-error)' : 'var(--gradient-purple)'}; display:flex; align-items:center; justify-content:center; color:white;">${ava}</div>
        <div class="chat-item-details">
          <div class="chat-item-name">${chat.username} ${isVerified ? '✅' : ''} ${statusBadge}</div>
          <div class="chat-item-lastmsg">${isBlocked ? '🔒 Заблокирован' : 'Нажмите, чтобы открыть'}</div>
        </div>
      `;

      item.addEventListener('click', () => this.selectChat(chat));

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.contextChat = chat;
        const menu = document.getElementById('chat-context-menu');
        document.getElementById('ctx-chat-pin').innerHTML = chat.pinned ? '<i class="fa-solid fa-thumbtack"></i> Открепить' : '<i class="fa-solid fa-thumbtack"></i> Закрепить';
        document.getElementById('ctx-chat-mute').innerHTML = chat.notificationsMuted ? '<i class="fa-solid fa-bell-slash"></i> Включить уведомления' : '<i class="fa-solid fa-bell"></i> Отключить уведомления';
        if (chat.isSaved || chat.id === 'bot') {
          document.getElementById('ctx-chat-pin').style.display = 'none';
          document.getElementById('ctx-chat-mute').style.display = 'none';
        } else {
          document.getElementById('ctx-chat-pin').style.display = 'flex';
          document.getElementById('ctx-chat-mute').style.display = 'flex';
        }
        const menuWidth = 180;
        const menuHeight = 120;
        const maxX = window.innerWidth - menuWidth;
        const maxY = window.innerHeight - menuHeight;
        menu.style.display = 'flex';
        menu.style.left = Math.min(e.clientX, maxX) + 'px';
        menu.style.top = Math.min(e.clientY, maxY) + 'px';
      });

      wrapper.appendChild(item);
      container.appendChild(wrapper);
    });
  }

  selectChat(chat) {
    if (this.blockedUsers.includes(chat.username) && !chat.isSaved) {
      showCustomToast(`🔒 Пользователь ${chat.username} заблокирован`, 'error');
      return;
    }

    this.activeChat = chat;
    this.clearAction();
    document.getElementById('active-chat-username').innerHTML = `${chat.username} ${this.verifiedUsers.includes(chat.username) ? '✅' : ''}`;
    document.getElementById('active-chat-status').textContent = chat.status || 'Защищенный канал';
    document.getElementById('chat-input-area').style.display = 'flex';

    const pinArea = document.getElementById('pinned-message-area');
    if (chat.pinnedMsg) {
      pinArea.style.display = 'flex';
      document.getElementById('pinned-message-text').textContent = chat.pinnedMsg.text || chat.pinnedMsg.fileName || 'Файл';
    } else {
      pinArea.style.display = 'none';
    }

    this.renderChatList();
    this.renderMessages();
  }

  // ==========================================
  // КОНТЕКСТНОЕ МЕНЮ ЧАТА
  // ==========================================
  pinChat() {
    const chat = this.contextChat;
    if (chat) {
      chat.pinned = !chat.pinned;
      this.saveChatsToStorage();
      this.renderChatList();
      showCustomToast(chat.pinned ? '📌 Чат закреплён' : '📌 Чат откреплён', 'success');
      document.getElementById('chat-context-menu').style.display = 'none';
    }
  }

  muteChat() {
    const chat = this.contextChat;
    if (chat) {
      chat.notificationsMuted = !chat.notificationsMuted;
      this.saveChatsToStorage();
      this.renderChatList();
      showCustomToast(chat.notificationsMuted ? '🔕 Уведомления выключены' : '🔔 Уведомления включены', 'success');
      document.getElementById('chat-context-menu').style.display = 'none';
    }
  }

  deleteChat() {
    const chat = this.contextChat;
    if (!chat || chat.isSaved || chat.id === 'bot') {
      showCustomToast('Нельзя удалить системный чат', 'warning');
      document.getElementById('chat-context-menu').style.display = 'none';
      return;
    }
    this.chatToDelete = chat;
    document.getElementById('chat-context-menu').style.display = 'none';
    this.requestChatDelete(chat);
  }

  requestChatDelete(chat) {
    if (!chat || chat.isSaved || chat.id === 'bot') {
      showCustomToast('Нельзя удалить системный чат', 'warning');
      return;
    }
    this.chatToDelete = chat;
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent = 'Удалить чат?';
    document.getElementById('confirm-desc').textContent = `Переписка с ${chat.username} будет удалена.`;
    document.getElementById('btn-confirm-ok').textContent = 'Удалить';
    document.getElementById('confirm-block-label').style.display = 'flex';
    modal.style.display = 'flex';
  }

  executeChatDelete() {
    const chat = this.chatToDelete;
    if (!chat) return;
    const isBlocked = document.getElementById('confirm-block-checkbox').checked;

    this.chats = this.chats.filter(c => c.id !== chat.id);
    if (isBlocked) {
      window.settingsManager.toggleBlockUser(chat.username);
      this.blockedUsers = window.settingsManager.settings.blockedUsers;
      showCustomToast(`🔒 Пользователь ${chat.username} заблокирован`, 'error');
    } else {
      showCustomToast(`🗑️ Чат с ${chat.username} удалён`, 'success');
    }

    if (this.activeChat && this.activeChat.id === chat.id) {
      this.resetActiveChat();
    }

    document.getElementById('modal-confirm').style.display = 'none';
    this.chatToDelete = null;
    document.getElementById('confirm-block-checkbox').checked = false;
    this.saveChatsToStorage();
    this.renderChatList();
  }

  resetActiveChat() {
    this.activeChat = null;
    document.getElementById('active-chat-username').textContent = 'Выберите чат или пользователя';
    document.getElementById('active-chat-status').textContent = 'Защищенный канал';
    document.getElementById('chat-input-area').style.display = 'none';
    document.getElementById('pinned-message-area').style.display = 'none';
    this.clearAction();
    document.getElementById('messages-container').innerHTML = `
      <div id="empty-chat-placeholder" style="text-align: center; color: var(--text-muted); margin-top: 40px;">
        <i class="fa-solid fa-paper-plane" style="font-size: 32px; margin-bottom: 10px; color: var(--accent-purple-primary);"></i>
        <p>Выберите собеседника для отправки сообщений или файлов</p>
      </div>
    `;
  }

  // ==========================================
  // ПРОФИЛЬ
  // ==========================================
  openUserProfile(user) {
    const modal = document.getElementById('modal-user-profile');
    modal.style.display = 'flex';
    document.getElementById('profile-modal-name').textContent = user.name || user.username;
    document.getElementById('profile-modal-username').textContent = user.username;
    const ava = document.getElementById('profile-modal-avatar');
    if (user.avatar) {
      ava.style.backgroundImage = `url('${user.avatar}')`;
      ava.style.backgroundSize = 'cover';
      ava.innerHTML = '';
    } else {
      ava.style.backgroundImage = 'var(--gradient-purple)';
      ava.innerHTML = user.isSaved ? (user.id === 'bot' ? '🤖' : '<i class="fa-solid fa-bookmark"></i>') : (user.name ? user.name[0] : '?');
    }
    document.getElementById('profile-modal-bio').textContent = user.bio || 'Пользователь SyncLine';

    const blockBtn = document.getElementById('btn-block-user');
    if (user.isSaved || user.id === 'bot' || user.username === window.authManager?.username) {
      blockBtn.style.display = 'none';
    } else {
      blockBtn.style.display = 'block';
      const isBlocked = this.blockedUsers.includes(user.username);
      blockBtn.textContent = isBlocked ? 'Разблокировать' : 'Заблокировать';
      blockBtn.style.background = isBlocked ? 'var(--color-success)' : 'var(--color-error)';
      blockBtn.style.borderColor = isBlocked ? 'var(--color-success)' : 'var(--color-error)';
      blockBtn.dataset.username = user.username;
    }
  }

  toggleBlockUserFromProfile() {
    const username = document.getElementById('btn-block-user').dataset.username;
    if (username) {
      window.settingsManager.toggleBlockUser(username);
      this.blockedUsers = window.settingsManager.settings.blockedUsers;
      document.getElementById('modal-user-profile').style.display = 'none';
      showCustomToast(`Пользователь ${username} ${this.blockedUsers.includes(username) ? 'заблокирован' : 'разблокирован'}`, 'info');
      this.renderChatList();
    }
  }

  // ==========================================
  // СТАТУСЫ
  // ==========================================
  startPresenceSimulation() {
    setInterval(() => {
      this.chats.forEach(chat => {
        if (!chat.isSaved) {
          const now = Date.now();
          const diff = now - (chat.lastSeen || now);
          const minutes = Math.floor(diff / 60000);
          
          if (Math.random() > 0.7) {
            chat.status = 'в сети';
            chat.lastSeen = now;
          } else if (Math.random() > 0.5) {
            chat.status = 'печатает...';
          } else if (minutes < 5) {
            chat.status = 'был(а) 5м назад';
          } else if (minutes < 30) {
            chat.status = 'был(а) недавно';
          } else if (minutes < 120) {
            chat.status = `был(а) ${minutes}м назад`;
          } else {
            chat.status = 'был(а) давно';
          }
        }
      });
      if (this.activeChat && !this.activeChat.isSaved) {
        document.getElementById('active-chat-status').textContent = this.activeChat.status;
      }
    }, 8000);
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ (ТОЛЬКО 1 РАЗ)
  // ==========================================
  initEvents() {
    // Отправка сообщений
    const sendBtn = document.getElementById('btn-send-message');
    const msgInput = document.getElementById('input-message');

    if (sendBtn) {
      const newSendBtn = sendBtn.cloneNode(true);
      sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
      newSendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (msgInput) {
      const newMsgInput = msgInput.cloneNode(true);
      msgInput.parentNode.replaceChild(newMsgInput, msgInput);
      newMsgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
    }

    // Прикрепление файлов с предпросмотром
    const attachBtn = document.getElementById('btn-attach-file');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.multiple = true;
    document.body.appendChild(fileInput);

    if (attachBtn) {
      const newAttachBtn = attachBtn.cloneNode(true);
      attachBtn.parentNode.replaceChild(newAttachBtn, attachBtn);
      newAttachBtn.addEventListener('click', () => fileInput.click());
    }

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const file = files[0];
      const filePath = file.path || file.name;
      const fileName = file.name;
      
      const previewArea = document.getElementById('file-preview-area');
      document.getElementById('file-preview-name').textContent = fileName;
      document.getElementById('file-preview-type-icon').className = `fa-solid fa-${file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'}`;
      document.getElementById('file-preview-input').value = '';
      document.getElementById('file-preview-one-time').checked = false;
      previewArea.style.display = 'block';
      
      previewArea.dataset.filePath = filePath;
      
      const cancelBtn = document.getElementById('file-preview-cancel');
      const sendFileBtn = document.getElementById('file-preview-send');
      
      // Убираем старые обработчики, чтобы не дублировалось
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        previewArea.style.display = 'none';
        fileInput.value = '';
      });
      
      const newSendFileBtn = sendFileBtn.cloneNode(true);
      sendFileBtn.parentNode.replaceChild(newSendFileBtn, sendFileBtn);
      newSendFileBtn.addEventListener('click', () => {
        const comment = document.getElementById('file-preview-input').value.trim();
        const isOneTime = document.getElementById('file-preview-one-time').checked;
        this.sendFileMessage(filePath, comment, isOneTime);
        previewArea.style.display = 'none';
        fileInput.value = '';
      });
    });

    // Поиск
    const searchInput = document.getElementById('input-search-user');
    if (searchInput) {
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      newSearchInput.addEventListener('input', (e) => {
        this.renderChatList(e.target.value);
      });
    }

    // Профиль
    const profileBtn = document.getElementById('btn-open-user-profile');
    if (profileBtn) {
      const newProfileBtn = profileBtn.cloneNode(true);
      profileBtn.parentNode.replaceChild(newProfileBtn, profileBtn);
      newProfileBtn.addEventListener('click', (e) => {
        if (e.target.closest('#btn-my-settings') || !this.activeChat) return;
        this.openUserProfile(this.activeChat);
      });
    }

    const closeProfileBtn = document.getElementById('btn-close-user-profile');
    if (closeProfileBtn) {
      const newCloseProfileBtn = closeProfileBtn.cloneNode(true);
      closeProfileBtn.parentNode.replaceChild(newCloseProfileBtn, closeProfileBtn);
      newCloseProfileBtn.addEventListener('click', () => {
        document.getElementById('modal-user-profile').style.display = 'none';
      });
    }

    const blockBtn = document.getElementById('btn-block-user');
    if (blockBtn) {
      const newBlockBtn = blockBtn.cloneNode(true);
      blockBtn.parentNode.replaceChild(newBlockBtn, blockBtn);
      newBlockBtn.addEventListener('click', () => {
        this.toggleBlockUserFromProfile();
      });
    }

    // Свой профиль по аватарке
    const avatarBtn = document.getElementById('current-user-avatar');
    if (avatarBtn) {
      const newAvatarBtn = avatarBtn.cloneNode(true);
      avatarBtn.parentNode.replaceChild(newAvatarBtn, avatarBtn);
      newAvatarBtn.addEventListener('click', () => {
        const user = {
          name: window.authManager?.username || 'Пользователь',
          username: window.authManager?.username || '@user',
          avatar: window.authManager?.userAvatarPath || null,
          bio: 'Это ваш профиль. Настройте его в настройках.',
          isSaved: false
        };
        this.openUserProfile(user);
        document.getElementById('btn-block-user').style.display = 'none';
      });
    }

    // Модалка подтверждения
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        document.getElementById('modal-confirm').style.display = 'none';
        this.chatToDelete = null;
      });
    }

    const okBtn = document.getElementById('btn-confirm-ok');
    if (okBtn) {
      const newOkBtn = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(newOkBtn, okBtn);
      newOkBtn.addEventListener('click', () => {
        this.executeChatDelete();
      });
    }

    // Скрытие контекстных меню
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#chat-context-menu')) {
        document.getElementById('chat-context-menu').style.display = 'none';
      }
      if (!e.target.closest('#message-context-menu')) {
        document.getElementById('message-context-menu').style.display = 'none';
      }
    });

    // Пункты контекстного меню сообщений
    const ctxReply = document.getElementById('ctx-reply');
    if (ctxReply) {
      const newCtxReply = ctxReply.cloneNode(true);
      ctxReply.parentNode.replaceChild(newCtxReply, ctxReply);
      newCtxReply.addEventListener('click', () => this.setupAction('reply'));
    }

    const ctxEdit = document.getElementById('ctx-edit');
    if (ctxEdit) {
      const newCtxEdit = ctxEdit.cloneNode(true);
      ctxEdit.parentNode.replaceChild(newCtxEdit, ctxEdit);
      newCtxEdit.addEventListener('click', () => this.setupAction('edit'));
    }

    const ctxPin = document.getElementById('ctx-pin');
    if (ctxPin) {
      const newCtxPin = ctxPin.cloneNode(true);
      ctxPin.parentNode.replaceChild(newCtxPin, ctxPin);
      newCtxPin.addEventListener('click', () => this.pinMessage());
    }

    const ctxDownload = document.getElementById('ctx-download');
    if (ctxDownload) {
      const newCtxDownload = ctxDownload.cloneNode(true);
      ctxDownload.parentNode.replaceChild(newCtxDownload, ctxDownload);
      newCtxDownload.addEventListener('click', () => {
        showCustomToast('📥 Файл скачан в Загрузки!', 'success');
        document.getElementById('message-context-menu').style.display = 'none';
      });
    }

    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) {
      const newCtxDelete = ctxDelete.cloneNode(true);
      ctxDelete.parentNode.replaceChild(newCtxDelete, ctxDelete);
      newCtxDelete.addEventListener('click', () => this.deleteMessageAtAll());
    }

    // Реакции
    document.querySelectorAll('.reaction-picker').forEach(el => {
      const newEl = el.cloneNode(true);
      el.parentNode.replaceChild(newEl, el);
      newEl.addEventListener('click', () => {
        const emoji = newEl.dataset.emoji;
        if (this.contextTargetId) {
          this.addReaction(this.contextTargetId, emoji);
        }
        document.getElementById('message-context-menu').style.display = 'none';
      });
    });

    // Отмена действия
    const cancelAction = document.getElementById('btn-cancel-action');
    if (cancelAction) {
      const newCancelAction = cancelAction.cloneNode(true);
      cancelAction.parentNode.replaceChild(newCancelAction, cancelAction);
      newCancelAction.addEventListener('click', () => this.clearAction());
    }

    // Открепление
    const unpinBtn = document.getElementById('btn-unpin');
    if (unpinBtn) {
      const newUnpinBtn = unpinBtn.cloneNode(true);
      unpinBtn.parentNode.replaceChild(newUnpinBtn, unpinBtn);
      newUnpinBtn.addEventListener('click', () => {
        if (this.activeChat) {
          this.activeChat.pinnedMsg = null;
          document.getElementById('pinned-message-area').style.display = 'none';
          this.saveChatsToStorage();
          showCustomToast('📌 Закрепление снято', 'info');
        }
      });
    }

    // Контекстное меню чата
    const ctxChatPin = document.getElementById('ctx-chat-pin');
    if (ctxChatPin) {
      const newCtxChatPin = ctxChatPin.cloneNode(true);
      ctxChatPin.parentNode.replaceChild(newCtxChatPin, ctxChatPin);
      newCtxChatPin.addEventListener('click', () => this.pinChat());
    }

    const ctxChatMute = document.getElementById('ctx-chat-mute');
    if (ctxChatMute) {
      const newCtxChatMute = ctxChatMute.cloneNode(true);
      ctxChatMute.parentNode.replaceChild(newCtxChatMute, ctxChatMute);
      newCtxChatMute.addEventListener('click', () => this.muteChat());
    }

    const ctxChatDelete = document.getElementById('ctx-chat-delete');
    if (ctxChatDelete) {
      const newCtxChatDelete = ctxChatDelete.cloneNode(true);
      ctxChatDelete.parentNode.replaceChild(newCtxChatDelete, ctxChatDelete);
      newCtxChatDelete.addEventListener('click', () => this.deleteChat());
    }

    // Закрытие модалки медиа
    const closeMedia = document.getElementById('btn-close-media');
    if (closeMedia) {
      const newCloseMedia = closeMedia.cloneNode(true);
      closeMedia.parentNode.replaceChild(newCloseMedia, closeMedia);
      newCloseMedia.addEventListener('click', () => {
        document.getElementById('modal-media').style.display = 'none';
      });
    }
  }

  initDemoChat() {
    this.renderChatList();
  }
}

window.companionManager = new CompanionManager();