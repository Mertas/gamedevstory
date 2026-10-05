@echo off
title QuestTest — тест саги «Синяя Комета»
cd /d "%~dp0"
start "QuestTest server" /min "C:\nvm4w\nodejs\node.exe" server.mjs
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:8899/
