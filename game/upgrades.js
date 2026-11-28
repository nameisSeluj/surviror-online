const { UPGRADES, COMBOS, SUPER_COMBOS, RARITIES, PICK_TIMEOUT } = require("./constants");

function rollRarity(lvl) {
  const bonus = Math.min(20, Math.floor(lvl * 0.5));
  const weights = RARITIES.map((r, idx) => {
    if (idx === 0) return Math.max(25, r.weight - bonus);
    if (idx === 1) return r.weight + Math.floor(bonus * 0.5);
    if (idx === 2) return r.weight + Math.floor(bonus * 0.35);
    return r.weight + Math.floor(bonus * 0.15);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return 0;
}

function getUpgradeHint(player, uIdx) {
  for (const cmb of COMBOS) {
    if (!cmb.req.includes(uIdx)) continue;
    const other = cmb.req[0] === uIdx ? cmb.req[1] : cmb.req[0];
    if ((player.inv[other] || 0) > 0) {
      const curLvl = player.combos[cmb.id] || 0;
      const nextLvl = curLvl + 1;
      for (const sup of SUPER_COMBOS) {
        if (sup.req.includes(cmb.id) && !player.superCombos[sup.id]) {
          const otherCmb = sup.req[0] === cmb.id ? sup.req[1] : sup.req[0];
          if ((player.combos[otherCmb] || 0) >= 1) {
            return { type: "sup", txt: `FUSION : ${sup.name}` };
          }
        }
      }
      return { type: "fuse", txt: `COMBO : ${cmb.name} N.${nextLvl}` };
    }
    return { type: "hint", txt: `Synergie : ${UPGRADES[other].short}` };
  }
  return null;
}

function offerUpgrades(player, lvl) {
  const pool = UPGRADES.map((_, idx) => idx);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  player.ch = picked.map(uIdx => {
    const rarIdx = rollRarity(lvl);
    const rar = RARITIES[rarIdx];
    const up = UPGRADES[uIdx];
    const hint = getUpgradeHint(player, uIdx);
    return [uIdx, up.short, up.desc(rar.mult), hint, rarIdx];
  });
  player.pickTimer = PICK_TIMEOUT;
}

function rerollUpgrades(player, lvl) {
  if (!player.ch || player.rerolls <= 0) return false;
  player.rerolls -= 1;
  offerUpgrades(player, lvl);
  return true;
}

function applyUpgrade(room, player, choice) {
  const uIdx = choice[0];
  const rarIdx = choice[4] || 0;
  const rar = RARITIES[rarIdx] || RARITIES[0];
  const up = UPGRADES[uIdx];
  if (!up) return;

  up.apply(player.S, rar.mult);
  player.inv[uIdx] = (player.inv[uIdx] || 0) + 1;

  for (const cmb of COMBOS) {
    if (!cmb.req.includes(uIdx)) continue;
    const c0 = player.inv[cmb.req[0]] || 0;
    const c1 = player.inv[cmb.req[1]] || 0;
    const targetLvl = Math.min(c0, c1);
    const curLvl = player.combos[cmb.id] || 0;
    if (targetLvl > curLvl) {
      player.combos[cmb.id] = targetLvl;
      cmb.apply(player.S, targetLvl);
      room.ev.push([player.x, player.y, 5, player.i]);
    }
  }

  for (const sup of SUPER_COMBOS) {
    if (player.superCombos[sup.id]) continue;
    if ((player.combos[sup.req[0]] || 0) >= 1 && (player.combos[sup.req[1]] || 0) >= 1) {
      player.superCombos[sup.id] = 1;
      sup.apply(player.S);
      room.ev.push([player.x, player.y, 6, player.i]);
    }
  }
}

module.exports = { offerUpgrades, rerollUpgrades, applyUpgrade };