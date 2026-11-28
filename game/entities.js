const { W, H, DT, DIFFICULTIES } = require("./constants");

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

function distToSegment2(ax, ay, bx, by, px, py) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return wx * wx + wy * wy;
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) {
    const dx = px - bx;
    const dy = py - by;
    return dx * dx + dy * dy;
  }
  const t = c1 / c2;
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

const bossHpScale = w => (1 + (Math.max(1, w) - 1) * 0.09) * Math.pow(1.55, Math.floor((Math.max(1, w) - 1) / 5));
const bossDmgScale = w => (1 + (Math.max(1, w) - 1) * 0.06) * Math.pow(1.24, Math.floor((Math.max(1, w) - 1) / 5));
const mobHpScale = w => (1 + (Math.max(1, w) - 1) * 0.038) * Math.pow(1.34, Math.floor((Math.max(1, w) - 1) / 5));
const mobDmgScale = w => (1 + (Math.max(1, w) - 1) * 0.02) * Math.pow(1.12, Math.floor((Math.max(1, w) - 1) / 5));

function edgePos(m) {
  const a = Math.random() * 4;
  if (a < 1) return [rnd(40, W - 40), -m];
  if (a < 2) return [W + m, rnd(40, H - 40)];
  if (a < 3) return [rnd(40, W - 40), H + m];
  return [-m, rnd(40, H - 40)];
}

function shootEnemyBullet(r, x, y, vx, vy, dmg, l = 3.4) {
  r.X.push({ x, y, vx, vy, d: dmg, l });
}

function spawnBoss(r, forcedType) {
  const w = r.wave;
  const diff = DIFFICULTIES[r.diff] || DIFFICULTIES.medium;
  const pCount = r.pl.length;
  const nHp = (1 + (pCount - 1) * 0.55) * diff.hpMult;
  const nDmg = (1 + (pCount - 1) * 0.18) * diff.dmgMult;
  const scHp = bossHpScale(w);
  const scDmg = bossDmgScale(w);
  const bType = forcedType !== undefined ? forcedType : Math.floor((w / 5 - 1) % 5);
  const [x, y] = edgePos(32);

  const e = {
    id: ++r.eid, k: 4, bk: bType, r: 30, xp: 15 + Math.floor(w / 2),
    d: 26 * nDmg * scDmg, bd: 13 * nDmg * scDmg,
    sh: 2.0, sp2: 3.2, sp3: 5.5, dash: 0, chain: 0, windup: 0, spiral: 0,
    healCount: 0, vx: 0, vy: 0, slow: 0, slowVal: 0
  };

  if (bType === 0) { e.hp = (145 + w * 24) * nHp * scHp; e.sp = 38 * diff.spdMult; e.r = 32; e.d = 30 * nDmg * scDmg; }
  else if (bType === 1) { e.hp = (120 + w * 20) * nHp * scHp; e.sp = 64 * diff.spdMult; e.r = 26; e.d = 24 * nDmg * scDmg; }
  else if (bType === 2) {
    e.hp = (130 + w * 21) * nHp * scHp;
    e.sp = 34 * diff.spdMult;
    e.r = 28;
    e.bd = 7.5 * nDmg * scDmg;
  }
  else if (bType === 3) { e.hp = (160 + w * 25) * nHp * scHp; e.sp = 30 * diff.spdMult; e.r = 34; }
  else { e.hp = (200 + w * 30) * nHp * scHp; e.sp = 42 * diff.spdMult; e.r = 36; e.d = 34 * nDmg * scDmg; e.bd = 15 * nDmg * scDmg; }

  e.x = x; e.y = y; e.mh = e.hp; e.bc = 0;
  r.E.push(e);
}

