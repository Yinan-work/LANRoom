const os = require("os");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CONFIG_PATH = path.join(__dirname, "network-config.json");

// 虚拟网卡、代理、VPN 及特殊网卡的关键词（不区分大小写）
const VIRTUAL_NAME_KEYWORDS = [
  "vethernet",
  "vmware",
  "virtualbox",
  "vboxnet",
  "mihomo",
  "clash",
  "tap",
  "tun",
  "hyper-v",
  "tailscale",
  "zerotier",
  "docker",
  "teredo",
  "bluetooth",
  "loopback",
  "npcap",
  "wireguard",
  "wintun",
  "pseudo",
  "host-only"
];

// 常见真实物理网卡关键词（优先评分）
const PHYSICAL_NAME_KEYWORDS = [
  "wlan",
  "wi-fi",
  "wifi",
  "无线",
  "以太网",
  "ethernet",
  "本地连接",
  "en0",
  "eth0"
];

/**
 * 判断某个网卡或IP是否为虚拟/测试/代理网络
 */
function isVirtualInterface(name, address) {
  const lowerName = name.toLowerCase();
  for (const keyword of VIRTUAL_NAME_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      return true;
    }
  }

  // 198.18.* 通常为 Mihomo/Clash 等代理的 Fake-IP 或基准保留网段
  if (address.startsWith("198.18.")) {
    return true;
  }
  // 169.254.* 为没有获取到 DHCP 的 APIPA 自动配置保留地址
  if (address.startsWith("169.254.")) {
    return true;
  }
  // 127.* 回环
  if (address.startsWith("127.")) {
    return true;
  }

  return false;
}

/**
 * 计算网卡的优先级评分
 */
function calculateScore(name, address) {
  const lowerName = name.toLowerCase();
  const isVirtual = isVirtualInterface(name, address);

  // 虚拟网卡直接降权
  if (isVirtual) {
    return -100;
  }

  let score = 0;

  // 物理网卡名称加分
  for (const keyword of PHYSICAL_NAME_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      score += 50;
      break;
    }
  }

  // 常见家庭/办公私网网段加分
  if (address.startsWith("192.168.")) {
    score += 30;
  } else if (address.startsWith("10.")) {
    score += 20;
  } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) {
    score += 10;
  } else {
    score += 5;
  }

  return score;
}

/**
 * 获取本机所有的有效 IPv4 网卡列表，并按评分从高到低排序
 */
function getAllIPv4Interfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const devName in interfaces) {
    const ifaceList = interfaces[devName] || [];
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && iface.address !== "127.0.0.1" && !iface.internal) {
        const isVirtual = isVirtualInterface(devName, iface.address);
        const score = calculateScore(devName, iface.address);
        let description = "物理网卡/推荐";
        if (isVirtual) {
          description = "虚拟网卡 / 代理 / 虚拟机";
        } else if (score >= 50) {
          description = "主要局域网网卡 (推荐)";
        }

        result.push({
          name: devName,
          address: iface.address,
          netmask: iface.netmask,
          mac: iface.mac,
          isVirtual: isVirtual,
          score: score,
          description: description
        });
      }
    }
  }

  // 按得分从高到低排序
  result.sort((a, b) => b.score - a.score);
  return result;
}

/**
 * 读取本地保存的网卡配置
 */
function loadSavedConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    // 忽略读取错误
  }
  return null;
}

/**
 * 保存用户的网卡偏好
 */
function saveConfig(preferredInterface, preferredIp) {
  try {
    const data = {
      preferredInterface,
      preferredIp,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("保存网络配置文件失败:", err.message);
  }
}

/**
 * 命令行交互式选择网卡
 */
function promptSelectInterface(interfaces, defaultSelected) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log("\n=======================================================");
    console.log("   请选择聊天室要绑定的局域网网络接口/网卡：");
    console.log("=======================================================");

    interfaces.forEach((item, index) => {
      const isDefault = item.address === defaultSelected.address;
      const tag = isDefault ? " ★ [推荐/当前]" : "";
      console.log(` [${index + 1}] ${item.name.padEnd(28)} -> ${item.address.padEnd(16)} (${item.description})${tag}`);
    });
    console.log("=======================================================");

    const defaultIndex = interfaces.findIndex((i) => i.address === defaultSelected.address) + 1;
    const promptText = `请输入序号 [1-${interfaces.length}] (直接按回车使用 [${defaultIndex}]): `;

    rl.question(promptText, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      let chosen = defaultSelected;

      if (trimmed !== "") {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= interfaces.length) {
          chosen = interfaces[num - 1];
        } else {
          console.log(`输入无效，将默认使用: ${defaultSelected.name} (${defaultSelected.address})`);
        }
      }

      // 保存选择
      saveConfig(chosen.name, chosen.address);
      console.log(` 已成功保存选择: ${chosen.name} (${chosen.address})`);
      resolve(chosen);
    });
  });
}

/**
 * 决定最终使用的 IP 地址
 */
async function resolveSelectedIp() {
  const interfaces = getAllIPv4Interfaces();

  // 如果没有找到任何可用外部 IPv4，直接回退到 127.0.0.1
  if (interfaces.length === 0) {
    return {
      selectedIp: "127.0.0.1",
      selectedInterface: "Loopback",
      interfaces: []
    };
  }

  // 1. 检查是否有命令行参数指定 --ip=xxx
  const ipArg = process.argv.find((arg) => arg.startsWith("--ip="));
  if (ipArg) {
    const specifiedIp = ipArg.split("=")[1].trim();
    if (specifiedIp) {
      const match = interfaces.find((i) => i.address === specifiedIp);
      saveConfig(match ? match.name : "Custom", specifiedIp);
      return {
        selectedIp: specifiedIp,
        selectedInterface: match ? match.name : "Custom",
        interfaces
      };
    }
  }

  // 2. 确定默认推荐的网卡（先看是否有已保存的配置，且当前仍然有效）
  let defaultChoice = interfaces[0]; // 默认取最高评分的
  const savedConfig = loadSavedConfig();
  if (savedConfig && savedConfig.preferredIp) {
    const savedMatch = interfaces.find((i) => i.address === savedConfig.preferredIp);
    if (savedMatch) {
      defaultChoice = savedMatch;
    } else if (savedConfig.preferredInterface) {
      // 如果 IP 变了，但网卡名字匹配（比如重新连 Wi-Fi 换了 IP）
      const nameMatch = interfaces.find((i) => i.name === savedConfig.preferredInterface);
      if (nameMatch) {
        defaultChoice = nameMatch;
      }
    }
  }

  // 3. 检查是否开启交互选择模式（--select 或 -s）
  const isSelectMode = process.argv.includes("--select") || process.argv.includes("-s");
  if (isSelectMode) {
    const chosen = await promptSelectInterface(interfaces, defaultChoice);
    return {
      selectedIp: chosen.address,
      selectedInterface: chosen.name,
      interfaces
    };
  }

  // 4. 默认模式：直接使用推荐/已记忆的网卡
  return {
    selectedIp: defaultChoice.address,
    selectedInterface: defaultChoice.name,
    interfaces
  };
}

module.exports = {
  getAllIPv4Interfaces,
  resolveSelectedIp,
  saveConfig,
  loadSavedConfig
};
