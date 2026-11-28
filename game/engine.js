const crypto = require("crypto");
const {
  W, H, DT, MAX_WAVE, PICK_TIMEOUT, RECONNECT_GRACE,
  DIFFICULTIES, RANKS, CLASSES, UPGRADES, BOSSES_INFO, MAP_THEMES
} = require("./constants");
const { offerUpgrades, applyUpgrade } = require("./upgrades");
const {
  dist2, distToSegment2, spawnBoss, spawnEnemy, explodeKamikaze, hitEnemy, triggerNova, updateEnemies
} = require("./entities");

const TAU = Math.PI * 2;
const SPAWNS = [[-56, -34], [56, -34], [-56, 34], [56, 34], [0, -48], [0, 48]];

const nextNeed = (lvl, nPl = 1) => Math.round((7 + lvl * 4.2 + Math.floor(lvl * lvl * 0.38)) * (1 + (Math.max(1, nPl) - 1) * 0.18));
const cleanSkin = raw => Math.max(0, Math.min(CLASSES.length - 1, parseInt(raw, 10) || 0));
const cleanRank = raw => Math.max(0, Math.min(RANKS.length - 1, parseInt(raw, 10) || 0));

function isSkinTaken(r, sk, ignorePlayer) {
  return r.pl.some(p => p !== ignorePlayer && p.skin === sk);
}

function findFreeSkin(r, preferred, ignorePlayer) {
  const pref = cleanSkin(preferred);
  if (!isSkinTaken(r, pref, ignorePlayer)) return pref;
  for (let i = 0; i < CLASSES.length; i++) {
    if (!isSkinTaken(r, i, ignorePlayer)) return i;
  }
  return pref;
}

function buildPlayerStats(skinIdx) {
  const s = {
    hp: 100, maxHp: 100,
    dmg: 1, rate: 1, multi: 1, pierce: 0, speed: 1, magnet: 85, regen: 0,
    orb: 0, orbSpd: 1, orbRad: 62, orbSize: 1.0, orbDmgMult: 1.0,
    crit: 0, critMult: 2.2,
    nova: 0, novaEvery: 5,
    bounce: 0,
    frostR: 0, frostSlow: 0, frostDmg: 0,
    xpMult: 1, armor: 0, dashCd: 1, revivePower: 0,
    drone: 0, lifesteal: 0, corpseExp: 0, projSpd: 1
  };
  CLASSES[cleanSkin(skinIdx)].apply(s);
  return s;
}

function createPlayer(ws, i, profile) {
  const sp = SPAWNS[i % SPAWNS.length];
  const sk = cleanSkin(profile.skin);
  const rk = cleanRank(profile.rank);
  const s = buildPlayerStats(sk);
  return {
    ws, i,
    userId: profile.userId || null,
    rejoinKey: profile.rejoinKey || crypto.randomBytes(12).toString("hex"),
    disconnected: false,
    disconnectTime: 0,
    name: profile.name || `J${i + 1}`,
    skin: sk,
    rank: rk,
    elo: profile.elo || 0,
    eloDelta: 0,
    x: W / 2 + sp[0], y: H / 2 + sp[1], r: 11,
    down: 0, rev: 0, revBy: 0, inv: 0,
    dx: 0, dy: 0, cd: 0, droneCd: 0.6, dc: 0, dsh: 0,
    pend: 0, ch: null, pickTimer: 0, rerolls: 2,
    sc: 0, frostPulses: 0, linked: 0, lsBank: 10,
    inv: Array(UPGRADES.length).fill(0),
    combos: {},
    superCombos: {},
    st: { kills: 0, dmg: 0, taken: 0, revives: 0, gems: 0 },
    S: s
  };
}

