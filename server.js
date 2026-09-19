const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 图片上传与清理逻辑 ---
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 清理旧的运行文件夹（保留最近2个，加上本次新建的即为3个）
const folders = fs.readdirSync(uploadsDir).filter((f) => f.startsWith("run_"));
folders.sort(); // 默认按字符串排序即可（因为时间戳递增）
while (folders.length >= 3) {
  const oldest = folders.shift();
  fs.rmSync(path.join(uploadsDir, oldest), { recursive: true, force: true });
  console.log(`🧹 已清理旧聊天图片记录: ${oldest}`);
}

// 为当前这次运行创建一个新的文件夹
const currentRunFolder = `run_${Date.now()}`;
const currentRunPath = path.join(uploadsDir, currentRunFolder);
fs.mkdirSync(currentRunPath);

// 配置 Multer 存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, currentRunPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".png";
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});
const upload = multer({ storage: storage });

// 托管 public 文件夹作为静态资源
app.use(express.static(path.join(__dirname, "public")));

// 图片上传接口
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "没有上传文件" });
  }
  const imageUrl = `/uploads/${currentRunFolder}/${req.file.filename}`;
  res.json({ url: imageUrl });
});

const { resolveSelectedIp, saveConfig } = require("./network-utils");

let currentNetworkInfo = {
  selectedIp: "127.0.0.1",
  selectedInterface: "Loopback",
  interfaces: []
};

// 解析 JSON 请求体
app.use(express.json());

// 提供局域网配置给前端（用于生成二维码和网络切换）
app.get("/api/config", (req, res) => {
  const port = process.env.PORT || 3433;
  res.json({
    ip: currentNetworkInfo.selectedIp,
    selectedInterface: currentNetworkInfo.selectedInterface,
    port: port,
    url: `http://${currentNetworkInfo.selectedIp}:${port}`,
    interfaces: currentNetworkInfo.interfaces.map((i) => ({
      name: i.name,
      address: i.address,
      description: i.description,
      isCurrent: i.address === currentNetworkInfo.selectedIp
    }))
  });
});

// 支持前端切换选中的网卡并持久化记忆
app.post("/api/select-interface", (req, res) => {
  const { ip, name } = req.body || {};
  if (ip) {
    const match = currentNetworkInfo.interfaces.find((i) => i.address === ip);
    const ifaceName = name || (match ? match.name : "Custom");
    currentNetworkInfo.selectedIp = ip;
    currentNetworkInfo.selectedInterface = ifaceName;
    saveConfig(ifaceName, ip);
    console.log(`[配置更新] 用户通过前端切换了首选网卡: ${ifaceName} (${ip})`);
    return res.json({ success: true, ip, name: ifaceName });
  }
  res.status(400).json({ error: "无效的 IP 地址" });
});

// 保存最近的聊天记录，用于断线重连或新用户加入时同步
const MAX_HISTORY = 200;
let messageHistory = [];

// WebSocket 逻辑
io.on("connection", (socket) => {
  let currentUser = "匿名用户";

  // 监听历史消息同步请求
  socket.on("sync history", (callback) => {
    if (typeof callback === "function") {
      callback(messageHistory);
    }
  });

  // 监听用户加入
  socket.on("user joined", (nickname) => {
    currentUser = nickname;
    socket.broadcast.emit("system message", `${currentUser} 加入了聊天室`);
  });

  // 监听新消息并广播
  socket.on("chat message", (data) => {
    // 兼容旧代码，如果发来的是纯字符串，转换为对象
    if (typeof data === "string") {
      data = { type: "text", content: data };
    }

    const msgObj = {
      user: currentUser,
      ...data,
    };

    // 确保每条消息都有唯一 ID
    if (!msgObj.id) {
      msgObj.id =
        Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 9);
    }

    // 存入历史记录
    messageHistory.push(msgObj);
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory.shift();
    }

    // 向除自己外的其他人广播
    socket.broadcast.emit("chat message", msgObj);
  });

  // 监听用户断开连接
  socket.on("disconnect", () => {
    if (currentUser !== "匿名用户") {
      socket.broadcast.emit("system message", `${currentUser} 离开了聊天室`);
    }
  });
});

const PORT = process.env.PORT || 3433;

async function start() {
  currentNetworkInfo = await resolveSelectedIp();
  const IP_ADDRESS = currentNetworkInfo.selectedIp;

  server.listen(PORT, "0.0.0.0", () => {
    console.log("\n=======================================================");
    console.log("🎉 局域网聊天室服务器已启动！");
    console.log("=======================================================");
    console.log(`本机访问地址:   http://localhost:${PORT}`);
    console.log(`局域网推荐地址: http://${IP_ADDRESS}:${PORT}  [${currentNetworkInfo.selectedInterface}]`);
    
    if (currentNetworkInfo.interfaces.length > 1) {
      console.log("\n本机检测到的所有网络接口：");
      currentNetworkInfo.interfaces.forEach((item, idx) => {
        const isCurrent = item.address === IP_ADDRESS;
        const mark = isCurrent ? "★ [已选用]" : "          ";
        console.log(` ${mark} [${idx + 1}] ${item.name.padEnd(28)} -> http://${item.address}:${PORT} (${item.description})`);
      });
      console.log("\n💡 提示: 同一 WiFi 下的朋友请访问【局域网推荐地址】。");
      console.log("💡 若需手动选择其他网卡，可运行: npm run select-ip 或双击【选择网卡启动.bat】");
    }
    console.log("=======================================================\n");
  });
}

start();
