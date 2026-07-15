/**
 * SyncLine — Frontend Core Engine (Глобальные UI-утилиты)
 * Версия: 4.0 — Мега-апдейт
 */

// ==========================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ДОКУМЕНТА
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initCustomToasts();
    initDiscordServers();
    initFullscreenSettings();
    initTelegramCropper();
    initPlayerControls();
});

// ==========================================
// ГЛОБАЛЬНАЯ СИСТЕМА УВЕДОМЛЕНИЙ (ТОСТЫ)
// ==========================================
function showCustomToast(message, type = "success") {
    let container = document.querySelector(".toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.getElementById("app-root").appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "fa-check-circle";
    if (type === "error") icon = "fa-exclamation-circle";
    if (type === "warning") icon = "fa-exclamation-triangle";
    if (type === "info") icon = "fa-circle-info";

    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add("show"), 50);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Перехватываем стандартный alert
window.alert = (msg) => showCustomToast(msg, "warning");

function initCustomToasts() {
    // Уже сделано выше, но оставляем для ясности
}

// ==========================================
// ЛОГИКА СОЗДАНИЯ СЕРВЕРОВ (Discord Style)
// ==========================================
function initDiscordServers() {
    const addServerBtn = document.querySelector(".server-icon.add-server");
    const serverSidebar = document.querySelector(".server-sidebar");
    
    if (!addServerBtn || !serverSidebar) return;

    addServerBtn.addEventListener("click", () => {
        const serverName = prompt("Введите название нового Discord-сервера:");
        if (!serverName || serverName.trim() === "") {
            showCustomToast("Название сервера не может быть пустым", "warning");
            return;
        }

        const shortcut = serverName.trim().substring(0, 2).toUpperCase();
        const newServer = document.createElement("div");
        newServer.className = "server-icon animate-fade-in";
        newServer.innerText = shortcut;
        newServer.title = serverName;

        serverSidebar.insertBefore(newServer, addServerBtn);
        showCustomToast(`Сервер "${serverName}" создан!`, "success");

        newServer.addEventListener("click", () => {
            document.querySelectorAll(".server-icon").forEach(s => s.classList.remove("active"));
            newServer.classList.add("active");
            showCustomToast(`Подключение к ${serverName}...`, "info");
        });
    });

    document.querySelectorAll(".server-icon:not(.add-server)").forEach(server => {
        server.addEventListener("click", () => {
            document.querySelectorAll(".server-icon").forEach(s => s.classList.remove("active"));
            server.classList.add("active");
        });
    });
}

// ==========================================
// УПРАВЛЕНИЕ ОКНОМ НАСТРОЕК
// ==========================================
function initFullscreenSettings() {
    const settingsOverlay = document.querySelector(".settings-fullscreen-overlay");
    const openBtn = document.querySelector(".btn-icon.fa-cog");
    const closeBtn = document.querySelector(".btn-close-settings-fullscreen");

    if (!settingsOverlay) return;

    const toggleSettings = (state) => {
        if (state) settingsOverlay.classList.add("show");
        else settingsOverlay.classList.remove("show");
    };

    if (openBtn) openBtn.addEventListener("click", () => toggleSettings(true));
    if (closeBtn) closeBtn.addEventListener("click", () => toggleSettings(false));
}

// ==========================================
// TELEGRAM-STYLE КАДРИРОВАНИЕ ФОТО
// ==========================================
function initTelegramCropper() {
    const avatarInput = document.getElementById("avatar-file-input");
    const cropOverlay = document.querySelector(".crop-modal-overlay");
    const cropImg = document.querySelector(".crop-img-preview");
    const zoomSlider = document.querySelector(".crop-zoom-slider");
    const cancelCrop = document.getElementById("btn-crop-cancel");
    const saveCrop = document.getElementById("btn-crop-save");

    if (!avatarInput || !cropOverlay) return;

    let isDragging = false;
    let startX, startY, imgX = 0, imgY = 0;
    let currentScale = 1;

    avatarInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                cropImg.src = event.target.result;
                cropOverlay.classList.add("show");
                imgX = 0; imgY = 0; currentScale = 1;
                zoomSlider.value = 100;
                updateImageTransform();
            };
            reader.readAsDataURL(file);
        }
    });

    cropImg.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX - imgX;
        startY = e.clientY - imgY;
        cropImg.style.cursor = "grabbing";
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
        if (cropImg) cropImg.style.cursor = "move";
    });

    cropImg.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        imgX = e.clientX - startX;
        imgY = e.clientY - startY;
        updateImageTransform();
    });

    zoomSlider.addEventListener("input", () => {
        currentScale = zoomSlider.value / 100;
        updateImageTransform();
    });

    function updateImageTransform() {
        cropImg.style.transform = `translate(${imgX}px, ${imgY}px) scale(${currentScale})`;
    }

    cancelCrop.addEventListener("click", () => {
        cropOverlay.classList.remove("show");
        avatarInput.value = "";
    });

    saveCrop.addEventListener("click", () => {
        // Обновляем аватарку только текущего пользователя (не бота и не избранное)
        const currentAva = document.getElementById('current-user-avatar');
        if (currentAva) {
            currentAva.style.backgroundImage = `url('${cropImg.src}')`;
            currentAva.style.backgroundSize = 'cover';
            currentAva.innerHTML = '';
        }
        // Также обновляем в настройках
        const settingsAva = document.getElementById('settings-my-avatar');
        if (settingsAva) {
            settingsAva.style.backgroundImage = `url('${cropImg.src}')`;
            settingsAva.style.backgroundSize = 'cover';
            settingsAva.innerHTML = '';
        }
        // Сохраняем в localStorage
        localStorage.setItem('syncline_avatar', cropImg.src);
        cropOverlay.classList.remove("show");
        showCustomToast("Аватар успешно обновлен", "success");
    });
}

// ==========================================
// УПРАВЛЕНИЕ МИНИ-ПЛЕЕРОМ
// ==========================================
function initPlayerControls() {
    // Кнопки управления уже обрабатываются в companion.js,
    // но здесь мы добавляем вспомогательные визуальные эффекты.
    const playBtn = document.querySelector('.player-btn.play-pause');
    if (!playBtn) return;

    // Обработчики кнопок для переключения треков (дублируем для надёжности)
    const prevBtn = document.querySelector('#btn-prev-track');
    const nextBtn = document.querySelector('#btn-next-track');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (window.companionManager) {
                window.companionManager.prevTrack();
            } else {
                showCustomToast('⏪ Предыдущий трек', 'info');
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (window.companionManager) {
                window.companionManager.nextTrack();
            } else {
                showCustomToast('⏩ Следующий трек', 'info');
            }
        });
    }
}