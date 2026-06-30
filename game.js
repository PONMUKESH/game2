const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const joinEl = document.querySelector("#join");
const nameEl = document.querySelector("#name");
const playEl = document.querySelector("#play");
const leaderboardEl = document.querySelector("#leaderboard");
const charactersEl = document.querySelector("#characters");
const positionEl = document.querySelector("#position");
const modeSelect = document.querySelector("#mode-select");
const invitePanel = document.querySelector("#invite-panel");
const inviteLinkEl = document.querySelector("#invite-link");
const copyInviteBtn = document.querySelector("#copy-invite");
const botCountEl = document.querySelector("#bot-count");
const difficultySelect = document.querySelector("#difficulty-select");
const touchControlsEl = document.querySelector("#touch-controls");
const moveJoystickEl = document.querySelector("#move-joystick");
const moveKnobEl = document.querySelector("#move-knob");
const shootTriggerEl = document.querySelector("#shoot-trigger");

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
const defaultObstacles = [
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
let obstacles = [];
let state = { players: [], bullets: [], leaderboard: [] };
let mouse = { x: 0, y: 0, down: false };
let touchInput = { up: false, down: false, left: false, right: false, shoot: false };
let touchJoystick = { active: false, pointerId: null };
let camera = { x: 0, y: 0 };
let offlineMode = false;
let offlinePlayer = null;
const TICK_RATE = 1000 / 60;
const classes = {
  vanguard: { hp: 120, speed: 4.2, cooldown: 240, damage: 18, bulletSpeed: 13, color: "#40c0ff" },
  striker: { hp: 90, speed: 5.2, cooldown: 150, damage: 12, bulletSpeed: 15, color: "#f8d34f" },
  medic: { hp: 100, speed: 4.7, cooldown: 210, damage: 14, bulletSpeed: 12, color: "#54df9f" },
  phantom: { hp: 82, speed: 5.7, cooldown: 190, damage: 15, bulletSpeed: 16, color: "#d48cff" }
};
let nextBulletId = 1;
let offlineDifficulty = "normal";
const keys = new Set();
const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

createCharacterButtons();
setupTouchControls();
connect();
resize();
requestAnimationFrame(draw);
setInterval(sendInput, 1000 / 30);
setInterval(offlineTick, TICK_RATE);

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

function setupTouchControls() {
  if (!touchControlsEl || !moveJoystickEl || !moveKnobEl || !shootTriggerEl) return;
  const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouchDevice) {
    touchControlsEl.classList.remove("is-active");
    return;
  }
  touchControlsEl.classList.add("is-active");

  moveJoystickEl.addEventListener("pointerdown", handleJoystickPointerDown, { passive: false });
  window.addEventListener("pointermove", handleJoystickPointerMove, { passive: false });
  window.addEventListener("pointerup", handleJoystickPointerUp, { passive: false });
  window.addEventListener("pointercancel", handleJoystickPointerUp, { passive: false });

  const handleShootStart = event => {
    event.preventDefault();
    touchInput.shoot = true;
    shootTriggerEl.classList.add("is-pressed");
  };
  const handleShootEnd = () => releaseShootTrigger();

  shootTriggerEl.addEventListener("pointerdown", handleShootStart, { passive: false });
  shootTriggerEl.addEventListener("pointerup", handleShootEnd);
  shootTriggerEl.addEventListener("pointerleave", handleShootEnd);
  shootTriggerEl.addEventListener("pointercancel", handleShootEnd);

  canvas.addEventListener("touchstart", handleTouchAim, { passive: false });
  canvas.addEventListener("touchmove", handleTouchAim, { passive: false });
  canvas.addEventListener("touchend", handleTouchAim, { passive: false });
}

function handleJoystickPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (touchJoystick.active) return;
  event.preventDefault();
  touchJoystick.active = true;
  touchJoystick.pointerId = event.pointerId;
  moveJoystickEl.setPointerCapture?.(event.pointerId);
  updateJoystickFromPoint(event.clientX, event.clientY);
}