function spawnEnemy(r) {
  const w = r.wave;
  const diff = DIFFICULTIES[r.diff] || DIFFICULTIES.medium;
  const pCount = r.pl.length;
  const nHp = (1 + (pCount - 1) * 0.32) * diff.hpMult;
  const nDmg = (1 + (pCount - 1) * 0.09) * diff.dmgMult;
  const scHp = mobHpScale(w);
  const scDmg = mobDmgScale(w);
  const [x, y] = edgePos(28);

  const pool = [0, 0, 0];
  if (w >= 2) pool.push(1, 1);
  if (w >= 4) pool.push(3, 3);
  if (w >= 5) pool.push(2);
  if (w >= 6) pool.push(5, 5);
  if (w >= 8) pool.push(6, 6);
  if (w >= 11) pool.push(7, 7);
  if (w >= 14) pool.push(8, 8);
  if (w >= 18) pool.push(9);

  const k = pool[Math.floor(Math.random() * pool.length)];
  let e;
  if (k === 1) e = { k: 1, r: 8, hp: (1.3 + w * 0.20) * nHp * scHp, sp: 100, xp: 1, d: 6 * nDmg * scDmg };
  else if (k === 2) e = { k: 2, r: 17, hp: (7.5 + w * 1.05) * nHp * scHp, sp: 41, xp: 3, d: 13 * nDmg * scDmg };
  else if (k === 3) e = { k: 3, r: 10, hp: (2.3 + w * 0.36) * nHp * scHp, sp: 52, xp: 2, d: 6 * nDmg * scDmg, bd: 8 * nDmg * scDmg, sh: 2.2 };
  else if (k === 5) e = { k: 5, r: 10, hp: (2.5 + w * 0.38) * nHp * scHp, sp: 64, xp: 2, d: 8 * nDmg * scDmg, tp: 2.7 };
  else if (k === 6) e = { k: 6, r: 9, hp: (1.6 + w * 0.22) * nHp * scHp, sp: 110, xp: 2, d: 12 * nDmg * scDmg, bd: 8 * nDmg * scDmg };
  else if (k === 7) e = { k: 7, r: 13, hp: (4.6 + w * 0.68) * nHp * scHp, sp: 45, xp: 2, d: 13 * nDmg * scDmg, chg: 2.8, dash: 0, vx: 0, vy: 0 };
  else if (k === 8) e = { k: 8, r: 12, hp: (3.8 + w * 0.55) * nHp * scHp, sp: 43, xp: 2, d: 8 * nDmg * scDmg, bd: 8.5 * nDmg * scDmg, sh: 2.6 };
  else if (k === 9) e = { k: 9, r: 13, hp: (5.0 + w * 0.72) * nHp * scHp, sp: 38, xp: 3, d: 7 * nDmg * scDmg, sum: 3.8 };
  else e = { k: 0, r: 11, hp: (1.9 + w * 0.33) * nHp * scHp, sp: 62 + Math.min(w * 1.3, 28), xp: 1, d: 7 * nDmg * scDmg };

  e.sp *= diff.spdMult;
  e.id = ++r.eid; e.x = x; e.y = y; e.mh = e.hp; e.bc = 0; e.slow = 0; e.slowVal = 0;
  r.E.push(e);
}

function explodeKamikaze(r, e) {
  const diff = DIFFICULTIES[r.diff] || DIFFICULTIES.medium;
  r.ev.push([Math.round(e.x), Math.round(e.y), 6]);
  const bd = e.bd || 8 * mobDmgScale(r.wave) * diff.dmgMult;
  for (let i = 0; i < 6; i++) {
    const a = i * 1.0472;
    shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195, bd, 2.4);
  }
}

function triggerCorpseExplosion(r, x, y, owner, victimMaxHp = 10) {
  const rad = 72;
  const r2 = rad * rad;
  const dmg = Math.max(owner.S.dmg * owner.S.corpseExp, victimMaxHp * owner.S.corpseExp * 0.35);
  r.ev.push([Math.round(x), Math.round(y), 7, rad]);
  for (const e of r.E) {
    if (e.hp > 0 && dist2(x, y, e.x, e.y) <= r2) {
      hitEnemy(r, e, dmg, owner.i, false, true);
    }
  }
}

