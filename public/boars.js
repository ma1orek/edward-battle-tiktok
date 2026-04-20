/**
 * BOARS MODE — Gonienie Dzików Warszawa → Las
 * Każdy widz = 1 dzik. Każdy lajk = dzik robi krok w prawo.
 * 1000 tapów = dzik przegoniony do lasu, user dostaje kolejnego.
 * Runda 3 min. Top 5 — najwięcej przegonionych.
 */

const TAPS_TO_CHASE = 1000;
const ROUND_BOARS_SECONDS = 180;

class BoarsGame {
  constructor(canvas, ctx, backendUrl) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.BACKEND_URL = backendUrl;
    this.players = new Map();
    this.avatarCache = new Map();
    this.particles = [];
    this.escapedBoars = []; // boars that reached forest (animation)
    this.tapAnimations = []; // little boar tap flashes
    this.active = true;
    this.roundLeft = ROUND_BOARS_SECONDS;
    this.totalChased = 0;
    this.totalTaps = 0;

    // Parallax layers
    this.clouds = [
      { x: 0.15, y: 0.12, size: 0.08, speed: 0.02 },
      { x: 0.45, y: 0.08, size: 0.10, speed: 0.03 },
      { x: 0.75, y: 0.14, size: 0.07, speed: 0.025 },
    ];
    this.trees = [];
    this.buildings = [];
    this.generateScenery();

