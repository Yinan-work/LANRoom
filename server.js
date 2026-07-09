const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 托管 public 文件夹作为静态资源
app.use(express.static(path.join(__dirname, 'public')));

// 获取本机的局域网 IPv4 地址
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

// 提供局域网配置给前端（用于生成二维码）
app.get('/api/config', (req, res) => {
    const port = process.env.PORT || 3000;
    res.json({
        ip: getLocalIpAddress(),
        port: port,
        url: `http://${getLocalIpAddress()}:${port}`
    });
});

// WebSocket 逻辑
io.on('connection', (socket) => {
    let currentUser = '匿名用户';

    // 监听用户加入
    socket.on('user joined', (nickname) => {
        currentUser = nickname;
        socket.broadcast.emit('system message', `${currentUser} 加入了聊天室`);
    });

    // 监听新消息并广播
    socket.on('chat message', (msg) => {
        // 向除自己外的其他人广播
        socket.broadcast.emit('chat message', {
            user: currentUser,
            text: msg
        });
    });

    // 监听用户断开连接
    socket.on('disconnect', () => {
        if (currentUser !== '匿名用户') {
            socket.broadcast.emit('system message', `${currentUser} 离开了聊天室`);
        }
    });
});

const PORT = process.env.PORT || 3000;
const IP_ADDRESS = getLocalIpAddress();

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n=======================================');
    console.log('🎉 局域网聊天室服务器已启动！');
    console.log('=======================================');
    console.log(`本机访问地址: http://localhost:${PORT}`);
    console.log(`局域网访问地址: http://${IP_ADDRESS}:${PORT}`);
    console.log('👉 请让同一 WiFi 下的朋友访问【局域网访问地址】即可一起聊天。');
    console.log('=======================================\n');
});