function handleJoystickPointerMove(event) {
  if (!touchJoystick.active || event.pointerId !== touchJoystick.pointerId) return;
  event.preventDefault();
  updateJoystickFromPoint(event.clientX, event.clientY);
}

function handleJoystickPointerUp(event) {
  if (!touchJoystick.active || event.pointerId !== touchJoystick.pointerId) return;
  event.preventDefault();
  touchJoystick.active = false;
  touchJoystick.pointerId = null;
  moveJoystickEl.releasePointerCapture?.(event.pointerId);
  moveKnobEl.style.transform = "translate(0, 0)";
  touchInput.up = false;
  touchInput.down = false;
  touchInput.left = false;
  touchInput.right = false;
}

function updateJoystickFromPoint(clientX, clientY) {
  const rect = moveJoystickEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const maxDist = rect.width * 0.28;
  const magnitude = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, magnitude / maxDist);
  const clampedX = (dx / magnitude) * maxDist * scale;
  const clampedY = (dy / magnitude) * maxDist * scale;
  moveKnobEl.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  const nx = clamp(clampedX / maxDist, -1, 1);
  const ny = clamp(clampedY / maxDist, -1, 1);
  touchInput.left = nx < -0.15;
  touchInput.right = nx > 0.15;
  touchInput.up = ny < -0.15;
  touchInput.down = ny > 0.15;
}

function releaseShootTrigger(event) {
  if (event) event.preventDefault?.();
  touchInput.shoot = false;
  shootTriggerEl.classList.remove("is-pressed");
}

function handleTouchAim(event) {
  if (!event.touches || !event.touches.length) return;
  const touch = event.touches[0];
  const rect = canvas.getBoundingClientRect();
  mouse.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
}
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

// Mode / invite UI
if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    const v = modeSelect.value;
    invitePanel.style.display = v === "invite" ? "block" : "none";
  });
}
if (copyInviteBtn) copyInviteBtn.addEventListener("click", () => {
  const url = new URL(location.href);
  if (!url.searchParams.get("room")) url.searchParams.set("room", Math.random().toString(36).slice(2, 9));
  navigator.clipboard.writeText(url.toString()).then(() => {
    copyInviteBtn.textContent = "Copied!";
    setTimeout(() => copyInviteBtn.textContent = "Copy Invite Link", 1500);
  });
});

// If URL has room param, show invite mode and populate link
const urlParams = new URLSearchParams(location.search);
if (urlParams.get("room")) {
  if (modeSelect) modeSelect.value = "invite";
  if (invitePanel) invitePanel.style.display = "block";
  if (inviteLinkEl) inviteLinkEl.value = location.href;
}
// difficulty UI
if (difficultySelect) {
  difficultySelect.addEventListener("change", () => { offlineDifficulty = difficultySelect.value; });
  offlineDifficulty = difficultySelect.value || offlineDifficulty;
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
    up: keys.has("w") || keys.has("arrowup") || keys.has("KeyW") || keys.has("ArrowUp") || touchInput.up,
    down: keys.has("s") || keys.has("arrowdown") || keys.has("KeyS") || keys.has("ArrowDown") || touchInput.down,
    left: keys.has("a") || keys.has("arrowleft") || keys.has("KeyA") || keys.has("ArrowLeft") || touchInput.left,
    right: keys.has("d") || keys.has("arrowright") || keys.has("KeyD") || keys.has("ArrowRight") || touchInput.right,
    shoot: mouse.down || keys.has(" ") || keys.has("Space") || touchInput.shoot,
    angle
  };
}

