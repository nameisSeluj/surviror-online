const {
  MAX_COMBOS, MAX_SUPER, UPGRADES, COMBOS, findSuper, rollRarity
} = require("./constants");

function offerUpgrades(p, lvl, excludeIds = []) {
  let pool = UPGRADES.map((_, idx) => idx).filter(id => !excludeIds.includes(id));
  if (pool.length < 3) pool = UPGRADES.map((_, idx) => idx);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  p.ch = pool.slice(0, 3).map(u => ({ u, r: rollRarity(lvl) }));
}

function rerollUpgrades(p, lvl) {
  if (!p.ch || (p.rerolls || 0) <= 0) return false;
  const prev = p.ch.map(c => c.u);
  p.rerolls--;
  offerUpgrades(p, lvl, prev);
  return true;
}

function getComboHint(p, uIdx) {
  const nextCnt = (p.invList[uIdx] || 0) + 1;
  for (const c of COMBOS) {
    const pos = c.req.indexOf(uIdx);
    if (pos === -1) continue;
    const otherIdx = c.req[1 - pos];
    const otherCnt = p.invList[otherIdx] || 0;
    const targetLvl = Math.min(nextCnt, otherCnt);
    if (targetLvl <= 0) continue;

    const existing = p.combos.find(x => x.id === c.id);
    const curLvl = existing ? existing.lvl : (p.fusedLvl[c.id] || 0);
    if (targetLvl <= curLvl) continue;

    if (existing) {
      return { txt: `★ ${c.name} N.${targetLvl}`, type: "cmb" };
    }
    if (p.combos.length === 1 && p.supers.length < MAX_SUPER) {
      const sc = findSuper(p.combos[0].id, c.id);
      if (sc) return { txt: `✦ FUSION : ${sc.name}`, type: "fuse" };
    }
    if (p.combos.length < MAX_COMBOS) {
      return { txt: `★ COMBO : ${c.name}`, type: "cmb" };
    }
    return { txt: "Emplacements combos pleins", type: "full" };
  }
  return null;
}

function applyUpgrade(r, p, choice) {
  const { u, r: rar } = choice;
  UPGRADES[u].apply(p, rar);
  p.invList[u] = (p.invList[u] || 0) + 1;

  for (const c of COMBOS) {
    if (!c.req.includes(u)) continue;
    const targetLvl = Math.min(p.invList[c.req[0]] || 0, p.invList[c.req[1]] || 0);
    if (targetLvl <= 0) continue;

    const existing = p.combos.find(x => x.id === c.id);
    const prevLvl = existing ? existing.lvl : (p.fusedLvl[c.id] || 0);
    if (targetLvl <= prevLvl) continue;

    if (existing) {
      existing.lvl = targetLvl;
      c.apply(p);
      r.ev.push([Math.round(p.x), Math.round(p.y), 5, p.i]);
    } else if (p.combos.length < MAX_COMBOS) {
      p.combos.push({ id: c.id, lvl: targetLvl });
      c.apply(p);
      r.ev.push([Math.round(p.x), Math.round(p.y), 5, p.i]);

      if (p.combos.length === 2 && p.supers.length < MAX_SUPER) {
        const [cA, cB] = p.combos;
        const sc = findSuper(cA.id, cB.id);
        if (sc) {
          p.fusedLvl[cA.id] = cA.lvl;
          p.fusedLvl[cB.id] = cB.lvl;
          p.combos = [];
          p.supers.push({ id: sc.id });
          sc.apply(p);
          r.ev.push([Math.round(p.x), Math.round(p.y), 6, p.i]);
        }
      }
    }
  }
}

module.exports = { offerUpgrades, rerollUpgrades, getComboHint, applyUpgrade };