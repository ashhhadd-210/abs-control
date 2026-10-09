@echo off
title ABS Control
cd /d "%~dp0"
echo Starting ABS Control on http://localhost:4800 ...
start "" http://localhost:4800
node --no-warnings server.js
pause
