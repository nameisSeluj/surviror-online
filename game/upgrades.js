const { MAX_COMBOS, MAX_SUPER, UPGRADES, COMBOS, SUPER_COMBOS, findSuper, rollRarity } = require("./constants");

function offerUpgrades(player, squadLevel = 1) {
  const picks = UPGRADES.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 3);
  player.ch = picks.map(u => ({ u, r: rollRarity(squadLevel) }));
}

function getComboHint(player, uIdx) {
  const nextInv = player.invList.slice();
  nextInv[uIdx]++;

  for (const sup of player.supers) {
    const sc = SUPER_COMBOS[sup.id];
    const c1 = COMBOS[sc.req[0]];
    const c2 = COMBOS[sc.req[1]];
    const minAll = Math.min(nextInv[c1.req[0]], nextInv[c1.req[1]], nextInv[c2.req[0]], nextInv[c2.req[1]]);
    if (minAll > sup.lvl) {
      return { type: "sup", txt: `Cumul Fusion Niv.${sup.lvl + 1} : ${sc.name} (${sc.desc})` };
    }
  }

  for (const act of player.combos) {
    const c = COMBOS[act.id];
    const newLvl = Math.min(nextInv[c.req[0]], nextInv[c.req[1]]) - player.fusedLvl[c.id];
    if (newLvl > act.lvl) {
      if (player.combos.length >= 2) {
        if (player.supers.length >= MAX_SUPER) {
          return { type: "full", txt: `Max 1 Super-Combo (cumul Niv.${newLvl} : ${c.name})` };
        }
        const sc = findSuper(player.combos[0].id, player.combos[1].id);
        if (sc) return { type: "fuse", txt: `FUSION : ${sc.name} (${sc.desc})` };
      }
      return { type: "lvl", txt: `Cumul Niv.${newLvl} : ${c.name} (${c.desc})` };
    }
  }

  for (const c of COMBOS) {
    if (player.combos.some(x => x.id === c.id)) continue;
    const targetLvl = Math.min(nextInv[c.req[0]], nextInv[c.req[1]]) - player.fusedLvl[c.id];
    if (targetLvl > 0) {
      if (player.combos.length >= MAX_COMBOS) {
        return { type: "full", txt: `Slots combos pleins (${MAX_COMBOS}/${MAX_COMBOS})` };
      }
      if (player.combos.length === 1 && (player.combos[0].lvl + targetLvl) >= 3) {
        if (player.supers.length >= MAX_SUPER) {
          return { type: "full", txt: `Max 1 Super-Combo · Combo : ${c.name}` };
        }
        const sc = findSuper(player.combos[0].id, c.id);
        if (sc) return { type: "fuse", txt: `FUSION : ${sc.name} (${sc.desc})` };
      }
      return { type: "new", txt: `Combo : ${c.name} (${c.desc})` };
    }
  }
  return null;
}

function applyUpgrade(room, player, uIdx, rarIdx = 0) {
  UPGRADES[uIdx].apply(player, rarIdx);
  player.invList[uIdx]++;

  for (const sup of player.supers) {
    const sc = SUPER_COMBOS[sup.id];
    const c1 = COMBOS[sc.req[0]];
    const c2 = COMBOS[sc.req[1]];
    const minAll = Math.min(player.invList[c1.req[0]], player.invList[c1.req[1]], player.invList[c2.req[0]], player.invList[c2.req[1]]);
    while (sup.lvl < minAll) {
      sup.lvl++;
      if (player.fusedLvl[c1.id] < sup.lvl) player.fusedLvl[c1.id] = sup.lvl;
      if (player.fusedLvl[c2.id] < sup.lvl) player.fusedLvl[c2.id] = sup.lvl;
      sc.apply(player);
      room.ev.push([Math.round(player.x), Math.round(player.y), 6, player.i, sc.id, sup.lvl]);
    }
  }

  for (const c of COMBOS) {
    const targetLvl = Math.min(player.invList[c.req[0]], player.invList[c.req[1]]) - player.fusedLvl[c.id];
    if (targetLvl <= 0) continue;
    let existing = player.combos.find(x => x.id === c.id);
    if (!existing) {
      if (player.combos.length >= MAX_COMBOS) continue;
      existing = { id: c.id, lvl: 0 };
      player.combos.push(existing);
    }
    while (existing.lvl < targetLvl) {
      existing.lvl++;
      c.apply(player);
      room.ev.push([Math.round(player.x), Math.round(player.y), 5, player.i, c.id, existing.lvl]);
    }
  }

  if (player.supers.length < MAX_SUPER && player.combos.length === 2 && (player.combos[0].lvl + player.combos[1].lvl) >= 3) {
    const cA = player.combos[0];
    const cB = player.combos[1];
    const sc = findSuper(cA.id, cB.id);
    if (sc) {
      player.fusedLvl[cA.id] += cA.lvl;
      player.fusedLvl[cB.id] += cB.lvl;
      player.combos = [];
      player.supers.push({ id: sc.id, lvl: 1 });
      sc.apply(player);
      room.ev.push([Math.round(player.x), Math.round(player.y), 6, player.i, sc.id, 1]);
    }
  }
}

module.exports = { offerUpgrades, getComboHint, applyUpgrade };