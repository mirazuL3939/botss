@echo off
cd /d "%~dp0"

echo ==========================================
echo  ModerBot Deploy to Render via GitHub
echo ==========================================
echo.

REM Check for changes
git status --short
echo.

REM Ask for commit message
set /p MSG="Commit message (Enter for auto): "
if "%MSG%"=="" set MSG=update %DATE% %TIME%

echo.
echo Committing and pushing...
git add .
git commit -m "%MSG%"
git push origin main

echo.
echo ==========================================
echo  Deploy triggered!
echo  Check: https://github.com/mirazuL3939/botss/actions
echo  Render: https://dashboard.render.com/web/srv-xxxxxx
echo ==========================================
pause