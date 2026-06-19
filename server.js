const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const TICK_RATE = 1000 / 60;
const WORLD = { width: 2200, height: 1400 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const classes = {
  vanguard: { hp: 120, speed: 4.2, cooldown: 240, damage: 18, bulletSpeed: 13, color: "#40c0ff" },
  striker: { hp: 90, speed: 5.2, cooldown: 150, damage: 12, bulletSpeed: 15, color: "#f8d34f" },
  medic: { hp: 100, speed: 4.7, cooldown: 210, damage: 14, bulletSpeed: 12, color: "#54df9f" },
  phantom: { hp: 82, speed: 5.7, cooldown: 190, damage: 15, bulletSpeed: 16, color: "#d48cff" }
};

const obstacles = [
  { x: 420, y: 260, w: 220, h: 120 },
  { x: 910, y: 200, w: 140, h: 360 },
  { x: 1330, y: 310, w: 300, h: 120 },
  { x: 1740, y: 210, w: 120, h: 260 },
  { x: 210, y: 760, w: 320, h: 110 },
  { x: 760, y: 820, w: 170, h: 320 },
  { x: 1220, y: 760, w: 240, h: 150 },
  { x: 1660, y: 870, w: 280, h: 120 },
  { x: 620, y: 1180, w: 280, h: 80 },
  { x: 1280, y: 1120, w: 420, h: 90 }
];

const clients = new Map();
const players = new Map();
const bullets = new Map();
let nextBulletId = 1;

const server = http.createServer((req, res) => {
  const safePath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const id = crypto.randomUUID();
  clients.set(id, { id, socket, buffer: Buffer.alloc(0), input: {}, lastSeen: Date.now() });
  socket.on("data", data => readFrames(id, data));
  socket.on("close", () => removeClient(id));
  socket.on("error", () => removeClient(id));

  send(id, { type: "welcome", id, world: WORLD, obstacles, classes: publicClasses() });
});

function readFrames(id, data) {
  const client = clients.get(id);
  if (!client) return;
  client.buffer = Buffer.concat([client.buffer, data]);

  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      removeClient(id);
      return;
    }

    const masked = Boolean(second & 0x80);
    const maskOffset = offset;
    const payloadOffset = masked ? offset + 4 : offset;
    const frameLength = payloadOffset + length;
    if (client.buffer.length < frameLength) return;

    const opcode = first & 0x0f;
    let payload = client.buffer.subarray(payloadOffset, frameLength);
    if (masked) {
      const mask = client.buffer.subarray(maskOffset, maskOffset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 8) {
      removeClient(id);
      return;
    }
    if (opcode === 1) handleMessage(id, payload.toString("utf8"));
  }
}

function handleMessage(id, text) {
  const client = clients.get(id);
  if (!client) return;
  client.lastSeen = Date.now();

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }

  if (msg.type === "join") {
    const chosen = classes[msg.className] ? msg.className : "vanguard";
    const spawn = findSpawn();
    players.set(id, {
      id,
      name: String(msg.name || "Player").slice(0, 16),
      className: chosen,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: classes[chosen].hp,
      maxHp: classes[chosen].hp,
      score: 0,
      eliminations: 0,
      defeated: 0,
      lastShot: 0,
      respawnAt: 0,
      muzzle: 0
    });
    return;
  }

  if (msg.type === "input") {
    client.input = {
      up: Boolean(msg.up),
      down: Boolean(msg.down),
      left: Boolean(msg.left),
      right: Boolean(msg.right),
      shoot: Boolean(msg.shoot),
      angle: Number.isFinite(msg.angle) ? msg.angle : 0
    };
  }
}