function updateOfflineInput(input) {
  if (!offlinePlayer || offlinePlayer.respawnAt) return;
  const cls = classes[offlinePlayer.className] || { speed: 5 };
  let mx = Number(input.right) - Number(input.left);
  let my = Number(input.down) - Number(input.up);
  const mag = Math.hypot(mx, my) || 1;
  const vx = (mx / mag) * cls.speed;
  const vy = (my / mag) * cls.speed;
  offlinePlayer.angle = input.angle;
  movePlayer(offlinePlayer, vx, vy);
  // offlineTick will assemble players array (player + bots)
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
  // ensure obstacles present
  if (obstacles.length === 0) obstacles = defaultObstacles.slice();
  state = { players: [], bullets: [], leaderboard: [] };
  // spawn bots
  const botCount = Math.max(0, Math.min(8, parseInt(botCountEl?.value || '3', 10) || 3));
  for (let i = 0; i < botCount; i++) {
    const id = `bot-${i + 1}`;
    const spawn = findSpawn();
    const cls = Object.keys(classes)[i % Object.keys(classes).length];
    state.players.push({
      id,
      name: `Ranger-${i+1}`,
      className: cls,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: classes[cls].hp,
      maxHp: classes[cls].hp,
      score: 0,
      eliminations: 0,
      defeated: 0,
      lastShot: 0,
      respawnAt: 0,
      muzzle: 0
    });
  }
  // add player last so myId is set correctly
  state.players.push(offlinePlayer);
  state.bullets = [];
  statusEl.textContent = `${offlinePlayer.name} | Solo Mode | Score 0`;
}

