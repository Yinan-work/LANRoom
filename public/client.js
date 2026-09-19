const socket = io();

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

// 记录已处理的消息ID，防止重复渲染
const processedMsgIds = new Set();

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
        syncHistory();
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
        syncHistory();
    }
});

function syncHistory() {
    socket.emit('sync history', (history) => {
        if (Array.isArray(history)) {
            history.forEach(msg => {
                const side = msg.user === currentNickname ? 'right' : 'left';
                appendMessage(msg.user, msg, side);
            });
        }
    });
}

// 页面加载时自动恢复登录状态
if (currentNickname) {
    enterChatRoom(currentNickname);
}

// ---------------- 聊天逻辑 ----------------

// 发送消息
function sendMessage() {
    const msgText = messageInput.value.trim();
    if (msgText) {
        const payload = { id: generateId(), type: 'text', content: msgText };
        socket.emit('chat message', payload);
        
        appendMessage(currentNickname, payload, 'right');
        
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
    // 兼容旧的文本消息
    if (typeof data.text === 'string' && !data.type) {
        appendMessage(data.user, { type: 'text', content: data.text }, 'left');
    } else {
        appendMessage(data.user, data, 'left');
    }
});

// 接收系统消息 (如：加入、离开)
socket.on('system message', (msg) => {
    appendSystemMessage(msg);
});

// ---------------- UI 渲染逻辑 ----------------

// 添加普通消息到界面
function appendMessage(sender, data, side) {
    if (data && data.id) {
        if (processedMsgIds.has(data.id)) return;
        processedMsgIds.add(data.id);
    }

    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper', `message-${side}`);
    
    let senderHtml = '';
    if (side === 'left') {
        senderHtml = `<div class="message-sender">${sender}</div>`;
    }
    
    let contentHtml = '';
    // 兼容遗留的直接传 string 的情况
    if (typeof data === 'string') {
        contentHtml = escapeHTML(data);
    } else if (data.type === 'text') {
        contentHtml = escapeHTML(data.content);
    } else if (data.type === 'image') {
        contentHtml = `<img src="${data.content}" alt="图片" onclick="window.open(this.src, '_blank')">`;
    }
    
    wrapper.innerHTML = `
        ${senderHtml}
        <div class="message-bubble">${contentHtml}</div>
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
const interfaceSelectBox = document.getElementById('interface-select-box');
const interfaceSelect = document.getElementById('interface-select');
const copyUrlBtn = document.getElementById('copy-url-btn');

let qrcodeInstance = null;
let currentShareUrl = '';
let serverConfig = null;

// 初始化获取局域网配置
fetch('/api/config')
    .then(res => res.json())
    .then(data => {
        serverConfig = data;
        setupInterfaceSelector(data);
    })
    .catch(err => {
        console.error('获取局域网配置失败:', err);
        // 如果后端接口失败，回退使用当前浏览器的地址
        currentShareUrl = window.location.origin;
        shareUrlText.textContent = currentShareUrl;
    });

// 配置网卡下拉菜单
function setupInterfaceSelector(config) {
    const interfaces = config.interfaces || [];
    const port = config.port || window.location.port || 3433;
    const currentHost = window.location.hostname;
    const isCurrentHostIp = currentHost !== 'localhost' && currentHost !== '127.0.0.1' && /\d+\.\d+\.\d+\.\d+/.test(currentHost);

    // 默认分享 URL：如果当前就是通过具体的局域网 IP 访问，优先用当前 host
    if (isCurrentHostIp) {
        currentShareUrl = window.location.origin;
    } else {
        currentShareUrl = config.url || `http://${config.ip}:${port}`;
    }
    shareUrlText.textContent = currentShareUrl;

    // 如果有多个网卡，展示下拉框供切换
    if (interfaces.length > 1 && interfaceSelectBox && interfaceSelect) {
        interfaceSelect.innerHTML = '';
        interfaces.forEach(item => {
            const opt = document.createElement('option');
            opt.value = `http://${item.address}:${port}`;
            opt.dataset.ip = item.address;
            opt.dataset.name = item.name;
            opt.textContent = `${item.name} (${item.address})`;

            // 匹配默认选中项
            if (isCurrentHostIp && item.address === currentHost) {
                opt.selected = true;
            } else if (!isCurrentHostIp && (item.address === config.ip || item.isCurrent)) {
                opt.selected = true;
            }
            interfaceSelect.appendChild(opt);
        });
        interfaceSelectBox.style.display = 'flex';

        // 监听网卡切换
        interfaceSelect.addEventListener('change', () => {
            const selectedOpt = interfaceSelect.options[interfaceSelect.selectedIndex];
            currentShareUrl = interfaceSelect.value;
            shareUrlText.textContent = currentShareUrl;
            renderQrCode(currentShareUrl);

            // 通知服务端记住此选择
            if (selectedOpt && selectedOpt.dataset.ip) {
                fetch('/api/select-interface', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: selectedOpt.dataset.ip, name: selectedOpt.dataset.name })
                }).catch(() => {});
            }
        });
    }
}

