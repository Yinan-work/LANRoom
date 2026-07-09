# LANRoom

[English](#english) | [简体中文](#simplified-chinese)

---

<h2 id="english">English</h2>

**LANRoom** is a lightweight, real-time chat room application designed specifically for local area networks (LAN). Built with Node.js and Socket.io, it allows users connected to the same Wi-Fi network to quickly join a shared chat room by simply scanning a QR code or entering the host's IP address. No internet servers or external databases are required—everything stays fast, local, and secure.

### Features
* **Zero Configuration:** Start the server and you're good to go.
* **QR Code Joining:** Automatically generates a QR code for your LAN IP, allowing friends on the same Wi-Fi to scan and join instantly on their phones.
* **Real-time Messaging:** Lightning-fast, real-time text chatting powered by Socket.io.
* **No Database Required:** Anonymous joining with just a nickname. Messages are broadcasted instantly and not permanently stored.

### Quick Start
1. Ensure you have [Node.js](https://nodejs.org/) installed on your machine.
2. Clone this repository:
   ```bash
   git clone https://github.com/Yinan-work/LANRoom.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
   *(Alternatively, on Windows, you can double-click `一键启动聊天室.bat`)*
5. The terminal will display your LAN access address (e.g., `http://192.168.x.x:3000`). Share this link with your friends, or have them scan the QR code within the app to join!

### Tech Stack
* Node.js
* Express
* Socket.io
* HTML/CSS/Vanilla JavaScript (Frontend)

---

<h2 id="simplified-chinese">简体中文</h2>

**LANRoom** 是一个专为局域网设计的轻量级实时聊天室。基于 Node.js 和 Socket.io 构建。只要大家连接在同一个 Wi-Fi 或局域网下，只需扫描二维码或输入主机的局域网 IP 地址，即可快速加入公共聊天大厅。无需任何外网服务器或数据库，通信极速、纯粹且私密。

### 核心功能
* **零配置开箱即用：** 启动服务器即可开始使用。
* **扫码极速加入：** 自动获取本机的局域网 IP 并生成二维码，同一 Wi-Fi 下的朋友用手机扫码即可直接加入。
* **实时消息同步：** 基于 Socket.io 实现极低延迟的实时文本聊天。
* **无痕免注册：** 无需连接数据库，输入昵称直接开聊，无历史包袱。

### 快速开始
1. 请确保您的电脑上已安装 [Node.js](https://nodejs.org/)。
2. 克隆本仓库到本地：
   ```bash
   git clone https://github.com/Yinan-work/LANRoom.git
   ```
3. 安装依赖项：
   ```bash
   npm install
   ```
4. 启动服务器：
   ```bash
   npm start
   ```
   *（如果您是 Windows 用户，也可以直接双击目录下的 `一键启动聊天室.bat` 脚本快速启动）*
5. 控制台会打印出您的【局域网访问地址】（例如：`http://192.168.x.x:3000`），将这个地址发给朋友，或者让他们直接扫描聊天室页面右上角的“分享”二维码即可！

### 技术栈
* Node.js
* Express
* Socket.io
* 原生 HTML/CSS/JavaScript (前端)
