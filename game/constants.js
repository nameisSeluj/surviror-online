const W = 800;
const H = 560;
const DT = 1 / 30;
const TAU = Math.PI * 2;

const MAX_PLAYERS = 6;
const MAX_COMBOS = 2;
const MAX_SUPER = 1;
const MAX_WAVE = 50;

const SPAWNS = [[-56, -34], [56, -34], [-56, 34], [56, 34], [0, -48], [0, 48]];

const RANKS = [
  { id: 0, name: "Bronze", col: "#cd7f32", target: 24 * 60 },
  { id: 1, name: "Argent", col: "#c0c8d0", target: 22 * 60 },
  { id: 2, name: "Or", col: "#ffd166", target: 20 * 60 },
  { id: 3, name: "Platine", col: "#45b8b0", target: 18 * 60 + 30 },
  { id: 4, name: "Diamant", col: "#5b8fd9", target: 17 * 60 },
  { id: 5, name: "Maître", col: "#b06be8", target: 15 * 60 + 30 },
  { id: 6, name: "Grand Maître", col: "#e05656", target: 14 * 60 + 15 },
  { id: 7, name: "Légende", col: "#ff9f1c", target: 13 * 60 + 15 }
];

const RARITIES = [
  { id: 0, name: "Commun", col: "#b8aea0", mult: 1.0 },
  { id: 1, name: "Rare", col: "#5b8fd9", mult: 1.25 },
  { id: 2, name: "Épique", col: "#b06be8", mult: 1.55 },
  { id: 3, name: "Légendaire", col: "#ffd166", mult: 2.0 }
];

const MAP_THEMES = [
  { id: 0, name: "Arène de Braises", waves: "1-5 / 26-30", boss: "Colosse", bg: "#221e1a", tile: [35, 31, 27], border: "#5c4938", accent: "#e5a93c" },
  { id: 1, name: "Canyon de Rouille", waves: "6-10 / 31-35", boss: "Traqueur", bg: "#261a16", tile: [42, 27, 22], border: "#7a3e2b", accent: "#ff7b47" },
  { id: 2, name: "Sanctuaire Abyssal", waves: "11-15 / 36-40", boss: "Arpenteur", bg: "#141d26", tile: [20, 31, 42], border: "#2e5c7a", accent: "#5bc0eb" },
  { id: 3, name: "Marais Toxique", waves: "16-20 / 41-45", boss: "Matriarche", bg: "#172219", tile: [23, 36, 26], border: "#3d6b47", accent: "#6ede8a" },
  { id: 4, name: "Citadelle d'Obsidienne", waves: "21-25 / 46-50", boss: "Seigneur d'Encre", bg: "#1c1624", tile: [30, 23, 39], border: "#6b478a", accent: "#ffd166" }
];

function rollRarity(lvl) {
  const l = Math.min(25, Math.max(1, lvl));
  const leg = 4 + l * 0.30;
  const epi = 12 + l * 0.40;
  const rar = 28 + l * 0.20;
  const roll = Math.random() * 100;
  if (roll < leg) return 3;
  if (roll < leg + epi) return 2;
  if (roll < leg + epi + rar) return 1;
  return 0;
}

const CLASSES = [
  { id: 0, name: "Recrue", passive: "Polyvalent", bonus: "+10 % XP gemmes · Aimant +20 %", apply: p => { p.S.xpMult *= 1.10; p.S.magnet *= 1.20; } },
  { id: 1, name: "Chevalier", passive: "Cuirasse lourde", bonus: "+20 PV max · Armure +10 %", apply: p => { p.max += 20; p.hp = p.max; p.S.armor += 0.10; } },
  { id: 2, name: "Ninja", passive: "Agilité furtive", bonus: "Vitesse +12 % · Dash -25 % CD", apply: p => { p.S.speed *= 1.12; p.S.dashCd *= 0.75; } },
  { id: 3, name: "Viking", passive: "Rage du Nord", bonus: "Dégâts +15 % (+30 % sous 50 % PV)", apply: p => { p.S.dmg *= 1.15; p.S.berserk = 1; } },
  { id: 4, name: "Mage", passive: "Arcanes instables", bonus: "Critique +12 % · Onde +15 % rayon", apply: p => { p.S.crit += 0.12; p.S.novaRad *= 1.15; } },
  { id: 5, name: "Cyber", passive: "Visée assistée", bonus: "Cadence +14 % · +1 Ricochet", apply: p => { p.S.rate *= 1.14; p.S.bounce += 1; } },
  { id: 6, name: "Couronne", passive: "Aura royale", bonus: "+0,6 PV/s · Réanimation +25 %", apply: p => { p.S.regen += 0.6; p.S.revSpd += 0.25; } },
  { id: 7, name: "Faucheuse", passive: "Moisson d'âmes", bonus: "+2 Lames rapides · Vol de vie +2 % · +2 PV / 6 kills", apply: p => { p.S.orb += 2; p.S.orbSpd *= 1.20; p.S.lifesteal += 0.02; p.S.soul = 1; } },
  { id: 8, name: "Ingénieur", passive: "Drone autonome", bonus: "+1 Drone de tir auto · Aimant +15 %", apply: p => { p.S.drone += 1; p.S.magnet *= 1.15; } },
  { id: 9, name: "Vampire", passive: "Soif écarlate", bonus: "Vol de vie +4 % · Vitesse +8 %", apply: p => { p.S.lifesteal += 0.04; p.S.speed *= 1.08; } }
];

