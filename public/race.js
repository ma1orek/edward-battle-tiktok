/**
 * RACE MODE — Vertical Race to the Finish
 * 10 top tappers race. Each tap = forward progress.
 * First to finish wins. 3 min round.
 */

class RaceGame {
  constructor(canvas, ctx, backendUrl) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.BACKEND_URL = backendUrl;
    this.runners = new Map(); // id → Runner
    this.hearts = [];
    this.avatarCache = new Map();
    this.maxRunners = 10;
    this.trackLength = 1; // 0..1 progress (0 = start, 1 = finish)
    this.roundTime = 180;
    this.roundLeft = this.roundTime;
    this.active = true;
    this.winner = null;
    this.finishers = []; // order of finishers
    this.totalLikes = 0;
    this.viewers = 0;
  }

  // Lane positions (10 lanes evenly spread)
  laneX(lane) {
    const w = this.canvas.width;
    return (w / (this.maxRunners + 1)) * (lane + 1);
  }

  spawn(userData) {
    if (this.runners.has(userData.user)) return this.runners.get(userData.user);
    if (this.runners.size >= this.maxRunners) return null;
    const lane = this.runners.size;
    const r = new Runner(userData, lane, this);
    this.runners.set(userData.user, r);
    return r;
  }

  // Each heart batch pushes the runner forward
  onLike(evt) {
    if (!this.active) return;
    const count = Math.max(1, evt.count || 1);

    let r = this.runners.get(evt.user);
    if (!r) {
      r = this.spawn(evt);
      if (!r) {
        // Game is full — add to "cheering" list, boost all at once?
        return;
      }
    }
    r.taps += count;
    // Each tap pushes forward by a small amount (more taps = more distance)
    r.targetProgress = Math.min(1, r.targetProgress + count * 0.004);
    r.speedBoost = Math.min(3, r.speedBoost + count * 0.08);

    // Visual burst
    this.spawnHeartBurst(r.x, r.y, Math.min(count, 5), r.color);

    if (r.progress >= 1 && !r.finished) {
      r.finished = true;
      r.finishTime = this.roundTime - this.roundLeft;
      this.finishers.push(r);
      if (!this.winner) this.winner = r;
    }
  }

  onGift(evt) {
    if (!this.active) return;
    let r = this.runners.get(evt.user);
    if (!r) {
      r = this.spawn(evt);
      if (!r) return;
    }
    const giftName = (evt.giftName || '').toLowerCase();
    if (giftName.includes('rose') || evt.diamondCount === 1) {
      r.targetProgress = Math.min(1, r.targetProgress + 0.08);
      r.speedBoost = 3;
      window.playPop && window.playPop();
    } else if (giftName.includes('mic') || evt.diamondCount >= 99) {
      r.targetProgress = Math.min(1, r.targetProgress + 0.25);
      r.speedBoost = 5;
      window.playCritical && window.playCritical();
    } else if (giftName.includes('galaxy') || evt.diamondCount >= 1000) {
      r.targetProgress = 1;
      r.speedBoost = 10;
      window.playCritical && window.playCritical();
    } else {
      r.targetProgress = Math.min(1, r.targetProgress + 0.05);
    }
  }

  spawnHeartBurst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      this.hearts.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y,
        vx: (Math.random() - 0.5) * 2,
        vy: -1.5 - Math.random() * 1.5,
        life: 50,
        maxLife: 50,
        size: 12 + Math.random() * 6,
        color: color || '#ff6b9d',
        delay: i * 2,
      });
    }
  }

  tick() {
    if (!this.active) return;
    for (const r of this.runners.values()) {
      r.update();
      if (r.progress >= 1 && !r.finished) {
        r.finished = true;
        r.finishTime = this.roundTime - this.roundLeft;
        this.finishers.push(r);
        if (!this.winner) this.winner = r;
      }
    }

    // Check end conditions
    if (this.finishers.length >= Math.min(3, this.runners.size) || this.roundLeft <= 0) {
      this.end();
    }
  }

  end() {
    if (!this.active) return;
    this.active = false;
    // If no one finished, winner = highest progress
    if (!this.winner) {
      const sorted = [...this.runners.values()].sort((a, b) => b.progress - a.progress);
      this.winner = sorted[0] || null;
    }
  }

  reset() {
    this.runners.clear();
    this.hearts.length = 0;
    this.active = true;
    this.winner = null;
    this.finishers = [];
    this.roundLeft = this.roundTime;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background gradient track
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#1a1a3e');
    bgGrad.addColorStop(1, '#0a0a1e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Finish line (top)
    const finishY = 100;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, finishY - 4, w, 4);
    // Checker pattern
    for (let x = 0; x < w; x += 20) {
      ctx.fillStyle = (x / 20) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x, finishY - 14, 20, 8);
    }
    // Finish label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#fbbf24';
    ctx.fillText('🏁 META 🏁', w / 2, finishY - 22);
    ctx.shadowBlur = 0;

    // Start line (bottom)
    const startY = h - 180;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, startY, w, 2);

    // Draw lane guides
    for (let i = 0; i < Math.min(this.runners.size, this.maxRunners); i++) {
      const x = this.laneX(i);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(x, finishY);
      ctx.lineTo(x, startY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw hearts
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const hrt = this.hearts[i];
      if (hrt.delay > 0) { hrt.delay--; continue; }
      hrt.x += hrt.vx;
      hrt.y += hrt.vy;
      hrt.vy += 0.05;
      hrt.life--;
      if (hrt.life <= 0) { this.hearts.splice(i, 1); continue; }
      const alpha = hrt.life / hrt.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(hrt.x, hrt.y);
      ctx.scale(hrt.size / 20, hrt.size / 20);
      ctx.fillStyle = hrt.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = hrt.color;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-10, -6, -14, 4, 0, 14);
      ctx.bezierCurveTo(14, 4, 10, -6, 0, 4);
      ctx.fill();
      ctx.restore();
    }

    // Draw runners
    for (const r of this.runners.values()) {
      r.draw(ctx, finishY, startY);
    }
  }

  updateLeaderboard() {
    const top = [...this.runners.values()]
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      })
      .slice(0, 5);
    const ul = document.getElementById('topPlayers');
    if (!ul) return;
    ul.innerHTML = '';
    top.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = `rank-${i + 1}`;
      const proxyPic = p.picUrl && p.picUrl.startsWith('http')
        ? `${this.BACKEND_URL}/avatar?url=${encodeURIComponent(p.picUrl)}`
        : (p.picUrl || '');
      const status = p.finished ? '🏁' : `${Math.floor(p.progress * 100)}%`;
      li.innerHTML = `
        <img src="${proxyPic}" onerror="this.style.display='none'">
        <span class="name" style="color:${p.color}">${p.nickname.slice(0, 12)}</span>
        <span class="taps">❤️ ${p.taps || 0}</span>
        <span class="status-mini">${status}</span>
      `;
      ul.appendChild(li);
    });
    const pc = document.getElementById('playerCount');
    if (pc) pc.textContent = this.runners.size;
  }
}

