@echo off
cd /d "%~dp0"
if not exist .env (
    echo Creating .env from example...
    copy .env.example .env
    echo Please edit .env with your tokens and restart.
    pause
    exit /b
)
node bot.js
pause