# 开发踩坑记录 (Pitfalls)

在为局域网聊天室添加图片发送功能的过程中，遇到了一些具有代表性的技术坑点，特此记录以备日后参考。

## 1. Windows `.bat` 批处理文件的编码与换行符问题

**问题描述：**
双击 `一键启动聊天室.bat` 启动 Node.js 时，Windows 命令提示符 (cmd.exe) 报错：
* `'0A' is not recognized as an internal or external command`
* `'濡傛灉...' is not recognized as an internal or external command`

**问题剖析：**
这两个报错根源在于**代码编辑器与 Windows CMD 默认解析机制的冲突**。
1. **换行符冲突 (LF vs CRLF)**：在现代代码编辑器（如 VSCode）中创建文件时，默认换行符往往是 Unix 风格的 `LF` (`\n`)。然而，Windows 的 `cmd.exe` 在执行 `.bat` 时严格依赖 `CRLF` (`\r\n`)。如果遇到仅用 `LF` 换行的文件，CMD 会发生解析截断。例如代码 `color 0A\n`，CMD 可能会将前面的 `color` 识别正确，但错把下一行的换行符十六进制代码 `0A` 当作一个独立的指令，从而报错。
2. **编码冲突 (UTF-8 vs GBK)**：原本的 `.bat` 文件中包含了中文提示语。文件保存为没有 BOM 的 `UTF-8` 格式，但中文版 Windows 的 CMD 默认使用的是代码页 936 (GBK) 进行解析。这导致 UTF-8 的中文被错误解析成了诸如“濡傛灉”之类的乱码。当乱码加上换行符解析混乱时，CMD 甚至会尝试去把这些乱码当成命令执行。

**解决方案：**
* （尝试过的临时方案）：在脚本开头加入 `chcp 65001 > nul` 强制 CMD 使用 UTF-8 解析。但这并不能解决 LF 换行符导致的截断问题。
* **最终完美方案**：直接将 `.bat` 文件中的中文提示替换为纯英文（ASCII），并强制将该文件的换行符转换为 Windows 标准的 `CRLF`。这样一劳永逸地规避了所有由于语言版本、代码页和系统底层差异带来的执行失败。

## 2. 移动端直接上传大图导致局域网卡顿

**问题描述：**
现代智能手机（特别是 iOS 设备）拍出的照片动辄 5MB 到 20MB。如果在局域网内直接广播原图，瞬间会占用极高的路由器带宽，并且会导致接收端手机浏览器的内存飙升甚至崩溃重启（Safari 常见现象）。

**解决方案：**
引入了 **前端 Canvas 智能压缩**。在用户选择了图片后、调用 `fetch` 上传之前，利用 `FileReader` 读取图片并在内存中绘制到一个受限分辨率的 `<canvas>` 上（限制最大宽度 1920 像素），最后通过 `canvas.toBlob` 导出质量为 0.7 的 JPEG 图像。
这一步骤通常能将 10MB 的照片瞬间压缩至 300KB - 500KB，使得移动端发图体验变成了无感知的“秒发”，极大地提升了稳定性。同时我们也保留了“原图”复选框供特殊场景使用。

## 3. WebSocket 数据格式的平滑过渡

**问题描述：**
聊天室之前的逻辑是通过 Socket.io 直接发送和广播纯字符串（纯文本）。现在要加入图片，需要前端告诉后端“这是一张图片，不是文本”。

**解决方案：**
将 Socket.io 传输的数据 payload 从 `String` 重构为了 `Object`，格式如 `{ type: 'text'|'image', content: '...' }`。
为防止旧客户端未刷新或者有旧格式的数据残留，在 `server.js` 做了兼容层：
```javascript
socket.on('chat message', (data) => {
    if (typeof data === 'string') {
        data = { type: 'text', content: data }; // 将旧格式包装为新对象
    }
    socket.broadcast.emit('chat message', { user: currentUser, ...data });
});
```
确保了协议升级的前后向兼容。