const UPGRADES = [
  {
    id: 0, short: "Dégâts",
    title: r => `Dégâts +${Math.round(28 * RARITIES[r].mult)} %`,
    desc: r => `Tes tirs frappent +${Math.round(28 * RARITIES[r].mult)} % plus fort`,
    apply: (p, r) => { p.S.dmg *= (1 + 0.28 * RARITIES[r].mult); }
  },
  {
    id: 1, short: "Cadence",
    title: r => `Cadence +${Math.round(24 * RARITIES[r].mult)} %`,
    desc: r => `Tu tires +${Math.round(24 * RARITIES[r].mult)} % plus vite`,
    apply: (p, r) => { p.S.rate *= (1 + 0.24 * RARITIES[r].mult); }
  },
  {
    id: 2, short: "Tir multi",
    title: r => r === 3 ? "Tir multiple (+2)" : "Tir multiple",
    desc: r => r === 3 ? "+2 projectiles par salve" : (r === 2 ? "+1 projectile et +12 % dégâts" : (r === 1 ? "+1 projectile et +6 % dégâts" : "+1 projectile par salve")),
    apply: (p, r) => { p.S.multi += (r === 3 ? 2 : 1); if (r === 1) p.S.dmg *= 1.06; if (r === 2) p.S.dmg *= 1.12; }
  },
  {
    id: 3, short: "Perforation",
    title: r => r === 3 ? "Perforation (+2)" : "Perforation",
    desc: r => r === 3 ? "Les tirs traversent +2 ennemis" : (r === 2 ? "+1 perforation et +12 % dégâts" : (r === 1 ? "+1 perforation et +6 % dégâts" : "Les tirs traversent +1 ennemi")),
    apply: (p, r) => { p.S.pierce += (r === 3 ? 2 : 1); if (r === 1) p.S.dmg *= 1.06; if (r === 2) p.S.dmg *= 1.12; }
  },
  {
    id: 4, short: "Vitesse",
    title: r => `Vitesse +${Math.round(11 * RARITIES[r].mult)} %`,
    desc: r => `Tu te déplaces +${Math.round(11 * RARITIES[r].mult)} % plus vite`,
    apply: (p, r) => { p.S.speed *= (1 + 0.11 * RARITIES[r].mult); }
  },
  {
    id: 5, short: "Aimant",
    title: r => `Aimant +${Math.round(38 * RARITIES[r].mult)} %`,
    desc: r => `Portée d'attraction +${Math.round(38 * RARITIES[r].mult)} %`,
    apply: (p, r) => { p.S.magnet *= (1 + 0.38 * RARITIES[r].mult); }
  },
  {
    id: 6, short: "Régén.",
    title: r => `Régén. +${(0.75 * RARITIES[r].mult).toFixed(1)} PV/s`,
    desc: r => `Récupère +${(0.75 * RARITIES[r].mult).toFixed(1)} PV par seconde`,
    apply: (p, r) => { p.S.regen += 0.75 * RARITIES[r].mult; }
  },
  {
    id: 7, short: "Lames",
    title: r => r === 3 ? "Lames orbitales (+2)" : "Lames orbitales",
    desc: r => r === 3 ? "+2 lames qui tournent autour de toi" : (r === 2 ? "+1 lame et rotation +20 %" : (r === 1 ? "+1 lame et rotation +10 %" : "+1 lame qui tourne autour de toi")),
    apply: (p, r) => { p.S.orb += (r === 3 ? 2 : 1); if (r === 1) p.S.orbSpd *= 1.10; if (r === 2) p.S.orbSpd *= 1.20; }
  },
  {
    id: 8, short: "PV & Soin",
    title: r => `Soin & +${Math.round(24 * RARITIES[r].mult)} PV`,
    desc: r => `+${Math.round(24 * RARITIES[r].mult)} PV max et soin complet`,
    apply: (p, r) => { const b = Math.round(24 * RARITIES[r].mult); p.max += b; p.hp = p.max; }
  },
  {
    id: 9, short: "Critique",
    title: r => `Critique +${Math.round(18 * RARITIES[r].mult)} %`,
    desc: r => `+${Math.round(18 * RARITIES[r].mult)} % de chance d'infliger ×2,2 dégâts`,
    apply: (p, r) => { p.S.crit += 0.18 * RARITIES[r].mult; }
  },
  {
    id: 10, short: "Onde choc",
    title: r => r > 0 ? `Onde de choc (×${RARITIES[r].mult.toFixed(2)})` : "Onde de choc",
    desc: r => `Explosion de zone tous les 6 tirs (puissance ×${RARITIES[r].mult.toFixed(2)})`,
    apply: (p, r) => { p.S.nova++; p.S.novaPow *= (0.82 + 0.18 * RARITIES[r].mult); }
  },
  {
    id: 11, short: "Ricochet",
    title: r => r >= 2 ? "Balles ricochet (+2)" : "Balles ricochet",
    desc: r => r >= 2 ? "Les tirs rebondissent vers +2 ennemis" : (r === 1 ? "+1 ricochet et +8 % dégâts" : "Les tirs rebondissent vers +1 ennemi"),
    apply: (p, r) => { p.S.bounce += (r >= 2 ? 2 : 1); if (r === 1) p.S.dmg *= 1.08; }
  },
  {
    id: 12, short: "Givre",
    title: r => `Aura de givre (-${Math.min(60, Math.round(32 * RARITIES[r].mult))} %)`,
    desc: r => `Ralentit (-${Math.min(60, Math.round(32 * RARITIES[r].mult))} %) et blesse les proches`,
    apply: (p, r) => { p.S.frost++; p.S.frostSlow = Math.max(p.S.frostSlow, Math.min(0.60, 0.32 * RARITIES[r].mult)); }
  },
  {
    id: 13, short: "Vol de vie",
    title: r => `Vol de vie +${(3 * RARITIES[r].mult).toFixed(1)} %`,
    desc: r => `Convertit ${(3 * RARITIES[r].mult).toFixed(1)} % des dégâts en PV (max 4,5 PV/s)`,
    apply: (p, r) => { p.S.lifesteal += 0.03 * RARITIES[r].mult; }
  },
  {
    id: 14, short: "Déflagration",
    title: r => `Déflagration (${Math.round(45 * RARITIES[r].mult)} %)`,
    desc: r => `Les ennemis tués explosent (${Math.round(45 * RARITIES[r].mult)} % de tes dégâts en zone)`,
    apply: (p, r) => { p.S.corpseExp += 0.45 * RARITIES[r].mult; }
  },
  {
    id: 15, short: "Bouclier",
    title: r => `Bouclier +${Math.round(7 * RARITIES[r].mult)} %`,
    desc: r => `Réduit les dégâts subis de ${Math.round(7 * RARITIES[r].mult)} %`,
    apply: (p, r) => { p.S.armor += 0.07 * RARITIES[r].mult; }
  },
  {
    id: 16, short: "Vélocité",
    title: r => `Vélocité +${Math.round(22 * RARITIES[r].mult)} %`,
    desc: r => `Projectiles +${Math.round(22 * RARITIES[r].mult)} % plus rapides et +10 % dégâts`,
    apply: (p, r) => { p.S.projSpd *= (1 + 0.22 * RARITIES[r].mult); p.S.dmg *= 1.10; }
  }
];

