const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

let Pool = null;
try {
  ({ Pool } = require("pg"));
} catch (e) {
  Pool = null;
}

const {
  DT, MAX_PLAYERS, MAX_WAVE, RECONNECT_GRACE,
  DIFFICULTIES, RANKS, getRankFromElo, RARITIES, MAP_THEMES,
  CLASSES, UPGRADES, COMBOS, SUPER_COMBOS,
  ENEMIES_INFO, BOSSES_INFO, INITIAL_PATCH_NOTES
} = require("./game/constants");
const {
  isSkinTaken, findFreeSkin, createPlayer, resetRoom, tickRoom, buildSnapshot
} = require("./game/engine");
const { offerUpgrades, rerollUpgrades, applyUpgrade } = require("./game/upgrades");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// --- Cache mémoire synchronisé avec PostgreSQL (Railway) ou JSON local ---
const db = {
  users: [],
  friendships: [], // { userId, friendId }
  leaderboard: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
};
const sessions = new Map();
let pgPool = null;

function createEmptyMastery() {
  const m = {};
  for (let i = 0; i < CLASSES.length; i++) {
    m[i] = { games: 0, wins: 0, kills: 0, dmg: 0, bestWave: 0 };
  }
  return m;
}

function ensureUserShape(u) {
  u.skin = Number(u.skin) || 0;
  u.elo = Number(u.elo) || 0;
  u.rank = getRankFromElo(u.elo);
  u.games = Number(u.games) || 0;
  u.wins = Number(u.wins) || 0;
  u.kills = Number(u.kills) || 0;
  u.bestWave = Number(u.bestWave) || 0;
  u.totalDmg = Number(u.totalDmg) || 0;
  u.totalRevives = Number(u.totalRevives) || 0;
  u.totalGems = Number(u.totalGems) || 0;
  if (u.bestTime === undefined || u.bestTime === null) u.bestTime = null;
  else u.bestTime = Number(u.bestTime);

  if (!u.mastery || typeof u.mastery !== "object") u.mastery = createEmptyMastery();
  for (let i = 0; i < CLASSES.length; i++) {
    if (!u.mastery[i]) u.mastery[i] = { games: 0, wins: 0, kills: 0, dmg: 0, bestWave: 0 };
  }
  return u;
}

function loadLocalDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      db.users = (raw.users || []).map(ensureUserShape);
      db.friendships = Array.isArray(raw.friendships) ? raw.friendships : [];
      db.leaderboard = Object.assign({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, raw.leaderboard || {});
    }
  } catch (e) {
    console.error("Erreur lecture DB locale :", e.message);
  }
}

function saveLocalDb() {
  if (pgPool) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Erreur sauvegarde DB locale :", e.message);
  }
}