function hitEnemy(r, e, dmg, ownerIdx, isCrit, fromExplosion = false) {
  const dealt = Math.min(Math.max(0, e.hp), dmg);
  e.hp -= dmg;
  if (isCrit) r.ev.push([Math.round(e.x), Math.round(e.y), 8, Math.round(dmg)]);

  const owner = r.pl[ownerIdx];
  if (!owner) return;

  owner.st.dmg += dealt;
  if (owner.S.lifesteal > 0 && owner.lsBank > 0 && dealt > 0) {
    const heal = Math.min(owner.lsBank, dealt * owner.S.lifesteal);
    owner.lsBank -= heal;
    owner.S.hp = Math.min(owner.S.maxHp, owner.S.hp + heal);
  }

  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    owner.st.kills++;
    if (!fromExplosion && owner.S.corpseExp > 0) {
      triggerCorpseExplosion(r, e.x, e.y, owner, e.mh);
    }
  }
}

function triggerNova(r, x, y, owner) {
  const rad = Math.round(88 + owner.S.nova * 22);
  const r2 = rad * rad;
  const dmg = owner.S.dmg * (1.5 + 0.65 * owner.S.nova);
  r.ev.push([Math.round(x), Math.round(y), 7, rad]);
  for (const e of r.E) {
    if (e.hp > 0 && dist2(x, y, e.x, e.y) <= r2) {
      const isCrit = owner.S.crit > 0 && Math.random() < owner.S.crit;
      hitEnemy(r, e, isCrit ? dmg * owner.S.critMult : dmg, owner.i, isCrit);
    }
  }
}

