/**
 * Edward Warchocki Bubble Battle — TikTok Live Game
 * Bubbles paint the screen with their colors. Most coverage wins.
 */

// === Setup screen ===
const setupScreen = document.getElementById('setupScreen');
const gameContainer = document.getElementById('game-container');
const tiktokInput = document.getElementById('tiktokInput');
const startBtn = document.getElementById('startBtn');
const setupStatus = document.getElementById('setupStatus');

function extractUsername(input) {
  if (!input) return '';
  let s = input.trim();
  // Match TikTok URL: tiktok.com/@username or tiktok.com/@username/live
  const urlMatch = s.match(/tiktok\.com\/@([^/?]+)/i);
  if (urlMatch) return urlMatch[1];
  // Plain @username
  return s.replace(/^@/, '').split(/[/?]/)[0];
}

// === Game mode selection ===
let GAME_MODE = 'bubble'; // 'bubble' | 'race' | 'boars'
let raceGame = null;
let boarsGame = null;
let gameStarted = false; // prevents gameLoop from rendering bubble before launch

// Mode button click handler
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    GAME_MODE = btn.dataset.mode;
  });
});

function launchGame() {
  initAudio();
  setupScreen.classList.add('hidden');
  gameContainer.classList.remove('hidden');
  resize();

  // Expose audio globally for game classes
  window.playPop = playPop;
  window.playCritical = playCritical;
  window.playTap = playTap;

  // Clear canvases
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);

  // Destroy any previously running games
  raceGame = null;
  boarsGame = null;
  players.clear();

  const h3 = document.querySelector('#leaderboard h3');

  // Clean body classes then add for active mode
  document.body.classList.remove('mode-bubble', 'mode-race', 'mode-boars');
  document.body.classList.add(`mode-${GAME_MODE}`);

  if (GAME_MODE === 'race') {
    raceGame = new window.RaceGame(canvas, ctx, BACKEND_URL);
    if (h3) h3.textContent = '🏁 TOP 5 — WYŚCIG';
  } else if (GAME_MODE === 'boars') {
    boarsGame = new window.BoarsGame(canvas, ctx, BACKEND_URL);
    if (h3) h3.textContent = '🐗 PRZEGONIONYCH DZIKÓW';
  } else {
    if (h3) h3.textContent = '🏆 TOP 5 — NAJWIĘCEJ LAJKÓW';
  }

  gameStarted = true;
  startGame();
}

startBtn.addEventListener('click', async () => {
  const username = extractUsername(tiktokInput.value);
  if (!username) {
    // Just start in mock mode
    launchGame();
    return;
  }

  startBtn.disabled = true;
  setupStatus.textContent = `Łączę z @${username}...`;
  setupStatus.className = 'setup-status';

  try {
    const r = await fetch(`${BACKEND_URL}/connect/${encodeURIComponent(username)}`, { method: 'POST' });
    const data = await r.json();
    if (data.ok) {
      setupStatus.textContent = '✓ Połączono z TikTok Live!';
      setupStatus.className = 'setup-status ok';
      setTimeout(launchGame, 600);
    } else {
      // Show short friendly error and auto-start in test mode
      let msg = data.message || 'Nie można się połączyć';
      if (msg.includes('rate') || msg.includes('Rate') || msg.includes('limit')) {
        msg = '⚠ TikTok rate limit — startuję w trybie TEST';
      } else if (msg.includes('online') || msg.includes('offline')) {
        msg = `⚠ @${username} nie jest live — TEST MODE`;
      } else {
        msg = '⚠ Tryb TEST (offline)';
      }
      setupStatus.textContent = msg;
      setupStatus.className = 'setup-status err';
      setTimeout(launchGame, 1200);
    }
  } catch (e) {
    setupStatus.textContent = '⚠ Tryb TEST';
    setupStatus.className = 'setup-status err';
    setTimeout(launchGame, 1000);
  } finally {
    startBtn.disabled = false;
  }
});

// Allow Enter key to start
tiktokInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startBtn.click();
});

