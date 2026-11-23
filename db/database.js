const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  MAX_WAVE, RANKS, RARITIES, CLASSES, UPGRADES,
  COMBOS, SUPER_COMBOS, ENEMIES_INFO, BOSSES_INFO, INITIAL_PATCH_NOTES
} = require("../game/constants");

const SECRET = process.env.AUTH_SECRET || "ink-survivors-local-secret-key";
const DATA_DIR = path.join(__dirname, "..", "data");
const JSON_PATH = path.join(DATA_DIR, "db.json");

let pool = null;
let mem = null;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, username: user.username })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function buildWavesCatalog() {
  const waves = [];
  for (let w = 1; w <= MAX_WAVE; w++) {
    const enemies = ["Rôdeur"];
    if (w >= 2) enemies.push("Véloce");
    if (w >= 4) enemies.push("Tireur d'encre");
    if (w >= 5) enemies.push("Mastodonte");
    if (w >= 6) enemies.push("Spectre");
    if (w >= 8) enemies.push("Kamikaze");
    if (w >= 11) enemies.push("Bélier");
    if (w >= 14) enemies.push("Artilleur");
    if (w >= 18) enemies.push("Invocateur");

    let boss = null;
    if (w === 50) boss = "Les 5 Boss réunis";
    else if (w >= 45) boss = `${Math.min(4, 2 + Math.floor((w - 45) / 2))} Boss aléatoires`;
    else if (w % 5 === 0) boss = BOSSES_INFO[Math.floor((w / 5 - 1) % 5)].name;

    const baseCount = w % 5 === 0 ? (6 + Math.round(w * 0.8)) : Math.round(5 + w * 1.85);
    const hpMult = Number(((1 + (w - 1) * 0.038) * Math.pow(1.34, Math.floor((w - 1) / 5))).toFixed(2));
    waves.push({ wave: w, boss, baseCount, hpMult, enemies });
  }
  return waves;
}

function buildEncyclopediaPayload() {
  return {
    ranks: RANKS,
    rarities: RARITIES,
    classes: CLASSES.map(c => ({ id: c.id, name: c.name, passive: c.passive, bonus: c.bonus })),
    upgrades: UPGRADES.map(u => ({ id: u.id, short: u.short, title: u.title(0), desc: u.desc(0) })),
    combos: COMBOS.map(c => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      req: c.req.map(idx => UPGRADES[idx].short)
    })),
    super_combos: SUPER_COMBOS.map(sc => ({
      id: sc.id,
      name: sc.name,
      desc: sc.desc,
      req: sc.req.map(idx => COMBOS[idx].name)
    })),
    enemies: ENEMIES_INFO,
    bosses: BOSSES_INFO,
    waves: buildWavesCatalog()
  };
}

function saveLocalJson() {
  if (!mem) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(mem, null, 2), "utf8");
}

async function initDb() {
  const encyclopedia = buildEncyclopediaPayload();

  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(24) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        rank_id INTEGER NOT NULL DEFAULT 0,
        preferred_skin INTEGER NOT NULL DEFAULT 0,
        total_kills INTEGER NOT NULL DEFAULT 0,
        total_games INTEGER NOT NULL DEFAULT 0,
        total_wins INTEGER NOT NULL DEFAULT 0,
        best_wave INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        squad_size INTEGER NOT NULL,
        time_sec REAL NOT NULL,
        players_json JSONB NOT NULL,
        date_label VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS patch_notes (
        id SERIAL PRIMARY KEY,
        version VARCHAR(80) UNIQUE NOT NULL,
        date_label VARCHAR(32) NOT NULL,
        is_latest INTEGER NOT NULL DEFAULT 0,
        items_json JSONB NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS encyclopedia (
        category VARCHAR(32) PRIMARY KEY,
        data_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: pnCount } = await pool.query("SELECT COUNT(*)::int AS c FROM patch_notes");
    if (pnCount[0].c === 0) {
      for (let i = 0; i < INITIAL_PATCH_NOTES.length; i++) {
        const pn = INITIAL_PATCH_NOTES[i];
        await pool.query(
          "INSERT INTO patch_notes (version, date_label, is_latest, items_json, sort_order) VALUES ($1, $2, $3, $4, $5)",
          [pn.version, pn.date_label, pn.is_latest, JSON.stringify(pn.items), i]
        );
      }
    }

    for (const [category, data] of Object.entries(encyclopedia)) {
      await pool.query(
        `INSERT INTO encyclopedia (category, data_json, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (category) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()`,
        [category, JSON.stringify(data)]
      );
    }
    return;
  }

  // Fallback local JSON si DATABASE_URL n'est pas configuré
  if (fs.existsSync(JSON_PATH)) {
    mem = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  } else {
    mem = {
      nextUserId: 1,
      users: [],
      leaderboard: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
      patch_notes: INITIAL_PATCH_NOTES,
      encyclopedia
    };
  }
  mem.encyclopedia = encyclopedia;
  saveLocalJson();
}

function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    rank: u.rank_id ?? u.rank ?? 0,
    skin: u.preferred_skin ?? u.skin ?? 0,
    kills: u.total_kills ?? u.kills ?? 0,
    games: u.total_games ?? u.games ?? 0,
    wins: u.total_wins ?? u.wins ?? 0,
    bestWave: u.best_wave ?? u.bestWave ?? 0
  };
}

