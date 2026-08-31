@echo off
setlocal
title Daily Ledger - Local Server
cd /d "%~dp0pc-web"
if errorlevel 1 goto missing_project
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
if not exist "node_modules\vinext\dist\cli.js" goto missing_dependencies
echo Starting Daily Ledger on this computer only.
echo Keep this window open while using the app.
echo When ready, open http://localhost:5173/
echo Or double-click the .url shortcut in the project folder.
echo If port 5173 is already in use, open the URL instead of starting again.
echo.
node.exe node_modules\vinext\dist\cli.js dev --host 127.0.0.1 --port 5173 --strictPort
echo.
echo Server stopped. If an error is shown above, share a screenshot.
pause
exit /b
:missing_project
echo Project folder pc-web was not found. Keep this file beside pc-web.
pause
exit /b 1
:missing_node
echo Node.js was not found. Please check the Node.js installation.
pause
exit /b 1
:missing_dependencies
echo Project dependencies are missing. Please ask for help restoring them.
pause
exit /b 1
