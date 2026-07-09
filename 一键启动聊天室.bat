@echo off
title 局域网聊天室服务端
color 0A
cd /d "%~dp0"
echo =======================================
echo 正在启动局域网聊天室...
echo 如果出现防火墙提示，请允许 Node.js 访问网络。
echo =======================================
node server.js
pause