const COMBOS = [
  { id: 0, req: [0, 1], name: "Mitrailleuse lourde", desc: "Dégâts ×1,22 · Cadence ×1,22", apply: p => { p.S.dmg *= 1.22; p.S.rate *= 1.22; } },
  { id: 1, req: [2, 3], name: "Pluie d'acier", desc: "+1 projectile · +1 perforation", apply: p => { p.S.multi += 1; p.S.pierce += 1; } },
  { id: 2, req: [7, 4], name: "Tempête de lames", desc: "+2 lames · Vitesse lames ×1,3", apply: p => { p.S.orb += 2; p.S.orbSpd *= 1.3; } },
  { id: 3, req: [6, 8], name: "Forteresse vivante", desc: "+25 PV max · +1,2 PV/s", apply: p => { p.max += 25; p.hp = p.max; p.S.regen += 1.2; } },
  { id: 4, req: [5, 7], name: "Vortex magnétique", desc: "Aimant ×1,5 · +1 PV/gemme", apply: p => { p.S.magnet *= 1.5; p.S.gemHeal += 1; } },
  { id: 5, req: [9, 11], name: "Rebond Mortel", desc: "+15 % crit · +2 ricochets · Crit ×2,6", apply: p => { p.S.crit += 0.15; p.S.bounce += 2; p.S.critMult = Math.max(p.S.critMult, 2.6); } },
  { id: 6, req: [10, 0], name: "Cataclysme", desc: "Onde tous les 4 tirs · Dégâts/rayon ×1,45", apply: p => { p.S.novaEvery = 4; p.S.novaPow *= 1.45; p.S.novaRad *= 1.3; } },
  { id: 7, req: [12, 6], name: "Bastion Glaciaire", desc: "Gel 50 % · Aura élargie · +1,4 PV/s", apply: p => { p.S.frostSlow = 0.50; p.S.frostRad *= 1.3; p.S.regen += 1.4; } },
  { id: 8, req: [13, 14], name: "Moisson Sanglante", desc: "Vol de vie +5 % · Déflagration +60 %", apply: p => { p.S.lifesteal += 0.05; p.S.corpseExp += 0.60; } },
  { id: 9, req: [15, 16], name: "Égide Balistique", desc: "Armure +12 % · Vélocité +30 % · Dégâts ×1,18", apply: p => { p.S.armor += 0.12; p.S.projSpd *= 1.30; p.S.dmg *= 1.18; } }
];