function tick() {
  const now = Date.now();

  for (const [id, player] of players) {
    const client = clients.get(id);
    if (!client) continue;
    const cls = classes[player.className];

    if (player.respawnAt && now >= player.respawnAt) {
      const spawn = findSpawn();
      Object.assign(player, { x: spawn.x, y: spawn.y, hp: player.maxHp, respawnAt: 0 });
    }
    if (player.respawnAt) continue;

    const input = client.input || {};
    let mx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    let my = Number(Boolean(input.down)) - Number(Boolean(input.up));
    const mag = Math.hypot(mx, my) || 1;
    mx /= mag;
    my /= mag;
    player.vx = mx * cls.speed;
    player.vy = my * cls.speed;
    player.angle = Number.isFinite(input.angle) ? input.angle : player.angle;
    movePlayer(player, player.vx, player.vy);

    if (input.shoot && now - player.lastShot > cls.cooldown) {
      player.lastShot = now;
      player.muzzle = 5;
      const bx = player.x + Math.cos(player.angle) * 34;
      const by = player.y + Math.sin(player.angle) * 34;
      const bulletId = nextBulletId++;
      bullets.set(bulletId, {
        id: bulletId,
        owner: id,
        x: bx,
        y: by,
        vx: Math.cos(player.angle) * cls.bulletSpeed,
        vy: Math.sin(player.angle) * cls.bulletSpeed,
        damage: cls.damage,
        ttl: 70,
        color: cls.color
      });
    }
    player.muzzle = Math.max(0, player.muzzle - 1);
  }

  for (const [id, bullet] of bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.ttl -= 1;

    if (bullet.ttl <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD.width || bullet.y > WORLD.height || intersectsObstacle(bullet.x, bullet.y, 5)) {
      bullets.delete(id);
      continue;
    }

    for (const player of players.values()) {
      if (player.id === bullet.owner || player.respawnAt) continue;
      if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < 25) {
        player.hp -= bullet.damage;
        bullets.delete(id);
        if (player.hp <= 0) {
          const killer = players.get(bullet.owner);
          if (killer) {
            killer.score += 100;
            killer.eliminations += 1;
          }
          player.defeated += 1;
          player.hp = 0;
          player.respawnAt = now + 2200;
        }
        break;
      }
    }
  }

  broadcast({
    type: "state",
    now,
    players: [...players.values()].map(publicPlayer),
    bullets: [...bullets.values()],
    leaderboard: [...players.values()]
      .sort((a, b) => b.score - a.score || b.eliminations - a.eliminations)
      .slice(0, 6)
      .map(p => ({ id: p.id, name: p.name, score: p.score, eliminations: p.eliminations, defeated: p.defeated }))
  });
}

function movePlayer(player, vx, vy) {
  const nextX = clamp(player.x + vx, 24, WORLD.width - 24);
  if (!collidesPlayer(nextX, player.y)) player.x = nextX;
  const nextY = clamp(player.y + vy, 24, WORLD.height - 24);
  if (!collidesPlayer(player.x, nextY)) player.y = nextY;
}

function collidesPlayer(x, y) {
  return obstacles.some(o => x + 22 > o.x && x - 22 < o.x + o.w && y + 22 > o.y && y - 22 < o.y + o.h);
}

function intersectsObstacle(x, y, r) {
  return obstacles.some(o => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
}

function findSpawn() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const point = {
      x: 90 + Math.random() * (WORLD.width - 180),
      y: 90 + Math.random() * (WORLD.height - 180)
    };
    if (!collidesPlayer(point.x, point.y)) return point;
  }
  return { x: 120, y: 120 };
}

function send(id, data) {
  const client = clients.get(id);
  if (!client || client.socket.destroyed) return;
  try {
    client.socket.write(encodeFrame(JSON.stringify(data)));
  } catch {
    removeClient(id);
  }
}

function broadcast(data) {
  const payload = encodeFrame(JSON.stringify(data));
  for (const [id, client] of clients) {
    if (client.socket.destroyed) {
      removeClient(id);
      continue;
    }
    try {
      client.socket.write(payload);
    } catch {
      removeClient(id);
    }
  }
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, payload]);
}

function publicClasses() {
  return Object.fromEntries(Object.entries(classes).map(([key, value]) => [key, {
    hp: value.hp,
    speed: value.speed,
    cooldown: value.cooldown,
    damage: value.damage,
    color: value.color
  }]));
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    className: player.className,
    x: player.x,
    y: player.y,
    angle: player.angle,
    hp: player.hp,
    maxHp: player.maxHp,
    score: player.score,
    eliminations: player.eliminations,
    defeated: player.defeated,
    respawnAt: player.respawnAt,
    muzzle: player.muzzle
  };
}

function removeClient(id) {
  const client = clients.get(id);
  if (client) {
    client.socket.destroy();
    clients.delete(id);
  }
  players.delete(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

setInterval(tick, TICK_RATE);

server.listen(PORT, () => {
  console.log(`Arena Rangers running at http://localhost:${PORT}`);
});
