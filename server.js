const WebSocket = require("ws");
const os = require("os");

const wss = new WebSocket.Server({ port: 3000, host: "0.0.0.0" });

// ws -> user
const socketUser = new Map();
// username -> ws
const userSocket = new Map();

function genUserId() {
  return Math.random().toString(36).slice(2, 10);
}

wss.on("connection", ws => {
  console.log("🔌 新连接");

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    /* ========= 登录 ========= */
    if (data.type === "login") {
      const username = data.username;

      // 若同名用户已存在，踢掉旧连接
      if (userSocket.has(username)) {
        const oldWs = userSocket.get(username);
        try { oldWs.close(); } catch {}
      }

      const user = {
        id: genUserId(),
        username,
        lat: null,
        lng: null,
        range: 1000
      };

      socketUser.set(ws, user);
      userSocket.set(username, ws);

      console.log("👤 登录：", username);

      // 告诉自己
      ws.send(JSON.stringify({
        type: "self",
        user
      }));

      broadcastUsers();
    }

    /* ========= 聊天 ========= */
    if (data.type === "chat") {
      const fromUser = socketUser.get(ws);
      if (!fromUser) return;

      // 私聊
      if (data.to) {
        const targetWs = userSocket.get(data.to);
        if (!targetWs) return;

        const msgObj = {
          type: "chat",
          from: fromUser.username,
          to: data.to,
          msg: data.msg,
          private: true,
          time: Date.now()
        };

        // 发给对方
        targetWs.send(JSON.stringify(msgObj));
        // 回显给自己
        ws.send(JSON.stringify(msgObj));
        console.log("📨 私聊：", msgObj);
        return;
      }

      // 公屏
      const msgObj = {
        type: "chat",
        from: fromUser.username,
        msg: data.msg,
        time: Date.now()
      };
      broadcast(msgObj);
      console.log("📨 公屏：", msgObj);
    }

    /* ========= 位置 ========= */
    if (data.type === "position") {
      const user = socketUser.get(ws);
      if (!user) return;

      user.lat = data.lat;
      user.lng = data.lng;

      broadcastUsers();
    }
  });

  ws.on("close", () => {
    const user = socketUser.get(ws);
    if (user) {
      console.log("❌ 离线：", user.username);
      socketUser.delete(ws);
      userSocket.delete(user.username);
      broadcastUsers();
    }
  });
});

/* ========= 工具 ========= */
function broadcastUsers() {
  // 只广播有 lat/lng 的用户
  const list = [...socketUser.values()].map(u => ({
    id: u.id,
    username: u.username,
    lat: u.lat,
    lng: u.lng,
    range: u.range
  }));
  broadcast({ type: "users", list });
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

/* ========= IP 输出 ========= */
const interfaces = os.networkInterfaces();
let localIp = "localhost";
for (const dev in interfaces) {
  for (const item of interfaces[dev]) {
    if (item.family === "IPv4" && !item.internal) {
      localIp = item.address;
      break;
    }
  }
}

console.log("✅ WebSocket 服务已启动");
console.log(`🌐 局域网访问：ws://${localIp}:3000`);
console.log(`💻 本机访问：ws://localhost:3000`);
