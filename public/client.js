const socket = io();

// DOM 元素
const loginView = document.getElementById('login-view');
const chatView = document.getElementById('chat-view');
const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const currentUserDisplay = document.getElementById('current-user-display');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let currentNickname = sessionStorage.getItem('chat_nickname') || '';

// ---------------- 登录与断线重连逻辑 ----------------

function enterChatRoom(nickname) {
    currentNickname = nickname;
    sessionStorage.setItem('chat_nickname', nickname); // 记住昵称，防止刷新丢失
    
    // 切换视图
    loginView.classList.remove('active');
    chatView.classList.add('active');
    
    currentUserDisplay.textContent = `当前: ${nickname}`;
    
    // 如果当前处于连接状态，立即通知服务器
    if (socket.connected) {
        socket.emit('user joined', nickname);
    }
    
    // 聚焦输入框
    setTimeout(() => messageInput.focus(), 100);
}

function joinChat() {
    const nickname = nicknameInput.value.trim();
    if (nickname) {
        enterChatRoom(nickname);
    } else {
        alert('请输入一个昵称！');
    }
}

joinBtn.addEventListener('click', joinChat);
nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

// 核心修复：监听 Socket 的连接与重连事件
socket.on('connect', () => {
    // 无论是首次连接，还是手机锁屏唤醒后的重新连接，只要有昵称就重新注册
    if (currentNickname) {
        socket.emit('user joined', currentNickname);
    }
});

// 页面加载时自动恢复登录状态
if (currentNickname) {
    enterChatRoom(currentNickname);
}

// ---------------- 聊天逻辑 ----------------

// 发送消息
function sendMessage() {
    const msgText = messageInput.value.trim();
    if (msgText) {
        // 发送给服务器
        socket.emit('chat message', msgText);
        
        // 立即在本地显示自己发的消息（右侧）
        appendMessage(currentNickname, msgText, 'right');
        
        // 清空输入框
        messageInput.value = '';
        messageInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// 接收别人的消息
socket.on('chat message', (data) => {
    appendMessage(data.user, data.text, 'left');
});

// 接收系统消息 (如：加入、离开)
socket.on('system message', (msg) => {
    appendSystemMessage(msg);
});

// ---------------- UI 渲染逻辑 ----------------

// 添加普通消息到界面
function appendMessage(sender, text, side) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper', `message-${side}`);
    
    // 如果是别人发的消息，显示发送者名字
    let senderHtml = '';
    if (side === 'left') {
        senderHtml = `<div class="message-sender">${sender}</div>`;
    }
    
    wrapper.innerHTML = `
        ${senderHtml}
        <div class="message-bubble">${escapeHTML(text)}</div>
    `;
    
    messagesContainer.appendChild(wrapper);
    scrollToBottom();
}

// 添加系统提示到界面
function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('message-system');
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

// 自动滚动到最底部
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 简单的 XSS 防护：转义 HTML 字符
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---------------- 分享与二维码逻辑 ----------------

const shareBtn = document.getElementById('share-btn');
const qrModal = document.getElementById('qr-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const qrcodeContainer = document.getElementById('qrcode');
const shareUrlText = document.getElementById('share-url-text');
let qrCodeGenerated = false;
let lanUrl = '';

// 获取局域网配置
fetch('/api/config')
    .then(res => res.json())
    .then(data => {
        lanUrl = data.url;
        shareUrlText.textContent = lanUrl;
    })
    .catch(err => console.error('获取局域网配置失败:', err));

// 打开分享弹窗
shareBtn.addEventListener('click', () => {
    qrModal.classList.add('active');
    
    // 只在第一次打开时生成二维码
    if (!qrCodeGenerated && lanUrl) {
        new QRCode(qrcodeContainer, {
            text: lanUrl,
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        qrCodeGenerated = true;
    }
});

// 关闭弹窗
closeModalBtn.addEventListener('click', () => {
    qrModal.classList.remove('active');
});

// 点击空白处也可以关闭
qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.classList.remove('active');
    }
});
