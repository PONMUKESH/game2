const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const joinEl = document.querySelector("#join");
const nameEl = document.querySelector("#name");
const playEl = document.querySelector("#play");
const leaderboardEl = document.querySelector("#leaderboard");
const charactersEl = document.querySelector("#characters");
const positionEl = document.querySelector("#position");

const MULTIPLAYER_SERVER_URL = "";

const characterMeta = {
  vanguard: { label: "Vanguard", color: "#40c0ff", armor: "#163a4e", visor: "#bdf4ff" },
  striker: { label: "Striker", color: "#f8d34f", armor: "#4f3710", visor: "#fff0a8" },
  medic: { label: "Medic", color: "#54df9f", armor: "#123f2e", visor: "#c8ffe3" },
  phantom: { label: "Phantom", color: "#d48cff", armor: "#35214f", visor: "#f3d6ff" }
};

let socket;
let myId = "";
let joined = false;
let selectedClass = "vanguard";
let world = { width: 2200, height: 1400 };
let obstacles = [];
let state = { players: [], bullets: [], leaderboard: [] };
let mouse = { x: 0, y: 0, down: false };
let camera = { x: 0, y: 0 };
let offlineMode = false;
let offlinePlayer = null;
const keys = new Set();
const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

createCharacterButtons();
connect();
resize();
requestAnimationFrame(draw);
setInterval(sendInput, 1000 / 30);

window.addEventListener("resize", resize);
window.addEventListener("keydown", event => {
  if (!joined && event.key !== "Enter") return;
  if (movementKeys.has(event.code)) event.preventDefault();
  keys.add(event.code);
  keys.add(event.key.toLowerCase());
  if (event.code === "Space") mouse.down = true;
});
window.addEventListener("keyup", event => {
  if (movementKeys.has(event.code)) event.preventDefault();
  keys.delete(event.code);
  keys.delete(event.key.toLowerCase());
  if (event.code === "Space") mouse.down = false;
});
canvas.addEventListener("mousemove", event => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener("mousedown", () => { mouse.down = true; });
window.addEventListener("mouseup", () => { mouse.down = false; });
playEl.addEventListener("click", join);
nameEl.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});

function connect() {
  if (!["http:", "https:"].includes(location.protocol)) {
    enableOfflineMode("Static file mode. Solo play is ready.");
    return;
  }
  socket = new WebSocket(getSocketUrl());
  socket.addEventListener("open", () => {
    statusEl.textContent = "Connected. Pick your ranger.";
  });
  socket.addEventListener("close", () => {
    if (!joined) {
      enableOfflineMode("No multiplayer server found. Solo play is ready.");
      return;
    }
    statusEl.textContent = "Disconnected. Reconnecting...";
    setTimeout(connect, 900);
  });
  socket.addEventListener("error", () => {
    if (!joined) enableOfflineMode("No multiplayer server found. Solo play is ready.");
  });
  socket.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.type === "welcome") {
      myId = msg.id;
      world = msg.world;
      obstacles = msg.obstacles;
    }
    if (msg.type === "state") {
      state = msg;
      updateLeaderboard();
      const me = getMe();
      if (me) {
        const respawn = me.respawnAt ? ` Respawning in ${Math.ceil((me.respawnAt - Date.now()) / 1000)}s.` : "";
        statusEl.textContent = `${me.name} | HP ${Math.max(0, Math.ceil(me.hp))}/${me.maxHp} | Score ${me.score}.${respawn}`;
        positionEl.textContent = `Position: ${Math.round(me.x)}, ${Math.round(me.y)}`;
      }
    }
  });
}

function join() {
  if (!offlineMode && (!socket || socket.readyState !== WebSocket.OPEN)) {
    enableOfflineMode("No multiplayer server found. Solo play is ready.");
  }
  joined = true;
  joinEl.classList.add("is-hidden");
  canvas.focus();
  if (offlineMode) {
    startOfflineGame();
    return;
  }
  socket.send(JSON.stringify({
    type: "join",
    name: nameEl.value.trim() || "Ranger",
    className: selectedClass
  }));
}