class Runner {
  constructor(userData, lane, game) {
    this.id = userData.user;
    this.nickname = userData.nickname || userData.user;
    this.picUrl = userData.pic;
    this.lane = lane;
    this.game = game;

    // Progress 0..1 (0 = start, 1 = finish)
    this.progress = 0;
    this.targetProgress = 0;
    this.speedBoost = 0;
    this.taps = 0;
    this.finished = false;
    this.finishTime = 0;

    // Visual
    this.x = game.laneX(lane);
    this.y = 0;
    this.color = Runner.COLORS[lane % Runner.COLORS.length];

    this.avatar = null;
    this.loadAvatar();
  }

  loadAvatar() {
    if (!this.picUrl) return;
    const proxyUrl = this.picUrl.startsWith('http')
      ? `${this.game.BACKEND_URL}/avatar?url=${encodeURIComponent(this.picUrl)}`
      : this.picUrl;
    if (this.game.avatarCache.has(proxyUrl)) {
      this.avatar = this.game.avatarCache.get(proxyUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.avatar = img;
      this.game.avatarCache.set(proxyUrl, img);
    };
    img.onerror = () => {
      const fb = new Image();
      fb.onload = () => { this.avatar = fb; };
      fb.src = this.picUrl;
    };
    img.src = proxyUrl;
  }

  update() {
    // Smooth progress toward target
    this.progress += (this.targetProgress - this.progress) * 0.08;
    // Decay speed boost
    this.speedBoost *= 0.96;
    // Target slightly decays too (makes them slow if no new taps)
    // Actually no — target should be sticky, only increased by taps
  }

  draw(ctx, finishY, startY) {
    const trackHeight = startY - finishY;
    this.y = startY - this.progress * trackHeight;
    this.x = this.game.laneX(this.lane);

    const size = 24;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Speed trail
    if (this.speedBoost > 0.5) {
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.15 - i * 0.025;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, i * 6 + 8, size - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Outer ring glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;

    // Circle background
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    // Avatar
    if (this.avatar && this.avatar.complete && this.avatar.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, size - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.avatar, -size + 3, -size + 3, (size - 3) * 2, (size - 3) * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${size * 0.9}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.nickname[0]?.toUpperCase() || '?', 0, 2);
    }

    // Nickname below
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 3;
    ctx.shadowColor = '#000';
    ctx.fillText(this.nickname.slice(0, 10), 0, size + 14);

    // Tap counter
    if (this.taps > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Arial';
      ctx.fillText(`❤️${this.taps}`, 0, size + 26);
    }

    // Finished medal
    if (this.finished) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#fbbf24';
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('🏆', 0, -size - 8);
    }
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

Runner.COLORS = [
  '#ff6b9d', '#ff8e3c', '#ffd93d', '#6bcb77', '#4d96ff',
  '#9b5de5', '#f15bb5', '#00bbf9', '#00f5d4', '#fee440',
];

window.RaceGame = RaceGame;