const SUPER_PARTS = [
  { pre: "Apocalypse", suf: "Balistique", txt: "Dégâts ×1,22 · Cadence ×1,15", apply: p => { p.S.dmg *= 1.22; p.S.rate *= 1.15; } },
  { pre: "Déluge", suf: "Perforant", txt: "+2 tirs · +1 perforation", apply: p => { p.S.multi += 2; p.S.pierce += 1; } },
  { pre: "Tourbillon", suf: "Tranchant", txt: "+2 lames · Vitesse ×1,12", apply: p => { p.S.orb += 2; p.S.speed *= 1.12; } },
  { pre: "Juggernaut", suf: "Éternel", txt: "+35 PV max · +1,4 PV/s", apply: p => { p.max += 35; p.hp = p.max; p.S.regen += 1.4; } },
  { pre: "Singularité", suf: "Astrale", txt: "Aimant ×1,5 · +2 PV/gemme", apply: p => { p.S.magnet *= 1.5; p.S.gemHeal += 2; } },
  { pre: "Exécuteur", suf: "Mortel", txt: "+20 % crit · +2 ricochets", apply: p => { p.S.crit += 0.20; p.S.bounce += 2; } },
  { pre: "Cataclysme", suf: "Sismique", txt: "Onde +1 · Puissance ×1,35", apply: p => { p.S.nova += 1; p.S.novaPow *= 1.35; } },
  { pre: "Tempête", suf: "Boréale", txt: "Givre +2 · Gel renforcé", apply: p => { p.S.frost += 2; p.S.frostSlow = Math.min(0.65, p.S.frostSlow + 0.08); } },
  { pre: "Fléau", suf: "Écarlate", txt: "Vol de vie +5 % · Déflagration +55 %", apply: p => { p.S.lifesteal += 0.05; p.S.corpseExp += 0.55; } },
  { pre: "Bastion", suf: "Cinétique", txt: "Armure +10 % · Vélocité +25 %", apply: p => { p.S.armor += 0.10; p.S.projSpd *= 1.25; } }
];

