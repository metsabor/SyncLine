/**
 * SyncLine — Auth Manager (Авторизация, Настройки, Эффекты, Безопасность)
 * Версия: 3.5 — Дивергентный апгрейд
 */

// ==========================================
// ГЛОБАЛЬНЫЙ URL API (БЕЗ process.env)
// ==========================================
const API_URL = 'https://syncline-f44k.onrender.com';

/* ==========================================
   СИСТЕМА КАСТОМНЫХ УВЕДОМЛЕНИЙ (ТОСТЫ)
   ========================================== */
function showCustomToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if(type === 'error') icon = 'fa-circle-exclamation';
  if(type === 'success') icon = 'fa-circle-check';
  if(type === 'warning') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

window.alert = (msg) => showCustomToast(msg, "warning");

/* ==========================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ЗАПРОСОВ К API
   ========================================== */
async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Ошибка запроса');
  }
  return response.json();
}

async function requestCode(email) {
  try {
    const response = await fetch(`${API_URL}/api/auth/request-code?email=${encodeURIComponent(email)}`, {
      method: 'POST'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Ошибка запроса кода');
    }
    return true;
  } catch (error) {
    showCustomToast(error.message, 'error');
    return false;
  }
}

async function verifyCode(email, code) {
  try {
    const response = await fetch(`${API_URL}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Неверный код');
    }
    return true;
  } catch (error) {
    showCustomToast(error.message, 'error');
    return false;
  }
}

// ==========================================
// SettingsManager (ОСТАЁТСЯ БЕЗ ИЗМЕНЕНИЙ)
// ==========================================
class SettingsManager {
  constructor() {
    this.loadSettings();
    this.createEffectsContainer();
  }

  createEffectsContainer() {
    let container = document.getElementById('effects-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'effects-container';
      document.body.prepend(container);
    }
  }

  loadSettings() {
    const saved = localStorage.getItem('syncline_settings');
    if (saved) {
      this.settings = JSON.parse(saved);
    } else {
      this.settings = {
        username: '@user',
        email: 'syncline@internet.ru',
        theme: 'dark',
        blurStrength: 80,
        avatarPath: null,
        blockedUsers: [],
        verifiedUsers: ['SyncLine Bot'],
        macros: {
          screenshot: 'Ctrl+Shift+S',
          clearChat: 'Ctrl+Shift+E'
        },
        effects: {
          snow: false,
          rain: false,
          leaves: false,
          particles: false
        },
        security: {
          twoFactor: false,
          sessions: [
            { id: 1, name: 'Windows • Chrome', time: 'Сейчас', isCurrent: true },
            { id: 2, name: 'Android • SyncLine App', time: '2 часа назад', isCurrent: false }
          ]
        }
      };
      this.saveSettings();
    }
    return this.settings;
  }

  saveSettings() {
    localStorage.setItem('syncline_settings', JSON.stringify(this.settings));
  }

  updateUsername(username) {
    this.settings.username = username;
    this.saveSettings();
  }

  updateEmail(email) {
    this.settings.email = email;
    this.saveSettings();
    localStorage.setItem('syncline_current_email', email);
  }

  updateAvatar(path) {
    this.settings.avatarPath = path;
    this.saveSettings();
  }

  updateTheme(theme) {
    this.settings.theme = theme;
    this.saveSettings();
    this.applyTheme(theme);
  }

  getCurrentEmail() {
    return localStorage.getItem('syncline_current_email') || this.settings.email || '';
  }

  toggleBlockUser(username) {
    const index = this.settings.blockedUsers.indexOf(username);
    if (index > -1) {
      this.settings.blockedUsers.splice(index, 1);
    } else {
      this.settings.blockedUsers.push(username);
    }
    this.saveSettings();
    return this.settings.blockedUsers;
  }

  toggleVerifyUser(username) {
    const index = this.settings.verifiedUsers.indexOf(username);
    if (index > -1) {
      this.settings.verifiedUsers.splice(index, 1);
    } else {
      this.settings.verifiedUsers.push(username);
    }
    this.saveSettings();
    return this.settings.verifiedUsers;
  }

  toggleEffect(effectName) {
    this.settings.effects[effectName] = !this.settings.effects[effectName];
    this.saveSettings();
    this.applyEffects();
  }

  applyEffects() {
    const container = document.getElementById('effects-container');
    if (!container) {
      this.createEffectsContainer();
      return this.applyEffects();
    }
    
    container.innerHTML = '';
    const e = this.settings.effects;
    
    if (e.snow) this.createParticles(container, '❄️', 30, 'fallSnow');
    if (e.rain) this.createParticles(container, '💧', 60, 'fallRain');
    if (e.leaves) this.createParticles(container, '🍃', 20, 'fallLeaves');
    if (e.particles) this.createParticles(container, '✨', 40, 'floatParticles');
  }

  createParticles(container, char, count, animClass) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.innerText = char;
      p.className = 'effect-particle';
      p.style.animationName = animClass;
      p.style.left = Math.random() * 100 + 'vw';
      p.style.animationDuration = (Math.random() * 3 + 2) + 's';
      p.style.animationDelay = (Math.random() * 2) + 's';
      p.style.fontSize = (Math.random() * 10 + 10) + 'px';
      container.appendChild(p);
    }
  }

  resetEffects() {
    this.settings.effects = { snow: false, rain: false, leaves: false, particles: false };
    this.saveSettings();
    this.applyEffects();
    showCustomToast('Эффекты сброшены', 'success');
  }

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--bg-dark-base', 'rgba(240, 235, 250, 0.85)');
      root.style.setProperty('--text-primary', '#1a1a2e');
      root.style.setProperty('--text-secondary', '#4a4a6a');
      root.style.setProperty('--text-muted', '#7a7a9a');
      root.style.setProperty('--bg-glass-card', 'rgba(255, 255, 255, 0.6)');
      root.style.setProperty('--bg-glass-input', 'rgba(255, 255, 255, 0.7)');
      root.style.setProperty('--border-glass-light', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--shadow-glass', '0 16px 40px 0 rgba(0, 0, 0, 0.1)');
    } else {
      root.style.setProperty('--bg-dark-base', 'rgba(14, 11, 22, 0.82)');
      root.style.setProperty('--text-primary', '#f8f9fa');
      root.style.setProperty('--text-secondary', '#b5adc4');
      root.style.setProperty('--text-muted', '#7d7291');
      root.style.setProperty('--bg-glass-card', 'rgba(30, 22, 48, 0.45)');
      root.style.setProperty('--bg-glass-input', 'rgba(22, 16, 36, 0.6)');
      root.style.setProperty('--border-glass-light', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--shadow-glass', '0 16px 40px 0 rgba(0, 0, 0, 0.5)');
    }
  }

  applyBlur(strength) {
    const panels = document.querySelectorAll('.glass-panel, .glass-input, .toast, .settings-fullscreen-overlay, .crop-card');
    const blurValue = `${strength}px`;
    panels.forEach(el => {
      el.style.backdropFilter = `blur(${blurValue}) saturate(180%)`;
      el.style.webkitBackdropFilter = `blur(${blurValue}) saturate(180%)`;
    });
  }
}

// ==========================================
// ОСНОВНОЙ МЕНЕДЖЕР АВТОРИЗАЦИИ
// ==========================================
class AuthManager {
  constructor() {
    this.userAvatarPath = null;
    this.username = '';
    this.currentEmail = '';
    this.tempCropPath = null;
    this.settings = new SettingsManager();
    this.cropCallback = null;
    this.retryTimer = null;
    this.retryCountdown = 0;
    this.isCodeRequested = false;
    
    this.token = localStorage.getItem('syncline_token') || null;
    this.user = localStorage.getItem('syncline_user') ? JSON.parse(localStorage.getItem('syncline_user')) : null;

    this.initEvents();
    this.initSettingsTabs();
    this.initCropper();
    this.initPasswordIndicator();
    this.initThemeSwitcher();
    this.initMacros();
    this.initRealMacros();
    this.loadSavedSettings();

    if (this.user && this.token) {
      document.getElementById('current-user-name').textContent = this.user.username || this.settings.settings.username;
      this.switchScreen('auth-screen-email', 'main-workspace');
      if (window.companionManager) window.companionManager.initDemoChat();
    }
  }

  loadSavedSettings() {
    const s = this.settings.settings;
    if (s.avatarPath) this.userAvatarPath = s.avatarPath;
    if (s.theme) this.settings.applyTheme(s.theme);
    if (s.blurStrength) this.settings.applyBlur(s.blurStrength);
    this.settings.applyEffects();

    document.querySelectorAll('.effect-toggle').forEach(btn => {
      if (s.effects[btn.dataset.effect]) btn.classList.add('active');
    });

    if (s.email) {
      localStorage.setItem('syncline_current_email', s.email);
    }
  }

  openCropper(filePath, callback) {
    this.tempCropPath = filePath;
    this.cropCallback = callback;
    const img = document.getElementById('crop-image');
    if (img) {
      img.src = filePath;
      img.style.transform = 'scale(1)';
      img.style.left = '0px';
      img.style.top = '0px';
    }
    document.getElementById('crop-zoom').value = 100;
    document.getElementById('modal-crop').classList.add('show');
  }

  async login(email, password) {
    try {
      const result = await apiRequest('/api/auth/login', 'POST', { email, password });
      if (result.success) {
        this.user = result.user;
        this.token = result.session;
        localStorage.setItem('syncline_token', this.token);
        localStorage.setItem('syncline_user', JSON.stringify(this.user));
        showCustomToast(`Добро пожаловать, ${this.user.username}!`, 'success');
        return true;
      }
    } catch (error) {
      showCustomToast(error.message, 'error');
      return false;
    }
  }

  async register(email, password, username) {
    try {
      const result = await apiRequest('/api/auth/register', 'POST', { email, password, username });
      if (result.success) {
        showCustomToast('Регистрация успешна!', 'success');
        return true;
      }
    } catch (error) {
      showCustomToast(error.message, 'error');
      return false;
    }
  }

  async logout() {
    try {
      await apiRequest('/api/auth/logout', 'POST', null, this.token);
    } catch (e) {}
    this.user = null;
    this.token = null;
    localStorage.removeItem('syncline_token');
    localStorage.removeItem('syncline_user');
    showCustomToast('Вы вышли из системы', 'info');
    this.switchScreen('main-workspace', 'auth-screen-email');
  }

  startRetryTimer() {
    const btnResend = document.getElementById('btn-resend-code');
    if (!btnResend) return;
    
    this.retryCountdown = 30;
    btnResend.disabled = true;
    btnResend.textContent = `Отправить снова (${this.retryCountdown}с)`;

    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => {
      this.retryCountdown--;
      if (this.retryCountdown <= 0) {
        clearInterval(this.retryTimer);
        this.retryTimer = null;
        btnResend.disabled = false;
        btnResend.textContent = '🔄 Отправить код снова';
        this.isCodeRequested = false;
      } else {
        btnResend.textContent = `Отправить снова (${this.retryCountdown}с)`;
      }
    }, 1000);
  }

  resetRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    const btnResend = document.getElementById('btn-resend-code');
    if (btnResend) {
      btnResend.disabled = false;
      btnResend.textContent = '🔄 Отправить код снова';
      this.retryCountdown = 0;
      this.isCodeRequested = false;
    }
  }

  // =====================================
  // ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ
  // =====================================
  initEvents() {
    // Шаг 1: Почта
    const formEmail = document.getElementById('form-email-step');
    if (formEmail) {
      formEmail.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('input-email');
        const emailVal = emailInput.value.trim();
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        
        if (emailVal === "") {
          showCustomToast("Заполните поле: Адрес электронной почты", "error");
          emailInput.focus();
          return;
        }
        if (!emailRegex.test(emailVal)) {
          showCustomToast("Введите корректный E-mail (пример: user@domain.com)", "error");
          emailInput.focus();
          return;
        }
        
        this.currentEmail = emailVal;
        document.getElementById('target-email-label').textContent = emailVal;
        
        const success = await requestCode(emailVal);
        if (success) {
          this.switchScreen('auth-screen-email', 'auth-screen-code');
          this.isCodeRequested = true;
          this.startRetryTimer();
          showCustomToast('Код отправлен в Telegram', 'info');
        }
      });
    }

    // Шаг 2: Код
    const codeScreen = document.getElementById('auth-screen-code');
    if (codeScreen) {
      const backBtn = document.createElement('button');
      backBtn.className = 'btn-glass-secondary';
      backBtn.textContent = '⬅ Назад (изменить почту)';
      backBtn.style.marginTop = '10px';
      backBtn.style.width = '100%';
      backBtn.id = 'btn-back-to-email';
      const card = codeScreen.querySelector('.auth-card');
      if (card) {
        const verifyBtn = document.getElementById('btn-verify-code');
        if (verifyBtn) {
          card.insertBefore(backBtn, verifyBtn);
        } else {
          card.appendChild(backBtn);
        }
      }

      backBtn.addEventListener('click', () => {
        this.switchScreen('auth-screen-code', 'auth-screen-email');
        this.resetRetryTimer();
        document.querySelectorAll('.code-digit').forEach(d => d.value = '');
        document.getElementById('btn-verify-code').disabled = false;
        document.getElementById('btn-verify-code').textContent = 'Войти';
      });

      const resendBtn = document.createElement('button');
      resendBtn.className = 'btn-glass-secondary';
      resendBtn.textContent = '🔄 Отправить код снова';
      resendBtn.style.marginTop = '8px';
      resendBtn.style.width = '100%';
      resendBtn.id = 'btn-resend-code';
      resendBtn.disabled = true;
      if (card) {
        const backBtnRef = document.getElementById('btn-back-to-email');
        if (backBtnRef) {
          card.insertBefore(resendBtn, backBtnRef);
        } else {
          card.appendChild(resendBtn);
        }
      }

      resendBtn.addEventListener('click', async () => {
        if (resendBtn.disabled) return;
        const email = this.currentEmail || this.settings.settings.email || '';
        if (!email) {
          showCustomToast('Почта не найдена, вернитесь назад', 'error');
          return;
        }
        const success = await requestCode(email);
        if (success) {
          this.isCodeRequested = true;
          this.startRetryTimer();
          showCustomToast('Код отправлен повторно', 'info');
          document.querySelectorAll('.code-digit').forEach(d => d.value = '');
          document.getElementById('btn-verify-code').disabled = false;
        }
      });
    }

    const digits = document.querySelectorAll('.code-digit');
    digits.forEach((digit, index) => {
      digit.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < digits.length - 1) digits[index + 1].focus();
      });
      digit.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) digits[index - 1].focus();
      });
    });

    const btnVerifyCode = document.getElementById('btn-verify-code');
    if (btnVerifyCode) {
      btnVerifyCode.addEventListener('click', async () => {
        let code = Array.from(digits).map(d => d.value).join('');
        if (code.length === 5) {
          const email = this.currentEmail || this.settings.settings.email || '';
          const isValid = await verifyCode(email, code);
          if (isValid) {
            this.resetRetryTimer();
            this.switchScreen('auth-screen-code', 'auth-screen-profile');
          }
        } else {
          showCustomToast('Введите полный 5-значный код', 'error');
        }
      });
    }

    // Шаг 3: Профиль
    const btnChangeAvatar = document.getElementById('btn-change-avatar');
    if (btnChangeAvatar) {
      btnChangeAvatar.addEventListener('click', async () => {
        if (window.electronAPI) {
          const filePaths = await window.electronAPI.selectFiles();
          if (filePaths && filePaths.length > 0) {
            const filePath = `file:///${filePaths[0].replace(/\\/g, '/')}`;
            this.openCropper(filePath, (croppedPath) => {
              this.userAvatarPath = croppedPath;
              const preview = document.getElementById('preview-avatar');
              if (preview) {
                preview.innerHTML = '';
                preview.style.backgroundImage = `url('${croppedPath}')`;
                preview.style.backgroundSize = 'cover';
              }
              showCustomToast('Фото профиля установлено!', 'success');
            });
          }
        }
      });
    }

    const usernameInput = document.getElementById('input-username');
    if (usernameInput) {
      usernameInput.value = this.settings.settings.username || '@user';
      usernameInput.addEventListener('input', (e) => {
        let val = e.target.value;
        if (val.length > 0 && !val.startsWith('@')) e.target.value = '@' + val.replace(/@/g, '');
      });
    }

    const btnFinishSetup = document.getElementById('btn-finish-setup');
    if (btnFinishSetup) {
      btnFinishSetup.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = this.currentEmail || this.settings.settings.email || '';
        const username = usernameInput.value.trim();
        const password = document.getElementById('input-password').value;

        if (username.length < 2) {
          showCustomToast("Укажите корректный юзернейм (минимум 2 символа)", "error");
          usernameInput.focus();
          return;
        }
        if (password.length === 0) {
          showCustomToast("Пожалуйста, задайте пароль для защиты", "error");
          document.getElementById('input-password').focus();
          return;
        }

        const loggedIn = await this.login(email, password);
        if (!loggedIn) {
          const registered = await this.register(email, password, username);
          if (registered) {
            await this.login(email, password);
          } else {
            return;
          }
        }

        this.settings.updateUsername(username);
        this.settings.updateEmail(email);
        document.getElementById('current-user-name').textContent = username;

        if (this.userAvatarPath) {
          this.settings.updateAvatar(this.userAvatarPath);
          const currentAva = document.getElementById('current-user-avatar');
          if (currentAva) {
            currentAva.innerHTML = '';
            currentAva.style.backgroundImage = `url('${this.userAvatarPath}')`;
            currentAva.style.backgroundSize = 'cover';
          }
        }

        this.switchScreen('auth-screen-profile', 'main-workspace');
        if (window.companionManager) window.companionManager.initDemoChat();
        showCustomToast("Добро пожаловать в SyncLine!", "success");
      });
    }

    // =====================================
    // УПРАВЛЕНИЕ НАСТРОЙКАМИ
    // =====================================
    const btnMySettings = document.getElementById('btn-my-settings');
    const modalSettings = document.getElementById('modal-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    if (btnMySettings && modalSettings) {
      btnMySettings.addEventListener('click', () => {
        modalSettings.classList.add('show');
        this.loadSettingsIntoUI();
        this.refreshBlockedList();
        this.refreshVerifiedList();
      });
      btnCloseSettings.addEventListener('click', () => modalSettings.classList.remove('show'));
    }

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        const username = document.getElementById('settings-username').value.trim();
        const email = document.getElementById('settings-email').value.trim();
        if (username) {
          this.settings.updateUsername(username);
          document.getElementById('current-user-name').textContent = username;
        }
        if (email) {
          this.settings.updateEmail(email);
          localStorage.setItem('syncline_current_email', email);
        }
        showCustomToast('Настройки профиля сохранены!', 'success');
      });
    }

    const btnApplyStyle = document.getElementById('btn-apply-style');
    if (btnApplyStyle) {
      btnApplyStyle.addEventListener('click', () => {
        const theme = document.getElementById('settings-theme').value;
        const blur = parseInt(document.getElementById('settings-blur').value);
        this.settings.updateTheme(theme);
        this.settings.settings.blurStrength = blur;
        this.settings.saveSettings();
        this.settings.applyBlur(blur);
        showCustomToast('Стиль применён!', 'success');
      });
    }

    // Эффекты
    document.querySelectorAll('.effect-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const effect = btn.dataset.effect;
        this.settings.toggleEffect(effect);
        btn.classList.toggle('active');
        const isActive = this.settings.settings.effects[effect];
        showCustomToast(
          `${effect === 'snow' ? '❄️ Снег' : effect === 'rain' ? '🌧️ Дождь' : effect === 'leaves' ? '🍃 Листопад' : '✨ Частицы'} ${isActive ? 'включён' : 'выключен'}`,
          isActive ? 'success' : 'warning'
        );
      });
    });

    document.getElementById('btn-reset-effects')?.addEventListener('click', () => {
      this.settings.resetEffects();
      document.querySelectorAll('.effect-toggle').forEach(btn => btn.classList.remove('active'));
    });

    const avatarInput = document.getElementById('avatar-file-input');
    if (avatarInput) {
      avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            this.openCropper(event.target.result, (croppedPath) => {
              this.userAvatarPath = croppedPath;
              this.settings.updateAvatar(croppedPath);
              document.querySelectorAll('.user-avatar, .profile-large-avatar').forEach(el => {
                if (el.tagName === 'IMG') el.src = croppedPath;
                else {
                  el.style.backgroundImage = `url('${croppedPath}')`;
                  el.style.backgroundSize = 'cover';
                }
              });
              showCustomToast('Аватар обновлён!', 'success');
            });
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // 2FA
    const btn2FA = document.getElementById('btn-toggle-2fa');
    const qrContainer = document.getElementById('qrcode-container');
    if (btn2FA) {
      btn2FA.addEventListener('click', () => {
        const isEnabled = this.settings.settings.security.twoFactor;
        this.settings.settings.security.twoFactor = !isEnabled;
        this.settings.saveSettings();

        if (!isEnabled) {
          btn2FA.textContent = '🔒 2FA Включена';
          btn2FA.style.background = 'var(--color-success)';
          if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.style.display = 'block';
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
              text: 'otpauth://totp/SyncLine?secret=JBSWY3DPEHPK3PXP',
              width: 128,
              height: 128
            });
            showCustomToast('Отсканируйте QR код в Google Authenticator', 'info');
          } else {
            showCustomToast('Для QR-кода требуется библиотека qrcode.js', 'warning');
          }
        } else {
          btn2FA.textContent = '🔓 Включить 2FA';
          btn2FA.style.background = 'var(--color-error)';
          if (qrContainer) qrContainer.style.display = 'none';
          showCustomToast('2FA отключена', 'warning');
        }
      });
    }

    document.querySelector('#view-security .btn-glass-secondary')?.addEventListener('click', () => {
      this.settings.settings.security.sessions = this.settings.settings.security.sessions.filter(s => s.isCurrent);
      this.settings.saveSettings();
      this.loadSettingsIntoUI();
      showCustomToast('Все сессии завершены, кроме текущей', 'success');
    });

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-glass-secondary';
    logoutBtn.style.marginTop = '20px';
    logoutBtn.textContent = '🚪 Выйти из аккаунта';
    logoutBtn.addEventListener('click', () => this.logout());
    const securityView = document.getElementById('view-security');
    if (securityView) {
      const logoutContainer = document.createElement('div');
      logoutContainer.style.borderTop = '1px solid var(--border-glass-light)';
      logoutContainer.style.paddingTop = '20px';
      logoutContainer.appendChild(logoutBtn);
      securityView.appendChild(logoutContainer);
    }
  }

  // =====================================
  // ВКЛАДКИ НАСТРОЕК
  // =====================================
  initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab-btn');
    const views = document.querySelectorAll('.settings-view');

    if (tabs.length === 0) return;

    tabs.forEach(t => t.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    tabs[0].classList.add('active');
    const firstView = document.getElementById(tabs[0].dataset.tab);
    if (firstView) firstView.classList.add('active');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        tab.classList.add('active');
        const targetView = document.getElementById(tab.dataset.tab);
        if (targetView) {
          targetView.classList.add('active');
          if (tab.dataset.tab === 'view-blocked') this.refreshBlockedList();
          if (tab.dataset.tab === 'view-verified') this.refreshVerifiedList();
          if (tab.dataset.tab === 'view-profile') this.loadSettingsIntoUI();
          if (tab.dataset.tab === 'view-security') this.loadSettingsIntoUI();
        }
      });
    });
  }

  refreshBlockedList() {
    const container = document.getElementById('blocked-list-container');
    if (!container) return;
    const blocked = this.settings.settings.blockedUsers || [];
    container.innerHTML = '';

    if (blocked.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Список пуст. Вы никого не блокировали.</p>`;
      return;
    }

    blocked.forEach(username => {
      const item = document.createElement('div');
      item.className = 'macro-item';
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass-light); margin-bottom: 8px;';
      item.innerHTML = `
        <span style="color: white; font-weight: 600;"><i class="fas fa-user-slash" style="color: var(--color-error); margin-right: 8px;"></i> ${username}</span>
        <button class="btn-glass-secondary" style="padding: 6px 12px; font-size: 12px;">Разблокировать</button>
      `;
      container.appendChild(item);
      item.querySelector('button').addEventListener('click', () => {
        this.settings.toggleBlockUser(username);
        this.refreshBlockedList();
        if (window.companionManager) {
          window.companionManager.blockedUsers = this.settings.settings.blockedUsers;
          window.companionManager.renderChatList();
        }
        showCustomToast(`Пользователь ${username} разблокирован`, 'success');
      });
    });
  }

  refreshVerifiedList() {
    const container = document.getElementById('verified-list-container');
    if (!container) return;
    const verified = this.settings.settings.verifiedUsers || [];
    container.innerHTML = '';

    if (verified.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Нет верифицированных пользователей.</p>`;
      return;
    }

    verified.forEach(username => {
      const item = document.createElement('div');
      item.className = 'macro-item';
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass-light); margin-bottom: 8px;';
      item.innerHTML = `
        <span style="color: white; font-weight: 600;"><i class="fas fa-check-circle" style="color: var(--color-success); margin-right: 8px;"></i> ${username}</span>
        <button class="btn-glass-secondary" style="padding: 6px 12px; font-size: 12px;">Снять верификацию</button>
      `;
      container.appendChild(item);
      item.querySelector('button').addEventListener('click', () => {
        this.settings.toggleVerifyUser(username);
        this.refreshVerifiedList();
        if (window.companionManager) {
          window.companionManager.verifiedUsers = this.settings.settings.verifiedUsers;
          window.companionManager.renderChatList();
        }
        showCustomToast(`Верификация с ${username} снята`, 'warning');
      });
    });
  }

  loadSettingsIntoUI() {
    const s = this.settings.settings;
    document.getElementById('settings-username').value = s.username || '@user';
    document.getElementById('settings-email').value = s.email || 'syncline@internet.ru';
    document.getElementById('settings-theme').value = s.theme || 'dark';
    document.getElementById('settings-blur').value = s.blurStrength || 80;
    document.getElementById('settings-display-username').textContent = s.username || '@user';

    if (s.avatarPath) {
      const ava = document.getElementById('settings-my-avatar');
      if (ava) {
        ava.style.backgroundImage = `url('${s.avatarPath}')`;
        ava.style.backgroundSize = 'cover';
      }
    }

    const btn2FA = document.getElementById('btn-toggle-2fa');
    if (btn2FA) {
      const twoFA = s.security.twoFactor;
      btn2FA.textContent = twoFA ? '🔒 2FA Включена' : '🔓 Включить 2FA';
      btn2FA.style.background = twoFA ? 'var(--color-success)' : 'var(--color-error)';
      const qrContainer = document.getElementById('qrcode-container');
      if (qrContainer) {
        qrContainer.style.display = twoFA ? 'block' : 'none';
        if (twoFA && typeof QRCode !== 'undefined') {
          qrContainer.innerHTML = '';
          new QRCode(qrContainer, {
            text: 'otpauth://totp/SyncLine?secret=JBSWY3DPEHPK3PXP',
            width: 128,
            height: 128
          });
        }
      }
    }

    const sessionsList = document.getElementById('sessions-list');
    if (sessionsList) {
      sessionsList.innerHTML = '';
      const sessions = s.security.sessions || [];
      sessions.forEach(sess => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-glass-light);';
        div.innerHTML = `
          <span>${sess.isCurrent ? '🟢' : '🟡'} ${sess.name}</span>
          <span>${sess.time}</span>
        `;
        sessionsList.appendChild(div);
      });
    }
  }

  initPasswordIndicator() {
    const passInput = document.getElementById('input-password');
    const fill = document.getElementById('strength-fill');
    const text = document.getElementById('strength-text');
    if (!passInput || !fill || !text) return;

    passInput.addEventListener('input', () => {
      const val = passInput.value;
      let score = 0;
      if (val.length >= 6) score++;
      if (val.length >= 10) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      if (val.length === 0) {
        fill.style.width = '0%';
        fill.style.backgroundColor = 'transparent';
        text.innerText = 'Надёжность пароля';
      } else if (score <= 2) {
        fill.style.width = '30%';
        fill.style.backgroundColor = 'var(--color-error)';
        text.innerText = 'Слабый пароль ⚠️';
      } else if (score === 3 || score === 4) {
        fill.style.width = '65%';
        fill.style.backgroundColor = 'var(--color-warning)';
        text.innerText = 'Хороший уровень защиты 👍';
      } else {
        fill.style.width = '100%';
        fill.style.backgroundColor = 'var(--color-success)';
        text.innerText = 'Идеальный надёжный пароль 🔥';
      }
    });
  }

  initThemeSwitcher() {
    const themeSelect = document.getElementById('settings-theme');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.settings.applyTheme(e.target.value);
      });
    }
  }

  initMacros() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        showCustomToast('📸 Скриншот сделан! (имитация)', 'success');
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        if (window.companionManager && window.companionManager.activeChat) {
          window.companionManager.activeChat.messages = [];
          window.companionManager.renderMessages();
          window.companionManager.saveChatsToStorage();
          showCustomToast('Чат очищен', 'warning');
        }
      }
    });
  }

  initRealMacros() {
    const macroBtns = document.querySelectorAll('#view-macros .btn-glass-secondary');
    const macros = this.settings.settings.macros;
    macroBtns.forEach((btn, index) => {
      if (index === 0) btn.textContent = macros.screenshot || 'Ctrl+Shift+S';
      if (index === 1) btn.textContent = macros.clearChat || 'Ctrl+Shift+E';

      btn.addEventListener('click', () => {
        btn.textContent = 'Нажмите комбинацию...';
        btn.style.borderColor = 'var(--accent-purple-bright)';
        const handler = (e) => {
          e.preventDefault();
          if (e.key === 'Escape') {
            btn.textContent = 'Отменено';
            btn.style.borderColor = '';
            document.removeEventListener('keydown', handler);
            return;
          }
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          let keys = [];
          if (e.ctrlKey) keys.push('Ctrl');
          if (e.shiftKey) keys.push('Shift');
          if (e.altKey) keys.push('Alt');
          keys.push(e.key.toUpperCase());
          const combo = keys.join(' + ');
          btn.textContent = combo;
          btn.style.borderColor = '';
          if (index === 0) macros.screenshot = combo;
          if (index === 1) macros.clearChat = combo;
          this.settings.saveSettings();
          showCustomToast(`Макрос назначен: ${combo}`, 'success');
          document.removeEventListener('keydown', handler);
        };
        document.addEventListener('keydown', handler);
      });
    });
  }

  initCropper() {
    const zoomSlider = document.getElementById('crop-zoom');
    const img = document.getElementById('crop-image');
    const overlay = document.getElementById('modal-crop');
    if (!zoomSlider || !img || !overlay) return;

    let isDragging = false;
    let startX, startY, imgX = 0, imgY = 0;
    let currentScale = 1;

    img.style.position = 'relative';
    img.style.left = '0px';
    img.style.top = '0px';

    img.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX - parseInt(img.style.left || 0);
      startY = e.clientY - parseInt(img.style.top || 0);
      img.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      img.style.cursor = 'move';
    });
    img.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      imgX = e.clientX - startX;
      imgY = e.clientY - startY;
      img.style.left = imgX + 'px';
      img.style.top = imgY + 'px';
    });

    zoomSlider.addEventListener('input', (e) => {
      currentScale = e.target.value / 100;
      img.style.transform = `scale(${currentScale})`;
    });

    document.getElementById('btn-crop-cancel').addEventListener('click', () => {
      overlay.classList.remove('show');
      this.tempCropPath = null;
      if (this.cropCallback) this.cropCallback(null);
    });

    document.getElementById('btn-crop-save').addEventListener('click', () => {
      const result = this.tempCropPath;
      overlay.classList.remove('show');
      if (this.cropCallback) {
        this.cropCallback(result);
        this.cropCallback = null;
      }
    });
  }

  switchScreen(fromId, toId) {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    if (fromEl) fromEl.style.display = 'none';
    if (toEl) toEl.style.display = 'flex';
  }
}

window.authManager = new AuthManager();
window.settingsManager = window.authManager.settings;