// === Canvas setup ===
const canvas = document.getElementById('gameCanvas');
const paintCanvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const paintCtx = paintCanvas.getContext('2d');

function resize() {
  const w = window.innerWidth || 1920;
  const h = window.innerHeight || 1080;
  canvas.width = w; canvas.height = h;
  paintCanvas.width = w; paintCanvas.height = h;
  paintCtx.fillStyle = 'rgba(10, 10, 30, 1)';
  paintCtx.fillRect(0, 0, w, h);
}
window.addEventListener('resize', resize);
// Also resize at page load
resize();

// === Game state ===
const players = new Map();
const particles = [];
const hearts = [];  // floating hearts animation
const avatarCache = new Map();

// === Audio system ===
let audioCtx = null;
let audioEnabled = false;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioEnabled = true;
  } catch (e) { console.warn('Audio init failed'); }
}

function playTap(pitch = 1) {
  if (!audioEnabled || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1200 * pitch, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(400 * pitch, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {}
}

function playCritical() {
  if (!audioEnabled || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    // Triangle rising
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440 + i * 220, now + i * 0.08);
      gain.gain.setValueAtTime(0.18, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    }
  } catch (e) {}
}

function playPop() {
  if (!audioEnabled || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {}
}

function spawnHeartBurst(x, y, count, color) {
  const n = Math.min(count, 8); // cap visual bursts
  for (let i = 0; i < n; i++) {
    hearts.push({
      x: x + (Math.random() - 0.5) * 30,
      y: y - 10,
      vx: (Math.random() - 0.5) * 2,
      vy: -2 - Math.random() * 2,
      life: 60,
      maxLife: 60,
      size: 16 + Math.random() * 8,
      color: color || '#ff6b9d',
      delay: i * 3,
    });
  }
}

let roundNum = 1;
let roundTimeLeft = 180;
let roundActive = true;

const ROUND_DURATION = 180;
const MAX_PLAYERS = 20;
const NEXT_ROUND_DELAY = 8;

// Vibrant colors for bubbles
const COLOR_PALETTE = [
  '#ff6b9d', '#ff8e3c', '#ffd93d', '#6bcb77', '#4d96ff',
  '#9b5de5', '#f15bb5', '#00bbf9', '#00f5d4', '#fee440',
  '#ff70a6', '#ff9770', '#e9ff70', '#70d6ff', '#ffd670',
  '#ee6c4d', '#f78c6b', '#fcd5ce', '#84a59d', '#f28482',
];
let colorIdx = 0;

// === Bubble Character ===
class Bubble {
  constructor(userData) {
    this.id = userData.user;
    this.nickname = userData.nickname || userData.user;
    this.picUrl = userData.pic;
    this.color = COLOR_PALETTE[colorIdx++ % COLOR_PALETTE.length];
    this.colorRgb = hexToRgb(this.color);

    // Spawn at random position
    this.x = Math.random() * (canvas.width - 200) + 100;
    this.y = Math.random() * (canvas.height - 400) + 200;

    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = (Math.random() - 0.5) * 1.2;

    this.size = 40;
    this.maxSize = 40;
    this.targetSize = 40;
    this.alive = true;

    this.spawnTime = Date.now();
    this.spawnAnim = 1.5;

    // Buffs
    this.speedMul = 1;
    this.speedMulUntil = 0;
    this.shielded = false;
    this.shieldedUntil = 0;
    this.paintRadius = 16; // smaller trail

    // Score
    this.coverage = 0;
    this.taps = 0;  // how many likes this player sent
    this.paintCount = 0;  // coverage tracker

    // Avatar
    this.avatar = null;
    this.loadAvatar();
  }

  loadAvatar() {
    if (!this.picUrl) return;
    const proxyUrl = this.picUrl.startsWith('http')
      ? `${BACKEND_URL}/avatar?url=${encodeURIComponent(this.picUrl)}`
      : this.picUrl;
    if (avatarCache.has(proxyUrl)) {
      this.avatar = avatarCache.get(proxyUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.avatar = img;
      avatarCache.set(proxyUrl, img);
    };
    img.onerror = () => {
      // Fallback: try direct URL without proxy
      const fallback = new Image();
      fallback.onload = () => {
        this.avatar = fallback;
        avatarCache.set(proxyUrl, fallback);
      };
      fallback.onerror = () => {};
      fallback.src = this.picUrl;
    };
    img.src = proxyUrl;
  }

  growBubble(amount = 2) {
    this.targetSize = Math.min(80, this.targetSize + amount);
    this.paintRadius = this.targetSize * 0.7;
  }

  giveBoost(type, duration) {
    if (type === 'speed') {
      this.speedMul = 2.2;
      this.speedMulUntil = Date.now() + duration * 1000;
    } else if (type === 'shield') {
      this.shielded = true;
      this.shieldedUntil = Date.now() + duration * 1000;
    } else if (type === 'big') {
      this.targetSize = Math.min(120, this.targetSize + 25);
      this.paintRadius = this.targetSize * 0.8;
    }
  }

  update(dt) {
    if (!this.alive) return;

    if (this.spawnAnim > 0) this.spawnAnim -= 0.04;
    if (this.spawnAnim < 0) this.spawnAnim = 0;

    if (Date.now() > this.speedMulUntil) this.speedMul = 1;
    if (Date.now() > this.shieldedUntil) this.shielded = false;

    // Smooth size animation
    this.size += (this.targetSize - this.size) * 0.1;

    // Paint trail at current position
    this.paintAt(this.x, this.y);

    // Very gentle wandering
    this.vx += (Math.random() - 0.5) * 0.06;
    this.vy += (Math.random() - 0.5) * 0.06;

    // Friction
    this.vx *= 0.97;
    this.vy *= 0.97;

    // Cap velocity — MUCH slower
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = 0.9 * this.speedMul;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    // Bounce off walls
    if (this.x < this.size) { this.x = this.size; this.vx = Math.abs(this.vx); }
    if (this.x > canvas.width - this.size) { this.x = canvas.width - this.size; this.vx = -Math.abs(this.vx); }
    if (this.y < 70 + this.size) { this.y = 70 + this.size; this.vy = Math.abs(this.vy); }
    if (this.y > canvas.height - 200 - this.size) { this.y = canvas.height - 200 - this.size; this.vy = -Math.abs(this.vy); }

    // Soft collision with other bubbles (push apart)
    for (const p of players.values()) {
      if (p === this || !p.alive) continue;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      const minD = this.size + p.size;
      if (d < minD && d > 0) {
        const overlap = minD - d;
        const push = overlap / 2;
        this.x -= (dx / d) * push;
        this.y -= (dy / d) * push;
        this.vx -= (dx / d) * 0.3;
        this.vy -= (dy / d) * 0.3;
      }
    }
  }

  paintAt(x, y) {
    const r = this.paintRadius + (Math.random() * 4 - 2);
    try {
      const grad = paintCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, this.color + 'ff');
      grad.addColorStop(0.7, this.color + 'cc');
      grad.addColorStop(1, this.color + '00');
      paintCtx.fillStyle = grad;
    } catch (e) {
      paintCtx.fillStyle = this.color;
    }
    paintCtx.beginPath();
    paintCtx.arc(x, y, r, 0, Math.PI * 2);
    paintCtx.fill();
    this.paintCount++;
  }

  draw() {
    if (!this.alive) return;

    const scale = 1 + this.spawnAnim * 0.5;
    const size = this.size * scale;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Glow / shield ring
    if (this.shielded && Date.now() < this.shieldedUntil) {
      ctx.beginPath();
      ctx.arc(0, 0, size + 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffffff';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Outer glow in player color
    ctx.shadowBlur = 25;
    ctx.shadowColor = this.color;

    // Bubble background
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // White ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    // Avatar inside
    if (this.avatar && this.avatar.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, size - 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.avatar, -size + 4, -size + 4, (size - 4) * 2, (size - 4) * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${size * 0.9}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.nickname[0]?.toUpperCase() || '?', 0, 2);
    }

    // Highlight sheen (bubble look)
    ctx.beginPath();
    ctx.arc(-size * 0.3, -size * 0.3, size * 0.3, 0, Math.PI * 2);
    const sheen = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 0, -size * 0.3, -size * 0.3, size * 0.3);
    sheen.addColorStop(0, 'rgba(255,255,255,0.6)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill();

    // Nickname below
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000';
    ctx.fillText(this.nickname.slice(0, 14), 0, size + 16);
    ctx.shadowBlur = 0;

    // Tap counter badge (top-right of bubble)
    if (this.taps > 0) {
      const bx = size * 0.7;
      const by = -size * 0.7;
      const br = 13;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = this.taps > 99 ? '99+' : String(this.taps);
      ctx.fillText(txt, bx, by + 1);
    }

    ctx.restore();
  }
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// === Coverage tracking (based on paint calls, not pixel sampling) ===
// Each bubble increments its own paint count when it paints a circle.
// Avoids getImageData which can crash on tainted canvases.
function computeCoverage() {
  const totalPaint = [...players.values()].reduce((s, p) => s + (p.paintCount || 0), 0);
  if (totalPaint === 0) return;
  for (const p of players.values()) {
    p.coverage = (p.paintCount || 0) / totalPaint;
  }
}

// === Socket.io ===
let socket = null;

// Backend URL — configurable via localStorage or URL param
// For Netlify deploy: set backend URL via ?backend=https://your-backend.onrender.com
// or localStorage.setItem('backendUrl', 'https://your-backend.com')
const urlParams = new URLSearchParams(window.location.search);
const BACKEND_URL = urlParams.get('backend')
  || localStorage.getItem('backendUrl')
  || (window.location.hostname === 'localhost' ? '' : window.location.origin);

function startGame() {
  socket = BACKEND_URL ? io(BACKEND_URL) : io();

  socket.on('connect', () => console.log('Socket connected'));

  socket.on('status', (data) => {
    const dot = document.getElementById('connStatus');
    if (data.connected) { dot.classList.remove('off'); dot.classList.add('on'); }
    else { dot.classList.remove('on'); dot.classList.add('off'); }
  });

  socket.on('stats', (data) => {
    const v = document.getElementById('viewerCount');
    const l = document.getElementById('totalLikes');
    if (v) v.textContent = (data.viewers || 0).toLocaleString('pl-PL');
    if (l) l.textContent = (data.totalLikes || 0).toLocaleString('pl-PL');
  });

  // Server signals that it switched to a different live — clear our state
  socket.on('reset', (data) => {
    console.log('Reset — backend switched to @' + data.username);
    players.clear();
    if (raceGame) raceGame.reset();
    if (boarsGame) boarsGame.reset();
    // Clear header stats
    const v = document.getElementById('viewerCount');
    const l = document.getElementById('totalLikes');
    if (v) v.textContent = '0';
    if (l) l.textContent = '0';
  });

  socket.on('like', (evt) => {
    // Route to active game mode
    if (GAME_MODE === 'race' && raceGame) {
      raceGame.onLike(evt);
      playTap(0.8 + Math.random() * 0.6);
      return;
    }
    if (GAME_MODE === 'boars' && boarsGame) {
      boarsGame.onLike(evt);
      return; // boars handles its own sound
    }

    if (!roundActive) return;
    if (players.size >= MAX_PLAYERS && !players.has(evt.user)) return;

    // TikTok sends likeCount per batch (many hearts in one event)
    const heartCount = Math.max(1, evt.count || 1);

    if (!players.has(evt.user)) {
      const b = new Bubble(evt);
      b.taps = heartCount;
      players.set(evt.user, b);
      showAlert(`❤️ <strong>${evt.nickname}</strong> wskakuje! +${heartCount}`, evt.pic);
      spawnHeartBurst(b.x, b.y, heartCount, b.color);
      playPop();
    } else {
      const p = players.get(evt.user);
      p.taps += heartCount;
      p.growBubble(Math.min(heartCount * 0.3, 5));
      spawnHeartBurst(p.x, p.y, heartCount, p.color);
      // Random pitch per tap for variety
      const pitch = 0.8 + Math.random() * 0.6;
      playTap(pitch);
      if (heartCount >= 3) {
        showAlert(`❤️ <strong>${evt.nickname}</strong> +${heartCount} (${p.taps})`, evt.pic);
      }
    }
  });

  socket.on('gift', (evt) => {
    if (GAME_MODE === 'race' && raceGame) {
      raceGame.onGift(evt);
      return;
    }
    if (GAME_MODE === 'boars' && boarsGame) {
      boarsGame.onGift(evt);
      return;
    }
    if (!roundActive) return;
    if (!players.has(evt.user)) {
      const b = new Bubble(evt);
      players.set(evt.user, b);
    }
    const p = players.get(evt.user);
    if (!p) return;

    const giftName = (evt.giftName || '').toLowerCase();

    if (giftName.includes('rose') || evt.diamondCount === 1) {
      p.giveBoost('speed', 8);
      p.growBubble(8);
      showAlert(`🌹 <strong>${evt.nickname}</strong> Rose!`, evt.pic, 'gift');
      playPop();
    } else if (giftName.includes('mic') || evt.diamondCount >= 99) {
      p.giveBoost('big', 0);
      p.giveBoost('speed', 15);
      showCritical('🎤 BIG BUBBLE', evt.nickname, evt.pic);
      showAlert(`🎤 <strong>${evt.nickname}</strong> BIG BUBBLE!`, evt.pic, 'gift');
      playCritical();
    } else if (giftName.includes('galaxy') || evt.diamondCount >= 1000) {
      p.targetSize = 150;
      p.paintRadius = 100;
      p.giveBoost('shield', 30);
      p.giveBoost('speed', 30);
      showCritical('🌌 GALAXY CRITICAL', evt.nickname, evt.pic);
      showAlert(`💥 <strong>${evt.nickname}</strong> GALAXY!`, evt.pic, 'win');
      playCritical();
    } else {
      p.growBubble(5);
      showAlert(`🎁 <strong>${evt.nickname}</strong> ${evt.giftName}!`, evt.pic, 'gift');
      playPop();
    }
  });

  socket.on('chat', (evt) => {
    if (!roundActive) return;
    const comment = (evt.comment || '').toLowerCase();
    if (!players.has(evt.user)) return;
    const p = players.get(evt.user);
    if (!p) return;

    if (comment.includes('atak') || comment.includes('go') || comment.includes('attack') || comment.includes('szybko')) {
      p.giveBoost('speed', 6);
    }
  });

  socket.on('follow', (evt) => {
    if (!players.has(evt.user)) return;
    const p = players.get(evt.user);
    p.giveBoost('shield', 10);
    showAlert(`<strong>${evt.nickname}</strong> obserwuje! 🛡️`, evt.pic, 'gift');
  });

  socket.on('share', (evt) => {
    if (!players.has(evt.user)) return;
    const p = players.get(evt.user);
    p.growBubble(15);
    showAlert(`<strong>${evt.nickname}</strong> udostępnił! 💎`, evt.pic, 'gift');
  });
}

// === Alert system ===
const alertsEl = document.getElementById('alerts');
function showAlert(text, picUrl, type = '') {
  const proxyPic = picUrl && picUrl.startsWith('http') ? `${BACKEND_URL}/avatar?url=${encodeURIComponent(picUrl)}` : (picUrl || '');
  const div = document.createElement('div');
  div.className = `alert ${type}`;
  div.innerHTML = `
    <img src="${proxyPic}" onerror="this.style.display='none'">
    <div class="text">${text}</div>
  `;
  alertsEl.appendChild(div);
  setTimeout(() => div.remove(), 4000);
  while (alertsEl.children.length > 4) alertsEl.firstChild.remove();
}

// === Critical banner for big events ===
const critBanner = document.getElementById('criticalBanner');
const critPic = document.getElementById('critPic');
const critLabel = document.getElementById('critLabel');
const critName = document.getElementById('critName');
let critTimeout = null;

function showCritical(label, nickname, picUrl) {
  if (critTimeout) clearTimeout(critTimeout);
  const proxyPic = picUrl && picUrl.startsWith('http') ? `${BACKEND_URL}/avatar?url=${encodeURIComponent(picUrl)}` : (picUrl || '');
  critPic.src = proxyPic;
  critLabel.textContent = label;
  critName.textContent = nickname;
  critBanner.classList.remove('hidden');
  critTimeout = setTimeout(() => critBanner.classList.add('hidden'), 3500);
}

// === Round logic ===
function checkRoundEnd() {
  if (roundTimeLeft <= 0 && players.size > 0) {
    // Winner is highest coverage
    const sorted = [...players.values()].sort((a, b) => b.coverage - a.coverage);
    endRound(sorted[0]);
  }
}

function endRound(winner) {
  if (!roundActive) return;
  roundActive = false;

  if (winner) {
    document.getElementById('winnerPic').src = winner.picUrl || '';
    document.getElementById('winnerName').textContent = winner.nickname;
    document.getElementById('winnerCoverage').textContent = `${(winner.coverage * 100).toFixed(1)}% pokrycia`;
    document.getElementById('winnerOverlay').classList.remove('hidden');

    let countdown = NEXT_ROUND_DELAY;
    document.getElementById('nextRoundTimer').textContent = countdown;
    const interval = setInterval(() => {
      countdown--;
      document.getElementById('nextRoundTimer').textContent = countdown;
      if (countdown <= 0) { clearInterval(interval); startNewRound(); }
    }, 1000);
  } else {
    setTimeout(startNewRound, 3000);
  }
}

function startNewRound() {
  document.getElementById('winnerOverlay').classList.add('hidden');
  players.clear();
  particles.length = 0;
  hearts.length = 0;
  colorIdx = 0;
  paintCtx.fillStyle = 'rgba(10, 10, 30, 1)';
  paintCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
  roundNum++;
  roundTimeLeft = ROUND_DURATION;
  roundActive = true;
}

// === Update leaderboard ===
function updateLeaderboard() {
  const top = [...players.values()]
    .sort((a, b) => (b.taps || 0) - (a.taps || 0))
    .slice(0, 5);
  const ul = document.getElementById('topPlayers');
  ul.innerHTML = '';
  top.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = `rank-${i + 1}`;
    const proxyPic = p.picUrl && p.picUrl.startsWith('http') ? `${BACKEND_URL}/avatar?url=${encodeURIComponent(p.picUrl)}` : (p.picUrl || '');
    li.innerHTML = `
      <img src="${proxyPic}" onerror="this.style.display='none'">
      <span class="name" style="color:${p.color}">${p.nickname.slice(0, 12)}</span>
      <span class="taps">❤️ ${p.taps || 0}</span>
    `;
    ul.appendChild(li);
  });
  const v = document.getElementById('playerCount');
  if (v) v.textContent = players.size;
}

// === Timer ===
setInterval(() => {
  if (GAME_MODE === 'race' && raceGame) {
    if (raceGame.active) {
      raceGame.roundLeft--;
      if (raceGame.roundLeft < 0) raceGame.roundLeft = 0;
      const m = Math.floor(raceGame.roundLeft / 60);
      const s = raceGame.roundLeft % 60;
      const t = document.getElementById('timer');
      if (t) t.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      if (!raceGame.active && raceGame.winner) {
        setTimeout(() => { if (raceGame) raceGame.reset(); }, 10000);
      }
    }
    return;
  }
  if (GAME_MODE === 'boars' && boarsGame) {
    if (boarsGame.active) {
      boarsGame.roundLeft--;
      if (boarsGame.roundLeft < 0) {
        boarsGame.roundLeft = 0;
        boarsGame.end();
        // Auto-restart after 10s
        setTimeout(() => { if (boarsGame) boarsGame.reset(); }, 10000);
      }
      const m = Math.floor(boarsGame.roundLeft / 60);
      const s = boarsGame.roundLeft % 60;
      const t = document.getElementById('timer');
      if (t) t.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    return;
  }
  if (roundActive) {
    roundTimeLeft--;
    if (roundTimeLeft < 0) roundTimeLeft = 0;
    const m = Math.floor(roundTimeLeft / 60);
    const s = roundTimeLeft % 60;
    const t = document.getElementById('timer');
    if (t) t.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
}, 1000);

// Coverage check every 1s
setInterval(() => {
  if (roundActive) computeCoverage();
}, 1000);

// === Main loop ===
let lastFrame = Date.now();
let fadeFrame = 0;
function gameLoop() {
  try {
    const now = Date.now();
    const dt = (now - lastFrame) / 16.67;
    lastFrame = now;

    // Clear game canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Nothing to do until game is launched
    if (!gameStarted) {
      requestAnimationFrame(gameLoop);
      return;
    }

    // === RACE MODE ===
    if (GAME_MODE === 'race' && raceGame) {
      paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      raceGame.tick();
      raceGame.draw();
      try { raceGame.updateLeaderboard(); } catch (e) { console.error('race lb:', e); }
      requestAnimationFrame(gameLoop);
      return;
    }

    // === BOARS MODE ===
    if (GAME_MODE === 'boars' && boarsGame) {
      paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      boarsGame.tick();
      boarsGame.draw();
      try { boarsGame.updateLeaderboard(); } catch (e) { console.error('boars lb:', e); }
      requestAnimationFrame(gameLoop);
      return;
    }

    // === BUBBLE MODE (default) ===
    if (GAME_MODE !== 'bubble') {
      // Unknown mode — just wait
      requestAnimationFrame(gameLoop);
      return;
    }

    // Fade paint canvas slowly (every 2nd frame to save perf)
    fadeFrame++;
    if (fadeFrame % 2 === 0) {
      paintCtx.fillStyle = 'rgba(10, 10, 30, 0.015)';
      paintCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    }

    // Update + draw bubbles
    for (const p of players.values()) {
      try {
        p.update(dt);
        p.draw();
      } catch (e) {
        console.error('Bubble error:', e, p.id);
      }
    }

    // Update + draw floating hearts
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      if (h.delay > 0) { h.delay--; continue; }
      h.x += h.vx;
      h.y += h.vy;
      h.vy += 0.05; // gentle gravity
      h.life--;
      if (h.life <= 0) { hearts.splice(i, 1); continue; }

      const alpha = Math.min(1, h.life / h.maxLife * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(h.x, h.y);
      ctx.scale(h.size / 20, h.size / 20);
      ctx.fillStyle = h.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = h.color;
      // Heart shape
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-10, -6, -14, 4, 0, 14);
      ctx.bezierCurveTo(14, 4, 10, -6, 0, 4);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    if (roundActive) checkRoundEnd();
    try { updateLeaderboard(); } catch (e) { console.error('leaderboard:', e); }
  } catch (e) {
    console.error('GameLoop error:', e);
  }
  requestAnimationFrame(gameLoop);
}

// === Test panel ===
const testToggle = document.getElementById('testToggle');
const testPanel = document.getElementById('testPanel');
testToggle.style.display = 'block';
testToggle.addEventListener('click', () => {
  testPanel.classList.toggle('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 't') testPanel.classList.toggle('hidden');
});

testPanel.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tp-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'like') await fetch(`${BACKEND_URL}/test/like`);
  else if (action === 'spam') await fetch(`${BACKEND_URL}/test/spam`);
  else if (action === 'rose') await fetch(`${BACKEND_URL}/test/gift/rose`);
  else if (action === 'mic') await fetch(`${BACKEND_URL}/test/gift/mic`);
  else if (action === 'galaxy') await fetch(`${BACKEND_URL}/test/gift/galaxy`);
  else if (action === 'reset') startNewRound();
});

gameLoop();
console.log('Edward Warchocki Bubble Battle ready — press T for test panel');
