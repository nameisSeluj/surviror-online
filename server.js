const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const {
  DT, MAX_PLAYERS, MAX_WAVE, RANKS, RARITIES, MAP_THEMES,
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

// --- Persistance JSON (comptes, rangs, maîtrise des classes, classements) ---
function createEmptyMastery() {
  const m = {};
  for (let i = 0; i < CLASSES.length; i++) {
    m[i] = { games: 0, wins: 0, kills: 0, dmg: 0, bestWave: 0 };
  }
  return m;
}

function ensureUserShape(u) {
  u.skin = u.skin || 0;
  u.rank = u.rank || 0;
  u.games = u.games || 0;
  u.wins = u.wins || 0;
  u.kills = u.kills || 0;
  u.bestWave = u.bestWave || 0;
  u.totalDmg = u.totalDmg || 0;
  u.totalRevives = u.totalRevives || 0;
  u.totalGems = u.totalGems || 0;
  if (u.bestTime === undefined) u.bestTime = null;
  if (!u.mastery || typeof u.mastery !== "object") u.mastery = createEmptyMastery();
  for (let i = 0; i < CLASSES.length; i++) {
    if (!u.mastery[i]) u.mastery[i] = { games: 0, wins: 0, kills: 0, dmg: 0, bestWave: 0 };
  }
  return u;
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      const users = (raw.users || []).map(ensureUserShape);
      return {
        users,
        leaderboard: Object.assign({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, raw.leaderboard || {})
      };
    }
  } catch (e) {
    console.error("Erreur lecture DB :", e.message);
  }
  return { users: [], leaderboard: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } };
}

const db = loadDb();
const sessions = new Map();

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Erreur sauvegarde DB :", e.message);
  }
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