function sendInput() {
  if (!joined) return;
  const me = getMe();
  const angle = me ? Math.atan2(mouse.y - (me.y - camera.y), mouse.x - (me.x - camera.x)) : 0;
  const input = currentInput(angle);
  if (offlineMode) {
    updateOfflineInput(input);
    return;
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(input));
}

function currentInput(angle) {
  return {
    type: "input",
    up: keys.has("w") || keys.has("arrowup") || keys.has("KeyW") || keys.has("ArrowUp"),
    down: keys.has("s") || keys.has("arrowdown") || keys.has("KeyS") || keys.has("ArrowDown"),
    left: keys.has("a") || keys.has("arrowleft") || keys.has("KeyA") || keys.has("ArrowLeft"),
    right: keys.has("d") || keys.has("arrowright") || keys.has("KeyD") || keys.has("ArrowRight"),
    shoot: mouse.down || keys.has(" ") || keys.has("Space"),
    angle
  };
}

function updateOfflineInput(input) {
  if (!offlinePlayer || offlinePlayer.respawnAt) return;
  const cls = { speed: 5 };
  let mx = Number(input.right) - Number(input.left);
  let my = Number(input.down) - Number(input.up);
  const mag = Math.hypot(mx, my) || 1;
  offlinePlayer.x = clamp(offlinePlayer.x + (mx / mag) * cls.speed, 24, world.width - 24);
  offlinePlayer.y = clamp(offlinePlayer.y + (my / mag) * cls.speed, 24, world.height - 24);
  offlinePlayer.angle = input.angle;
  state.players = [offlinePlayer];
  statusEl.textContent = `${offlinePlayer.name} | Solo Mode | Score ${offlinePlayer.score}`;
  positionEl.textContent = `Position: ${Math.round(offlinePlayer.x)}, ${Math.round(offlinePlayer.y)}`;
}

function startOfflineGame() {
  offlinePlayer = {
    id: "solo",
    name: nameEl.value.trim() || "Ranger",
    className: selectedClass,
    x: world.width / 2,
    y: world.height / 2,
    angle: 0,
    hp: 100,
    maxHp: 100,
    score: 0,
    eliminations: 0,
    defeated: 0,
    respawnAt: 0,
    muzzle: 0
  };
  myId = "solo";
  state = { players: [offlinePlayer], bullets: [], leaderboard: [] };
  statusEl.textContent = `${offlinePlayer.name} | Solo Mode | Score 0`;
}

function enableOfflineMode(message) {
  offlineMode = true;
  statusEl.textContent = message;
}

