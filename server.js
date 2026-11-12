import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Server } from 'socket.io';
import helmet from 'helmet';
import { randomInt } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`).split(',').map(x => x.trim()).filter(Boolean);
const MAX_ONLINE = 80;
const CITY_ROOM = 'aincrad-city';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '128kb', strict: true }));
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'chrono-tower-v39', version: '39.0-rc', onlinePlayers: cityPlayers.size, parties: v37Parties.size, activeRaids: [...v37Parties.values()].filter(p => p.state === 'IN_BOSS').length, authConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY), cloudSaveConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) }));
app.get('/online-config.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store').send(
    `window.SAO_GEM_ONLINE_CONFIG=${JSON.stringify({ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SERVER_URL: '' })};`
  );
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h', setHeaders(res, filePath) { if (path.basename(filePath).toLowerCase() === 'index.html') res.setHeader('Cache-Control', 'no-store'); } }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CHRONO TOWER server.'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 16 * 1024
});

const supabaseAuth = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  : null;

// Service-role credentials stay on the server; they are never sent to the browser.
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  : null;

const v39ProfileWriteAt = new Map();
const V39_PROFILE_MAX_BYTES = 90000;
const V39_INVENTORY_KEYS = new Set([
  'rawOre','ingot','quartz','pauldronShard','maceCore','potions','whetstones','protectScrolls',
  'bossEssence','golgothCore','astraeaCore','awakeningCrystal','steelFragment','goldenFeather',
  'saoV362Weapon1','saoV362Weapon2'
]);
function v39SafeJson(value, depth = 0) {
  if (depth > 8) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return typeof value === 'string' ? value.slice(0, 3000) : value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(-1e9, Math.min(1e9, value)) : 0;
  if (Array.isArray(value)) return value.slice(0, 200).map(v => v39SafeJson(v, depth + 1));
  if (typeof value === 'object') {
    const out = Object.create(null);
    for (const [k,v] of Object.entries(value).slice(0, 250)) {
      if (['__proto__','constructor','prototype'].includes(k)) continue;
      out[String(k).slice(0,80)] = v39SafeJson(v, depth + 1);
    }
    return out;
  }
  return null;
}
function v39SanitizeProfile(raw, previous = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Hồ sơ nhân vật không hợp lệ.');
  const encoded = JSON.stringify(raw);
  if (Buffer.byteLength(encoded, 'utf8') > V39_PROFILE_MAX_BYTES) throw new Error('Hồ sơ vượt giới hạn 90 KB.');
  const p = v39SafeJson(raw) || {};
  const classKeys = new Set(['guardian','berserker','assassin','ranger','mage','cleric']);
  const level = Math.max(1, Math.min(100, Math.floor(Number(p.lv) || 1)));
  const requestedMax = Math.max(1, Math.min(100, Math.floor(Number(p.maxUnlockedFloor) || 1)));
  const clears = Object.create(null);
  if (p.clearedFloors && typeof p.clearedFloors === 'object') {
    for (const [key,val] of Object.entries(p.clearedFloors)) {
      const floor = Number(key);
      if (Number.isInteger(floor) && floor >= 1 && floor <= 100 && val === true) clears[String(floor)] = true;
    }
  }
  let contiguous = 0;
  while (clears[String(contiguous + 1)] === true) contiguous++;
  const prevMax = Math.max(1, Math.min(100, Math.floor(Number(previous?.maxUnlockedFloor) || 1)));
  const maxAllowedByProgress = Math.min(100, contiguous + 1);
  // A previous accepted record can never be rolled back; new unlocks must be backed by contiguous clears.
  const maxUnlockedFloor = Math.max(prevMax, Math.min(requestedMax, maxAllowedByProgress));
  const currentFloor = Math.max(1, Math.min(maxUnlockedFloor, Math.floor(Number(p.currentFloor) || 1)));
  const colCap = Math.min(100000000, 5000 + maxUnlockedFloor * 25000 + level * 2000);
  const col = Math.max(0, Math.min(colCap, Math.floor(Number(p.col) || 0)));
  const inv = Object.create(null);
  if (p.inv && typeof p.inv === 'object') {
    const itemCap = Math.min(1000000, 1000 + maxUnlockedFloor * 1000);
    for (const [key,val] of Object.entries(p.inv)) {
      if (!V39_INVENTORY_KEYS.has(key)) continue;
      if (key.startsWith('saoV362Weapon')) inv[key] = v39SafeJson(val);
      else inv[key] = Math.max(0, Math.min(itemCap, Math.floor(Number(val) || 0)));
    }
  }
  const out = {
    username: String(p.username || p.name || 'Adventurer').normalize('NFKC').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,24) || 'Adventurer',
    classKey: classKeys.has(p.classKey) ? p.classKey : 'assassin',
    subRole: String(p.subRole || 'vanguard').slice(0,24),
    lv: level,
    exp: Math.max(0, Math.min(1e9, Math.floor(Number(p.exp) || 0))),
    col,
    currentFloor,
    maxUnlockedFloor,
    clearedFloors: clears,
    inv,
    upg1: Math.max(0, Math.min(10, Math.floor(Number(p.upg1) || 0))),
    upg2: Math.max(0, Math.min(10, Math.floor(Number(p.upg2) || 0))),
    isEpic1: p.isEpic1 === true,
    isEpic2: p.isEpic2 === true,
    elem1: ['fire','ice','thunder','earth','wind','water'].includes(p.elem1) ? p.elem1 : 'fire',
    elem2: ['fire','ice','thunder','earth','wind','water'].includes(p.elem2) ? p.elem2 : 'ice',
    name2: String(p.name2 || '').slice(0,60),
    pityCount: Math.max(0, Math.min(5, Math.floor(Number(p.pityCount) || 0))),
    guild: p.guild && typeof p.guild === 'object' ? v39SafeJson(p.guild) : null,
    saoV373: p.saoV373 && typeof p.saoV373 === 'object' ? v39SafeJson(p.saoV373) : null
  };
  // Local tower data is a cloud backup, not a competitive score source. Ranked results come only from server Raid receipts.
  return out;
}
async function v39Auth(req, res, next) {
  try {
    if (!supabaseAuth) return res.status(503).json({ error: 'Supabase Auth chưa được cấu hình.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token.length < 40 || token.length > 5000) return res.status(401).json({ error: 'Thiếu access token hợp lệ.' });
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
    req.v39User = data.user;
    next();
  } catch (_) { res.status(401).json({ error: 'Không thể xác minh tài khoản.' }); }
}
async function v39ReadProfile(userId) {
  if (!supabaseAdmin) throw new Error('Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY.');
  const { data, error } = await supabaseAdmin.from('aetheria_profiles').select('profile_json,revision,updated_at,display_name').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return { profile: data.profile_json, revision: Number(data.revision) || 0, updatedAt: data.updated_at, displayName: data.display_name, legacy: false };
  // One-way compatibility read for existing V36/V37 cloud saves.
  const legacy = await supabaseAdmin.from('sao_characters').select('profile_json,updated_at,display_name').eq('user_id', userId).maybeSingle();
  if (!legacy.error && legacy.data?.profile_json) return { profile: legacy.data.profile_json, revision: 0, updatedAt: legacy.data.updated_at, displayName: legacy.data.display_name, legacy: true };
  return { profile: null, revision: 0, updatedAt: null, displayName: null, legacy: false };
}
app.get('/api/v39/profile', v39Auth, async (req, res) => {
  try {
    const saved = await v39ReadProfile(req.v39User.id);
    res.set('Cache-Control','no-store').json({ ok: true, ...saved });
  } catch (error) { res.status(503).json({ error: error.message || 'Không thể đọc bản lưu.' }); }
});
app.put('/api/v39/profile', v39Auth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Máy chủ chưa cấu hình lưu Cloud V39.' });
    const now = Date.now(), last = v39ProfileWriteAt.get(req.v39User.id) || 0;
    if (now - last < 12000) return res.status(429).json({ error: 'Bạn lưu quá nhanh. Vui lòng chờ 12 giây.' });
    const expectedRevision = Math.max(0, Math.floor(Number(req.body?.expectedRevision) || 0));
    const current = await v39ReadProfile(req.v39User.id);
    if (expectedRevision !== current.revision) return res.status(409).json({ error: 'Bản lưu đã thay đổi ở phiên khác. Hãy tải lại bản Cloud trước khi lưu.', revision: current.revision });
    const profile = v39SanitizeProfile(req.body?.profile, current.profile);
    const displayName = String(req.v39User.user_metadata?.display_name || req.v39User.email?.split('@')[0] || 'Adventurer').normalize('NFKC').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,24) || 'Adventurer';
    const { data, error } = await supabaseAdmin.rpc('aetheria_save_profile_v39', {
      p_user_id: req.v39User.id,
      p_display_name: displayName,
      p_profile_json: profile,
      p_expected_revision: expectedRevision
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.saved) return res.status(409).json({ error: 'Xung đột phiên bản bản lưu. Hãy tải lại Cloud.', revision: Number(result?.revision) || current.revision });
    v39ProfileWriteAt.set(req.v39User.id, now);
    res.set('Cache-Control','no-store').json({ ok: true, revision: Number(result.revision), updatedAt: new Date().toISOString(), profile, integrity: 'bounded-cloud-backup-not-ranked' });
  } catch (error) { res.status(400).json({ error: error.message || 'Không thể lưu hồ sơ.' }); }
});

// Keep the HTML fallback after all HTTP API routes so it cannot swallow /api requests.
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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
    socket.data.accessToken = token;
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
    if (!socket.data.joinedCity) return ack({ error: 'Bạn chưa vào Thành phố Chrono.' });
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



// ============================================================================
// CHRONO TOWER V39 — PARTY ONLINE + SERVER-AUTHORITATIVE CO-OP BOSS
// This add-on deliberately uses the already-authenticated Supabase identity.
// Client payloads never define player identity, damage, HP, or rewards.
// ============================================================================
const V37_ROLES = new Set(['tank', 'dps', 'healer', 'support']);
const V37_GRACE_MS = 120000;
const V37_MAX_PARTIES = 20;
const v37Parties = new Map();             // roomCode -> party state (RAM only)
const v37RoomByUser = new Map();          // verified Supabase user id -> roomCode

const V37_ROLE_STATS = {
  tank:    { maxHp: 1850, damage: 0.88, mitigation: 0.72 },
  dps:     { maxHp: 1120, damage: 1.22, mitigation: 1.00 },
  healer:  { maxHp: 1080, damage: 0.82, mitigation: 0.92 },
  support: { maxHp: 1220, damage: 0.96, mitigation: 0.88 }
};
const V37_ATTACKS = {
  basic:   { base: 190, break: 24, cooldown: 620, skill: false },
  combo:   { base: 470, break: 52, cooldown: 2300, skill: true },
  breaker: { base: 155, break: 280, cooldown: 3900, skill: true },
  awakened:{ base: 0, break: 0, cooldown: 12000, skill: true }
};
const V37_AWAKENED = {
  frost:    { base: 690, break: 330, skillId: 'absolute_zero', label: 'ABSOLUTE ZERO' },
  infernal: { base: 920, break: 180, skillId: 'dragon_eruption', label: 'DRAGON ERUPTION' },
  thunder:  { base: 810, break: 270, skillId: 'heavenly_judgment', label: 'HEAVENLY JUDGMENT' }
};
const V37_BOSS_SKILLS = {
  golgoth: [
    { id: 'dia_chan', name: 'ĐỊA CHẤN NHAM THẠCH', shape: 'circle', radius: 210, castMs: 1900, damage: 270, cooldown: 6200, minPhase: 1, target: 'all' },
    { id: 'hoa_nguc', name: 'HỎA NGỤC TRUY KÍCH', shape: 'line', radius: 260, castMs: 1650, damage: 330, cooldown: 7600, minPhase: 2, target: 'tank', requiresPart: 'mace_head' },
    { id: 'tram_ma', name: 'TRẢM MA ĐẠI ĐAO', shape: 'cone', radius: 300, castMs: 2100, damage: 430, cooldown: 9000, minPhase: 2, target: 'all' },
    { id: 'huy_diet', name: 'HỦY DIỆT DUNG NHAM', shape: 'ultimate', radius: 520, castMs: 4200, damage: 760, cooldown: 24000, minPhase: 3, target: 'all', ultimate: true }
  ],
  astraea: [
    { id: 'thien_loi', name: 'THIÊN LÔI ĐÁNH DẤU', shape: 'target', radius: 130, castMs: 1550, damage: 300, cooldown: 5600, minPhase: 1, target: 'tank' },
    { id: 'loi_cau', name: 'LÔI CẦU TRUY ĐUỔI', shape: 'orb', radius: 95, castMs: 1750, damage: 310, cooldown: 6900, minPhase: 1, target: 'all' },
    { id: 'loi_nguc', name: 'LÔI NGỤC 360°', shape: 'ring', radius: 330, castMs: 1900, damage: 410, cooldown: 9800, minPhase: 2, target: 'all' },
    { id: 'thien_phat', name: 'THIÊN PHẠT LÔI THƯƠNG', shape: 'ultimate', radius: 540, castMs: 4300, damage: 800, cooldown: 25000, minPhase: 3, target: 'all', ultimate: true }
  ]
};

function v37SafeText(value, max = 24) {
  return String(value ?? '').normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
}
function v37Ack(ack, value) { if (typeof ack === 'function') ack(value); }
function v37Fail(socket, message, ack) {
  socket.emit('v37:error', { message });
  v37Ack(ack, { error: message });
}
function v37NewCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do { code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); }
  while (v37Parties.has(code));
  return code;
}
function v37ScopedSupabase(token) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !token) return null;
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}
async function v37LoadBuild(socket) {
  const fallback = { level: 1, weaponLevel: 0, awakened: false, branch: null, engravings: [] };
  try {
    let profile = null;
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('aetheria_profiles').select('profile_json').eq('user_id', socket.data.identity.id).maybeSingle();
      if (!error && data?.profile_json) profile = data.profile_json;
    }
    if (!profile) {
      const db = v37ScopedSupabase(socket.data.accessToken);
      if (!db) return fallback;
      const { data, error } = await db.from('sao_characters').select('profile_json').eq('user_id', socket.data.identity.id).maybeSingle();
      if (error || !data?.profile_json) return fallback;
      profile = data.profile_json;
    }
    const inv = profile.inv || {};
    const meta = inv.saoV362Weapon1 && typeof inv.saoV362Weapon1 === 'object' ? inv.saoV362Weapon1 : {};
    const branch = ['frost', 'infernal', 'thunder'].includes(meta.branch) ? meta.branch : null;
    return {
      level: Math.max(1, Math.min(100, Math.floor(Number(profile.lv) || 1))),
      weaponLevel: Math.max(0, Math.min(10, Math.floor(Number(profile.upg1) || 0))),
      awakened: meta.awakened === true && !!branch,
      branch,
      engravings: Array.isArray(meta.engravings) ? meta.engravings.filter(x => ['force', 'skill', 'breaker', 'endurance'].includes(x)).slice(0, 3) : []
    };
  } catch (error) {
    console.warn('[CHRONO V39] Could not load cloud build:', error?.message || error);
    return fallback;
  }
}
function v37CreateMember(socket, role, build) {
  const stats = V37_ROLE_STATS[role] || V37_ROLE_STATS.dps;
  return {
    userId: socket.data.identity.id,
    username: socket.data.identity.name,
    socketId: socket.id,
    role,
    ready: false,
    online: true,
    isHuman: true,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    level: build.level,
    weaponLevel: build.weaponLevel,
    weaponAwakened: build.awakened,
    weaponBranch: build.branch,
    engravings: build.engravings,
    cooldowns: Object.create(null),
    lastDodgeAt: 0,
    disconnectTimer: null,
    disconnectUntil: 0,
    pendingLoot: null
  };
}
function v37FindMember(party, userId) {
  return party?.members.find(member => member.userId === userId) || null;
}
function v37SanitizeParty(party, viewerId = null) {
  return {
    roomCode: party.roomCode,
    leaderName: party.members.find(m => m.userId === party.leaderId)?.username || 'Đội trưởng',
    state: party.state,
    members: party.members.map(m => ({
      name: m.username, role: m.role, ready: !!m.ready, online: !!m.online,
      isHuman: true, self: m.userId === viewerId, hp: m.hp, maxHp: m.maxHp, level: m.level,
      weaponLevel: m.weaponLevel, weaponAwakened: m.weaponAwakened,
      pendingLoot: !!m.pendingLoot
    }))
  };
}
function v37SendParty(io, party) {
  for (const member of party.members) {
    if (member.online && member.socketId) io.to(member.socketId).emit('v37:party_updated', v37SanitizeParty(party, member.userId));
  }
}
function v37PublicTelegraph(t) {
  if (!t) return null;
  return { id: t.id, skillId: t.skillId, name: t.name, shape: t.shape, radius: t.radius, targetName: t.targetName, castEndsAt: t.castEndsAt, castMs: t.castMs, damage: t.damage, ultimate: t.ultimate, requiresPart: t.requiresPart };
}
function v37SanitizeCombat(party) {
  if (!party.combat) return null;
  const b = party.combat.boss;
  return {
    raidId: party.combat.raidId,
    boss: {
      key: b.key, name: b.name, hp: b.hp, maxHp: b.maxHp,
      breakGauge: b.breakGauge, maxBreakGauge: b.maxBreakGauge,
      isBroken: b.isBroken, phase: b.phase, enraged: b.enraged,
      brokenParts: { ...b.brokenParts }, activeTelegraph: v37PublicTelegraph(b.activeTelegraph)
    },
    members: party.members.map(m => ({ name: m.username, role: m.role, hp: m.hp, maxHp: m.maxHp, online: m.online })),
    state: party.state
  };
}
function v37EmitCombat(io, party) {
  io.to(`v37_${party.roomCode}`).emit('v37:combat_tick', v37SanitizeCombat(party));
}
function v37CreateBoss(bossKey, party) {
  const avgLevel = party.members.reduce((sum, m) => sum + m.level, 0) / Math.max(1, party.members.length);
  const baseHp = bossKey === 'astraea' ? 112000 : 98000;
  return {
    key: bossKey,
    name: bossKey === 'astraea' ? 'Astraea – Lôi Đế Sáu Cánh' : 'Golgoth – Ma Thần Dung Nham',
    hp: Math.round(baseHp * (1 + Math.max(0, avgLevel - 1) * 0.006)),
    maxHp: Math.round(baseHp * (1 + Math.max(0, avgLevel - 1) * 0.006)),
    breakGauge: 0, maxBreakGauge: 1000, isBroken: false, brokenUntil: 0,
    phase: 1, enraged: false, brokenParts: { shoulder_armor: false, mace_head: false },
    partHp: { shoulder_armor: 4200, mace_head: 5200 },
    activeTelegraph: null, nextSkillAt: Date.now() + 3000,
    stunnedUntil: 0, lastSkillId: null
  };
}
function v37UpdatePhase(boss) {
  const ratio = boss.hp / boss.maxHp;
  boss.phase = ratio <= 0.30 ? 3 : ratio <= 0.70 ? 2 : 1;
  if (ratio <= 0.30) boss.enraged = true;
}
function v37GrantPendingLoot(io, party, member) {
  if (member?.pendingLoot && member.online && member.socketId) {
    io.to(member.socketId).emit('v37:personal_loot', member.pendingLoot);
  }
}

async function v39PersistRaidReceipts(party) {
  if (!supabaseAdmin) throw new Error('Supabase chưa sẵn sàng để lưu biên nhận Raid.');
  if (!party?.combat?.raidId) throw new Error('Thiếu mã Raid để lưu biên nhận.');
  const raidId = String(party.combat.raidId).slice(0,96);
  const boss = party.combat.boss;
  const rows = party.members.filter(m => m.pendingLoot).map(m => ({
    raid_id: raidId, user_id: m.userId, boss_key: boss.key, boss_name: boss.name,
    success: true, damage: Math.max(0, Math.floor(Number(party.combat.contributions?.[m.userId]) || 0)),
    loot_json: m.pendingLoot.drops, created_at: new Date().toISOString()
  }));
  if (!rows.length) throw new Error('Không có biên nhận phần thưởng nào để lưu.');
  const { error } = await supabaseAdmin.from('aetheria_raid_receipts').upsert(rows, { onConflict:'raid_id,user_id', ignoreDuplicates:true });
  if (error) throw error;
}
async function v37FinishRaid(io, party, success) {
  if (!party.combat || party.state !== 'IN_BOSS') return;
  // Freeze the encounter while the server commits receipts. No new actions are accepted in SETTLING.
  party.state = success ? 'SETTLING' : 'FAILED';
  party.combat.boss.activeTelegraph = null;
  if (success) {
    const bossKey = party.combat.boss.key;
    for (const member of party.members) {
      if (member.pendingLoot) continue;
      const drops = [
        { id: 'ingot', qty: 3 },
        { id: 'bossEssence', qty: 2 },
        { id: bossKey === 'golgoth' ? 'golgothCore' : 'astraeaCore', qty: 1 },
        { id: bossKey === 'golgoth' ? 'pauldronShard' : 'maceCore', qty: 1 }
      ];
      if (randomInt(100) < 35) drops.push({ id: 'awakeningCrystal', qty: 1 });
      member.pendingLoot = { raidId: party.combat.raidId, bossName: party.combat.boss.name, drops };
    }
    try {
      // Persist every participant receipt before any client receives the loot event.
      await v39PersistRaidReceipts(party);
    } catch (error) {
      for (const member of party.members) member.pendingLoot = null;
      party.state = 'FAILED';
      console.error('[CHRONO V39] Raid receipt commit failed; rewards withheld:', error?.message || error);
      io.to(`v37_${party.roomCode}`).emit('v37:raid_finished', { success:false, state:party.state, reason:'Không thể xác nhận phần thưởng với máy chủ dữ liệu. Trận Raid được đánh dấu thất bại và chưa phát thưởng.' });
      v37SendParty(io, party);
      v37EmitCombat(io, party);
      return;
    }
    party.state = 'COMPLETED';
    for (const member of party.members) v37GrantPendingLoot(io, party, member);
  }
  io.to(`v37_${party.roomCode}`).emit('v37:raid_finished', { success, state: party.state, boss: party.combat.boss.name });
  v37SendParty(io, party);
  v37EmitCombat(io, party);
}
function v37BroadcastBreak(io, party, byName) {
  const boss = party.combat?.boss;
  if (!boss || boss.isBroken) return;
  boss.isBroken = true;
  boss.breakGauge = 0;
  boss.brokenUntil = Date.now() + 5200;
  boss.stunnedUntil = boss.brokenUntil;
  if (boss.activeTelegraph?.ultimate) {
    const interrupted = boss.activeTelegraph.name;
    boss.activeTelegraph = null;
    io.to(`v37_${party.roomCode}`).emit('v37:boss_interrupted', { by: byName, skill: interrupted });
  }
  io.to(`v37_${party.roomCode}`).emit('v37:boss_broken', { by: byName, duration: 5200 });
}
function v37ResolveAttack(io, socket, party, member, payload, ack) {
  const boss = party.combat.boss;
  const skillId = String(payload?.skillId || '');
  const now = Date.now();
  if (!['basic', 'combo', 'breaker', 'awakened', 'heal'].includes(skillId)) return v37Fail(socket, 'Kỹ năng không hợp lệ.', ack);
  if (member.hp <= 0) return v37Fail(socket, 'Bạn đang gục và cần được hồi phục.', ack);
  const cooldownKey = skillId;
  if ((member.cooldowns[cooldownKey] || 0) > now) {
    const remaining = Math.ceil((member.cooldowns[cooldownKey] - now) / 1000);
    return v37Fail(socket, `Kỹ năng đang hồi chiêu (${remaining}s).`, ack);
  }
  if (skillId === 'heal') {
    if (!['healer', 'support'].includes(member.role)) return v37Fail(socket, 'Chỉ Healer hoặc Support mới dùng được kỹ năng hồi phục.', ack);
    const target = party.members.filter(m => m.hp > 0 && m.hp < m.maxHp).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!target) return v37Fail(socket, 'Không có đồng đội cần hồi phục.', ack);
    const healed = Math.min(420, target.maxHp - target.hp);
    target.hp += healed;
    member.cooldowns.heal = now + 8500;
    io.to(`v37_${party.roomCode}`).emit('v37:player_healed', { healer: member.username, target: target.username, amount: healed });
    v37EmitCombat(io, party);
    v37Ack(ack, { ok: true });
    return;
  }
  let spec = V37_ATTACKS[skillId];
  if (!spec) return v37Fail(socket, 'Không tìm thấy kỹ năng.', ack);
  if (skillId === 'awakened') {
    const awakened = V37_AWAKENED[member.weaponBranch];
    if (!member.weaponAwakened || !awakened) return v37Fail(socket, 'Nhân vật chưa có Thần Binh thức tỉnh trong bản lưu Cloud.', ack);
    spec = { base: awakened.base, break: awakened.break, cooldown: 12000, skill: true };
  }
  member.cooldowns[cooldownKey] = now + spec.cooldown;
  const roleStats = V37_ROLE_STATS[member.role] || V37_ROLE_STATS.dps;
  const levelScale = 1 + Math.max(0, member.level - 1) * 0.012;
  const upgradeScale = 1 + member.weaponLevel * 0.045;
  const awakeningScale = member.weaponAwakened ? 1.12 : 1;
  const engravingScale = member.engravings.includes('force') ? 1.08 : 1;
  const skillScale = spec.skill && member.engravings.includes('skill') ? 1.15 : 1;
  const damage = Math.max(1, Math.round(spec.base * roleStats.damage * levelScale * upgradeScale * awakeningScale * engravingScale * skillScale));
  const breakScale = member.engravings.includes('breaker') ? 1.30 : 1;
  const breakDamage = Math.max(0, Math.round(spec.break * breakScale));
  boss.hp = Math.max(0, boss.hp - damage);
  party.combat.contributions[member.userId] = (party.combat.contributions[member.userId] || 0) + damage;

  let partBroken = null;
  const targetPart = ['shoulder_armor', 'mace_head'].includes(payload?.targetPart) ? payload.targetPart : null;
  if (targetPart && !boss.brokenParts[targetPart]) {
    boss.partHp[targetPart] = Math.max(0, boss.partHp[targetPart] - Math.round(damage * 0.85));
    if (boss.partHp[targetPart] <= 0) {
      boss.brokenParts[targetPart] = true;
      partBroken = targetPart;
      boss.breakGauge = Math.min(boss.maxBreakGauge, boss.breakGauge + 180);
      io.to(`v37_${party.roomCode}`).emit('v37:part_broken', { part: targetPart, by: member.username });
    }
  }
  if (!boss.isBroken) {
    boss.breakGauge = Math.min(boss.maxBreakGauge, boss.breakGauge + breakDamage);
    if (boss.breakGauge >= boss.maxBreakGauge) v37BroadcastBreak(io, party, member.username);
  }
  v37UpdatePhase(boss);
  io.to(`v37_${party.roomCode}`).emit('v37:attack_result', {
    by: member.username, skillId, damage, breakDamage, bossHp: boss.hp,
    breakGauge: boss.breakGauge, partBroken
  });
  if (boss.hp <= 0) v37FinishRaid(io, party, true);
  else v37EmitCombat(io, party);
  v37Ack(ack, { ok: true });
}
function v37StartTelegraph(io, party, now) {
  const boss = party.combat.boss;
  const skillList = V37_BOSS_SKILLS[boss.key] || V37_BOSS_SKILLS.golgoth;
  let available = skillList.filter(s => s.minPhase <= boss.phase);
  if (boss.brokenParts.mace_head) available = available.filter(s => !['hoa_nguc', 'tram_ma'].includes(s.id));
  if (available.length === 0) available = [skillList[0]];
  const pick = available[randomInt(available.length)];
  let target = null;
  if (pick.target === 'tank') target = party.members.find(m => m.role === 'tank' && m.hp > 0 && m.online) || null;
  const rage = boss.enraged ? 0.82 : 1;
  const castMs = Math.round(pick.castMs * rage);
  boss.activeTelegraph = {
    id: `${party.combat.raidId}:${now}`,
    skillId: pick.id,
    name: pick.name,
    shape: pick.shape,
    radius: pick.radius,
    targetName: target?.username || null,
    targetUserId: target?.userId || null,
    castEndsAt: now + castMs,
    castMs,
    damage: Math.round(pick.damage * (boss.enraged ? 1.18 : 1)),
    ultimate: !!pick.ultimate,
    requiresPart: pick.requiresPart || null
  };
  boss.nextSkillAt = now + Math.round(pick.cooldown * (boss.enraged ? 0.82 : 1));
  io.to(`v37_${party.roomCode}`).emit('v37:boss_telegraph', v37PublicTelegraph(boss.activeTelegraph));
}
function v37ResolveTelegraph(io, party, now) {
  const boss = party.combat.boss;
  const tg = boss.activeTelegraph;
  if (!tg || now < tg.castEndsAt) return;
  boss.activeTelegraph = null;
  if (boss.isBroken) {
    io.to(`v37_${party.roomCode}`).emit('v37:boss_interrupted', { by: 'Break', skill: tg.name });
    return;
  }
  const targets = tg.targetUserId
    ? party.members.filter(m => m.userId === tg.targetUserId && m.hp > 0 && m.online)
    : party.members.filter(m => m.hp > 0 && m.online);
  for (const target of targets) {
    const dodgeWindow = target.lastDodgeAt >= tg.castEndsAt - 1100 && target.lastDodgeAt <= tg.castEndsAt;
    target.lastDodgeAt = 0;
    if (dodgeWindow) {
      io.to(`v37_${party.roomCode}`).emit('v37:player_evaded', { name: target.username, skill: tg.name });
      continue;
    }
    let damage = tg.damage;
    const role = V37_ROLE_STATS[target.role] || V37_ROLE_STATS.dps;
    damage = Math.round(damage * role.mitigation);
    if (tg.requiresPart && boss.brokenParts[tg.requiresPart]) damage = Math.round(damage * 0.55);
    if (boss.key === 'astraea' && boss.brokenParts.shoulder_armor) damage = Math.round(damage * 0.78);
    target.hp = Math.max(0, target.hp - damage);
    io.to(`v37_${party.roomCode}`).emit('v37:player_hit', { name: target.username, damage, hp: target.hp, skill: tg.name });
  }
  v37EmitCombat(io, party);
  if (party.members.every(m => m.hp <= 0)) v37FinishRaid(io, party, false);
}

io.on('connection', socket => {
  const identity = socket.data.identity;
  if (!identity?.id) return;

  // Restore a previously disconnected member only by the identity verified in io.use.
  const oldCode = v37RoomByUser.get(identity.id);
  const oldParty = oldCode ? v37Parties.get(oldCode) : null;
  const oldMember = oldParty ? v37FindMember(oldParty, identity.id) : null;
  if (oldMember && oldMember.socketId !== socket.id && (oldMember.online || oldMember.disconnectUntil > Date.now() || oldMember.pendingLoot)) {
    clearTimeout(oldMember.disconnectTimer);
    oldMember.socketId = socket.id;
    oldMember.online = true;
    oldMember.disconnectUntil = 0;
    if (oldParty.state === 'LOBBY') oldMember.ready = false;
    socket.join(`v37_${oldCode}`);
    socket.emit('v37:reconnected', { party: v37SanitizeParty(oldParty, identity.id), combat: v37SanitizeCombat(oldParty) });
    v37SendParty(io, oldParty);
    v37GrantPendingLoot(io, oldParty, oldMember);
  }

  socket.on('v37:create_party', async (payload = {}, ack) => {
    const role = V37_ROLES.has(payload.role) ? payload.role : 'dps';
    const userId = identity.id;
    if (v37RoomByUser.has(userId)) return v37Fail(socket, 'Bạn đã ở trong một tổ đội. Hãy rời đội hiện tại trước.', ack);
    if (v37Parties.size >= V37_MAX_PARTIES) return v37Fail(socket, 'Máy chủ đang có quá nhiều phòng. Hãy thử lại sau.', ack);
    const build = await v37LoadBuild(socket);
    const code = v37NewCode();
    const member = v37CreateMember(socket, role, build);
    member.ready = true;
    const party = {
      roomCode: code, leaderId: userId, state: 'LOBBY', members: [member],
      combat: null, createdAt: Date.now(),
      // Room state is currently in memory; it resets if the Render service restarts.
    };
    v37Parties.set(code, party);
    v37RoomByUser.set(userId, code);
    socket.join(`v37_${code}`);
    socket.emit('v37:party_joined', v37SanitizeParty(party, identity.id));
    v37SendParty(io, party);
    v37Ack(ack, { ok: true, roomCode: code });
  });

  socket.on('v37:join_party', async (payload = {}, ack) => {
    const code = String(payload.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const party = v37Parties.get(code);
    if (!party) return v37Fail(socket, 'Mã phòng không tồn tại hoặc đã đóng.', ack);
    if (party.state !== 'LOBBY') return v37Fail(socket, 'Đội đã bắt đầu trận đấu.', ack);
    if (v37RoomByUser.has(identity.id)) return v37Fail(socket, 'Bạn đang ở trong một tổ đội khác.', ack);
    if (party.members.length >= 4) return v37Fail(socket, 'Phòng đã đủ 4/4 người chơi thật.', ack);
    const role = V37_ROLES.has(payload.role) ? payload.role : 'dps';
    const build = await v37LoadBuild(socket);
    const member = v37CreateMember(socket, role, build);
    party.members.push(member);
    v37RoomByUser.set(identity.id, code);
    socket.join(`v37_${code}`);
    socket.emit('v37:party_joined', v37SanitizeParty(party, identity.id));
    v37SendParty(io, party);
    v37Ack(ack, { ok: true, roomCode: code });
  });

  socket.on('v37:update_member', (payload = {}, ack) => {
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    const member = v37FindMember(party, identity.id);
    if (!party || !member || party.state !== 'LOBBY') return v37Fail(socket, 'Không thể đổi vai trò hoặc trạng thái khi trận đã bắt đầu.', ack);
    if (payload.role !== undefined) {
      if (!V37_ROLES.has(payload.role)) return v37Fail(socket, 'Vai trò không hợp lệ.', ack);
      const stats = V37_ROLE_STATS[payload.role];
      const ratio = member.maxHp > 0 ? member.hp / member.maxHp : 1;
      member.role = payload.role;
      member.maxHp = stats.maxHp;
      member.hp = Math.max(1, Math.round(stats.maxHp * ratio));
      member.ready = false;
    }
    if (typeof payload.ready === 'boolean') member.ready = payload.ready;
    v37SendParty(io, party);
    v37Ack(ack, { ok: true });
  });

  socket.on('v37:leave_party', (_payload = {}, ack) => {
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    if (!party) { v37RoomByUser.delete(identity.id); return v37Ack(ack, { ok: true }); }
    if (party.state === 'IN_BOSS') return v37Fail(socket, 'Không thể rời đội giữa trận Boss.', ack);
    const member = v37FindMember(party, identity.id);
    if (member?.pendingLoot) return v37Fail(socket, 'Hãy lưu và xác nhận phần thưởng Raid trước khi rời đội.', ack);
    if (member?.disconnectTimer) clearTimeout(member.disconnectTimer);
    party.members = party.members.filter(m => m.userId !== identity.id);
    v37RoomByUser.delete(identity.id);
    socket.leave(`v37_${code}`);
    if (party.members.length === 0) v37Parties.delete(code);
    else {
      if (party.leaderId === identity.id) party.leaderId = party.members[0].userId;
      v37SendParty(io, party);
    }
    socket.emit('v37:left_party');
    v37Ack(ack, { ok: true });
  });

  socket.on('v37:start_raid', (payload = {}, ack) => {
    if (!supabaseAdmin) return v37Fail(socket, 'Raid online tạm khóa vì máy chủ chưa cấu hình cơ sở dữ liệu biên nhận.', ack);
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    if (!party || party.state !== 'LOBBY') return v37Fail(socket, 'Không tìm thấy phòng đang chờ.', ack);
    if (party.leaderId !== identity.id) return v37Fail(socket, 'Chỉ đội trưởng mới được bắt đầu.', ack);
    if (party.members.some(m => m.pendingLoot)) return v37Fail(socket, 'Cả đội cần xác nhận phần thưởng Raid trước khi bắt đầu trận mới.', ack);
    const ready = party.members.filter(m => m.isHuman && m.online && m.ready && m.socketId);
    if (party.members.length !== 4 || ready.length !== 4) return v37Fail(socket, `Cần đủ đúng 4 người chơi thật đang online và sẵn sàng (${ready.length}/4).`, ack);
    const bossKey = ['golgoth', 'astraea'].includes(payload.bossKey) ? payload.bossKey : 'golgoth';
    party.state = 'IN_BOSS';
    for (const m of party.members) { m.hp = m.maxHp; m.cooldowns = Object.create(null); m.lastDodgeAt = 0; }
    const raidId = `${code}-${Date.now()}-${randomInt(100000, 999999)}`;
    party.combat = {
      raidId, boss: v37CreateBoss(bossKey, party), contributions: Object.create(null),
      startedAt: Date.now()
    };
    io.to(`v37_${code}`).emit('v37:raid_started', v37SanitizeCombat(party));
    v37SendParty(io, party);
    v37Ack(ack, { ok: true, raidId });
  });

  socket.on('v37:player_attack', (payload = {}, ack = () => {}) => {
    if (typeof ack !== 'function') ack = () => {};
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    const member = v37FindMember(party, identity.id);
    if (!party || party.state !== 'IN_BOSS' || !party.combat || !member?.online) return v37Fail(socket, 'Bạn chưa ở trong trận Boss online.', ack);
    if (Date.now() - Number(member.lastActionAt || 0) < 120) return v37Fail(socket, 'Thao tác quá nhanh.', ack);
    member.lastActionAt = Date.now();
    v37ResolveAttack(io, socket, party, member, payload, ack);
  });

  socket.on('v37:dodge', (_payload = {}, ack) => {
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    const member = v37FindMember(party, identity.id);
    if (!party || party.state !== 'IN_BOSS' || !member || member.hp <= 0) return v37Fail(socket, 'Không thể né lúc này.', ack);
    const now = Date.now();
    if (now - Number(member.lastDodgeAt || 0) < 2200) return v37Fail(socket, 'Động tác né đang hồi chiêu.', ack);
    member.lastDodgeAt = now;
    io.to(`v37_${code}`).emit('v37:dodge_used', { name: member.username });
    v37Ack(ack, { ok: true });
  });

  socket.on('v37:return_lobby', (_payload = {}, ack) => {
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    if (!party || !['COMPLETED', 'FAILED'].includes(party.state)) return v37Fail(socket, 'Chỉ có thể trở về sảnh sau khi trận kết thúc.', ack);
    if (party.leaderId !== identity.id) return v37Fail(socket, 'Chỉ đội trưởng mới có thể mở lại phòng.', ack);
    party.state = 'LOBBY';
    party.combat = null;
    for (const m of party.members) { m.hp = m.maxHp; m.ready = m.online && m.userId === identity.id; m.cooldowns = Object.create(null); }
    v37SendParty(io, party);
    v37Ack(ack, { ok: true });
  });

  socket.on('v37:loot_ack', async (payload = {}, ack) => {
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    const member = v37FindMember(party, identity.id);
    if (!member?.pendingLoot || member.pendingLoot.raidId !== payload.raidId) return v37Fail(socket, 'Không tìm thấy phần thưởng đang chờ xác nhận.', ack);
    if (!supabaseAdmin) return v37Fail(socket, 'Không thể xác nhận phần thưởng khi Cloud database chưa sẵn sàng.', ack);
    try {
      const { data, error } = await supabaseAdmin.from('aetheria_raid_receipts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('raid_id', String(payload.raidId).slice(0,96)).eq('user_id', identity.id)
        .is('acknowledged_at', null).select('raid_id').maybeSingle();
      if (error || !data) return v37Fail(socket, 'Biên nhận không tồn tại hoặc đã được xác nhận. Phần thưởng vẫn được giữ chờ.', ack);
      member.pendingLoot = null;
      v37SendParty(io, party);
      v37Ack(ack, { ok: true });
    } catch (error) {
      return v37Fail(socket, 'Kết nối dữ liệu bị gián đoạn. Phần thưởng vẫn được giữ chờ xác nhận lại.', ack);
    }
  });

  socket.on('v39:ack_raid_receipt', async (payload = {}, ack = () => {}) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!supabaseAdmin) return v37Fail(socket, 'Máy chủ chưa cấu hình lưu biên nhận Raid.', ack);
    const raidId = String(payload.raidId || '').slice(0,96);
    if (!raidId) return v37Fail(socket, 'Thiếu mã Raid.', ack);
    try {
      const { data, error } = await supabaseAdmin.from('aetheria_raid_receipts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('raid_id', raidId).eq('user_id', identity.id).is('acknowledged_at', null).select('raid_id').maybeSingle();
      if (error) return v37Fail(socket, 'Không thể xác nhận biên nhận Raid.', ack);
      if (!data) return v37Fail(socket, 'Biên nhận không tồn tại hoặc đã được xác nhận.', ack);
      v37Ack(ack, { ok: true });
    } catch (_) {
      return v37Fail(socket, 'Kết nối dữ liệu bị gián đoạn khi xác nhận biên nhận.', ack);
    }
  });

  socket.on('disconnect', () => {
    if (socketsByUser.get(identity.id) !== socket) return;
    const code = v37RoomByUser.get(identity.id);
    const party = v37Parties.get(code);
    const member = v37FindMember(party, identity.id);
    if (!party || !member) return;
    member.online = false;
    member.socketId = null;
    member.disconnectUntil = Date.now() + V37_GRACE_MS;
    if (party.state === 'LOBBY') member.ready = false;
    v37SendParty(io, party);
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = setTimeout(() => {
      if (member.online || member.pendingLoot) return;
      party.members = party.members.filter(m => m.userId !== identity.id);
      v37RoomByUser.delete(identity.id);
      if (party.members.length === 0) v37Parties.delete(code);
      else {
        if (party.leaderId === identity.id) party.leaderId = party.members[0].userId;
        v37SendParty(io, party);
      }
    }, V37_GRACE_MS);
    member.disconnectTimer.unref?.();
  });
});

// Lightweight 10 Hz raid tick: suitable for a small Render instance; rendering remains client-side.
const v37RaidTicker = setInterval(() => {
  const now = Date.now();
  for (const party of v37Parties.values()) {
    if (party.state !== 'IN_BOSS' || !party.combat) continue;
    const boss = party.combat.boss;
    if (boss.isBroken && now >= boss.brokenUntil) boss.isBroken = false;
    if (!boss.activeTelegraph && !boss.isBroken && now >= boss.stunnedUntil && now >= boss.nextSkillAt) v37StartTelegraph(io, party, now);
    if (boss.activeTelegraph) v37ResolveTelegraph(io, party, now);
    v37EmitCombat(io, party);
  }
}, 100);
v37RaidTicker.unref?.();


httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`CHRONO TOWER V39 server listening on port ${PORT}`);
  if (!supabaseAuth) console.warn('Supabase Auth chưa cấu hình: cần SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY.');
  if (!supabaseAdmin) console.warn('Cloud V39 chưa bật: cần SUPABASE_SERVICE_ROLE_KEY ở Render Environment.');
});
