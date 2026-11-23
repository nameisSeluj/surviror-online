const {
  W, H, DT, TAU, MAX_WAVE, SPAWNS, RANKS, CLASSES, UPGRADES, BOSSES_INFO
} = require("./constants");
const { offerUpgrades, getComboHint } = require("./upgrades");
const {
  dist2, spawnBoss, spawnEnemy, explodeKamikaze, hitEnemy, triggerNova, updateEnemies
} = require("./entities");

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
  const p = {
    max: 100,
    hp: 100,
    S: {
      dmg: 1, rate: 1, multi: 1, pierce: 0, speed: 1, magnet: 1, regen: 0,
      orb: 0, orbSpd: 1, gemHeal: 0, crit: 0, critMult: 2.2,
      nova: 0, novaEvery: 6, novaPow: 1, novaRad: 1, bounce: 0,
      frost: 0, frostSlow: 0.35, frostRad: 1,
      xpMult: 1, armor: 0, dashCd: 1, berserk: 0, revSpd: 0, soul: 0,
      drone: 0, lifesteal: 0, corpseExp: 0, projSpd: 1
    }
  };
  CLASSES[cleanSkin(skinIdx)].apply(p);
  return p;
}

function createPlayer(ws, i, profile) {
  const sp = SPAWNS[i % SPAWNS.length];
  const sk = cleanSkin(profile.skin);
  const rk = cleanRank(profile.rank);
  const base = buildPlayerStats(sk);
  return {
    ws, i,
    userId: profile.userId || null,
    name: profile.name || `J${i + 1}`,
    skin: sk, rank: rk, oldRank: rk, promoted: false,
    x: W / 2 + sp[0], y: H / 2 + sp[1], r: 11,
    hp: base.hp, max: base.max,
    down: 0, rev: 0, revBy: 0, inv: 0,
    dx: 0, dy: 0, cd: 0, droneCd: 0.6, dc: 0, dsh: 0,
    pend: 0, ch: null, sc: 0, linked: 0, lsBank: 4.5,
    invList: Array(UPGRADES.length).fill(0),
    fusedLvl: Array(10).fill(0),
    combos: [], supers: [],
    st: { kills: 0, dmg: 0, taken: 0, revives: 0, gems: 0 },
    S: base.S
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
  r.pl.forEach((p, i) => {
    Object.assign(p, createPlayer(p.ws, i, {
      userId: p.userId, name: p.name, skin: p.skin, rank: p.rank
    }));
  });
}

function damagePlayer(p, rawDmg) {
  const linkRed = p.linked === 2 ? 0.12 : (p.linked === 1 ? 0.05 : 0);
  const totalRed = Math.min(0.65, (p.S.armor || 0) + linkRed);
  const dmg = rawDmg * (1 - totalRed);
  p.hp -= dmg;
  p.inv = 0.75;
  p.st.taken += dmg;
  if (p.hp <= 0) { p.hp = 0; p.down = 1; p.rev = 0; p.revBy = 0; }
}

function getEffectiveDmgMult(p) {
  const linkMult = p.linked === 2 ? 1.25 : (p.linked === 1 ? 1.10 : 1);
  const berserkMult = (p.S.berserk && p.hp < p.max * 0.5) ? 1.13 : 1;
  return p.S.dmg * linkMult * berserkMult;
}

function tickRoom(r, onVictory) {
  if (r.st !== "play" || !r.pl.length) return;
  if (r.paused || r.pl.some(p => p.ch !== null)) return;

  r.t += DT;
  const pl = r.pl;
  const al = pl.filter(p => !p.down);
  const pRate = 1 + (pl.length - 1) * 0.12;

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
    p.hp = Math.min(p.max, p.hp + (p.S.regen + regenBonus) * DT);
    p.lsBank = Math.min(4.5, p.lsBank + 4.5 * DT);
    p.cd -= DT;

    // Aura de givre
    if (p.S.frost > 0) {
      const fr = (92 + p.S.frost * 22) * p.S.frostRad;
      const fr2 = fr * fr;
      const fDmg = 0.55 * p.S.dmg * p.S.frost;
      for (const e of r.E) {
        if (dist2(p.x, p.y, e.x, e.y) <= fr2) {
          e.slow = 0.2;
          e.slowVal = Math.max(e.slowVal, p.S.frostSlow);
          if (doFrostTick) hitEnemy(r, e, fDmg, p.i, false);
        }
      }
    }

    // Drone autonome (classe Ingénieur)
    if (p.S.drone > 0 && r.E.length) {
      p.droneCd -= DT;
      if (p.droneCd <= 0) {
        p.droneCd = 1.05 / p.S.drone;
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
            d: getEffectiveDmgMult(p) * 0.65, hv: 0, cr: p.S.crit, cm: p.S.critMult, nv: 0
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
      const hasHeavy = p.combos.some(c => c.id === 0) || p.supers.length > 0 || full;
      const bSpd = 460 * p.S.projSpd;
      p.sc = (p.sc + 1) % 256;
      const isNova = (p.S.nova > 0 && (p.sc % p.S.novaEvery === 0)) ? 1 : 0;

      for (let i = 0; i < p.S.multi; i++) {
        const a = an + (i - (p.S.multi - 1) / 2) * 0.18;
        r.B.push({
          x: p.x, y: p.y, vx: Math.cos(a) * bSpd, vy: Math.sin(a) * bSpd,
          l: 1.1 * Math.max(1, p.S.projSpd * 0.9), p: p.S.pierce, bn: p.S.bounce,
          h: [], o: p.i, d: dm, hv: hasHeavy ? 1 : 0,
          cr: p.S.crit, cm: p.S.critMult, nv: (i === 0 ? isNova : 0)
        });
      }
      p.cd = 0.52 / (p.S.rate * rateMult);
    }
  }

  // Projectiles joueurs
  const bounceMax2 = 235 * 235;
  for (const b of r.B) {
    b.x += b.vx * DT; b.y += b.vy * DT; b.l -= DT;
    if (b.l <= 0) continue;
    for (const e of r.E) {
      if (b.l <= 0 || e.hp <= 0) break;
      if (b.h.indexOf(e.id) !== -1) continue;
      const rad = e.r + 4;
      if (dist2(e.x, e.y, b.x, b.y) >= rad * rad) continue;

      const isCrit = b.cr > 0 && Math.random() < b.cr;
      hitEnemy(r, e, isCrit ? b.d * b.cm : b.d, b.o, isCrit);
      b.h.push(e.id);

      if (b.nv) {
        b.nv = 0;
        const owner = pl[b.o];
        if (owner) triggerNova(r, b.x, b.y, owner);
      }

      if (b.bn > 0) {
        let nextT = null, bestD2 = bounceMax2;
        for (const cand of r.E) {
          if (cand.hp <= 0 || b.h.indexOf(cand.id) !== -1) continue;
          const d2 = dist2(b.x, b.y, cand.x, cand.y);
          if (d2 < bestD2) { bestD2 = d2; nextT = cand; }
        }
        if (nextT) {
          b.bn--;
          const ang = Math.atan2(nextT.y - b.y, nextT.x - b.x);
          const spd = Math.hypot(b.vx, b.vy) || 460;
          b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
          b.l = Math.max(b.l, 0.55);
          break;
        }
      }
      if (--b.p < 0) b.l = 0;
    }
  }
  r.B = r.B.filter(b => b.l > 0);

  updateEnemies(r, al, pRate, damagePlayer);

  r.E = r.E.filter(e => {
    if (e.hp > 0) return true;
    r.kills++;
    r.G.push({ x: e.x, y: e.y, v: e.xp });
    r.ev.push([Math.round(e.x), Math.round(e.y), e.k]);
    if (e.k === 6) explodeKamikaze(r, e);
    if (e.k === 4) {
      for (const p of pl) {
        p.pend++;
        if (!p.ch) offerUpgrades(p, r.lvl);
        if (p.down) { p.down = 0; p.rev = 0; p.revBy = 0; p.inv = 4.0; }
        p.hp = Math.min(p.max, Math.max(p.hp, p.max * 0.5) + p.max * 0.35);
      }
    }
    return false;
  });

  // Réanimation avec immunité
  const revRad2 = 62 * 62;
  for (const d of pl) if (d.down) {
    const helpers = al.filter(p => !p.down && dist2(p.x, p.y, d.x, d.y) < revRad2);
    if (helpers.length > 0) {
      let revBonus = 1 + (helpers.length - 1) * 0.85;
      for (const h of helpers) revBonus += h.S.revSpd;
      d.rev += DT * revBonus;
      d.revBy = helpers.length;
    } else {
      d.rev = Math.max(0, d.rev - DT * 0.5);
      d.revBy = 0;
    }
    if (d.rev >= 2.2) {
      d.down = 0; d.hp = d.max * 0.65; d.inv = 4.0; d.rev = 0; d.revBy = 0;
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

  // Lames orbitales
  const live = pl.filter(p => !p.down);
  for (const p of live) if (p.S.orb) {
    for (let k = 0; k < p.S.orb; k++) {
      const a = r.t * 3 * p.S.orbSpd + k * TAU / p.S.orb;
      const bx = p.x + Math.cos(a) * 46;
      const by = p.y + Math.sin(a) * 46;
      for (const e of r.E) if (!(e.bc > 0)) {
        const rad = e.r + 7;
        if (dist2(e.x, e.y, bx, by) < rad * rad) {
          hitEnemy(r, e, 1.3 * p.S.dmg, p.i, false);
          e.bc = 0.28;
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
      if (dist2(p.x, p.y, b.x, b.y) < rad * rad) { damagePlayer(p, b.d || 10); return false; }
    }
    return true;
  });

  // Gemmes d'XP
  r.G = r.G.filter(g => {
    let n = null, nd2 = 1e12;
    for (const p of live) { const d2 = dist2(g.x, g.y, p.x, p.y); if (d2 < nd2) { nd2 = d2; n = p; } }
    if (!n) return true;
    const pull = r.E.length === 0 && r.toSpawn === 0 ? 190 : 85 * n.S.magnet;
    if (nd2 < pull * pull) {
      const d = Math.sqrt(nd2) || 1;
      g.x += (n.x - g.x) / d * 340 * DT;
      g.y += (n.y - g.y) / d * 340 * DT;
    }
    const pickR = n.r + 6;
    if (nd2 < pickR * pickR) {
      r.xp += g.v * 1.15 * n.S.xpMult;
      n.st.gems++;
      if (n.S.gemHeal) n.hp = Math.min(n.max, n.hp + n.S.gemHeal);
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

  const shared = {
    t: "s", st: r.st, code: r.code, n: r.pl.length,
    names: r.pl.map(p => p.name), skins: r.pl.map(p => p.skin), ranks: r.pl.map(p => p.rank),
    tm: R(r.t * 10) / 10, k: r.kills, l: r.lvl, xp: R(r.xp * 10) / 10, nd: r.need,
    lks: r.links, flk: r.fullLink, wv: r.wave, mw: MAX_WAVE,
    rem: r.E.length + r.toSpawn, wd, pz, mpz: r.paused ? 1 : 0, pby: r.pausedBy,
    bn: bName, bh: bHp, lb: ended ? leaderboard : null,
    stats: r.pl.map(p => ({
      i: p.i, name: p.name, skin: p.skin, rank: p.rank, oldRank: p.oldRank, promoted: p.promoted,
      kills: p.st.kills, dmg: R(p.st.dmg), taken: R(p.st.taken), rev: p.st.revives, gems: p.st.gems,
      cmb: p.combos, sup: p.supers
    })),
    p: r.pl.map(p => [
      R(p.x), R(p.y), R(p.hp), p.max, p.down, R(p.rev * 100) / 100, p.inv > 0 ? 1 : 0, p.pend,
      R(85 * p.S.magnet), R(Math.max(0, p.dc) * 10) / 10, p.S.orb, p.ch !== null ? 1 : 0,
      p.dsh > 0 ? 1 : 0, p.sc, p.S.orbSpd, p.linked, p.skin, p.revBy || 0,
      p.S.frost > 0 ? R((92 + p.S.frost * 22) * p.S.frostRad) : 0, p.st.kills, p.rank, p.S.drone
    ]),
    E: r.E.map(e => [R(e.x), R(e.y), e.k, R(e.hp / e.mh * 100), e.bk || 0, (e.dash > 0 || e.windup > 0 || e.spiral > 0) ? 1 : 0, e.slow > 0 ? 1 : 0]),
    B: r.B.map(x => [R(x.x), R(x.y), R(x.vx), R(x.vy), x.o, x.hv || 0]),
    G: r.G.map(g => [R(g.x), R(g.y)]),
    X: r.X.map(x => [R(x.x), R(x.y)]),
    oa: R(r.t * 300) / 100, ev: r.ev
  };
  r.ev = [];

  const sharedPrefix = JSON.stringify(shared).slice(0, -1);
  for (const p of r.pl) if (p.ws.readyState === 1) {
    const full = p.linked === 2;
    const rateM = full ? 1.22 : (p.linked === 1 ? 1.12 : 1);
    const dmgEff = getEffectiveDmgMult(p);
    const personal = JSON.stringify({
      me: p.i, myRank: p.rank, inv: p.invList, cmb: p.combos, sup: p.supers,
      stMe: {
        dmg: R(dmgEff * 100) / 100,
        rate: R((p.S.rate * rateM / 0.52) * 10) / 10,
        multi: p.S.multi,
        pierce: p.S.pierce
      },
      ch: p.ch ? p.ch.map(c => [c.u, UPGRADES[c.u].title(c.r), UPGRADES[c.u].desc(c.r), getComboHint(p, c.u), c.r]) : null
    }).slice(1);
    p.ws.send(`${sharedPrefix},${personal}`);
  }
}

module.exports = {
  nextNeed, isSkinTaken, findFreeSkin, buildPlayerStats,
  createPlayer, resetRoom, tickRoom, buildSnapshot
};