function getUserFromToken(token) {
  if (!token) return null;
  const uid = sessions.get(token);
  if (!uid) return null;
  return db.users.find(u => u.id === uid) || null;
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
    ranks: RANKS,
    rarities: RARITIES,
    themes: MAP_THEMES,
    classes: CLASSES.map(c => ({ id: c.id, name: c.name, passive: c.passive, bonus: c.bonus })),
    upgrades: UPGRADES.map(u => ({ id: u.id, short: u.short, desc: u.desc(0) })),
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
  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath === "/api/data" && req.method === "GET") {
    return sendJson(res, 200, {
      leaderboard: db.leaderboard,
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
    const user = ensureUserShape({
      id: db.users.length ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
      username,
      passwordHash: hashPassword(password),
      skin: Math.max(0, Math.min(CLASSES.length - 1, parseInt(body.skin, 10) || 0))
    });
    db.users.push(user);
    saveDb();
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);
    return sendJson(res, 200, { token, user: publicUser(user) });
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
      saveDb();
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  if (urlPath === "/api/auth/me" && req.method === "GET") {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const user = getUserFromToken(token);
    if (!user) return sendJson(res, 401, { error: "Session expirée." });
    return sendJson(res, 200, { user: publicUser(user) });
  }

  // Fichiers statiques dans public/
  const relPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  let filePath = path.normalize(path.join(PUBLIC_DIR, relPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (urlPath === "/" && !fs.existsSync(filePath)) {
    const alt = path.join(PUBLIC_DIR, "index_2.html");
    if (fs.existsSync(alt)) filePath = alt;
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

// --- Salles multijoueur WebSocket ---
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function recordMatchResult(r, isWin) {
  if (r.recorded) return;
  r.recorded = true;
  const runTime = Math.round(r.t * 10) / 10;

  for (const p of r.pl) {
    p.oldRank = p.rank;
    if (isWin) {
      const nextRk = RANKS[p.rank + 1];
      if (nextRk && r.t <= nextRk.target) {
        p.rank++;
        p.promoted = true;
      }
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
        u.rank = Math.max(u.rank, p.rank);
        u.skin = p.skin;

        const cm = u.mastery[p.skin];
        cm.games += 1;
        if (isWin) cm.wins += 1;
        cm.kills += p.st.kills;
        cm.dmg += Math.round(p.st.dmg);
        cm.bestWave = Math.max(cm.bestWave, r.wave);

        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ t: "user", user: publicUser(u) }));
        }
      }
    }
  }

  if (isWin) {
    const bucket = Math.max(1, Math.min(6, r.pl.length));
    const dateStr = new Date().toLocaleDateString("fr-FR");
    db.leaderboard[bucket].push({
      t: runTime,
      pl: r.pl.map(p => ({ name: p.name, skin: p.skin })),
      d: dateStr
    });
    db.leaderboard[bucket].sort((a, b) => a.t - b.t);
    db.leaderboard[bucket] = db.leaderboard[bucket].slice(0, 10);
  }

  saveDb();
}

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  let curRoom = null;
  let curPlayer = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.t === "create" || msg.t === "join") {
      if (curRoom) return;
      const user = getUserFromToken(msg.token);
      const nick = user
        ? user.username
        : (String(msg.n || "").trim().slice(0, 14) || "Survivant");
      const preferredSkin = user ? user.skin : msg.sk;
      const rank = user ? user.rank : 0;

      let room;
      if (msg.t === "create") {
        const code = makeCode();
        room = {
          code, st: "lobby", pl: [],
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
        rank
      });
      room.pl.push(player);
      curRoom = room;
      curPlayer = player;
      buildSnapshot(room, db.leaderboard);
      return;
    }

    if (!curRoom || !curPlayer) return;

    if (msg.t === "skin" && curRoom.st === "lobby") {
      const sk = Math.max(0, Math.min(CLASSES.length - 1, parseInt(msg.sk, 10) || 0));
      if (!isSkinTaken(curRoom, sk, curPlayer)) {
        curPlayer.skin = sk;
        if (curPlayer.userId) {
          const u = db.users.find(x => x.id === curPlayer.userId);
          if (u) { u.skin = sk; saveDb(); }
        }
        buildSnapshot(curRoom, db.leaderboard);
      }
    } else if (msg.t === "start" && curRoom.st === "lobby" && curPlayer.i === 0) {
      curRoom.st = "play";
      resetRoom(curRoom);
      buildSnapshot(curRoom, db.leaderboard);
    } else if (msg.t === "restart" && (curRoom.st === "win" || curRoom.st === "over") && curPlayer.i === 0) {
      curRoom.st = "play";
      resetRoom(curRoom);
      buildSnapshot(curRoom, db.leaderboard);
    } else if (msg.t === "pause" && curRoom.st === "play") {
      curRoom.paused = !curRoom.paused;
      curRoom.pausedBy = curRoom.paused ? curPlayer.i : -1;
      buildSnapshot(curRoom, db.leaderboard);
    } else if (msg.t === "in" && curRoom.st === "play") {
      curPlayer.dx = Math.max(-1, Math.min(1, Number(msg.x) || 0));
      curPlayer.dy = Math.max(-1, Math.min(1, Number(msg.y) || 0));
    } else if (msg.t === "dash" && curRoom.st === "play" && !curRoom.paused) {
      if (curPlayer.dc <= 0 && !curPlayer.down) {
        curPlayer.dsh = 0.16;
        curPlayer.dc = 1.6 * curPlayer.S.dashCd;
        curPlayer.inv = Math.max(curPlayer.inv, 0.24);
      }
    } else if (msg.t === "reroll" && curRoom.st === "play" && curPlayer.ch) {
      if (rerollUpgrades(curPlayer, curRoom.lvl)) {
        buildSnapshot(curRoom, db.leaderboard);
      }
    } else if (msg.t === "pick" && curRoom.st === "play" && curPlayer.ch) {
      const slot = parseInt(msg.k, 10);
      const choice = curPlayer.ch[slot];
      if (!choice) return;
      applyUpgrade(curRoom, curPlayer, choice);
      curPlayer.inv = Math.max(curPlayer.inv, 0.6);
      curPlayer.pend = Math.max(0, curPlayer.pend - 1);
      if (curPlayer.pend > 0) offerUpgrades(curPlayer, curRoom.lvl);
      else curPlayer.ch = null;
      buildSnapshot(curRoom, db.leaderboard);
    }
  });

  ws.on("close", () => {
    if (!curRoom || !curPlayer) return;
    const idx = curRoom.pl.indexOf(curPlayer);
    if (idx !== -1) {
      curRoom.pl.splice(idx, 1);
      curRoom.pl.forEach((p, i) => { p.i = i; });
    }
    if (curRoom.pl.length === 0) {
      rooms.delete(curRoom.code);
    } else {
      buildSnapshot(curRoom, db.leaderboard);
    }
  });
});

// Boucle serveur 30 Hz
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.st === "play") {
      tickRoom(room, r => recordMatchResult(r, true));
      if (room.st === "over") recordMatchResult(room, false);
      buildSnapshot(room, db.leaderboard);
    }
  }
}, Math.round(DT * 1000));

server.listen(PORT, () => {
  console.log(`Survivor Squad actif sur le port ${PORT}`);
});