function resetRoom(r) {
  Object.assign(r, {
    E: [], B: [], G: [], X: [], ev: [], links: [], fullLink: 0,
    t: 0, eid: 0, frostT: 0, kills: 0, xp: 0, lvl: 1,
    need: nextNeed(1, r.pl.length),
    wave: 0, toSpawn: 0, spawnCd: 0, waveDelay: 0.8,
    paused: false, pausedBy: -1, recorded: false
  });
  r.pl = r.pl.filter(p => !p.disconnected);
  r.pl.forEach((p, i) => {
    Object.assign(p, createPlayer(p.ws, i, {
      userId: p.userId,
      rejoinKey: p.rejoinKey,
      name: p.name,
      skin: p.skin,
      rank: p.rank,
      elo: p.elo
    }));
  });
}

function damagePlayer(r, p, rawDmg) {
  const linkRed = p.linked === 2 ? 0.12 : (p.linked === 1 ? 0.05 : 0);
  const totalRed = Math.min(0.78, (p.S.armor || 0) + linkRed);
  const dmg = rawDmg * (1 - totalRed);
  p.S.hp -= dmg;
  p.inv = 0.75;
  p.st.taken += dmg;
  if (p.i !== undefined) r.ev.push([Math.round(p.x), Math.round(p.y), 11, p.i]);
  if (p.S.hp <= 0) {
    p.S.hp = 0;
    p.down = 1;
    p.rev = 0;
    p.revBy = 0;
  }
}

function getEffectiveDmgMult(p) {
  const linkMult = p.linked === 2 ? 1.25 : (p.linked === 1 ? 1.10 : 1);
  return p.S.dmg * linkMult;
}

function autoPickChoice(r, p) {
  if (!p.ch || !p.ch.length) return;
  applyUpgrade(r, p, p.ch[0]);
  p.inv = Math.max(p.inv, 0.6);
  p.pend = Math.max(0, p.pend - 1);
  if (p.pend > 0) offerUpgrades(p, r.lvl);
  else {
    p.ch = null;
    p.pickTimer = 0;
  }
}

