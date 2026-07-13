@echo off
chcp 65001 > nul
title Запуск SyncLine
color 0D

echo ==========================================
echo       ЗАПУСК SyncLine
echo ==========================================
echo.
echo Запуск приложения...
echo.

:: Проверяем наличие npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm не найден! Установите Node.js.
    pause
    exit /b
)

:: Проверяем наличие node_modules
if not exist "node_modules" (
    echo [ВНИМАНИЕ] Папка node_modules не найдена.
    echo Выполняю установку зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось установить зависимости.
        pause
        exit /b
    )
)

:: Запускаем приложение
call npm start

:: Если приложение закрылось с ошибкой, показываем сообщение
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Приложение завершилось с кодом %errorlevel%.
    echo Проверьте логи выше.
)

echo.
echo Нажмите любую клавишу для выхода...
pause > nul