function updateEnemies(r, al, pRate, damagePlayer) {
  const pl = r.pl;
  const diff = DIFFICULTIES[r.diff] || DIFFICULTIES.medium;
  for (const e of r.E) {
    if (e.slow > 0) {
      e.slow -= DT;
      if (e.slow <= 0) e.slowVal = 0;
    }
    const slowFactor = e.slow > 0 ? (1 - e.slowVal) : 1;

    let t = null;
    let td2 = 1e12;
    for (const p of al) {
      if (p.down) continue;
      const d2 = dist2(e.x, e.y, p.x, p.y);
      if (d2 < td2) { td2 = d2; t = p; }
    }
    if (!t) break;
    const td = Math.sqrt(td2) || 1;

    if (e.k === 4) {
      const enraged = e.hp < e.mh * 0.5;
      const rMult = pRate * (enraged ? 1.32 : 1);

      if (e.bk === 0) {
        if (e.dash > 0) {
          e.dash -= DT;
          e.x = Math.max(e.r, Math.min(W - e.r, e.x + e.vx * DT));
          e.y = Math.max(e.r, Math.min(H - e.r, e.y + e.vy * DT));
          if (Math.random() < 0.35) {
            const a = Math.random() * TAU;
            shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 130, Math.sin(a) * 130, e.bd, 2.6);
          }
        } else if (e.windup > 0) {
          e.windup -= DT;
          if (e.windup <= 0) {
            r.ev.push([Math.round(e.x), Math.round(e.y), 4]);
            const cnt = enraged ? 20 : 14;
            for (let i = 0; i < cnt; i++) {
              const a = i * (TAU / cnt) + r.t;
              shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 175, Math.sin(a) * 175, e.bd, 3.8);
            }
          }
        } else {
          e.x += (t.x - e.x) / td * e.sp * slowFactor * DT;
          e.y += (t.y - e.y) / td * e.sp * slowFactor * DT;
          e.sh -= DT * rMult;
          if (e.sh <= 0) {
            e.sh = 2.3;
            const ba = Math.atan2(t.y - e.y, t.x - e.x);
            for (let i = -2; i <= 2; i++) {
              shootEnemyBullet(r, e.x, e.y, Math.cos(ba + i * 0.2) * 210, Math.sin(ba + i * 0.2) * 210, e.bd, 3.4);
            }
          }
          e.sp2 -= DT * rMult;
          if (e.sp2 <= 0) { e.sp2 = 4.6; e.windup = 0.65; }
          if (enraged) {
            e.sp3 -= DT;
            if (e.sp3 <= 0) { e.sp3 = 4.5; e.dash = 0.42; e.vx = (t.x - e.x) / td * 340; e.vy = (t.y - e.y) / td * 340; }
          }
        }
      } else if (e.bk === 1) {
        if (e.dash > 0) {
          e.dash -= DT;
          e.x = Math.max(e.r, Math.min(W - e.r, e.x + e.vx * DT));
          e.y = Math.max(e.r, Math.min(H - e.r, e.y + e.vy * DT));
          if (e.dash <= 0) {
            const ba = Math.atan2(t.y - e.y, t.x - e.x);
            for (let i = -2; i <= 2; i++) {
              shootEnemyBullet(r, e.x, e.y, Math.cos(ba + i * 0.16) * 245, Math.sin(ba + i * 0.16) * 245, e.bd, 2.8);
            }
            if (e.chain > 0) { e.chain--; e.windup = 0.22; }
          }
        } else if (e.windup > 0) {
          e.windup -= DT;
          if (e.windup <= 0) { e.dash = 0.32; e.vx = (t.x - e.x) / td * 420; e.vy = (t.y - e.y) / td * 420; }
        } else {
          e.x += (t.x - e.x) / td * e.sp * slowFactor * DT;
          e.y += (t.y - e.y) / td * e.sp * slowFactor * DT;
          e.sp2 -= DT * rMult;
          if (e.sp2 <= 0) { e.sp2 = 3.6; e.chain = enraged ? 2 : 1; e.windup = 0.45; }
          e.sh -= DT * rMult;
          if (e.sh <= 0) {
            e.sh = 2.8;
            const cnt = enraged ? 12 : 8;
            for (let i = 0; i < cnt; i++) {
              const a = i * (TAU / cnt) + r.t * 1.4;
              shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195, e.bd, 3.2);
            }
          }
        }
      } else if (e.bk === 2) {
        const v = td < 220 ? 0 : e.sp * slowFactor;
        e.x += (t.x - e.x) / td * v * DT;
        e.y += (t.y - e.y) / td * v * DT;
        for (const p of al) {
          const pd2 = dist2(e.x, e.y, p.x, p.y);
          if (pd2 > 45 * 45 && pd2 < 310 * 310) {
            const pd = Math.sqrt(pd2);
            const pull = (enraged ? 46 : 30) * DT;
            p.x = Math.max(p.r, Math.min(W - p.r, p.x + (e.x - p.x) / pd * pull));
            p.y = Math.max(p.r, Math.min(H - p.r, p.y + (e.y - p.y) / pd * pull));
          }
        }
        e.sp2 -= DT * rMult;
        if (e.sp2 <= 0) {
          e.sp2 = 4.4; e.x = rnd(80, W - 80); e.y = rnd(80, H - 80);
          r.ev.push([Math.round(e.x), Math.round(e.y), 2]);
          const cnt = enraged ? 10 : 8;
          for (let i = 0; i < cnt; i++) {
            const a = i * (TAU / cnt);
            shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 180, Math.sin(a) * 180, e.bd, 3.2);
          }
        }
        e.sh -= DT * rMult;
        if (e.sh <= 0) {
          e.sh = 1.9;
          const ba = Math.atan2(t.y - e.y, t.x - e.x);
          for (let i = -2; i <= 2; i++) shootEnemyBullet(r, e.x, e.y, Math.cos(ba + i * 0.22) * 205, Math.sin(ba + i * 0.22) * 205, e.bd, 3.1);
        }
        e.sp3 -= DT * rMult;
        if (e.sp3 <= 0) { e.sp3 = 5.2; e.spiral = 1.1; }
        if (e.spiral > 0) {
          e.spiral -= DT;
          if (Math.floor(e.spiral * 13) !== Math.floor((e.spiral + DT) * 13)) {
            const a = r.t * 6.0;
            shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 185, Math.sin(a) * 185, e.bd * 0.75, 3.0);
            shootEnemyBullet(r, e.x, e.y, Math.cos(a + 3.14) * 185, Math.sin(a + 3.14) * 185, e.bd * 0.75, 3.0);
          }
        }
      } else if (e.bk === 3) {
        e.x += (t.x - e.x) / td * e.sp * slowFactor * DT;
        e.y += (t.y - e.y) / td * e.sp * slowFactor * DT;
        e.sp2 -= DT * rMult;
        if (e.sp2 <= 0 && r.E.length < 55) {
          e.sp2 = 4.2;
          const scHp = bossHpScale(r.wave), scDmg = bossDmgScale(r.wave);
          const nHp = (1 + (pl.length - 1) * 0.55) * diff.hpMult;
          const nDmg = (1 + (pl.length - 1) * 0.18) * diff.dmgMult;
          for (let i = 0; i < 3; i++) {
            const sa = i * 2.09 + r.t;
            const sx = Math.max(20, Math.min(W - 20, e.x + Math.cos(sa) * 40));
            const sy = Math.max(20, Math.min(H - 20, e.y + Math.sin(sa) * 40));
            const m = { id: ++r.eid, k: 1, r: 8, hp: (1.8 + r.wave * 0.2) * nHp * scHp, sp: 104 * diff.spdMult, xp: 1, d: 8 * nDmg * scDmg, x: sx, y: sy, bc: 0, slow: 0, slowVal: 0 };
            m.mh = m.hp; r.E.push(m);
          }
          if (r.E.length > 6 && (e.healCount || 0) < 4) {
            e.hp = Math.min(e.mh, e.hp + e.mh * 0.005);
            e.healCount = (e.healCount || 0) + 1;
          }
        }
        e.sh -= DT * rMult;
        if (e.sh <= 0) {
          e.sh = 2.1;
          for (let arm = 0; arm < 4; arm++) {
            const base = arm * 1.5708 + r.t * 1.2;
            for (let s = -1; s <= 1; s++) shootEnemyBullet(r, e.x, e.y, Math.cos(base + s * 0.14) * 180, Math.sin(base + s * 0.14) * 180, e.bd, 3.5);
          }
        }
      } else {
        if (e.windup > 0) {
          e.windup -= DT;
          if (e.windup <= 0) {
            r.ev.push([Math.round(e.x), Math.round(e.y), 4]);
            const cnt = enraged ? 22 : 16;
            for (let i = 0; i < cnt; i++) {
              const a = i * (TAU / cnt) + r.t;
              shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 185, Math.sin(a) * 185, e.bd, 4.0);
            }
          }
        } else {
          e.x += (t.x - e.x) / td * e.sp * slowFactor * DT;
          e.y += (t.y - e.y) / td * e.sp * slowFactor * DT;
          e.sh -= DT * rMult;
          if (e.sh <= 0) {
            e.sh = 2.0;
            const cnt = enraged ? 14 : 10;
            for (let i = 0; i < cnt; i++) {
              const a = i * (TAU / cnt) + r.t * 1.8;
              shootEnemyBullet(r, e.x, e.y, Math.cos(a) * 175, Math.sin(a) * 175, e.bd, 4.0);
            }
            const ba = Math.atan2(t.y - e.y, t.x - e.x);
            for (let j = -1; j <= 1; j++) shootEnemyBullet(r, e.x, e.y, Math.cos(ba + j * 0.18) * 240, Math.sin(ba + j * 0.18) * 240, e.bd, 3.4);
          }
          e.sp3 -= DT * rMult;
          if (e.sp3 <= 0) {
            e.sp3 = 6.2; e.x = W / 2 + rnd(-120, 120); e.y = H / 2 + rnd(-90, 90);
            r.ev.push([Math.round(e.x), Math.round(e.y), 2]); e.windup = 0.7;
          }
        }
      }
    } else if (e.k === 5) {
      e.x += (t.x - e.x) / td * e.sp * slowFactor * DT;
      e.y += (t.y - e.y) / td * e.sp * slowFactor * DT;
      e.tp -= DT;
      if (e.tp <= 0) {
        e.tp = 2.7;
        const step = Math.min(110, Math.max(40, td - 28));
        e.x = Math.max(16, Math.min(W - 16, e.x + (t.x - e.x) / td * step));
        e.y = Math.max(16, Math.min(H - 16, e.y + (t.y - e.y) / td * step));
        r.ev.push([Math.round(e.x), Math.round(e.y), 5]);
      }
    } else if (e.k === 7) {
      if (e.dash > 0) {
        e.dash -= DT;
        e.x = Math.max(e.r, Math.min(W - e.r, e.x + e.vx * DT));
        e.y = Math.max(e.r, Math.min(H - e.r, e.y + e.vy * DT));
      } else {
        e.chg -= DT;
        const v = e.chg < 0.45 ? 0 : e.sp * slowFactor;
        e.x += (t.x - e.x) / td * v * DT;
        e.y += (t.y - e.y) / td * v * DT;
        if (e.chg <= 0) { e.chg = 3.0; e.dash = 0.40; e.vx = (t.x - e.x) / td * 320 * diff.spdMult; e.vy = (t.y - e.y) / td * 320 * diff.spdMult; }
      }
    } else if (e.k === 8) {
      const v = td < 250 ? 0 : e.sp * slowFactor;
      e.x += (t.x - e.x) / td * v * DT;
      e.y += (t.y - e.y) / td * v * DT;
      e.sh -= DT;
      if (e.sh <= 0) {
        e.sh = 2.6;
        const ba = Math.atan2(t.y - e.y, t.x - e.x);
        const bd = e.bd || 8.5 * mobDmgScale(r.wave) * diff.dmgMult;
        for (let i = -1; i <= 1; i++) shootEnemyBullet(r, e.x, e.y, Math.cos(ba + i * 0.22) * 185, Math.sin(ba + i * 0.22) * 185, bd, 3.2);
      }
    } else if (e.k === 9) {
      const v = td < 260 ? 0 : e.sp * slowFactor;
      e.x += (t.x - e.x) / td * v * DT;
      e.y += (t.y - e.y) / td * v * DT;
      e.sum -= DT;
      if (e.sum <= 0 && r.E.length < 45) {
        e.sum = 3.8;
        const scHp = mobHpScale(r.wave), scDmg = mobDmgScale(r.wave);
        const nHp = (1 + (pl.length - 1) * 0.32) * diff.hpMult;
        const nDmg = (1 + (pl.length - 1) * 0.09) * diff.dmgMult;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU;
          const m = {
            id: ++r.eid, k: 1, r: 8, hp: (1.2 + r.wave * 0.18) * nHp * scHp, sp: 98 * diff.spdMult, xp: 1, d: 6 * nDmg * scDmg,
            x: Math.max(18, Math.min(W - 18, e.x + Math.cos(a) * 26)),
            y: Math.max(18, Math.min(H - 18, e.y + Math.sin(a) * 26)),
            bc: 0, slow: 0, slowVal: 0
          };
          m.mh = m.hp; r.E.push(m);
        }
        r.ev.push([Math.round(e.x), Math.round(e.y), 9]);
      }
    } else {
      const v = e.k === 3 && td < 220 ? 0 : e.sp * slowFactor;
      e.x += (t.x - e.x) / td * v * DT;
      e.y += (t.y - e.y) / td * v * DT;
      if (e.k === 3) {
        e.sh = (e.sh === undefined ? 2.2 : e.sh) - DT;
        if (e.sh <= 0) {
          e.sh = 2.4;
          const bd = e.bd || 8 * mobDmgScale(r.wave) * diff.dmgMult;
          shootEnemyBullet(r, e.x, e.y, (t.x - e.x) / td * 175, (t.y - e.y) / td * 175, bd, 3.2);
        }
      }
    }

    if (td < e.r + t.r && t.inv <= 0) {
      damagePlayer(t, e.d);
      if (e.k === 6) { e.hp = 0; e.dead = true; }
    }
  }
}

module.exports = {
  dist2, distToSegment2, spawnBoss, spawnEnemy, explodeKamikaze, hitEnemy, triggerNova, updateEnemies
};