function tickRoom(r, onVictory) {
  if (r.st !== "play" || !r.pl.length) return;

  // Purge des joueurs déconnectés depuis plus de RECONNECT_GRACE secondes
  const now = Date.now();
  const beforeLen = r.pl.length;
  r.pl = r.pl.filter(p => !p.disconnected || (now - p.disconnectTime < RECONNECT_GRACE * 1000));
  if (r.pl.length !== beforeLen) {
    r.pl.forEach((p, idx) => { p.i = idx; });
    if (r.pl.length === 0) return;
  }

  // Décompte automatique de 15 s sur les choix d'améliorations en attente
  for (const p of r.pl) {
    if (p.ch !== null) {
      p.pickTimer -= DT;
      if (p.pickTimer <= 0) {
        autoPickChoice(r, p);
      }
    }
  }

  if (r.paused || r.pl.some(p => p.ch !== null)) return;

  r.t += DT;
  const pl = r.pl;
  const al = pl.filter(p => !p.down);
  const pRate = 1 + (pl.length - 1) * 0.12;
  const diff = DIFFICULTIES[r.diff] || DIFFICULTIES.medium;

  r.links = [];
  for (const p of pl) p.linked = 0;
  const linkDist2 = 205 * 205;
  for (let i = 0; i < al.length; i++) {
    for (let j = i + 1; j < al.length; j++) {
      if (dist2(al[i].x, al[i].y, al[j].x, al[j].y) < linkDist2) {
        al[i].linked = 1; al[j].linked = 1;
        r.links.push([al[i].i, al[j].i]);
      }
    }
  }
  const neededPairs = (pl.length * (pl.length - 1)) / 2;
  r.fullLink = (pl.length >= 2 && al.length === pl.length && r.links.length === neededPairs) ? 1 : 0;
  if (r.fullLink) for (const p of al) p.linked = 2;

  r.frostT -= DT;
  const doFrostTick = r.frostT <= 0;
  if (doFrostTick) r.frostT = 0.5;

  for (const p of al) {
    const full = p.linked === 2;
    const spdMult = full ? 1.08 : 1;
    const regenBonus = full ? 1.2 : (p.linked === 1 ? 0.4 : 0);
    const rateMult = full ? 1.22 : (p.linked === 1 ? 1.12 : 1);

    const l = Math.hypot(p.dx, p.dy);
    const k = l > 1 ? 1 / l : 1;
    const sp = 175 * p.S.speed * spdMult * (p.dsh > 0 ? 3.2 : 1);
    p.x = Math.max(p.r, Math.min(W - p.r, p.x + p.dx * k * sp * DT));
    p.y = Math.max(p.r, Math.min(H - p.r, p.y + p.dy * k * sp * DT));
    p.inv -= DT; p.dsh -= DT; p.dc -= DT;
    p.S.hp = Math.min(p.S.maxHp, p.S.hp + (p.S.regen + regenBonus) * DT);
    p.lsBank = Math.min(12, p.lsBank + 12 * DT);
    p.cd -= DT;

    // Aura de givre : ralentit et déclenche Critiques, Vol de vie et Onde de choc
    if (p.S.frostR > 0) {
      const fr = p.S.frostR;
      const fr2 = fr * fr;
      const baseFrostDmg = Math.max(1.2, (p.S.frostDmg * 0.14) * p.S.dmg);
      let hitCountInZone = 0;

      for (const e of r.E) {
        if (e.hp > 0 && dist2(p.x, p.y, e.x, e.y) <= fr2) {
          e.slow = 0.25;
          e.slowVal = Math.max(e.slowVal, p.S.frostSlow);
          if (doFrostTick) {
            hitCountInZone++;
            const isCrit = p.S.crit > 0 && Math.random() < p.S.crit;
            const dmgDealt = isCrit ? baseFrostDmg * p.S.critMult : baseFrostDmg;
            hitEnemy(r, e, dmgDealt, p.i, isCrit);
          }
        }
      }

      if (doFrostTick && hitCountInZone > 0 && p.S.nova > 0) {
        p.frostPulses = (p.frostPulses + 1) % 256;
        if (p.frostPulses % p.S.novaEvery === 0) {
          triggerNova(r, p.x, p.y, p);
        }
      }
    }

    // Drones autonomes
    if (p.S.drone > 0 && r.E.length) {
      p.droneCd -= DT;
      if (p.droneCd <= 0) {
        p.droneCd = 0.95 / p.S.drone;
        let target = null, bestD2 = 1e9;
        for (const e of r.E) {
          const d2 = dist2(e.x, e.y, p.x, p.y);
          if (d2 < bestD2) { bestD2 = d2; target = e; }
        }
        if (target) {
          const ang = Math.atan2(target.y - (p.y - 16), target.x - p.x);
          const v = 500 * p.S.projSpd;
          r.B.push({
            x: p.x, y: p.y - 16, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
            l: 1.0, p: 0, bn: p.S.bounce, h: [], o: p.i,
            d: getEffectiveDmgMult(p) * 0.72, hv: 0, cr: p.S.crit, cm: p.S.critMult, nv: 0
          });
        }
      }
    }

    // Tir principal
    if (p.cd <= 0 && r.E.length) {
      let n = null, nd = 1e9;
      for (const e of r.E) {
        const d = dist2(e.x, e.y, p.x, p.y);
        if (d < nd) { nd = d; n = e; }
      }
      const an = Math.atan2(n.y - p.y, n.x - p.x);
      const dm = getEffectiveDmgMult(p);
      const hasHeavy = (p.combos[0] || 0) > 0 || Object.keys(p.superCombos).length > 0 || full;
      const bSpd = 460 * p.S.projSpd;
      p.sc = (p.sc + 1) % 256;
      const isNova = (p.S.nova > 0 && (p.sc % p.S.novaEvery === 0)) ? 1 : 0;
      const spread = p.S.multi <= 1 ? 0 : Math.min(0.09, 0.48 / (p.S.multi - 1));

      for (let i = 0; i < p.S.multi; i++) {
        const a = an + (i - (p.S.multi - 1) / 2) * spread;
        r.B.push({
          x: p.x, y: p.y, vx: Math.cos(a) * bSpd, vy: Math.sin(a) * bSpd,
          l: 1.15 * Math.max(1, p.S.projSpd * 0.9), p: p.S.pierce, bn: p.S.bounce,
          h: [], o: p.i, d: dm, hv: hasHeavy ? 1 : 0,
          cr: p.S.crit, cm: p.S.critMult, nv: (i === 0 ? isNova : 0)
        });
      }
      r.ev.push([Math.round(p.x), Math.round(p.y), 10, p.i]);
      p.cd = 0.52 / (p.S.rate * rateMult);
    }
  }

  // Projectiles joueurs (collision continue par segment)
  const bounceMax2 = 245 * 245;
  for (const b of r.B) {
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.l -= DT;
    if (b.l <= 0) continue;

    for (const e of r.E) {
      if (b.l <= 0 || e.hp <= 0) break;
      if (b.h.indexOf(e.id) !== -1) continue;
      const rad = e.r + 5;
      if (distToSegment2(prevX, prevY, b.x, b.y, e.x, e.y) > rad * rad) continue;

      const isCrit = b.cr > 0 && Math.random() < b.cr;
      hitEnemy(r, e, isCrit ? b.d * b.cm : b.d, b.o, isCrit);
      b.h.push(e.id);

      if (b.nv) {
        b.nv = 0;
        const owner = pl[b.o];
        if (owner) triggerNova(r, e.x, e.y, owner);
      }

      if (b.bn > 0) {
        let nextT = null, bestD2 = bounceMax2;
        for (const cand of r.E) {
          if (cand.hp <= 0 || b.h.indexOf(cand.id) !== -1) continue;
          const d2 = dist2(e.x, e.y, cand.x, cand.y);
          if (d2 < bestD2) { bestD2 = d2; nextT = cand; }
        }
        if (nextT) {
          b.bn--;
          b.x = e.x;
          b.y = e.y;
          const ang = Math.atan2(nextT.y - e.y, nextT.x - e.x);
          const spd = Math.hypot(b.vx, b.vy) || 460;
          b.vx = Math.cos(ang) * spd;
          b.vy = Math.sin(ang) * spd;
          b.l = Math.max(b.l, 0.55);
          break;
        }
      }
      if (--b.p < 0) b.l = 0;
    }
  }
  r.B = r.B.filter(b => b.l > 0);

  updateEnemies(r, al, pRate, (t, rawDmg) => damagePlayer(r, t, rawDmg));

  r.E = r.E.filter(e => {
    if (e.hp > 0) return true;
    r.kills++;
    r.G.push({ x: e.x, y: e.y, v: e.xp });
    r.ev.push([Math.round(e.x), Math.round(e.y), e.k]);
    if (e.k === 6) explodeKamikaze(r, e);
    if (e.k === 4) {
      for (const p of pl) {
        p.pend++;
        p.rerolls = Math.min(5, (p.rerolls || 0) + 1);
        if (!p.ch) offerUpgrades(p, r.lvl);
        if (p.down) { p.down = 0; p.rev = 0; p.revBy = 0; p.inv = 4.0; }
        p.S.hp = Math.min(p.S.maxHp, Math.max(p.S.hp, p.S.maxHp * 0.5) + p.S.maxHp * 0.35);
      }
    }
    return false;
  });

  // Réanimation avec immunité
  const revRad2 = 62 * 62;
  for (const d of pl) if (d.down) {
    const helpers = al.filter(p => !p.down && !p.disconnected && dist2(p.x, p.y, d.x, d.y) < revRad2);
    if (helpers.length > 0) {
      let revBonus = 1 + (helpers.length - 1) * 0.85;
      for (const h of helpers) revBonus += (h.S.revivePower || 0);
      d.rev += DT * revBonus;
      d.revBy = helpers.length;
    } else {
      d.rev = Math.max(0, d.rev - DT * 0.5);
      d.revBy = 0;
    }
    if (d.rev >= 2.2) {
      d.down = 0; d.S.hp = d.S.maxHp * 0.65; d.inv = 4.0; d.rev = 0; d.revBy = 0;
      for (const h of helpers) { h.st.revives++; h.inv = Math.max(h.inv, 1.2); }
    }
  }
  if (pl.every(p => p.down)) { r.st = "over"; return; }

  // Gestion des vagues
  if (r.toSpawn > 0) {
    r.spawnCd -= DT;
    if (r.spawnCd <= 0) {
      spawnEnemy(r);
      r.toSpawn--;
      r.spawnCd = Math.max(0.08, (0.40 - r.wave * 0.005) / (1 + (pl.length - 1) * 0.18));
    }
  } else if (r.E.length === 0) {
    if (r.wave >= MAX_WAVE) {
      r.st = "win";
      if (onVictory) onVictory(r);
      return;
    }
    r.waveDelay -= DT;
    if (r.waveDelay <= 0) {
      const wasBoss = (r.wave > 0 && r.wave % 5 === 0);
      r.wave++;
      r.waveDelay = wasBoss ? 5.5 : 4.5;
      if (r.wave >= 45 && r.wave <= 50) {
        const multBoss = 1 + (pl.length - 1) * 0.48;
        const bossCount = r.wave === 50 ? 5 : Math.min(4, 2 + Math.floor((r.wave - 45) / 2));
        const order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
        for (let bi = 0; bi < bossCount; bi++) spawnBoss(r, order[bi % 5]);
        r.toSpawn = Math.round((10 + r.wave * 0.6) * multBoss);
      } else if (r.wave % 5 === 0) {
        spawnBoss(r);
        r.toSpawn = Math.round((6 + r.wave * 0.8) * (1 + (pl.length - 1) * 0.48));
      } else {
        r.toSpawn = Math.round((5 + r.wave * 1.85) * (1 + (pl.length - 1) * 0.32));
      }
      r.spawnCd = 0.12;
    }
  }

  // Lames orbitales massives et éloignées
  const live = pl.filter(p => !p.down);
  for (const p of live) if (p.S.orb > 0) {
    const orbRad = p.S.orbRad || 62;
    const hitPad = 12 * (p.S.orbSize || 1.0);
    const bladeDmg = 2.4 * getEffectiveDmgMult(p) * (p.S.orbDmgMult || 1.0);
    for (let k = 0; k < p.S.orb; k++) {
      const a = r.t * 3.1 * p.S.orbSpd + k * TAU / p.S.orb;
      const bx = p.x + Math.cos(a) * orbRad;
      const by = p.y + Math.sin(a) * orbRad;
      for (const e of r.E) if (!(e.bc > 0) && e.hp > 0) {
        const rad = e.r + hitPad;
        if (dist2(e.x, e.y, bx, by) < rad * rad) {
          const isCrit = p.S.crit > 0 && Math.random() < p.S.crit;
          hitEnemy(r, e, isCrit ? bladeDmg * p.S.critMult : bladeDmg, p.i, isCrit);
          e.bc = 0.18;
        }
      }
    }
  }
  for (const e of r.E) e.bc -= DT;

  // Projectiles ennemis
  r.X = r.X.filter(b => {
    b.x += b.vx * DT; b.y += b.vy * DT; b.l -= DT;
    if (b.l <= 0) return false;
    for (const p of live) if (p.inv <= 0) {
      const rad = p.r + 5;
      if (dist2(p.x, p.y, b.x, b.y) < rad * rad) { damagePlayer(r, p, b.d || 10); return false; }
    }
    return true;
  });

  // Gemmes d'XP
  r.G = r.G.filter(g => {
    let n = null, nd2 = 1e12;
    for (const p of live) {
      if (p.disconnected) continue;
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (d2 < nd2) { nd2 = d2; n = p; }
    }
    if (!n) return true;
    const pull = r.E.length === 0 && r.toSpawn === 0 ? 190 : n.S.magnet;
    if (nd2 < pull * pull) {
      const d = Math.sqrt(nd2) || 1;
      g.x += (n.x - g.x) / d * 340 * DT;
      g.y += (n.y - g.y) / d * 340 * DT;
    }
    const pickR = n.r + 6;
    if (nd2 < pickR * pickR) {
      r.xp += g.v * 1.15 * n.S.xpMult * diff.xpMult;
      n.st.gems++;
      r.ev.push([Math.round(n.x), Math.round(n.y), 12, n.i]);
      while (r.xp >= r.need) {
        r.xp -= r.need; r.lvl++; r.need = nextNeed(r.lvl, pl.length);
        for (const p of pl) { p.pend++; if (p.ch === null) offerUpgrades(p, r.lvl); }
      }
      return false;
    }
    return true;
  });
}

