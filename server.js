import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Server } from 'socket.io';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`).split(',').map(x => x.trim()).filter(Boolean);
const MAX_ONLINE = 80;
const CITY_ROOM = 'aincrad-city';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'sao-gem-v36', onlinePlayers: cityPlayers.size, configured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) }));
app.get('/online-config.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store').send(
    `window.SAO_GEM_ONLINE_CONFIG=${JSON.stringify({ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SERVER_URL: '' })};`
  );
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by SAO GEM server.'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 16 * 1024
});

const supabaseAuth = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  : null;

// Auth is checked with Supabase on every new Socket.IO connection. The browser never receives a service-role key.
io.use(async (socket, next) => {
  try {
    if (!supabaseAuth) return next(new Error('Server chưa cấu hình Supabase.'));
    const token = String(socket.handshake.auth?.token || '');
    if (token.length < 40 || token.length > 5000) return next(new Error('Thiếu hoặc sai access token.'));
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'));
    const user = data.user;
    const rawName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Adventurer';
    const name = String(rawName).normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Adventurer';
    socket.data.identity = { id: user.id, name };
    next();
  } catch (error) {
    next(new Error('Không thể xác minh tài khoản online.'));
  }
});

const cityPlayers = new Map(); // userId -> public city state, held in RAM only
const socketsByUser = new Map();
function publicPlayer(player) {
  return { id: player.id, name: player.name, x: player.x, pose: player.pose, dir: player.dir, updatedAt: player.updatedAt };
}
function validNumber(value) { return typeof value === 'number' && Number.isFinite(value); }

io.on('connection', socket => {
  const identity = socket.data.identity;
  const previous = socketsByUser.get(identity.id);
  if (previous && previous !== socket) {
    previous.emit('session:replaced');
    previous.disconnect(true);
  }
  socketsByUser.set(identity.id, socket);
  socket.data.joinedCity = false;
  socket.data.lastMoveAt = 0;
  socket.data.chatTimes = [];

  socket.on('city:join', (payload = {}, ack = () => {}) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!socket.data.joinedCity && cityPlayers.size >= MAX_ONLINE && !cityPlayers.has(identity.id)) {
      ack({ error: `Thành phố đã đủ ${MAX_ONLINE} người chơi.` });
      return;
    }
    const previousState = cityPlayers.get(identity.id);
    const startX = validNumber(payload.x) ? Math.max(45, Math.min(2155, payload.x)) : (previousState?.x ?? 360);
    const state = { id: identity.id, name: identity.name, x: startX, pose: 'idle', dir: 1, updatedAt: Date.now() };
    socket.join(CITY_ROOM);
    socket.data.joinedCity = true;
    cityPlayers.set(identity.id, state);
    ack({ ok: true, players: [...cityPlayers.values()].filter(p => p.id !== identity.id).map(publicPlayer) });
    socket.emit('city:players', [...cityPlayers.values()].filter(p => p.id !== identity.id).map(publicPlayer));
    socket.to(CITY_ROOM).emit('city:player-joined', publicPlayer(state));
  });

  socket.on('city:move', (payload = {}) => {
    if (!socket.data.joinedCity) return;
    const now = Date.now();
    if (now - socket.data.lastMoveAt < 45) return; // max ~22 updates/s per client
    socket.data.lastMoveAt = now;
    const old = cityPlayers.get(identity.id);
    if (!old || !validNumber(payload.x)) return;
    const allowedPoses = new Set(['idle', 'walk', 'wave', 'sit', 'cheer', 'bow']);
    const state = {
      ...old,
      x: Math.max(45, Math.min(2155, payload.x)),
      pose: allowedPoses.has(payload.pose) ? payload.pose : 'idle',
      dir: Number(payload.dir) < 0 ? -1 : 1,
      updatedAt: now
    };
    cityPlayers.set(identity.id, state);
    socket.to(CITY_ROOM).volatile.emit('city:state', publicPlayer(state));
  });

  socket.on('city:chat', (payload = {}, ack = () => {}) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!socket.data.joinedCity) return ack({ error: 'Bạn chưa vào thành phố Aincrad.' });
    const now = Date.now();
    socket.data.chatTimes = socket.data.chatTimes.filter(t => now - t < 10000);
    if (socket.data.chatTimes.length >= 5) return ack({ error: 'Bạn gửi chat quá nhanh. Hãy chờ một chút.' });
    const text = String(payload.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 240);
    if (!text) return ack({ error: 'Tin nhắn đang trống.' });
    socket.data.chatTimes.push(now);
    io.to(CITY_ROOM).emit('city:chat', { id: identity.id, name: identity.name, text, at: now });
    ack({ ok: true });
  });

  socket.on('city:leave', () => {
    if (!socket.data.joinedCity) return;
    socket.leave(CITY_ROOM);
    socket.data.joinedCity = false;
    cityPlayers.delete(identity.id);
    socket.to(CITY_ROOM).emit('city:player-left', { id: identity.id });
  });

  socket.on('disconnect', () => {
    // Ignore a late disconnect from an older socket after this account reconnected.
    const isCurrentSocket = socketsByUser.get(identity.id) === socket;
    if (!isCurrentSocket) return;
    socketsByUser.delete(identity.id);
    if (socket.data.joinedCity) {
      cityPlayers.delete(identity.id);
      socket.to(CITY_ROOM).emit('city:player-left', { id: identity.id });
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SAO GEM V36 server listening on http://localhost:${PORT}`);
  if (!supabaseAuth) console.warn('Supabase is not configured. Fill SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.');
});
