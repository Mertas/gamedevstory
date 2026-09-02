@echo off
rem Game Dev Story — запуск сервера и игры (ярлык на рабочем столе)
cd /d E:\MY\GameDevStory

rem явные пути: node и pnpm живут внутри Hermes-окружения (в PATH ярлыка их нет)
set "GDS_NODE=C:\Users\GOODMONING\AppData\Local\hermes\node\node.exe"
set "GDS_PNPM=C:\Users\GOODMONING\AppData\Local\hermes\node\node_modules\pnpm\bin\pnpm.cjs"
rem pnpm запускает скрипты через node из PATH — ставим hermes-ноду (v22, нужен node:sqlite) ПЕРВОЙ
set "PATH=C:\Users\GOODMONING\AppData\Local\hermes\node;%PATH%"

rem освобождаем порт 3001, если сервер уже запущен (закрываем старый)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

title Game Dev Story — сервер (закройте это окно, чтобы остановить игру)
echo.
echo   Game Dev Story — запуск...
echo   Игра откроется в браузере: http://localhost:3001
echo.
rem браузер откроется через 5 секунд, когда сервер уже встанет
start "" /b cmd /c "ping -n 6 127.0.0.1 >nul & start http://localhost:3001"

"%GDS_NODE%" "%GDS_PNPM%" server
pause