function buildSnapshot(r, leaderboard) {
  const R = Math.round;
  const lvlPz = r.pl.some(p => p.ch !== null) ? 1 : 0;
  const pz = (lvlPz || r.paused) ? 1 : 0;
  const bosses = r.E.filter(e => e.k === 4);
  let bName = "", bHp = 0;

  if (bosses.length === 1) {
    bName = BOSSES_INFO[bosses[0].bk].name;
    bHp = R(bosses[0].hp / bosses[0].mh * 100);
  } else if (bosses.length > 1) {
    const cur = bosses.reduce((s, e) => s + Math.max(0, e.hp), 0);
    const tot = bosses.reduce((s, e) => s + e.mh, 0);
    bName = `${bosses.length} BOSS (${bosses.map(b => BOSSES_INFO[b.bk].name).join(" · ")})`;
    bHp = tot > 0 ? R(cur / tot * 100) : 0;
  }

  const ended = (r.st === "over" || r.st === "win");
  const wd = (r.E.length === 0 && r.toSpawn === 0 && r.wave > 0 && r.wave < MAX_WAVE) ? Math.max(0, R(r.waveDelay * 10) / 10) : 0;
  const theme = r.wave > 0 ? Math.floor((r.wave - 1) / 10) % MAP_THEMES.length : 0;

  const shared = {
    t: "s", st: r.st, code: r.code, diff: r.diff || "medium", n: r.pl.length, th: theme,
    names: r.pl.map(p => p.name), skins: r.pl.map(p => p.skin), ranks: r.pl.map(p => p.rank),
    tm: R(r.t * 10) / 10, k: r.kills, l: r.lvl, xp: R(r.xp * 10) / 10, nd: r.need,
    lks: r.links, flk: r.fullLink, wv: r.wave, mw: MAX_WAVE,
    rem: r.E.length + r.toSpawn, wd, pz, mpz: r.paused ? 1 : 0, pby: r.pausedBy,
    bn: bName, bh: bHp, lb: ended ? leaderboard : null,
    stats: r.pl.map(p => ({
      i: p.i, name: p.name, skin: p.skin, rank: p.rank, elo: p.elo || 0, eloDelta: p.eloDelta || 0,
      kills: p.st.kills, dmg: R(p.st.dmg), taken: R(p.st.taken), rev: p.st.revives, gems: p.st.gems,
      cmb: Object.entries(p.combos).map(([id, lvl]) => ({ id: Number(id), lvl })),
      sup: Object.keys(p.superCombos).map(id => ({ id: Number(id) }))
    })),
    p: r.pl.map(p => [
      R(p.x), R(p.y), R(p.S.hp), R(p.S.maxHp), p.down, R(p.rev * 100) / 100, p.inv > 0 ? 1 : 0, p.pend,
      R(p.S.magnet), R(Math.max(0, p.dc) * 10) / 10, p.S.orb, p.ch !== null ? 1 : 0,
      p.dsh > 0 ? 1 : 0, p.sc, R(p.S.orbSpd * 100) / 100, p.linked, p.skin, p.revBy || 0,
      R(p.S.frostR), p.st.kills, p.rank, p.S.drone,
      R(p.S.orbRad || 62), R((p.S.orbSize || 1.0) * 100) / 100, p.disconnected ? 1 : 0
    ]),
    E: r.E.map(e => [R(e.x), R(e.y), e.k, R(e.hp / e.mh * 100), e.bk || 0, (e.dash > 0 || e.windup > 0 || e.spiral > 0) ? 1 : 0, e.slow > 0 ? 1 : 0]),
    B: r.B.map(x => [R(x.x), R(x.y), R(x.vx), R(x.vy), x.o, x.hv || 0]),
    G: r.G.map(g => [R(g.x), R(g.y)]),
    X: r.X.map(x => [R(x.x), R(x.y)]),
    oa: R(r.t * 310) / 100, ev: r.ev
  };
  r.ev = [];

  const sharedPrefix = JSON.stringify(shared).slice(0, -1);
  for (const p of r.pl) if (p.ws && p.ws.readyState === 1 && !p.disconnected) {
    const full = p.linked === 2;
    const rateM = full ? 1.22 : (p.linked === 1 ? 1.12 : 1);
    const linkRed = full ? 0.12 : (p.linked === 1 ? 0.05 : 0);
    const regenBonus = full ? 1.2 : (p.linked === 1 ? 0.4 : 0);
    const dmgEff = getEffectiveDmgMult(p);
    const personal = JSON.stringify({
      me: p.i, myRank: p.rank, myElo: p.elo || 0, rjKey: p.rejoinKey,
      inv: p.inv,
      cmb: Object.entries(p.combos).map(([id, lvl]) => ({ id: Number(id), lvl })),
      sup: Object.keys(p.superCombos).map(id => ({ id: Number(id) })),
      rr: p.rerolls || 0,
      pt: p.ch ? Math.max(0, Math.ceil(p.pickTimer)) : 0,
      stMe: {
        hp: R(p.S.hp), maxHp: R(p.S.maxHp),
        dmg: R(dmgEff * 100) / 100,
        rate: R((p.S.rate * rateM / 0.52) * 10) / 10,
        multi: p.S.multi,
        pierce: p.S.pierce,
        bounce: p.S.bounce,
        crit: Math.min(95, R(p.S.crit * 100)),
        critMult: R(p.S.critMult * 10) / 10,
        speed: R(p.S.speed * (full ? 1.08 : 1) * 100),
        armor: Math.min(78, R((p.S.armor + linkRed) * 100)),
        regen: R((p.S.regen + regenBonus) * 10) / 10,
        lifesteal: R(p.S.lifesteal * 1000) / 10,
        magnet: R(p.S.magnet),
        orb: p.S.orb,
        orbRad: R(p.S.orbRad || 62),
        orbDmg: R((p.S.orbDmgMult || 1) * 100),
        orbSpd: R(p.S.orbSpd * 100),
        nova: p.S.nova,
        novaEvery: p.S.novaEvery,
        frostR: R(p.S.frostR),
        frostSlow: p.S.frostR > 0 ? R(p.S.frostSlow * 100) : 0,
        corpseExp: R(p.S.corpseExp * 100),
        projSpd: R(p.S.projSpd * 100),
        xpMult: R(p.S.xpMult * 100),
        drone: p.S.drone
      },
      ch: p.ch
    }).slice(1);
    p.ws.send(`${sharedPrefix},${personal}`);
  }
}

module.exports = {
  isSkinTaken, findFreeSkin, buildPlayerStats,
  createPlayer, resetRoom, tickRoom, buildSnapshot
};