    // Time
    this.startTime = Date.now();
  }

  generateScenery() {
    // Warsaw buildings (left side)
    for (let i = 0; i < 8; i++) {
      this.buildings.push({
        x: 0.02 + Math.random() * 0.28,
        width: 0.04 + Math.random() * 0.06,
        height: 0.15 + Math.random() * 0.25,
        color: `hsl(${200 + Math.random() * 40}, ${30 + Math.random() * 30}%, ${25 + Math.random() * 15}%)`,
        windows: Math.floor(Math.random() * 6) + 3,
      });
    }
    // Forest trees (right side)
    for (let i = 0; i < 14; i++) {
      this.trees.push({
        x: 0.68 + Math.random() * 0.32,
        y: 0.55 + Math.random() * 0.35,
        size: 0.04 + Math.random() * 0.06,
        hue: 100 + Math.random() * 40,
        sway: Math.random() * Math.PI * 2,
      });
    }
  }

  loadAvatar(player) {
    if (!player.picUrl) return;
    const proxyUrl = player.picUrl.startsWith('http')
      ? `${this.BACKEND_URL}/avatar?url=${encodeURIComponent(player.picUrl)}`
      : player.picUrl;
    if (this.avatarCache.has(proxyUrl)) {
      player.avatar = this.avatarCache.get(proxyUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      player.avatar = img;
      this.avatarCache.set(proxyUrl, img);
    };
    img.onerror = () => {
      const fb = new Image();
      fb.onload = () => { player.avatar = fb; };
      fb.src = player.picUrl;
    };
    img.src = proxyUrl;
  }

  createPlayer(userData) {
    const p = {
      id: userData.user,
      nickname: userData.nickname || userData.user,
      picUrl: userData.pic,
      currentTaps: 0,
      totalTaps: 0,
      boarsChased: 0,
      // Spread vertically across 20-85% of screen (full height)
      boarY: 0.20 + Math.random() * 0.65,
      // Start at Warszawa edge (x = 0.08)
      boarX: 0.08,
      boarWobble: 0,
      boarColor: `hsl(${Math.random() * 360}, 70%, 60%)`,
      avatar: null,
      lastTapTime: 0,
      tapScale: 1,
    };
    this.loadAvatar(p);
    return p;
  }

  onLike(evt) {
    if (!this.active) return;
    const count = Math.max(1, evt.count || 1);

    if (!this.players.has(evt.user)) {
      this.players.set(evt.user, this.createPlayer(evt));
    }
    const p = this.players.get(evt.user);

    // Process taps
    for (let i = 0; i < count; i++) {
      p.currentTaps++;
      p.totalTaps++;
      this.totalTaps++;

      if (p.currentTaps >= TAPS_TO_CHASE) {
        this.escapeBoar(p);
        p.boarsChased++;
        this.totalChased++;
        p.currentTaps = 0;
      }
    }

    // === INSTANT VISUAL MOVE per burst ===
    // Each like pushes boar forward IMMEDIATELY by the exact visual portion.
    // This way even single taps are visible, not hidden behind smoothing.
    const deltaProgress = count / TAPS_TO_CHASE;
    p.boarX = Math.min(0.85, p.boarX + deltaProgress * 0.77);

    // Big pop effect for visibility
    p.lastTapTime = Date.now();
    p.tapScale = Math.min(1.5, p.tapScale + 0.15 + Math.min(0.2, count * 0.01));
    p.boarWobble += (Math.random() - 0.5) * 0.3;
    p.boarWobble = Math.max(-0.4, Math.min(0.4, p.boarWobble));

    // Flash effect for visibility
    p.tapFlash = 1.0; // will decay in tick()

    // Particles
    if (this.particles.length < 200) {
      this.spawnTapFlash(p);
    }

    // Sound
    if (Date.now() - (p._lastSound || 0) > 120) {
      p._lastSound = Date.now();
      if (window.playTap) window.playTap(0.7 + Math.random() * 0.5);
    }
  }

  onGift(evt) {
    if (!this.active) return;
    if (!this.players.has(evt.user)) {
      this.players.set(evt.user, this.createPlayer(evt));
    }
    const p = this.players.get(evt.user);
    const giftName = (evt.giftName || '').toLowerCase();

    let bonus = 0;
    if (giftName.includes('rose') || evt.diamondCount === 1) bonus = 50;
    else if (giftName.includes('mic') || evt.diamondCount >= 99) bonus = 300;
    else if (giftName.includes('galaxy') || evt.diamondCount >= 1000) {
      // Galaxy = instantly chase 3 boars
      for (let i = 0; i < 3; i++) {
        this.escapeBoar(p);
        p.boarsChased++;
        this.totalChased++;
      }
      p.currentTaps = 0;
      if (window.playCritical) window.playCritical();
      return;
    } else bonus = 100;

    // Apply bonus taps
    for (let i = 0; i < bonus; i++) {
      p.currentTaps++;
      p.totalTaps++;
      if (p.currentTaps >= TAPS_TO_CHASE) {
        this.escapeBoar(p);
        p.boarsChased++;
        this.totalChased++;
        p.currentTaps = 0;
      }
    }
    if (window.playPop) window.playPop();
  }

  escapeBoar(p) {
    this.escapedBoars.push({
      startX: 0.08 + (p.currentTaps / TAPS_TO_CHASE) * 0.77, // matches current boar X range
      startY: p.boarY,
      endX: 1.05,
      endY: p.boarY + (Math.random() - 0.5) * 0.1,
      progress: 0,
      life: 90,
      nickname: p.nickname,
      color: p.boarColor,
    });
  }

  spawnTapFlash(p) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const progress = p.currentTaps / TAPS_TO_CHASE;
    const bx = (0.08 + progress * 0.77) * w;
    const by = p.boarY * h;

    // Only 1-2 dust particles (was 3)
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: bx - 30 + Math.random() * 15,
        y: by + 15 + (Math.random() - 0.5) * 10,
        vx: -1 - Math.random() * 2,
        vy: -0.5 - Math.random() * 1,
        life: 18,
        maxLife: 18,
        size: 4 + Math.random() * 4,
        color: '#8b7355',
      });
    }

    // Little heart (cap at 50 hearts max)
    if (this.tapAnimations.length < 50) {
      this.tapAnimations.push({
        x: bx + (Math.random() - 0.5) * 30,
        y: by - 30,
        vy: -2,
        life: 28,
        maxLife: 28,
        size: 16,
      });
    }
  }

  tick() {
    if (!this.active) return;

    // Update boar positions (0.08 Warsaw → 0.85 forest)
    for (const p of this.players.values()) {
      const targetX = 0.08 + (p.currentTaps / TAPS_TO_CHASE) * 0.77;
      const dx = targetX - p.boarX;

      // Fast catch-up: 40% per frame + min step so they keep moving even for tiny diffs
      if (Math.abs(dx) > 0.0005) {
        p.boarX += dx * 0.4 + Math.sign(dx) * 0.0008; // min step = 0.08% per frame
      } else {
        p.boarX = targetX;
      }

      p.tapScale += (1 - p.tapScale) * 0.22;
      p.boarWobble *= 0.88;

      // Running bobble — always animate while moving
      if (dx > 0.0005) {
        p._runPhase = (p._runPhase || 0) + 0.3;
        p.boarBob = Math.sin(p._runPhase) * 5;
      } else {
        p.boarBob = (p.boarBob || 0) * 0.85;
      }
    }

    // Update escaped boars
    for (let i = this.escapedBoars.length - 1; i >= 0; i--) {
      const b = this.escapedBoars[i];
      b.progress += 0.025;
      if (b.progress >= 1) b.life--;
      if (b.life <= 0) this.escapedBoars.splice(i, 1);
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.08;
      pt.life--;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Update tap hearts
    for (let i = this.tapAnimations.length - 1; i >= 0; i--) {
      const t = this.tapAnimations[i];
      t.y += t.vy;
      t.vy += 0.05;
      t.life--;
      if (t.life <= 0) this.tapAnimations.splice(i, 1);
    }

    // Clouds drift
    for (const c of this.clouds) {
      c.x += c.speed / 1000;
      if (c.x > 1.1) c.x = -0.1;
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // === BACKGROUND — gradient sky + ground ===
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    skyGrad.addColorStop(0, '#1a2a4a');
    skyGrad.addColorStop(0.5, '#4a5a7a');
    skyGrad.addColorStop(1, '#d4a574');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.6);

    // Ground (split left=city, right=forest)
    const groundGrad = ctx.createLinearGradient(0, h * 0.6, w, h * 0.6);
    groundGrad.addColorStop(0, '#3a3a3a');     // city asphalt
    groundGrad.addColorStop(0.5, '#5a4a3a');   // transition
    groundGrad.addColorStop(1, '#2d4a1f');     // forest soil
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);

    // === CLOUDS ===
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const c of this.clouds) {
      const cx = c.x * w;
      const cy = c.y * h;
      const cs = c.size * w;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.5, 0, Math.PI * 2);
      ctx.arc(cx + cs * 0.35, cy, cs * 0.4, 0, Math.PI * 2);
      ctx.arc(cx - cs * 0.35, cy, cs * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // === WARSAW (left 30%) ===
    // Background
    ctx.fillStyle = 'rgba(30,40,60,0.4)';
    ctx.fillRect(0, 0, w * 0.3, h);

    // Buildings
    for (const b of this.buildings) {
      const bx = b.x * w;
      const bw = b.width * w;
      const bh = b.height * h;
      const by = h * 0.6 - bh;
      ctx.fillStyle = b.color;
      ctx.fillRect(bx, by, bw, bh);
      // Windows
      ctx.fillStyle = 'rgba(255,230,120,0.6)';
      const ww = bw / 4;
      const wh = 4;
      for (let i = 1; i < b.windows; i++) {
        for (let j = 0; j < 3; j++) {
          if (Math.random() < 0.7) {
            ctx.fillRect(bx + 3 + j * (ww + 2), by + 6 + i * 10, ww, wh);
          }
        }
      }
    }

    // Warsaw label (rotated vertically on left edge)
    ctx.save();
    ctx.fillStyle = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#000';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.translate(30, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('🏙️ WARSZAWA', 0, 0);
    ctx.restore();

    // === TRANSITION ZONE (middle) — road/path ===
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.7);
    ctx.lineTo(w * 0.7, h * 0.7);
    ctx.stroke();
    ctx.setLineDash([]);

    // === FOREST (right 30%) ===
    ctx.fillStyle = 'rgba(20,50,20,0.4)';
    ctx.fillRect(w * 0.7, 0, w * 0.3, h);

    // Trees
    for (const t of this.trees) {
      const tx = t.x * w;
      const ty = t.y * h;
      const ts = t.size * w;
      t.sway += 0.01;
      const swayX = Math.sin(t.sway) * 2;
      // Trunk
      ctx.fillStyle = '#3d2817';
      ctx.fillRect(tx - ts * 0.1, ty, ts * 0.2, ts * 0.8);
      // Leaves
      ctx.fillStyle = `hsl(${t.hue}, 60%, 30%)`;
      ctx.beginPath();
      ctx.arc(tx + swayX, ty - ts * 0.3, ts * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${t.hue}, 60%, 40%)`;
      ctx.beginPath();
      ctx.arc(tx + swayX - ts * 0.3, ty - ts * 0.5, ts * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Forest label (rotated vertically on right edge)
    ctx.save();
    ctx.fillStyle = '#90ee90';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#000';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.translate(w - 30, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('🌲 LAS', 0, 0);
    ctx.restore();

    // === PARTICLES (dust behind boars) ===
    for (const pt of this.particles) {
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // === BOARS ===
    ctx.font = '42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const p of this.players.values()) {
      const boarX = p.boarX * w;
      const boarY = p.boarY * h;

      // Progress bar above boar
      const progressPct = p.currentTaps / TAPS_TO_CHASE;
      const barW = 90;
      const barH = 8;
      const barX = boarX - barW / 2;
      const barY = boarY - 64;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = p.boarColor;
      ctx.fillRect(barX, barY, barW * progressPct, barH);

      // Current taps number
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000';
      ctx.fillText(`${p.currentTaps}/${TAPS_TO_CHASE}`, boarX, barY - 8);
      ctx.shadowBlur = 0;

      // BIG Boar emoji (TV-friendly) + running bobble
      ctx.save();
      ctx.translate(boarX, boarY + (p.boarBob || 0));
      ctx.rotate(p.boarWobble);
      ctx.scale(p.tapScale, p.tapScale);
      ctx.font = '78px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐗', 0, 0);
      ctx.restore();

      // Avatar above boar (bigger)
      if (p.avatar && p.avatar.complete) {
        ctx.save();
        const avSize = 22;
        ctx.beginPath();
        ctx.arc(boarX, boarY - 90, avSize, 0, Math.PI * 2);
        ctx.closePath();
        ctx.strokeStyle = p.boarColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.drawImage(p.avatar, boarX - avSize, boarY - 90 - avSize, avSize * 2, avSize * 2);
        ctx.restore();
        ctx.restore();
      }

      // Nickname below boar
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000';
      ctx.fillText(p.nickname.slice(0, 14), boarX, boarY + 56);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(`🐗×${p.boarsChased}  ❤️${p.totalTaps}`, boarX, boarY + 74);
      ctx.shadowBlur = 0;
    }

    // === ESCAPING BOARS (animation: fly off to forest) ===
    for (const eb of this.escapedBoars) {
      const t = Math.min(1, eb.progress);
      const ex = (eb.startX + (eb.endX - eb.startX) * t) * w;
      const ey = (eb.startY + (eb.endY - eb.startY) * t) * h;
      const jumpY = ey - Math.sin(t * Math.PI) * 50;

      ctx.save();
      ctx.globalAlpha = eb.life / 90;
      ctx.translate(ex, jumpY);
      ctx.rotate(Math.sin(t * Math.PI * 3) * 0.3);
      ctx.font = '90px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐗', 0, 0);

      if (t < 0.7) {
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 18px Arial';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#000';
        ctx.fillText('UCIEKŁ! 💨', 0, -60);
      }
      ctx.restore();
    }

    // === TAP HEARTS FLYING UP ===
    for (const t of this.tapAnimations) {
      ctx.globalAlpha = t.life / t.maxLife;
      ctx.font = `${t.size}px Arial`;
      ctx.fillText('❤️', t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // === TITLE "GONIENIE DZIKÓW" (top center) ===
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#000';
    ctx.fillText('🐗 GONIENIE DZIKÓW 🐗', w / 2, 38);
    ctx.restore();

    // === BIG TIMER (center top, prominent) ===
    const m = Math.floor(this.roundLeft / 60);
    const s = this.roundLeft % 60;
    const timerTxt = `${m}:${s.toString().padStart(2, '0')}`;
    ctx.save();
    const tBoxW = 320;
    const tBoxH = 58;
    const tBoxX = w / 2 - tBoxW / 2;
    const tBoxY = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(tBoxX, tBoxY, tBoxW, tBoxH);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.strokeRect(tBoxX, tBoxY, tBoxW, tBoxH);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DO KOŃCA RUNDY', w / 2, tBoxY + 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px "Courier New"';
    ctx.fillText(timerTxt, w / 2, tBoxY + 48);
    ctx.restore();

    // === STATS ROW below timer (simple: only chased boars) ===
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const statsW = 280;
    ctx.fillRect(w / 2 - statsW / 2, tBoxY + tBoxH + 10, statsW, 36);
    ctx.strokeStyle = 'rgba(251,191,36,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(w / 2 - statsW / 2, tBoxY + tBoxH + 10, statsW, 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `🐗 Przegonionych: ${this.totalChased}`,
      w / 2, tBoxY + tBoxH + 35
    );
    ctx.restore();

  }

  updateLeaderboard() {
    const top = [...this.players.values()]
      .sort((a, b) => {
        if (b.boarsChased !== a.boarsChased) return b.boarsChased - a.boarsChased;
        return b.totalTaps - a.totalTaps;
      })
      .slice(0, 5);
    const ul = document.getElementById('topPlayers');
    if (!ul) return;
    ul.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    top.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = `rank-${i + 1}`;
      const proxyPic = p.picUrl && p.picUrl.startsWith('http')
        ? `${this.BACKEND_URL}/avatar?url=${encodeURIComponent(p.picUrl)}`
        : (p.picUrl || '');
      li.innerHTML = `
        <span class="rank-num">${medals[i]}</span>
        <img src="${proxyPic}" onerror="this.style.display='none'">
        <span class="name" style="color:${p.boarColor}">${p.nickname.slice(0, 14)}</span>
        <span class="boars-count">🐗 ${p.boarsChased}</span>
        <span class="taps-count">❤️ ${p.totalTaps}</span>
      `;
      ul.appendChild(li);
    });
    const pc = document.getElementById('playerCount');
    if (pc) pc.textContent = this.players.size;
  }

  reset() {
    this.players.clear();
    this.escapedBoars.length = 0;
    this.particles.length = 0;
    this.tapAnimations.length = 0;
    this.roundLeft = ROUND_BOARS_SECONDS;
    this.totalChased = 0;
    this.totalTaps = 0;
    this.active = true;
    this.startTime = Date.now();
  }

  end() {
    this.active = false;
  }
}

window.BoarsGame = BoarsGame;
