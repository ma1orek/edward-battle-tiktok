/**
 * TikTok Live Game Server
 * Connects to @edwardwarchocki TikTok Live, forwards events to game frontend.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

let TikTokLiveConnection, WebcastEvent;
try {
  const lib = require('tiktok-live-connector');
  TikTokLiveConnection = lib.TikTokLiveConnection || lib.WebcastPushConnection;
  WebcastEvent = lib.WebcastEvent || {
    LIKE: 'like',
    GIFT: 'gift',
    CHAT: 'chat',
    MEMBER: 'member',
    FOLLOW: 'follow',
    SHARE: 'share',
  };
} catch (e) {
  console.warn('tiktok-live-connector not available, running in mock mode');
}

let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'edwardwarchocki';
const PORT = process.env.PORT || 3000;
const EULER_API_KEY = process.env.EULER_API_KEY || 'euler_YWM1NGE3ZWQwYTA3ZGJiMjI2Y2M2MDU1ZWI3ODk1YzM2MDVjZTk0ODYxNGJmM2M5YWQ3NWFm';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// CORS for cross-origin frontend (Netlify) → backend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// === Health endpoint — Render reads this to decide on auto-restart ===
const startedAt = Date.now();
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    sessions: robotSessions ? robotSessions.size : 0,
    legacyConnected: connected,
    memMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
    eventsTotal: eventCount,
  });
});

// Avatar proxy — bypasses CORS for TikTok CDN
const https = require('https');
const httpLib = require('http');
const avatarCache = new Map(); // url → buffer

app.get('/avatar', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();

  if (avatarCache.has(url)) {
    const cached = avatarCache.get(url);
    res.set('Content-Type', cached.type);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buf);
  }

  const lib = url.startsWith('https') ? https : httpLib;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.tiktok.com/',
    },
  };

  const doRequest = (targetUrl, redirectCount = 0) => {
    if (redirectCount > 5) return res.status(502).end();
    const l = targetUrl.startsWith('https') ? https : httpLib;
    l.get(targetUrl, options, (upstream) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(upstream.statusCode)) {
        const loc = upstream.headers.location;
        if (loc) {
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).toString();
          return doRequest(nextUrl, redirectCount + 1);
        }
      }
      if (upstream.statusCode !== 200) {
        console.warn(`Avatar proxy ${upstream.statusCode} for ${targetUrl.substring(0, 80)}`);
        return res.status(upstream.statusCode).end();
      }
      const chunks = [];
      upstream.on('data', c => chunks.push(c));
      upstream.on('end', () => {
        const buf = Buffer.concat(chunks);
        const type = upstream.headers['content-type'] || 'image/jpeg';
        if (avatarCache.size < 500) avatarCache.set(url, { buf, type });
        res.set('Content-Type', type);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(buf);
      });
    }).on('error', (e) => {
      console.warn('Avatar proxy error:', e.message);
      res.status(502).end();
    });
  };

  doRequest(url);
});

// === Connection state ===
let tiktokConn = null;
let connected = false;
let eventCount = { likes: 0, gifts: 0, chats: 0, follows: 0 };
let liveStats = { viewers: 0, totalLikes: 0 };

function setupConnectionHandlers() {
  if (!tiktokConn) return;
  // === Event handlers ===
  tiktokConn.on('roomUser', data => {
    liveStats.viewers = data.viewerCount || data.userCount || 0;
    io.emit('stats', liveStats);
  });

  tiktokConn.on('like', data => {
    eventCount.likes++;
    // Defensive: TikTok can send either batch count or running sum under different fields
    const count = Math.max(1, data.likeCount || data.count || data.likes || 1);
    const uid = data.uniqueId || data.user?.uniqueId || 'unknown';

    // Track running total of like events we actually received (ground truth for our game)
    liveStats.totalLikes = (liveStats.totalLikes || 0) + count;
    // Also keep TikTok's authoritative total if provided
    if (data.totalLikeCount && data.totalLikeCount > liveStats.totalLikes) {
      liveStats.totalLikes = data.totalLikeCount;
    }

    io.emit('stats', liveStats);
    io.emit('like', {
      user: uid,
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      count: count,
      total: liveStats.totalLikes,
    });
  });

  tiktokConn.on('gift', data => {
    eventCount.gifts++;
    if (data.giftType === 1 && !data.repeatEnd) return; // streak in progress
    io.emit('gift', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      giftName: data.giftName || 'unknown',
      giftId: data.giftId,
      diamondCount: data.diamondCount || 1,
      repeatCount: data.repeatCount || 1,
    });
  });

  tiktokConn.on('chat', data => {
    eventCount.chats++;
    io.emit('chat', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      comment: data.comment || '',
    });
  });

  tiktokConn.on('follow', data => {
    eventCount.follows++;
    io.emit('follow', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    });
  });

  tiktokConn.on('share', data => {
    io.emit('share', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    });
  });

  tiktokConn.on('disconnected', () => {
    console.log('Disconnected from TikTok Live');
    connected = false;
    io.emit('status', { connected: false });
    setTimeout(startTikTokConnection, 5000);
  });

  tiktokConn.on('streamEnd', () => {
    console.log('Stream ended');
    connected = false;
    io.emit('status', { connected: false, ended: true });
  });
}

function createConnection(username) {
  // Pass EulerStream API key for higher rate limits
  return new TikTokLiveConnection(username, {
    signApiKey: EULER_API_KEY,
  });
}

function startTikTokConnection() {
  if (!TikTokLiveConnection) {
    console.log('Mock mode — no real TikTok connection');
    return;
  }
  console.log(`Connecting to TikTok Live: @${TIKTOK_USERNAME}...`);
  tiktokConn = createConnection(TIKTOK_USERNAME);
  setupConnectionHandlers();
  tiktokConn.connect()
    .then(state => {
      console.log(`Connected to room ${state.roomId}`);
      connected = true;
      io.emit('status', { connected: true, room: state.roomId });
    })
    .catch(err => {
      console.log('Initial connect failed (offline?). Will wait for /connect from UI.');
    });
}

// === Test endpoints (mock events) ===
const mockUsers = [
  { user: 'janek', nickname: 'Janek', pic: 'https://i.pravatar.cc/150?img=1' },
  { user: 'kasia', nickname: 'Kasia', pic: 'https://i.pravatar.cc/150?img=5' },
  { user: 'tomek', nickname: 'Tomek', pic: 'https://i.pravatar.cc/150?img=11' },
  { user: 'ola', nickname: 'Ola', pic: 'https://i.pravatar.cc/150?img=16' },
  { user: 'piotrek', nickname: 'Piotrek', pic: 'https://i.pravatar.cc/150?img=22' },
  { user: 'ania', nickname: 'Ania', pic: 'https://i.pravatar.cc/150?img=32' },
  { user: 'marcin', nickname: 'Marcin', pic: 'https://i.pravatar.cc/150?img=33' },
  { user: 'magda', nickname: 'Magda', pic: 'https://i.pravatar.cc/150?img=36' },
  { user: 'bartek', nickname: 'Bartek', pic: 'https://i.pravatar.cc/150?img=51' },
  { user: 'ewa', nickname: 'Ewa', pic: 'https://i.pravatar.cc/150?img=47' },
];

// Mock stats for test mode
setInterval(() => {
  if (!connected) {
    liveStats.viewers = Math.floor(100 + Math.random() * 50 + eventCount.likes / 10);
    io.emit('stats', liveStats);
  }
}, 3000);

app.get('/test/like', (req, res) => {
  const u = mockUsers[Math.floor(Math.random() * mockUsers.length)];
  eventCount.likes++;
  liveStats.totalLikes++;
  io.emit('like', { ...u, count: 1, total: liveStats.totalLikes });
  io.emit('stats', liveStats);
  res.json({ ok: true, sent: u });
});

app.get('/test/gift/:type', (req, res) => {
  const u = mockUsers[Math.floor(Math.random() * mockUsers.length)];
  const giftType = req.params.type || 'rose';
  const gifts = {
    rose: { giftName: 'Rose', diamondCount: 1 },
    mic: { giftName: 'Mic', diamondCount: 99 },
    galaxy: { giftName: 'Galaxy', diamondCount: 1000 },
  };
  const g = gifts[giftType] || gifts.rose;
  io.emit('gift', { ...u, ...g, repeatCount: 1 });
  res.json({ ok: true, sent: { ...u, ...g } });
});

app.get('/test/spam', (req, res) => {
  let i = 0;
  const interval = setInterval(() => {
    const u = mockUsers[Math.floor(Math.random() * mockUsers.length)];
    eventCount.likes++;
    liveStats.totalLikes++;
    io.emit('like', { ...u, count: 1, total: liveStats.totalLikes });
    io.emit('stats', liveStats);
    i++;
    if (i > 50) clearInterval(interval);
  }, 100);
  res.json({ ok: true, count: 50 });
});

app.get('/status', (req, res) => {
  res.json({ connected, username: TIKTOK_USERNAME, events: eventCount });
});

// Connect to a different username on demand
let connectLock = false;
app.post('/connect/:username', async (req, res) => {
  const newUsername = req.params.username.replace(/^@/, '');
  if (!newUsername) return res.json({ ok: false, message: 'No username' });
  if (connectLock) return res.json({ ok: false, message: 'Busy switching, try again' });
  connectLock = true;

  // Disconnect previous, fully reset state
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (e) {}
    tiktokConn.removeAllListeners && tiktokConn.removeAllListeners();
    tiktokConn = null;
    connected = false;
  }

  // Reset stats so old stream's numbers don't leak
  liveStats = { viewers: 0, totalLikes: 0 };
  eventCount = { likes: 0, gifts: 0, chats: 0, follows: 0 };

  TIKTOK_USERNAME = newUsername;
  console.log(`[SWITCH] Now watching @${newUsername}`);

  // Tell ALL connected frontends to reset their state
  io.emit('reset', { username: newUsername });
  io.emit('stats', liveStats);

  if (!TikTokLiveConnection) {
    connectLock = false;
    return res.json({ ok: false, message: 'TikTok library not loaded' });
  }

  try {
    tiktokConn = createConnection(newUsername);
    setupConnectionHandlers();
    const state = await tiktokConn.connect();
    connected = true;
    io.emit('status', { connected: true, room: state.roomId, username: newUsername });
    connectLock = false;
    res.json({ ok: true, room: state.roomId, username: newUsername });
  } catch (err) {
    connectLock = false;
    res.json({ ok: false, message: err.message || 'Connection failed' });
  }
});

// ============================================================
// MULTI-TENANT MERAROBOTICS ENDPOINTS
// ------------------------------------------------------------
// Each robotId (from merarobotics) keeps its own TikTok connection.
// Events are scoped as `robot:${robotId}:${eventName}` so they
// don't clash with legacy battle events above.
// ============================================================

const robotSessions = new Map(); // robotId -> { conn, username, connected, stats, events }

function emitRobot(robotId, event, payload) {
  io.emit(`robot:${robotId}:${event}`, payload);
}

function attachRobotHandlers(conn, robotId, s) {
  // Guard: ignore events from stale sessions that were superseded by a
  // newer connectRobot(robotId, ...) call. Without this, old TikTok conns
  // keep firing after switch and client receives two streams overlapping.
  const active = () => robotSessions.get(robotId) === s;

  // === High-frequency event throttling ===
  // At 10k viewers TikTok fires hundreds of like events per second.
  // Emitting each over socket.io single-threads Node and saturates WSS.
  // We keep the *exact* totals (incremented synchronously on every event)
  // but flush to subscribers at a fixed cadence with the running aggregate.
  s.likeBuffer = { count: 0, lastUser: null, lastNick: null, lastPic: null };
  s.statsDirty = false;

  // Flush every 500ms — fast enough for the heart counter to feel alive,
  // slow enough that Node + socket.io aren't melting at 10k viewers.
  s.flushInterval = setInterval(() => {
    if (!active()) return;
    if (s.likeBuffer.count > 0) {
      emitRobot(robotId, 'like', {
        user: s.likeBuffer.lastUser || 'unknown',
        nickname: s.likeBuffer.lastNick || 'Anonim',
        pic: s.likeBuffer.lastPic || '',
        count: s.likeBuffer.count,
        total: s.stats.totalLikes,
      });
      s.likeBuffer = { count: 0, lastUser: null, lastNick: null, lastPic: null };
    }
    if (s.statsDirty) {
      emitRobot(robotId, 'stats', s.stats);
      s.statsDirty = false;
    }
  }, 500);

  conn.on('roomUser', data => {
    if (!active()) return;
    s.lastEventAt = Date.now();
    s.stats.viewers = data.viewerCount || data.userCount || 0;
    s.statsDirty = true;  // batched flush every 500ms
  });
  conn.on('like', data => {
    if (!active()) return;
    s.events.likes++;
    s.lastEventAt = Date.now();
    const count = data.likeCount || data.count || data.likes || 1;
    const total = data.totalLikeCount || data.totalLikes;
    if (total && total > s.stats.totalLikes) s.stats.totalLikes = total;
    else s.stats.totalLikes = (s.stats.totalLikes || 0) + count;

    // Aggregate into buffer; periodic flusher emits the batch.
    s.likeBuffer.count += count;
    s.likeBuffer.lastUser = data.uniqueId || data.user?.uniqueId || s.likeBuffer.lastUser;
    s.likeBuffer.lastNick = data.nickname || data.user?.nickname || s.likeBuffer.lastNick;
    s.likeBuffer.lastPic = data.profilePictureUrl || data.user?.profilePictureUrl || s.likeBuffer.lastPic;
    s.statsDirty = true;
  });
  conn.on('gift', data => {
    if (!active()) return;
    s.events.gifts++;
    if (data.giftType === 1 && !data.repeatEnd) return;
    emitRobot(robotId, 'gift', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      giftName: data.giftName || 'unknown',
      giftId: data.giftId,
      diamondCount: data.diamondCount || 1,
      repeatCount: data.repeatCount || 1,
    });
  });
  conn.on('chat', data => {
    if (!active()) return;
    s.events.chats++;
    emitRobot(robotId, 'chat', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      comment: data.comment || '',
    });
  });
  conn.on('follow', data => {
    if (!active()) return;
    s.events.follows++;
    emitRobot(robotId, 'follow', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    });
  });
  conn.on('share', data => {
    if (!active()) return;
    emitRobot(robotId, 'share', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    });
  });
  conn.on('disconnected', () => {
    if (!active()) return; // stale session, do not auto-reconnect
    // Exponential backoff: 5s -> 15s -> 45s -> capped 120s. Prevents
    // hammering EulerStream / TikTok when the room is offline or rate-limited.
    s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;
    const delay = Math.min(120000, 5000 * Math.pow(3, s.reconnectAttempts - 1));
    console.log(`[robot:${robotId}] TikTok disconnected — reconnect attempt ${s.reconnectAttempts} in ${delay}ms`);
    s.connected = false;
    emitRobot(robotId, 'status', { connected: false, username: s.username });
    setTimeout(() => {
      if (robotSessions.get(robotId) !== s) return;
      connectRobot(robotId, s.username)
        .then(() => { s.reconnectAttempts = 0; })
        .catch(err =>
          console.warn(`[robot:${robotId}] reconnect failed:`, err.message)
        );
    }, delay);
  });
  conn.on('streamEnd', () => {
    if (!active()) return;
    console.log(`[robot:${robotId}] Stream ended`);
    s.connected = false;
    emitRobot(robotId, 'status', { connected: false, ended: true, username: s.username });
  });
}

async function connectRobot(robotId, username) {
  if (!TikTokLiveConnection) throw new Error('TikTok library not loaded');
  // Stop previous session if any — remove listeners first so any buffered
  // events don't leak into the new session (two lives overlapping symptom).
  const prev = robotSessions.get(robotId);
  if (prev) {
    if (prev.flushInterval) clearInterval(prev.flushInterval);
    try { prev.conn.removeAllListeners(); } catch {}
    try { prev.conn.disconnect(); } catch {}
    robotSessions.delete(robotId);
  }
  const s = {
    conn: new TikTokLiveConnection(username, { signApiKey: EULER_API_KEY }),
    username,
    connected: false,
    stats: { viewers: 0, totalLikes: 0 },
    events: { likes: 0, gifts: 0, chats: 0, follows: 0 },
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    reconnectAttempts: 0,
  };
  robotSessions.set(robotId, s);
  attachRobotHandlers(s.conn, robotId, s);
  emitRobot(robotId, 'status', { connected: false, connecting: true, username });
  const state = await s.conn.connect();
  s.connected = true;
  emitRobot(robotId, 'status', {
    connected: true,
    username,
    roomId: state.roomId,
    viewers: state.roomInfo?.user_count,
  });
  return state;
}

app.post('/robot/:robotId/connect/:username', async (req, res) => {
  const robotId = req.params.robotId;
  const username = req.params.username.replace(/^@/, '');
  if (!robotId || !username) return res.status(400).json({ ok: false, message: 'robotId+username required' });
  console.log(`[robot:${robotId}] Connecting to @${username}...`);
  try {
    const state = await connectRobot(robotId, username);
    res.json({ ok: true, roomId: state.roomId, username });
  } catch (err) {
    console.warn(`[robot:${robotId}] Connect failed:`, err.message);
    emitRobot(robotId, 'status', { connected: false, error: err.message, username });
    res.status(502).json({ ok: false, message: err.message });
  }
});

app.post('/robot/:robotId/disconnect', (req, res) => {
  const robotId = req.params.robotId;
  const s = robotSessions.get(robotId);
  if (s) {
    if (s.flushInterval) clearInterval(s.flushInterval);
    try { s.conn.disconnect(); } catch {}
    robotSessions.delete(robotId);
    emitRobot(robotId, 'status', { connected: false, username: s.username, reason: 'stopped' });
  }
  res.json({ ok: true });
});

app.get('/robot/:robotId/status', (req, res) => {
  const s = robotSessions.get(req.params.robotId);
  if (!s) return res.json({ connected: false });
  res.json({ connected: s.connected, username: s.username, stats: s.stats, events: s.events });
});

// ============================================================
// END multi-tenant block
// ============================================================

io.on('connection', socket => {
  console.log('Frontend connected');
  socket.emit('status', { connected, username: TIKTOK_USERNAME });
  // On re-subscribe, replay current status for any active robot the client mentions
  socket.on('subscribe-robot', (robotId) => {
    const s = robotSessions.get(robotId);
    if (s) {
      socket.emit(`robot:${robotId}:status`, {
        connected: s.connected,
        username: s.username,
      });
      if (s.stats.viewers || s.stats.totalLikes) {
        socket.emit(`robot:${robotId}:stats`, s.stats);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  TikTok Live Game Server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Watching: @${TIKTOK_USERNAME}`);
  console.log(`========================================`);
  console.log(`Test endpoints:`);
  console.log(`  GET /test/like           — fake like`);
  console.log(`  GET /test/gift/rose      — fake rose gift`);
  console.log(`  GET /test/gift/mic       — fake mic gift`);
  console.log(`  GET /test/gift/galaxy    — fake galaxy gift`);
  console.log(`  GET /test/spam           — spam 50 likes`);
  console.log(`  GET /status              — server status`);
  console.log(`  GET /health              — render healthcheck`);
  console.log(`========================================`);
  startTikTokConnection();
});

// === Graceful shutdown ===
// Render sends SIGTERM 30s before recycling the container. Without this,
// active TikTok WS connections are killed mid-frame and the next start
// hits EulerStream rate limits ("too many open conns from same IP").
function gracefulShutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing connections...`);
  // Disconnect every robot session
  for (const [robotId, s] of robotSessions.entries()) {
    if (s.flushInterval) clearInterval(s.flushInterval);
    try { s.conn.removeAllListeners(); } catch {}
    try { s.conn.disconnect(); } catch {}
    emitRobot(robotId, 'status', { connected: false, reason: 'server-shutdown', username: s.username });
  }
  robotSessions.clear();
  if (tiktokConn) {
    try { tiktokConn.removeAllListeners(); } catch {}
    try { tiktokConn.disconnect(); } catch {}
  }
  io.close(() => console.log('[shutdown] socket.io closed'));
  server.close(() => {
    console.log('[shutdown] http server closed, exiting');
    process.exit(0);
  });
  // Hard-exit after 10s if anything hangs
  setTimeout(() => {
    console.warn('[shutdown] timeout — force exit');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// === Stale-session sweeper ===
// Every 60s, drop sessions that are not connected AND have been idle for 10min.
// Prevents stuck/zombie sessions from leaking memory if a frontend forgot to disconnect.
setInterval(() => {
  const now = Date.now();
  for (const [robotId, s] of robotSessions.entries()) {
    if (!s.connected && (now - (s.lastEventAt || s.startedAt || now)) > 10 * 60 * 1000) {
      if (s.flushInterval) clearInterval(s.flushInterval);
      try { s.conn.removeAllListeners(); } catch {}
      try { s.conn.disconnect(); } catch {}
      robotSessions.delete(robotId);
      console.log(`[sweeper] dropped idle session robotId=${robotId}`);
    }
  }
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
  if (mem > 400) console.warn(`[mem] high RSS: ${mem}MB, sessions=${robotSessions.size}`);
}, 60000).unref();
