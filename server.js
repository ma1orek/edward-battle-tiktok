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
    // Log fields to find the right one
    if (eventCount.likes <= 5) {
      console.log('LIKE event fields:', Object.keys(data).join(','));
      console.log('LIKE data:', JSON.stringify({
        likeCount: data.likeCount,
        totalLikeCount: data.totalLikeCount,
        count: data.count,
        uniqueId: data.uniqueId,
        user: data.user?.uniqueId,
      }));
    }
    const count = data.likeCount || data.count || data.likes || 1;
    const total = data.totalLikeCount || data.totalLikes || liveStats.totalLikes;
    if (total) liveStats.totalLikes = total;
    io.emit('stats', liveStats);
    io.emit('like', {
      user: data.uniqueId || data.user?.uniqueId || 'unknown',
      nickname: data.nickname || data.user?.nickname || 'Anonim',
      pic: data.profilePictureUrl || data.user?.profilePictureUrl || '',
      count: count,
      total: total,
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
app.post('/connect/:username', async (req, res) => {
  const newUsername = req.params.username.replace(/^@/, '');
  if (!newUsername) return res.json({ ok: false, message: 'No username' });

  // Disconnect previous
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (e) {}
    tiktokConn = null;
    connected = false;
  }

  TIKTOK_USERNAME = newUsername;
  console.log(`Switching to @${newUsername}...`);

  if (!TikTokLiveConnection) {
    return res.json({ ok: false, message: 'TikTok library not loaded' });
  }

  try {
    tiktokConn = createConnection(newUsername);
    setupConnectionHandlers();
    const state = await tiktokConn.connect();
    connected = true;
    io.emit('status', { connected: true, room: state.roomId, username: newUsername });
    res.json({ ok: true, room: state.roomId, username: newUsername });
  } catch (err) {
    res.json({ ok: false, message: err.message || 'Connection failed' });
  }
});

io.on('connection', socket => {
  console.log('Frontend connected');
  socket.emit('status', { connected, username: TIKTOK_USERNAME });
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
  console.log(`========================================`);
  startTikTokConnection();
});