async function initDatabase() {
  if (!process.env.DATABASE_URL || !Pool) {
    console.log("Mode stockage local JSON actif (data/db.json).");
    loadLocalDb();
    return;
  }

  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        skin INT DEFAULT 0,
        elo INT DEFAULT 0,
        rank INT DEFAULT 0,
        games INT DEFAULT 0,
        wins INT DEFAULT 0,
        kills INT DEFAULT 0,
        best_wave INT DEFAULT 0,
        total_dmg BIGINT DEFAULT 0,
        total_revives INT DEFAULT 0,
        total_gems INT DEFAULT 0,
        best_time REAL,
        mastery JSONB DEFAULT '{}'::jsonb
      );
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        friend_id INT REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, friend_id)
      );
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        squad_size INT NOT NULL,
        run_time REAL NOT NULL,
        players JSONB NOT NULL,
        date_str TEXT NOT NULL
      );
    `);

    const uRes = await pgPool.query("SELECT * FROM users ORDER BY id ASC");
    db.users = uRes.rows.map(row => ensureUserShape({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      skin: row.skin,
      elo: row.elo,
      rank: row.rank,
      games: row.games,
      wins: row.wins,
      kills: row.kills,
      bestWave: row.best_wave,
      totalDmg: row.total_dmg,
      totalRevives: row.total_revives,
      totalGems: row.total_gems,
      bestTime: row.best_time,
      mastery: row.mastery
    }));

    const fRes = await pgPool.query("SELECT user_id, friend_id FROM friendships");
    db.friendships = fRes.rows.map(r => ({ userId: r.user_id, friendId: r.friend_id }));

    const lRes = await pgPool.query("SELECT squad_size, run_time, players, date_str FROM leaderboard ORDER BY run_time ASC");
    db.leaderboard = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const row of lRes.rows) {
      const b = Math.max(1, Math.min(6, Number(row.squad_size) || 1));
      if (db.leaderboard[b].length < 10) {
        db.leaderboard[b].push({ t: Number(row.run_time), pl: row.players, d: row.date_str });
      }
    }

    console.log(`PostgreSQL Railway connecté (${db.users.length} comptes chargés).`);
  } catch (e) {
    console.error("Échec connexion PostgreSQL, bascule sur JSON local :", e.message);
    pgPool = null;
    loadLocalDb();
  }
}

async function persistUser(u) {
  ensureUserShape(u);
  if (!pgPool) {
    saveLocalDb();
    return;
  }
  try {
    await pgPool.query(
      `UPDATE users SET
        skin = $1, elo = $2, rank = $3, games = $4, wins = $5, kills = $6,
        best_wave = $7, total_dmg = $8, total_revives = $9, total_gems = $10,
        best_time = $11, mastery = $12::jsonb
       WHERE id = $13`,
      [
        u.skin, u.elo, u.rank, u.games, u.wins, u.kills,
        u.bestWave, Math.round(u.totalDmg), u.totalRevives, u.totalGems,
        u.bestTime, JSON.stringify(u.mastery), u.id
      ]
    );
  } catch (e) {
    console.error("Erreur persistUser PG :", e.message);
  }
}

async function createUserRecord(username, passwordHash, skin) {
  const mastery = createEmptyMastery();
  if (!pgPool) {
    const user = ensureUserShape({
      id: db.users.length ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
      username,
      passwordHash,
      skin,
      elo: 0,
      mastery
    });
    db.users.push(user);
    saveLocalDb();
    return user;
  }
  const res = await pgPool.query(
    `INSERT INTO users (username, password_hash, skin, elo, rank, mastery)
     VALUES ($1, $2, $3, 0, 0, $4::jsonb)
     RETURNING id`,
    [username, passwordHash, skin, JSON.stringify(mastery)]
  );
  const user = ensureUserShape({
    id: res.rows[0].id,
    username,
    passwordHash,
    skin,
    elo: 0,
    mastery
  });
  db.users.push(user);
  return user;
}

async function addFriendshipRecord(idA, idB) {
  const pairs = [[idA, idB], [idB, idA]];
  for (const [uId, fId] of pairs) {
    if (!db.friendships.some(x => x.userId === uId && x.friendId === fId)) {
      db.friendships.push({ userId: uId, friendId: fId });
    }
  }
  if (!pgPool) {
    saveLocalDb();
    return;
  }
  try {
    await pgPool.query(
      "INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING",
      [idA, idB]
    );
  } catch (e) {
    console.error("Erreur addFriendship PG :", e.message);
  }
}

async function removeFriendshipRecord(idA, idB) {
  db.friendships = db.friendships.filter(
    x => !((x.userId === idA && x.friendId === idB) || (x.userId === idB && x.friendId === idA))
  );
  if (!pgPool) {
    saveLocalDb();
    return;
  }
  try {
    await pgPool.query(
      "DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [idA, idB]
    );
  } catch (e) {
    console.error("Erreur removeFriendship PG :", e.message);
  }
}

async function insertLeaderboardRecord(bucket, entry) {
  db.leaderboard[bucket].push(entry);
  db.leaderboard[bucket].sort((a, b) => a.t - b.t);
  db.leaderboard[bucket] = db.leaderboard[bucket].slice(0, 10);

  if (!pgPool) {
    saveLocalDb();
    return;
  }
  try {
    await pgPool.query(
      "INSERT INTO leaderboard (squad_size, run_time, players, date_str) VALUES ($1, $2, $3::jsonb, $4)",
      [bucket, entry.t, JSON.stringify(entry.pl), entry.d]
    );
  } catch (e) {
    console.error("Erreur insertLeaderboard PG :", e.message);
  }
}

function getRankedLeaderboard() {
  return db.users
    .filter(u => (u.elo || 0) >= 1000)
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins)
    .slice(0, 50)
    .map(u => ({
      id: u.id,
      username: u.username,
      skin: u.skin,
      elo: u.elo,
      rank: getRankFromElo(u.elo),
      wins: u.wins,
      bestTime: u.bestTime
    }));
}

function getAllLeaderboards() {
  return Object.assign({}, db.leaderboard, { ranked: getRankedLeaderboard() });
}

function hashPassword(pwd, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(pwd), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(pwd, stored) {
  const [salt, key] = String(stored || "").split(":");
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(String(pwd), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(hash, "hex"));
}

function publicUser(u) {
  ensureUserShape(u);
  return {
    id: u.id,
    username: u.username,
    skin: u.skin,
    elo: u.elo,
    rank: u.rank,
    games: u.games,
    wins: u.wins,
    kills: u.kills,
    bestWave: u.bestWave,
    totalDmg: Math.round(u.totalDmg),
    totalRevives: u.totalRevives,
    totalGems: u.totalGems,
    bestTime: u.bestTime,
    mastery: u.mastery
  };
}

function getUserFromReq(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return getUserFromToken(token);
}

function getUserFromToken(token) {
  if (!token) return null;
  const uid = sessions.get(token);
  if (!uid) return null;
  return db.users.find(u => u.id === uid) || null;
}

// --- Salles multijoueur & recherche de reconnexion ---
const rooms = new Map();

function findActiveSessionForUser(userId, codeHint, rjKeyHint) {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.st !== "play") continue;
    for (const p of room.pl) {
      if (p.disconnected && now - p.disconnectTime >= RECONNECT_GRACE * 1000) continue;
      if (userId && p.userId === userId) {
        return { code: room.code, rjKey: p.rejoinKey, wave: room.wave, diff: room.diff };
      }
      if (codeHint && rjKeyHint && room.code === codeHint && p.rejoinKey === rjKeyHint) {
        return { code: room.code, rjKey: p.rejoinKey, wave: room.wave, diff: room.diff };
      }
    }
  }
  return null;
}

function findRoomStatusForUser(userId) {
  for (const room of rooms.values()) {
    if (room.st === "win" || room.st === "over") continue;
    const p = room.pl.find(x => x.userId === userId && !x.disconnected);
    if (p) {
      return {
        online: true,
        roomCode: room.code,
        roomState: room.st,
        canJoin: room.st === "lobby" && room.pl.length < MAX_PLAYERS
      };
    }
  }
  for (const uid of sessions.values()) {
    if (uid === userId) return { online: true, roomCode: null, roomState: "home", canJoin: false };
  }
  return { online: false, roomCode: null, roomState: "offline", canJoin: false };
}

function buildFriendsList(userId) {
  const ids = db.friendships.filter(f => f.userId === userId).map(f => f.friendId);
  return ids
    .map(fid => db.users.find(u => u.id === fid))
    .filter(Boolean)
    .map(fu => {
      const status = findRoomStatusForUser(fu.id);
      return Object.assign(publicUser(fu), status);
    });
}

// --- Génération des données d'encyclopédie ---
function buildEncyclopedia() {
  const waves = [];
  for (let w = 1; w <= MAX_WAVE; w++) {
    const active = ENEMIES_INFO.filter(m => w >= m.waveMin).map(m => m.name);
    let boss = "";
    let baseCount = Math.round(5 + w * 1.85);
    if (w >= 45 && w <= 50) {
      const cnt = w === 50 ? 5 : Math.min(4, 2 + Math.floor((w - 45) / 2));
      boss = w === 50 ? "Les 5 Boss simultanés" : `${cnt} Boss aléatoires`;
      baseCount = Math.round(10 + w * 0.6);
    } else if (w % 5 === 0) {
      boss = BOSSES_INFO[Math.floor((w / 5 - 1) % 5)].name;
      baseCount = Math.round(6 + w * 0.8);
    }
    const hpMult = ((1 + (w - 1) * 0.038) * Math.pow(1.34, Math.floor((w - 1) / 5))).toFixed(2);
    waves.push({ wave: w, boss, baseCount, hpMult, enemies: active });
  }

  return {
    difficulties: DIFFICULTIES,
    ranks: RANKS,
    rarities: RARITIES,
    themes: MAP_THEMES,
    classes: CLASSES.map(c => ({ id: c.id, name: c.name, passive: c.passive, bonus: c.bonus })),
    upgrades: UPGRADES.map(u => ({ id: u.id, short: u.short, desc: u.desc(1) })),
    combos: COMBOS.map(c => ({
      id: c.id,
      name: c.name,
      req: c.req.map(idx => UPGRADES[idx].short),
      desc: c.desc
    })),
    super_combos: SUPER_COMBOS.map(s => ({
      id: s.id,
      name: s.name,
      req: s.req.map(idx => COMBOS[idx].name),
      desc: s.desc
    })),
    enemies: ENEMIES_INFO,
    bosses: BOSSES_INFO,
    waves
  };
}

const ENCYCLOPEDIA = buildEncyclopedia();
const PATCH_NOTES = INITIAL_PATCH_NOTES.map(p => ({
  version: p.version,
  date: p.date_label,
  latest: Boolean(p.is_latest),
  items: p.items
}));

// --- Serveur HTTP (API + fichiers statiques) ---
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 16384) req.destroy();
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const urlPath = urlObj.pathname;

  if (urlPath === "/api/data" && req.method === "GET") {
    return sendJson(res, 200, {
      leaderboard: getAllLeaderboards(),
      patchNotes: PATCH_NOTES,
      encyclopedia: ENCYCLOPEDIA
    });
  }

  if (urlPath === "/api/auth/register" && req.method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!/^[a-zA-Z0-9_-]{3,18}$/.test(username)) {
      return sendJson(res, 400, { error: "Pseudo invalide (3-18 car. alphanumériques)." });
    }
    if (password.length < 4) {
      return sendJson(res, 400, { error: "Mot de passe trop court (min. 4 car.)." });
    }
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return sendJson(res, 409, { error: "Ce pseudo est déjà utilisé." });
    }
    const skin = Math.max(0, Math.min(CLASSES.length - 1, parseInt(body.skin, 10) || 0));
    const user = await createUserRecord(username, hashPassword(password), skin);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);
    return sendJson(res, 200, {
      token,
      user: publicUser(user),
      friends: buildFriendsList(user.id),
      activeGame: findActiveSessionForUser(user.id, null, null)
    });
  }

  if (urlPath === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Pseudo ou mot de passe incorrect." });
    }
    if (body.skin !== undefined) {
      user.skin = Math.max(0, Math.min(CLASSES.length - 1, parseInt(body.skin, 10) || 0));
      await persistUser(user);
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);
    return sendJson(res, 200, {
      token,
      user: publicUser(user),
      friends: buildFriendsList(user.id),
      activeGame: findActiveSessionForUser(user.id, null, null)
    });
  }

  if (urlPath === "/api/auth/me" && req.method === "GET") {
    const user = getUserFromReq(req);
    const codeHint = (urlObj.searchParams.get("code") || "").toUpperCase();
    const rjHint = urlObj.searchParams.get("rj") || "";
    const activeGame = findActiveSessionForUser(user ? user.id : null, codeHint, rjHint);
    if (!user) {
      return sendJson(res, 200, { user: null, friends: [], activeGame });
    }
    return sendJson(res, 200, {
      user: publicUser(user),
      friends: buildFriendsList(user.id),
      activeGame
    });
  }

  if (urlPath === "/api/friends" && req.method === "GET") {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { error: "Connexion requise." });
    return sendJson(res, 200, { friends: buildFriendsList(user.id) });
  }

  if (urlPath === "/api/friends/add" && req.method === "POST") {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { error: "Connexion requise." });
    const body = await readBody(req);
    const targetName = String(body.username || "").trim();
    const target = db.users.find(u => u.username.toLowerCase() === targetName.toLowerCase());
    if (!target) return sendJson(res, 404, { error: "Joueur introuvable." });
    if (target.id === user.id) return sendJson(res, 400, { error: "Tu ne peux pas t'ajouter toi-même." });
    await addFriendshipRecord(user.id, target.id);
    return sendJson(res, 200, { friends: buildFriendsList(user.id) });
  }

  if (urlPath === "/api/friends/remove" && req.method === "POST") {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { error: "Connexion requise." });
    const body = await readBody(req);
    const friendId = parseInt(body.friendId, 10);
    if (friendId) await removeFriendshipRecord(user.id, friendId);
    return sendJson(res, 200, { friends: buildFriendsList(user.id) });
  }

  // Fichiers statiques dans public/
  const relPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  let filePath = path.normalize(path.join(PUBLIC_DIR, relPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`Introuvable : ${relPath}`);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
});

// --- Gestion WebSocket (Salles, Chat, Reconnexion, Combat) ---
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function broadcastChat(room, payload) {
  const msg = JSON.stringify(Object.assign({ t: "chat", ts: Date.now() }, payload));
  for (const p of room.pl) {
    if (p.ws && p.ws.readyState === 1 && !p.disconnected) {
      p.ws.send(msg);
    }
  }
}

function computeRankedEloDelta(curElo, isWin, wave, runTime) {
  if (curElo <= 0) {
    if (isWin) {
      return 960 + Math.max(0, Math.round((1300 - runTime) * 0.45));
    }
    if (wave >= 12) {
      return Math.round(wave * 18);
    }
    return 0;
  }
  if (isWin) {
    return Math.max(15, Math.round(65 + (1200 - runTime) * 0.14 - (curElo - 1000) * 0.03));
  }
  return Math.min(-6, Math.round((wave - 36) * 1.6 - (curElo - 800) * 0.025));
}

async function recordMatchResult(r, isWin) {
  if (r.recorded) return;
  r.recorded = true;
  const runTime = Math.round(r.t * 10) / 10;
  const isRanked = r.diff === "ranked";

  for (const p of r.pl) {
    if (isRanked) {
      const oldElo = p.elo || 0;
      const delta = computeRankedEloDelta(oldElo, isWin, r.wave, runTime);
      const newElo = oldElo === 0 ? delta : Math.max(1, oldElo + delta);
      p.eloDelta = newElo - oldElo;
      p.elo = newElo;
      p.rank = getRankFromElo(newElo);
    } else {
      p.eloDelta = 0;
    }

    if (p.userId) {
      const u = db.users.find(x => x.id === p.userId);
      if (u) {
        ensureUserShape(u);
        u.games += 1;
        if (isWin) {
          u.wins += 1;
          if (u.bestTime === null || runTime < u.bestTime) u.bestTime = runTime;
        }
        u.kills += p.st.kills;
        u.totalDmg += Math.round(p.st.dmg);
        u.totalRevives += p.st.revives;
        u.totalGems += p.st.gems;
        u.bestWave = Math.max(u.bestWave, r.wave);
        u.skin = p.skin;
        if (isRanked) {
          u.elo = p.elo;
          u.rank = getRankFromElo(u.elo);
        }

        const cm = u.mastery[p.skin];
        cm.games += 1;
        if (isWin) cm.wins += 1;
        cm.kills += p.st.kills;
        cm.dmg += Math.round(p.st.dmg);
        cm.bestWave = Math.max(cm.bestWave, r.wave);

        await persistUser(u);

        if (p.ws && p.ws.readyState === 1 && !p.disconnected) {
          p.ws.send(JSON.stringify({ t: "user", user: publicUser(u) }));
        }
      }
    }
  }

  if (isWin) {
    const bucket = Math.max(1, Math.min(6, r.pl.length));
    const dateStr = new Date().toLocaleDateString("fr-FR");
    await insertLeaderboardRecord(bucket, {
      t: runTime,
      diff: r.diff || "medium",
      pl: r.pl.map(p => ({ name: p.name, skin: p.skin })),
      d: dateStr
    });
  }
}

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  let curRoom = null;
  let curPlayer = null;

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.t === "rejoin") {
      if (curRoom) return;
      const user = getUserFromToken(msg.token);
      const code = String(msg.c || "").toUpperCase().trim();
      const rjKey = String(msg.rjKey || "");
      let targetRoom = code ? rooms.get(code) : null;
      let targetPlayer = null;

      if (targetRoom && targetRoom.st === "play") {
        targetPlayer = targetRoom.pl.find(p =>
          (user && p.userId === user.id) || (rjKey && p.rejoinKey === rjKey)
        );
      } else if (user) {
        for (const r of rooms.values()) {
          if (r.st !== "play") continue;
          const found = r.pl.find(p => p.userId === user.id);
          if (found) { targetRoom = r; targetPlayer = found; break; }
        }
      }

      if (!targetRoom || !targetPlayer) {
        return ws.send(JSON.stringify({ t: "err", m: "La partie n'est plus disponible." }));
      }

      if (targetPlayer.ws && targetPlayer.ws !== ws && targetPlayer.ws.readyState === 1) {
        try { targetPlayer.ws.close(); } catch (e) {}
      }

      targetPlayer.ws = ws;
      targetPlayer.disconnected = false;
      targetPlayer.disconnectTime = 0;
      targetPlayer.inv = Math.max(targetPlayer.inv, 2.5);
      curRoom = targetRoom;
      curPlayer = targetPlayer;

      broadcastChat(targetRoom, { sys: true, text: `${targetPlayer.name} a rejoint la partie en cours !` });
      buildSnapshot(targetRoom, getAllLeaderboards());
      return;
    }

    if (msg.t === "create" || msg.t === "join") {
      if (curRoom) return;
      const user = getUserFromToken(msg.token);
      const nick = user
        ? user.username
        : (String(msg.n || "").trim().slice(0, 14) || "Survivant");
      const preferredSkin = user ? user.skin : msg.sk;
      const elo = user ? (user.elo || 0) : 0;
      const rank = getRankFromElo(elo);

      let room;
      if (msg.t === "create") {
        const code = makeCode();
        room = {
          code, st: "lobby", diff: "medium", pl: [],
          E: [], B: [], G: [], X: [], ev: [], links: [], fullLink: 0,
          t: 0, eid: 0, frostT: 0, kills: 0, xp: 0, lvl: 1, need: 10,
          wave: 0, toSpawn: 0, spawnCd: 0, waveDelay: 0.8,
          paused: false, pausedBy: -1, recorded: false
        };
        rooms.set(code, room);
      } else {
        const code = String(msg.c || "").toUpperCase().trim();
        room = rooms.get(code);
        if (!room) return ws.send(JSON.stringify({ t: "err", m: "Salle introuvable." }));
        if (room.st !== "lobby") return ws.send(JSON.stringify({ t: "err", m: "Partie déjà en cours." }));
        if (room.pl.length >= MAX_PLAYERS) return ws.send(JSON.stringify({ t: "err", m: "Salle complète (6/6)." }));
      }

      const freeSkin = findFreeSkin(room, preferredSkin);
      const player = createPlayer(ws, room.pl.length, {
        userId: user ? user.id : null,
        name: nick,
        skin: freeSkin,
        rank,
        elo
      });
      room.pl.push(player);
      curRoom = room;
      curPlayer = player;
      broadcastChat(room, { sys: true, text: `${player.name} a rejoint le salon.` });
      buildSnapshot(room, getAllLeaderboards());
      return;
    }

    if (!curRoom || !curPlayer) return;

    if (msg.t === "chat") {
      const txt = String(msg.m || "").trim().slice(0, 140);
      if (!txt) return;
      broadcastChat(curRoom, {
        sys: false,
        i: curPlayer.i,
        name: curPlayer.name,
        skin: curPlayer.skin,
        text: txt
      });
    } else if (msg.t === "diff" && curRoom.st === "lobby" && curPlayer.i === 0) {
      const dKey = String(msg.diff || "medium");
      if (DIFFICULTIES[dKey]) {
        curRoom.diff = dKey;
        broadcastChat(curRoom, { sys: true, text: `Difficulté changée : ${DIFFICULTIES[dKey].name}.` });
        buildSnapshot(curRoom, getAllLeaderboards());
      }
    } else if (msg.t === "skin" && curRoom.st === "lobby") {
      const sk = Math.max(0, Math.min(CLASSES.length - 1, parseInt(msg.sk, 10) || 0));
      if (!isSkinTaken(curRoom, sk, curPlayer)) {
        curPlayer.skin = sk;
        if (curPlayer.userId) {
          const u = db.users.find(x => x.id === curPlayer.userId);
          if (u) { u.skin = sk; await persistUser(u); }
        }
        buildSnapshot(curRoom, getAllLeaderboards());
      }
    } else if (msg.t === "start" && curRoom.st === "lobby" && curPlayer.i === 0) {
      curRoom.st = "play";
      resetRoom(curRoom);
      buildSnapshot(curRoom, getAllLeaderboards());
    } else if (msg.t === "restart" && (curRoom.st === "win" || curRoom.st === "over") && curPlayer.i === 0) {
      curRoom.st = "play";
      resetRoom(curRoom);
      buildSnapshot(curRoom, getAllLeaderboards());
    } else if (msg.t === "pause" && curRoom.st === "play") {
      curRoom.paused = !curRoom.paused;
      curRoom.pausedBy = curRoom.paused ? curPlayer.i : -1;
      buildSnapshot(curRoom, getAllLeaderboards());
    } else if (msg.t === "in" && curRoom.st === "play") {
      curPlayer.dx = Math.max(-1, Math.min(1, Number(msg.x) || 0));
      curPlayer.dy = Math.max(-1, Math.min(1, Number(msg.y) || 0));
    } else if (msg.t === "dash" && curRoom.st === "play" && !curRoom.paused) {
      if (curPlayer.dc <= 0 && !curPlayer.down) {
        curPlayer.dsh = 0.16;
        curPlayer.dc = 1.6 * curPlayer.S.dashCd;
        curPlayer.inv = Math.max(curPlayer.inv, 0.24);
        curRoom.ev.push([Math.round(curPlayer.x), Math.round(curPlayer.y), 13, curPlayer.i]);
      }
    } else if (msg.t === "reroll" && curRoom.st === "play" && curPlayer.ch) {
      if (rerollUpgrades(curPlayer, curRoom.lvl)) {
        buildSnapshot(curRoom, getAllLeaderboards());
      }
    } else if (msg.t === "pick" && curRoom.st === "play" && curPlayer.ch) {
      const slot = parseInt(msg.k, 10);
      const choice = curPlayer.ch[slot];
      if (!choice) return;
      applyUpgrade(curRoom, curPlayer, choice);
      curPlayer.inv = Math.max(curPlayer.inv, 0.6);
      curPlayer.pend = Math.max(0, curPlayer.pend - 1);
      if (curPlayer.pend > 0) offerUpgrades(curPlayer, curRoom.lvl);
      else {
        curPlayer.ch = null;
        curPlayer.pickTimer = 0;
      }
      buildSnapshot(curRoom, getAllLeaderboards());
    }
  });

  ws.on("close", () => {
    if (!curRoom || !curPlayer) return;
    if (curPlayer.ws !== ws) return;

    if (curRoom.st === "play") {
      curPlayer.disconnected = true;
      curPlayer.disconnectTime = Date.now();
      curPlayer.dx = 0;
      curPlayer.dy = 0;
      broadcastChat(curRoom, {
        sys: true,
        text: `${curPlayer.name} a été déconnecté (reconnexion possible pendant 3 min).`
      });
      if (curRoom.pl.every(p => p.disconnected)) {
        rooms.delete(curRoom.code);
      } else {
        buildSnapshot(curRoom, getAllLeaderboards());
      }
      return;
    }

    const idx = curRoom.pl.indexOf(curPlayer);
    if (idx !== -1) {
      curRoom.pl.splice(idx, 1);
      curRoom.pl.forEach((p, i) => { p.i = i; });
    }
    if (curRoom.pl.length === 0) {
      rooms.delete(curRoom.code);
    } else {
      broadcastChat(curRoom, { sys: true, text: `${curPlayer.name} a quitté la salle.` });
      buildSnapshot(curRoom, getAllLeaderboards());
    }
  });
});

// Boucle serveur 30 Hz (envoi réseau optimisé)
let netTick = 0;
setInterval(() => {
  const lbs = getAllLeaderboards();
  for (const room of rooms.values()) {
    if (room.st === "play") {
      tickRoom(room, r => recordMatchResult(r, true));
      if (room.st === "over") recordMatchResult(room, false);
      if (++netTick % 2 === 0 || room.st !== "play" || room.ev.length > 0 || room.pl.some(p => p.ch !== null)) {
        buildSnapshot(room, lbs);
      }
    }
  }
}, Math.round(DT * 1000));

initDatabase().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Survivor Squad v1.7 actif sur le port ${PORT}`);
  });
});