@echo off
title LAN Chat Room Server
color 0A
cd /d "%~dp0"
echo =======================================
echo Starting LAN Chat Room...
echo Please allow Node.js if Windows Firewall prompts.
echo =======================================
node server.js
pause