async function registerUser(rawUsername, password, rawSkin = 0) {
  const username = String(rawUsername || "").trim().replace(/\s+/g, " ").slice(0, 18);
  if (username.length < 3) throw new Error("Le pseudo doit contenir au moins 3 caractères.");
  if (!password || String(password).length < 4) throw new Error("Le mot de passe doit contenir au moins 4 caractères.");

  const skin = Math.max(0, Math.min(CLASSES.length - 1, parseInt(rawSkin, 10) || 0));
  const { salt, hash } = hashPassword(password);

  if (pool) {
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    if (existing.rows.length > 0) throw new Error("Ce pseudo est déjà utilisé.");
    const res = await pool.query(
      `INSERT INTO users (username, password_hash, salt, preferred_skin)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [username, hash, salt, skin]
    );
    const user = sanitizeUser(res.rows[0]);
    return { user, token: signToken(user) };
  }

  if (mem.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Ce pseudo est déjà utilisé.");
  }
  const newUser = {
    id: mem.nextUserId++,
    username,
    password_hash: hash,
    salt,
    rank_id: 0,
    preferred_skin: skin,
    total_kills: 0,
    total_games: 0,
    total_wins: 0,
    best_wave: 0
  };
  mem.users.push(newUser);
  saveLocalJson();
  const user = sanitizeUser(newUser);
  return { user, token: signToken(user) };
}

async function loginUser(rawUsername, password) {
  const username = String(rawUsername || "").trim();
  if (!username || !password) throw new Error("Identifiants incomplets.");

  if (pool) {
    const res = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    const row = res.rows[0];
    if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
      throw new Error("Pseudo ou mot de passe incorrect.");
    }
    const user = sanitizeUser(row);
    return { user, token: signToken(user) };
  }

  const row = mem.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
    throw new Error("Pseudo ou mot de passe incorrect.");
  }
  const user = sanitizeUser(row);
  return { user, token: signToken(user) };
}

async function getUserById(id) {
  if (!id) return null;
  if (pool) {
    const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] ? sanitizeUser(res.rows[0]) : null;
  }
  const row = mem.users.find(u => u.id === id);
  return row ? sanitizeUser(row) : null;
}

async function updateUserSkin(userId, skinIdx) {
  const skin = Math.max(0, Math.min(CLASSES.length - 1, parseInt(skinIdx, 10) || 0));
  if (pool) {
    await pool.query("UPDATE users SET preferred_skin = $1 WHERE id = $2", [skin, userId]);
    return;
  }
  const row = mem.users.find(u => u.id === userId);
  if (row) {
    row.preferred_skin = skin;
    saveLocalJson();
  }
}

async function recordMatchStats(userId, { kills = 0, wave = 0, won = false, newRank = null }) {
  if (!userId) return;
  if (pool) {
    await pool.query(
      `UPDATE users SET
        total_kills = total_kills + $1,
        total_games = total_games + 1,
        total_wins = total_wins + $2,
        best_wave = GREATEST(best_wave, $3),
        rank_id = COALESCE($4, rank_id)
       WHERE id = $5`,
      [kills, won ? 1 : 0, wave, newRank, userId]
    );
    return;
  }
  const row = mem.users.find(u => u.id === userId);
  if (row) {
    row.total_kills += kills;
    row.total_games += 1;
    if (won) row.total_wins += 1;
    row.best_wave = Math.max(row.best_wave, wave);
    if (newRank !== null) row.rank_id = newRank;
    saveLocalJson();
  }
}

async function recordLeaderboardRun(squadSize, timeSec, players) {
  const n = Math.max(1, Math.min(6, squadSize));
  const t = Math.round(timeSec * 10) / 10;
  const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  if (pool) {
    await pool.query(
      "INSERT INTO leaderboard (squad_size, time_sec, players_json, date_label) VALUES ($1, $2, $3, $4)",
      [n, t, JSON.stringify(players), dateLabel]
    );
    await pool.query(
      `DELETE FROM leaderboard WHERE id IN (
        SELECT id FROM leaderboard WHERE squad_size = $1 ORDER BY time_sec ASC OFFSET 10
      )`,
      [n]
    );
    return;
  }

  mem.leaderboard[n] = mem.leaderboard[n] || [];
  mem.leaderboard[n].push({ t, pl: players, d: dateLabel });
  mem.leaderboard[n].sort((a, b) => a.t - b.t);
  mem.leaderboard[n] = mem.leaderboard[n].slice(0, 10);
  saveLocalJson();
}

async function getLeaderboard() {
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  if (pool) {
    const res = await pool.query("SELECT squad_size, time_sec, players_json, date_label FROM leaderboard ORDER BY time_sec ASC");
    for (const r of res.rows) {
      if (out[r.squad_size] && out[r.squad_size].length < 10) {
        out[r.squad_size].push({ t: r.time_sec, pl: r.players_json, d: r.date_label });
      }
    }
    return out;
  }
  return mem.leaderboard;
}

async function getPatchNotes() {
  if (pool) {
    const res = await pool.query("SELECT version, date_label, is_latest, items_json FROM patch_notes ORDER BY sort_order ASC");
    return res.rows.map(r => ({
      version: r.version,
      date: r.date_label,
      latest: Boolean(r.is_latest),
      items: r.items_json
    }));
  }
  return mem.patch_notes.map(p => ({
    version: p.version,
    date: p.date_label,
    latest: Boolean(p.is_latest),
    items: p.items
  }));
}

async function getEncyclopedia() {
  if (pool) {
    const res = await pool.query("SELECT category, data_json FROM encyclopedia");
    const out = {};
    for (const r of res.rows) out[r.category] = r.data_json;
    return out;
  }
  return mem.encyclopedia;
}

module.exports = {
  initDb,
  verifyToken,
  registerUser,
  loginUser,
  getUserById,
  updateUserSkin,
  recordMatchStats,
  recordLeaderboardRun,
  getLeaderboard,
  getPatchNotes,
  getEncyclopedia
};