function getSocketUrl() {
  if (MULTIPLAYER_SERVER_URL) return MULTIPLAYER_SERVER_URL;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}`;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function draw(time) {
  const me = getMe();
  if (me) {
    camera.x = lerp(camera.x, clamp(me.x - canvas.width / 2, 0, world.width - canvas.width), 0.14);
    camera.y = lerp(camera.y, clamp(me.y - canvas.height / 2, 0, world.height - canvas.height), 0.14);
  }

  drawArena();
  for (const bullet of state.bullets) drawBullet(bullet);
  for (const player of state.players) drawCharacter(player, time, player.id === myId);
  drawVignette();
  requestAnimationFrame(draw);
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.fillStyle = "#273039";
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= world.width; x += 80) line(x, 0, x, world.height);
  for (let y = 0; y <= world.height; y += 80) line(0, y, world.width, y);

  ctx.fillStyle = "#1a2027";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  for (const o of obstacles) {
    roundedRect(o.x, o.y, o.w, o.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(o.x + 10, o.y + 10, Math.max(8, o.w - 20), 8);
    ctx.fillStyle = "#1a2027";
  }

  ctx.strokeStyle = "#ffcf5a";
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, world.width - 4, world.height - 4);
  ctx.restore();
}

function drawCharacter(player, time, isMe) {
  const meta = characterMeta[player.className] || characterMeta.vanguard;
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  const defeated = Boolean(player.respawnAt);
  const stride = Math.sin(time / 110 + player.x * 0.03) * 4;

  ctx.save();
  ctx.globalAlpha = defeated ? 0.38 : 1;
  ctx.translate(x, y);
  ctx.rotate(player.angle);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ellipse(0, 24, 28, 10);
  ctx.fill();

  ctx.strokeStyle = meta.armor;
  ctx.lineWidth = 8;
  roundedLine(-4, -4, -20, 14 + stride);
  roundedLine(-4, 4, -20, -14 - stride);
  roundedLine(5, -3, 17, 17 - stride);
  roundedLine(5, 4, 17, -17 + stride);

  ctx.fillStyle = meta.armor;
  roundedRect(-17, -18, 34, 36, 10);
  ctx.fill();
  ctx.fillStyle = meta.color;
  roundedRect(-12, -14, 24, 28, 8);
  ctx.fill();

  ctx.fillStyle = "#161b20";
  roundedRect(7, -6, 35, 12, 4);
  ctx.fill();
  ctx.fillStyle = meta.color;
  ctx.fillRect(35, -3, 14, 6);
  if (player.muzzle > 0) {
    ctx.fillStyle = "#fff1a0";
    ctx.beginPath();
    ctx.moveTo(50, 0);
    ctx.lineTo(68, -8);
    ctx.lineTo(64, 0);
    ctx.lineTo(68, 8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#101317";
  circle(0, -23, 15);
  ctx.fill();
  ctx.fillStyle = meta.visor;
  roundedRect(-2, -30, 18, 8, 4);
  ctx.fill();
  ctx.restore();

  drawNameplate(player, x, y, meta, isMe);
}

function drawNameplate(player, x, y, meta, isMe) {
  ctx.save();
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = isMe ? "#ffcf5a" : "#f7fbff";
  ctx.fillText(player.name, x, y - 46);

  const width = 48;
  const hp = clamp(player.hp / player.maxHp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundedRect(x - width / 2, y - 38, width, 6, 3);
  ctx.fill();
  ctx.fillStyle = hp > 0.35 ? meta.color : "#ff6262";
  roundedRect(x - width / 2, y - 38, width * hp, 6, 3);
  ctx.fill();
  ctx.restore();
}

function drawBullet(bullet) {
  const x = bullet.x - camera.x;
  const y = bullet.y - camera.y;
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = bullet.color;
  ctx.fillStyle = bullet.color;
  circle(x, y, 5);
  ctx.fill();
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 80, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function createCharacterButtons() {
  for (const [key, meta] of Object.entries(characterMeta)) {
    const button = document.createElement("button");
    button.className = "character";
    button.type = "button";
    button.setAttribute("aria-pressed", key === selectedClass ? "true" : "false");
    button.innerHTML = `${portraitSvg(meta)}<span>${meta.label}</span>`;
    button.addEventListener("click", () => {
      selectedClass = key;
      for (const item of charactersEl.querySelectorAll(".character")) item.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
    });
    charactersEl.appendChild(button);
  }
}

function portraitSvg(meta) {
  return `
    <svg class="portrait" viewBox="0 0 80 88" aria-hidden="true">
      <ellipse cx="40" cy="78" rx="25" ry="6" fill="rgba(0,0,0,.35)"/>
      <path d="M22 36h36l8 30H14z" fill="${meta.armor}"/>
      <path d="M28 39h24l5 26H23z" fill="${meta.color}"/>
      <circle cx="40" cy="24" r="18" fill="#111820"/>
      <rect x="36" y="17" width="24" height="9" rx="4" fill="${meta.visor}"/>
      <path d="M18 49 7 62M62 49l11 13M30 66l-8 15M50 66l8 15" stroke="${meta.color}" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `;
}

function updateLeaderboard() {
  leaderboardEl.innerHTML = "";
  for (const row of state.leaderboard || []) {
    const item = document.createElement("li");
    item.textContent = `${row.name} - ${row.score} (${row.eliminations}/${row.defeated})`;
    leaderboardEl.appendChild(item);
  }
}

function getMe() {
  return state.players.find(player => player.id === myId);
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundedLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