const SUPER_COMBOS = [];
const SUPER_MAP = new Map();
for (let i = 0; i < COMBOS.length; i++) {
  for (let j = i + 1; j < COMBOS.length; j++) {
    const id = SUPER_COMBOS.length;
    const sc = {
      id,
      req: [i, j],
      name: `${SUPER_PARTS[i].pre} ${SUPER_PARTS[j].suf}`,
      desc: `${SUPER_PARTS[i].txt} · ${SUPER_PARTS[j].txt}`,
      apply: p => { SUPER_PARTS[i].apply(p); SUPER_PARTS[j].apply(p); }
    };
    SUPER_COMBOS.push(sc);
    SUPER_MAP.set(`${i}_${j}`, sc);
    SUPER_MAP.set(`${j}_${i}`, sc);
  }
}

const findSuper = (idA, idB) => SUPER_MAP.get(`${idA}_${idB}`) || null;

const ENEMIES_INFO = [
  { k: 0, name: "Rôdeur", waveMin: 1, role: "Éclaireur équilibré qui poursuit le joueur le plus proche." },
  { k: 1, name: "Véloce", waveMin: 2, role: "Très rapide mais fragile, attaque en meute." },
  { k: 3, name: "Tireur d'encre", waveMin: 4, role: "Garde ses distances et tire des projectiles." },
  { k: 2, name: "Mastodonte", waveMin: 5, role: "Lent, massif et très résistant." },
  { k: 5, name: "Spectre", waveMin: 6, role: "Se téléporte brusquement vers sa cible." },
  { k: 6, name: "Kamikaze", waveMin: 8, role: "Fonce sur l'escouade et explose en 6 éclats." },
  { k: 7, name: "Bélier", waveMin: 11, role: "Charge en ligne droite après un court temps d'arrêt." },
  { k: 8, name: "Artilleur", waveMin: 14, role: "Tire des salves en éventail à moyenne portée." },
  { k: 9, name: "Invocateur", waveMin: 18, role: "Fait apparaître régulièrement des renforts Véloces." }
];

const BOSSES_INFO = [
  { bk: 0, name: "Colosse", wave: "Vague 5+", role: "Salves en éventail, nova circulaire et charge enragée." },
  { bk: 1, name: "Traqueur", wave: "Vague 10+", role: "Enchaîne les ruées rapides suivies de tirs groupés." },
  { bk: 2, name: "Arpenteur", wave: "Vague 15+", role: "Attire les joueurs par gravité, se téléporte et tire en spirale." },
  { bk: 3, name: "Matriarche", wave: "Vague 20+", role: "Invoque des nuées de sbires, se régénère faiblement et tire en croix." },
  { bk: 4, name: "Seigneur d'Encre", wave: "Vague 25 & 50", role: "Combine téléportation, novæ massives et invocation d'élites." }
];

const INITIAL_PATCH_NOTES = [
  {
    version: "v1.6 — HUD Épuré, Profil, Maps par Boss & Équilibrage",
    date_label: "Actuel",
    is_latest: 1,
    items: [
      "Correction du tir multiple pair (angle resserré pour toucher au centre) et des projectiles fantômes (collision par segment).",
      "Projectiles ennemis lumineux à halo contrasté et changement automatique de map après chaque boss.",
      "Ajout du bouton Relancer les bonus (2 relances par partie + 1 par boss vaincu).",
      "Buff de la Faucheuse (+2 lames rapides, +2 PV / 6 kills, vol de vie +2 %), nerf du soin de la Matriarche et des dégâts de l'Arpenteur (vague 15).",
      "Nouveau HUD externe (gauche/droite), panneau de stats modifiées en direct et onglet Profil avec maîtrise des classes."
    ]
  },
  {
    version: "v1.5 — Base de données, Comptes & +2 Classes",
    date_label: "Précédent",
    is_latest: 0,
    items: [
      "Création de compte joueur et sauvegarde persistante des rangs, classements et statistiques.",
      "Ajout de 2 nouvelles classes : Ingénieur (drone autonome) et Vampire (vol de vie).",
      "Ajout de 4 nouveaux bonus (Vol de vie, Déflagration, Bouclier cinétique, Vélocité) et 2 combos."
    ]
  }
];

module.exports = {
  W, H, DT, TAU,
  MAX_PLAYERS, MAX_COMBOS, MAX_SUPER, MAX_WAVE,
  SPAWNS, RANKS, RARITIES, MAP_THEMES, rollRarity,
  CLASSES, UPGRADES, COMBOS, SUPER_COMBOS, findSuper,
  ENEMIES_INFO, BOSSES_INFO, INITIAL_PATCH_NOTES
};