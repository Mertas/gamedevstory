@echo off
rem Game Dev Story — запуск сервера и игры (ярлык на рабочем столе)
cd /d E:\MY\GameDevStory

rem явные пути: node и pnpm живут внутри Hermes-окружения (в PATH ярлыка их нет)
set "GDS_NODE=C:\Users\GOODMONING\AppData\Local\hermes\node\node.exe"
set "GDS_PNPM=C:\Users\GOODMONING\AppData\Local\hermes\node\node_modules\pnpm\bin\pnpm.cjs"
rem pnpm запускает скрипты через node из PATH — ставим hermes-ноду (v22, нужен node:sqlite) ПЕРВОЙ
set "PATH=C:\Users\GOODMONING\AppData\Local\hermes\node;%PATH%"

rem освобождаем порт 3001, если на нём наш прежний сервер; чужой процесс молча не убиваем (аудит-51 02-P3-3)
set "GDS_OLD_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do if not defined GDS_OLD_PID set "GDS_OLD_PID=%%p"
if defined GDS_OLD_PID (
  setlocal enabledelayedexpansion
  set "GDS_OURS="
  for /f "delims=" %%c in ('wmic process where "ProcessId=!GDS_OLD_PID!" get CommandLine /value 2^>nul ^| findstr /i "GameDevStory"') do set "GDS_OURS=1"
  if defined GDS_OURS (
    echo   Порт 3001 занят прежним сервером игры — останавливаю (PID !GDS_OLD_PID!).
    taskkill /F /PID !GDS_OLD_PID! >nul 2>&1
  ) else (
    echo   Порт 3001 занят ДРУГИМ процессом (PID !GDS_OLD_PID!) — это не сервер игры.
    choice /C YN /T 15 /D N /M "Завершить его принудительно"
    if errorlevel 2 ( echo   Запуск отменён: освободите порт 3001. & pause & exit /b 1 )
    taskkill /F /PID !GDS_OLD_PID! >nul 2>&1
  )
  endlocal
)

title Game Dev Story — сервер (закройте это окно, чтобы остановить игру)
echo.
echo   Game Dev Story — запуск...
echo   Игра откроется в браузере: http://localhost:3001
echo.
rem браузер откроется через 5 секунд, когда сервер уже встанет
start "" /b cmd /c "ping -n 6 127.0.0.1 >nul & start http://localhost:3001"

"%GDS_NODE%" "%GDS_PNPM%" server
pause