// 渲染或更新二维码
function renderQrCode(url) {
    if (!url) return;
    if (!qrcodeInstance) {
        qrcodeContainer.innerHTML = '';
        qrcodeInstance = new QRCode(qrcodeContainer, {
            text: url,
            width: 190,
            height: 190,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        qrcodeInstance.clear();
        qrcodeInstance.makeCode(url);
    }
}

// 打开分享弹窗
shareBtn.addEventListener('click', () => {
    qrModal.classList.add('active');
    renderQrCode(currentShareUrl);
});

// 复制链接
if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', async () => {
        if (!currentShareUrl) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(currentShareUrl);
            } else {
                const tempInput = document.createElement('input');
                tempInput.value = currentShareUrl;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
            }
            const originalText = copyUrlBtn.textContent;
            copyUrlBtn.textContent = ' 已复制！';
            setTimeout(() => {
                copyUrlBtn.textContent = originalText;
            }, 1500);
        } catch (err) {
            alert('复制失败，请手动长按复制下方链接');
        }
    });
}

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

// ---------------- 图片发送逻辑 ----------------

const imageInput = document.getElementById('image-input');
const originalCheckbox = document.getElementById('original-image-checkbox');

// 1. 点击按钮选择图片
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await handleImageUpload(file);
    }
    imageInput.value = ''; // 重置 input
});

// 2. 拖拽图片到页面
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!chatView.classList.contains('active')) return;
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        await handleImageUpload(file);
    }
});

// 3. 粘贴图片 (Ctrl+V)
document.addEventListener('paste', async (e) => {
    if (!chatView.classList.contains('active')) return;
    
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            await handleImageUpload(file);
        }
    }
});

// 核心上传处理函数
async function handleImageUpload(file) {
    let finalFile = file;
    
    // 如果没勾选“原图”，就进行前端压缩
    if (!originalCheckbox.checked) {
        try {
            finalFile = await compressImage(file);
        } catch (err) {
            console.error("图片压缩失败，将发送原图", err);
        }
    }
    
    const formData = new FormData();
    formData.append('image', finalFile, file.name || 'image.png');
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.url) {
            // 上传成功后通过 WebSocket 发送图片 URL
            const payload = { id: generateId(), type: 'image', content: data.url };
            socket.emit('chat message', payload);
            
            // 立即在本地显示
            appendMessage(currentNickname, payload, 'right');
            scrollToBottom();
        }
    } catch (err) {
        alert('图片上传失败！');
        console.error(err);
    }
}

// 图片压缩函数
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 限制最大宽度 1920，等比例缩放
                const MAX_WIDTH = 1920;
                let width = img.width;
                let height = img.height;
                
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // 压缩成 JPEG，质量 0.7
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name || 'compressed.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