function offlineTick() {
  if (!offlineMode) return;
  const now = Date.now();

  // Ensure offlinePlayer present
  if (!offlinePlayer) return;

  // Update players: respawn, movement, shooting (bots)
  for (const player of state.players) {
    const cls = classes[player.className] || { speed: 4, cooldown: 200, damage: 10, bulletSpeed: 12 };
    if (player.respawnAt && now >= player.respawnAt) {
      const spawn = findSpawn();
      Object.assign(player, { x: spawn.x, y: spawn.y, hp: player.maxHp, respawnAt: 0 });
    }
    if (player.respawnAt) continue;

    if (player.id === offlinePlayer.id) {
      // offlinePlayer velocity already set by updateOfflineInput; nothing here
    } else {
      // bot difficulty parameters
      const diff = offlineDifficulty || "normal";
      const difficultyParams = {
        easy: { speedMul: 0.8, accuracy: 0.6, cooldownMul: 1.4, aggressiveness: 0.7 },
        normal: { speedMul: 1.0, accuracy: 0.8, cooldownMul: 1.0, aggressiveness: 0.9 },
        hard: { speedMul: 1.2, accuracy: 0.92, cooldownMul: 0.85, aggressiveness: 1.05 },
        veryhard: { speedMul: 1.4, accuracy: 0.98, cooldownMul: 0.7, aggressiveness: 1.2 }
      };
      const params = difficultyParams[diff] || difficultyParams.normal;

      // simple bot AI: move towards player and shoot with noise based on accuracy
      const target = offlinePlayer;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.hypot(dx, dy) || 1;
      const mx = dx / dist;
      const my = dy / dist;
      const speed = (cls.speed || 4) * params.speedMul;
      player.vx = mx * speed * (Math.random() * 0.5 + params.aggressiveness * 0.6);
      player.vy = my * speed * (Math.random() * 0.5 + params.aggressiveness * 0.6);

      // aim with jitter inversely proportional to accuracy
      const aimJitter = (1 - params.accuracy) * (Math.random() - 0.5) * Math.min(0.6, dist / 600);
      player.angle = Math.atan2(dy, dx) + aimJitter;

      // shoot if cooldown passed and within range scaled by aggressiveness
      const shootRange = 700 * (0.8 + params.aggressiveness * 0.6);
      const botCooldown = (cls.cooldown || 200) * params.cooldownMul;
      if (now - (player.lastShot || 0) > botCooldown && dist < shootRange) {
        // accuracy check: sometimes bots miss entirely (don't shoot) based on accuracy
        if (Math.random() < params.accuracy + 0.05) {
          player.lastShot = now;
          player.muzzle = 5;
          const bx = player.x + Math.cos(player.angle) * 34;
          const by = player.y + Math.sin(player.angle) * 34;
          state.bullets.push({
            id: nextBulletId++,
            owner: player.id,
            x: bx,
            y: by,
            vx: Math.cos(player.angle) * cls.bulletSpeed,
            vy: Math.sin(player.angle) * cls.bulletSpeed,
            damage: cls.damage,
            ttl: 70,
            color: classes[player.className].color
          });
        } else {
          // simulate missed shot by delaying lastShot slightly
          player.lastShot = now - (botCooldown * 0.5);
        }
      }
    }

    movePlayer(player, player.vx || 0, player.vy || 0);
    player.muzzle = Math.max(0, (player.muzzle || 0) - 1);
  }

  // Offline player shooting
  const me = offlinePlayer;
  const myCls = classes[me.className] || { cooldown: 200 };
  if (me && me.respawnAt == 0 && (me.shoot || mouse.down || keys.has(" ") || keys.has("Space"))) {
    if (!me.lastShot) me.lastShot = 0;
    if (now - me.lastShot > myCls.cooldown) {
      me.lastShot = now;
      me.muzzle = 5;
      const bx = me.x + Math.cos(me.angle) * 34;
      const by = me.y + Math.sin(me.angle) * 34;
      state.bullets.push({
        id: nextBulletId++,
        owner: me.id,
        x: bx,
        y: by,
        vx: Math.cos(me.angle) * myCls.bulletSpeed,
        vy: Math.sin(me.angle) * myCls.bulletSpeed,
        damage: myCls.damage,
        ttl: 70,
        color: classes[me.className].color
      });
    }
  }

  // Move bullets and resolve collisions
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.ttl -= 1;
    if (bullet.ttl <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > world.width || bullet.y > world.height || intersectsObstacle(bullet.x, bullet.y, 5)) {
      state.bullets.splice(i, 1);
      continue;
    }
    for (const player of state.players) {
      if (player.id === bullet.owner || player.respawnAt) continue;
      if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < 25) {
        player.hp -= bullet.damage;
        state.bullets.splice(i, 1);
        if (player.hp <= 0) {
          const killer = state.players.find(p => p.id === bullet.owner);
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

  // rebuild leaderboard and update global state
  state.leaderboard = state.players.slice().sort((a, b) => b.score - a.score || b.eliminations - a.eliminations).slice(0, 6).map(p => ({ id: p.id, name: p.name, score: p.score, eliminations: p.eliminations, defeated: p.defeated }));
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

function movePlayer(player, vx, vy) {
  const nextX = clamp(player.x + vx, 24, world.width - 24);
  if (!collidesPlayer(nextX, player.y) && !collidesWithOtherPlayer(nextX, player.y, player.id)) player.x = nextX;
  const nextY = clamp(player.y + vy, 24, world.height - 24);
  if (!collidesPlayer(player.x, nextY) && !collidesWithOtherPlayer(player.x, nextY, player.id)) player.y = nextY;
}

function collidesPlayer(x, y) {
  return obstacles.some(o => x + 22 > o.x && x - 22 < o.x + o.w && y + 22 > o.y && y - 22 < o.y + o.h);
}

function collidesWithOtherPlayer(x, y, selfId) {
  if (!state || !state.players) return false;
  return state.players.some(p => {
    if (!p || !p.id) return false;
    if (selfId && p.id === selfId) return false;
    if (p.respawnAt) return false;
    return Math.hypot(p.x - x, p.y - y) < 44;
  });
}

function intersectsObstacle(x, y, r) {
  return obstacles.some(o => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
}

function findSpawn() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const point = {
      x: 90 + Math.random() * (world.width - 180),
      y: 90 + Math.random() * (world.height - 180)
    };
    if (!collidesPlayer(point.x, point.y) && !collidesWithOtherPlayer(point.x, point.y, null)) return point;
  }
  return { x: 120, y: 120 };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
