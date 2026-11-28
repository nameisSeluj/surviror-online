const DT = 1 / 30;
const W = 800;
const H = 560;
const MAX_PLAYERS = 6;
const MAX_WAVE = 50;
const PICK_TIMEOUT = 15;
const RECONNECT_GRACE = 180;

const DIFFICULTIES = {
  easy: {
    id: "easy",
    name: "Facile",
    hpMult: 0.72,
    dmgMult: 0.70,
    spdMult: 0.88,
    xpMult: 1.20,
    ranked: false,
    col: "#59b878",
    desc: "Ennemis affaiblis (-30 % dégâts) et +20 % XP. Ne modifie pas l’Elo."
  },
  medium: {
    id: "medium",
    name: "Medium",
    hpMult: 1.0,
    dmgMult: 1.0,
    spdMult: 1.0,
    xpMult: 1.0,
    ranked: false,
    col: "#e5a93c",
    desc: "Équilibrage standard. Ne modifie pas l’Elo."
  },
  ranked: {
    id: "ranked",
    name: "Ranked",
    hpMult: 1.25,
    dmgMult: 1.25,
    spdMult: 1.10,
    xpMult: 0.95,
    ranked: true,
    col: "#e05656",
    desc: "Ennemis renforcés (+25 % PV/dégâts). Seul mode qui modifie ton Elo."
  }
};

const RANKS = [
  { id: 0, name: "Non classé", minElo: 0, col: "#8c8275" },
  { id: 1, name: "Bronze", minElo: 1, col: "#cd7f32" },
  { id: 2, name: "Argent", minElo: 1000, col: "#c0c0c0" },
  { id: 3, name: "Or", minElo: 1300, col: "#ffd166" },
  { id: 4, name: "Platine", minElo: 1600, col: "#45b8b0" },
  { id: 5, name: "Diamant", minElo: 1900, col: "#5b8fd9" },
  { id: 6, name: "Maître", minElo: 2200, col: "#e05656" }
];

function getRankFromElo(elo) {
  const val = Number(elo) || 0;
  if (val <= 0) return 0;
  let rk = 1;
  for (let i = 1; i < RANKS.length; i++) {
    if (val >= RANKS[i].minElo) rk = i;
  }
  return rk;
}

const RARITIES = [
  { id: 0, name: "Commun", mult: 1.0, col: "#b8aea0", weight: 58 },
  { id: 1, name: "Rare", mult: 1.3, col: "#5b8fd9", weight: 27 },
  { id: 2, name: "Épique", mult: 1.65, col: "#b06be8", weight: 11 },
  { id: 3, name: "Légendaire", mult: 2.1, col: "#ff9f1c", weight: 4 }
];

const MAP_THEMES = [
  { id: 0, name: "Arène de Braises", waves: "1 – 10", boss: "Colosse de Braise", bg: "#221e1a", tile: [35, 31, 27], border: "#463b30", accent: "#e5a93c" },
  { id: 1, name: "Canyon de Rouille", waves: "11 – 20", boss: "Faucheur Écarlate", bg: "#261a16", tile: [44, 28, 23], border: "#6e3b2c", accent: "#ff7b54" },
  { id: 2, name: "Sanctuaire Abyssal", waves: "21 – 30", boss: "Léviathan Astral", bg: "#141f26", tile: [21, 35, 44], border: "#2c586e", accent: "#4cc9f0" },
  { id: 3, name: "Marais Toxique", waves: "31 – 40", boss: "Matriarche Virulente", bg: "#182219", tile: [26, 40, 28], border: "#3b6640", accent: "#7ae582" },
  { id: 4, name: "Citadelle d'Obsidienne", waves: "41 – 50", boss: "Seigneur du Néant", bg: "#1c1524", tile: [32, 23, 42], border: "#593b75", accent: "#c77dff" }
];

const CLASSES = [
  {
    id: 0, name: "Recrue", passive: "Polyvalent",
    bonus: "+12 % dégâts, +10 % PV max et +10 % XP",
    apply: s => { s.dmg *= 1.12; s.maxHp += 10; s.hp += 10; s.xpMult *= 1.1; }
  },
  {
    id: 1, name: "Chevalier", passive: "Rempart",
    bonus: "+45 PV max, +18 % armure et +1 lame orbitale",
    apply: s => { s.maxHp += 45; s.hp += 45; s.armor = Math.min(0.75, s.armor + 0.18); s.orb += 1; }
  },
  {
    id: 2, name: "Ninja", passive: "Frappe chirurgicale",
    bonus: "+22 % vitesse, +18 % critique et esquive rapide",
    apply: s => { s.speed *= 1.22; s.crit += 0.18; s.dashCd *= 0.72; }
  },
  {
    id: 3, name: "Viking", passive: "Fureur sanglante",
    bonus: "+25 % dégâts, +5 % vol de vie et +25 PV max",
    apply: s => { s.dmg *= 1.25; s.lifesteal += 0.05; s.maxHp += 25; s.hp += 25; }
  },
  {
    id: 4, name: "Mage", passive: "Arcanes instables",
    bonus: "+1 projectile, +2 ricochets et onde de choc niv.1",
    apply: s => { s.multi += 1; s.bounce += 2; s.nova += 1; }
  },
  {
    id: 5, name: "Cyborg", passive: "Systèmes actifs",
    bonus: "+1 drone autonome, +20 % cadence et +2 perforation",
    apply: s => { s.drone += 1; s.rate *= 1.20; s.pierce += 2; }
  },
  {
    id: 6, name: "Paladin", passive: "Aura bénie",
    bonus: "+3,0 PV/s régénération, +35 PV max et réanimation ×2",
    apply: s => { s.regen += 3.0; s.maxHp += 35; s.hp += 35; s.revivePower += 1.0; }
  },
  {
    id: 7, name: "Cryomancien", passive: "Zéro absolu",
    bonus: "Aura de givre (125 px), ralentit de 42 % et gèle les ennemis",
    apply: s => { s.frostR += 125; s.frostSlow = Math.min(0.72, s.frostSlow + 0.42); s.frostDmg += 22; }
  },
  {
    id: 8, name: "Artificier", passive: "Munitions instables",
    bonus: "Déflagration (55 % PV max) et +25 % vitesse projectiles",
    apply: s => { s.corpseExp += 0.55; s.projSpd *= 1.25; }
  },
  {
    id: 9, name: "Vampire", passive: "Soif éternelle",
    bonus: "+10 % vol de vie, +18 % crit et +18 % vitesse",
    apply: s => { s.lifesteal += 0.10; s.crit += 0.18; s.speed *= 1.18; }
  }
];

// Bonus 0, 1, 4, 13 inchangés ; tous les autres bonus sont nettement renforcés
const UPGRADES = [
  {
    id: 0, short: "Dégâts",
    desc: m => `+${Math.round(18 * m)} % dégâts de base`,
    apply: (s, m) => { s.dmg *= 1 + 0.18 * m; }
  },
  {
    id: 1, short: "Cadence",
    desc: m => `+${Math.round(16 * m)} % cadence de tir`,
    apply: (s, m) => { s.rate *= 1 + 0.16 * m; }
  },
  {
    id: 2, short: "Salve",
    desc: m => `+${Math.max(1, Math.round(m))} projectile(s) par tir`,
    apply: (s, m) => { s.multi += Math.max(1, Math.round(m)); }
  },
  {
    id: 3, short: "Perforation",
    desc: m => `Traverse +${Math.max(2, Math.round(2 * m))} ennemis et +12 % dégâts`,
    apply: (s, m) => { s.pierce += Math.max(2, Math.round(2 * m)); s.dmg *= 1.12; }
  },
  {
    id: 4, short: "Vélocité",
    desc: m => `+${Math.round(12 * m)} % vitesse de déplacement`,
    apply: (s, m) => { s.speed *= 1 + 0.12 * m; }
  },
  {
    id: 5, short: "Vampirisme",
    desc: m => `+${(4.5 * m).toFixed(1)} % vol de vie et +${Math.round(15 * m)} PV max`,
    apply: (s, m) => {
      s.lifesteal += 0.045 * m;
      const hpAdd = Math.round(15 * m);
      s.maxHp += hpAdd;
      s.hp = Math.min(s.maxHp, s.hp + hpAdd);
    }
  },
  {
    id: 6, short: "Vitalité",
    desc: m => `+${Math.round(45 * m)} PV max et soin immédiat`,
    apply: (s, m) => {
      const add = Math.round(45 * m);
      s.maxHp += add;
      s.hp = Math.min(s.maxHp, s.hp + add);
    }
  },
  {
    id: 7, short: "Lames",
    desc: m => `+${Math.max(2, Math.round(2 * m))} lames, portée +12 px et +35 % dégâts`,
    apply: (s, m) => {
      s.orb += Math.max(2, Math.round(2 * m));
      s.orbRad += 12;
      s.orbSize += 0.16 * m;
      s.orbDmgMult *= 1 + 0.35 * m;
    }
  },
  {
    id: 8, short: "Armure",
    desc: m => `-${Math.round(13 * m)} % dégâts subis et +15 PV max`,
    apply: (s, m) => {
      s.armor = Math.min(0.78, s.armor + 0.13 * m);
      s.maxHp += 15;
      s.hp = Math.min(s.maxHp, s.hp + 15);
    }
  },
  {
    id: 9, short: "Critique",
    desc: m => `+${Math.round(15 * m)} % chance critique et +${(0.45 * m).toFixed(2)}× dégâts crit`,
    apply: (s, m) => { s.crit = Math.min(0.95, s.crit + 0.15 * m); s.critMult += 0.45 * m; }
  },
  {
    id: 10, short: "Onde de choc",
    desc: m => `Nova niv.+${Math.max(1, Math.round(m))} tous les 5 tirs (rayon + dégâts)`,
    apply: (s, m) => { s.nova += Math.max(1, Math.round(m)); }
  },
  {
    id: 11, short: "Ricochet",
    desc: m => `+${Math.max(2, Math.round(2 * m))} rebonds et +18 % vitesse projectiles`,
    apply: (s, m) => { s.bounce += Math.max(2, Math.round(2 * m)); s.projSpd *= 1.18; }
  },
  {
    id: 12, short: "Aura de givre",
    desc: m => `Rayon +${Math.round(50 * m)} px, ralentit +15 % et dégâts de gel +${Math.round(22 * m)}`,
    apply: (s, m) => {
      s.frostR += Math.round(50 * m);
      s.frostSlow = Math.min(0.78, s.frostSlow + 0.15 * m);
      s.frostDmg += Math.round(22 * m);
    }
  },
  {
    id: 13, short: "Régénération",
    desc: m => `+${(2.2 * m).toFixed(1)} PV régénérés par seconde`,
    apply: (s, m) => { s.regen += 2.2 * m; }
  },
  {
    id: 14, short: "Déflagration",
    desc: m => `Les ennemis explosent (+${Math.round(40 * m)} % PV max en zone)`,
    apply: (s, m) => { s.corpseExp += 0.40 * m; }
  },
  {
    id: 15, short: "Drone",
    desc: m => `+${Math.max(1, Math.round(m))} drone(s) autonome(s) à tir rapide`,
    apply: (s, m) => { s.drone += Math.max(1, Math.round(m)); }
  },
  {
    id: 16, short: "Aimant & XP",
    desc: m => `Portée aimant +${Math.round(65 * m)} px et +${Math.round(30 * m)} % XP`,
    apply: (s, m) => { s.magnet += Math.round(65 * m); s.xpMult *= 1 + 0.30 * m; }
  }
];

const COMBOS = [
  {
    id: 0, name: "Mitrailleuse lourde", req: [0, 1],
    desc: "+25 % cadence et +15 % dégâts (plafonné à +45 % dégâts bonus)",
    apply: (s, lvl) => {
      s.rate *= 1.25;
      if (lvl <= 3) s.dmg *= 1.15;
    }
  },
  {
    id: 1, name: "Tempête de lames", req: [7, 1],
    desc: "+3 lames géantes, orbite éloignée (+28 px), rotation +55 % et dégâts ×2,2",
    apply: s => {
      s.orb += 3;
      s.orbRad += 28;
      s.orbSize += 0.35;
      s.orbSpd *= 1.55;
      s.orbDmgMult *= 2.2;
    }
  },
  {
    id: 2, name: "Lames spectrales", req: [7, 3],
    desc: "Lames colossales (+32 px portée, taille +45 %) et dégâts ×2,4",
    apply: s => {
      s.orb += 2;
      s.orbRad += 32;
      s.orbSize += 0.45;
      s.orbDmgMult *= 2.4;
    }
  },
  {
    id: 3, name: "Faucheuse sanglante", req: [7, 9],
    desc: "Lames critiques élargies (+25 px portée), +20 % crit et dégâts lames ×2,0",
    apply: s => {
      s.orbRad += 25;
      s.orbSize += 0.30;
      s.orbDmgMult *= 2.0;
      s.crit = Math.min(0.95, s.crit + 0.20);
      s.critMult += 0.55;
    }
  },
  {
    id: 4, name: "Pluie d'acier", req: [2, 11],
    desc: "+2 projectiles, +3 ricochets et +25 % vitesse tirs",
    apply: s => { s.multi += 2; s.bounce += 3; s.projSpd *= 1.25; }
  },
  {
    id: 5, name: "Blizzard absolu", req: [12, 10],
    desc: "Aura de givre +80 px, dégâts gel ×2 et onde de choc tous les 4 tirs",
    apply: s => { s.frostR += 80; s.frostDmg *= 2.0; s.nova += 2; s.novaEvery = 4; }
  },
  {
    id: 6, name: "Forteresse vivante", req: [6, 8],
    desc: "+90 PV max, +15 % armure et +3,5 PV/s régénération",
    apply: s => { s.maxHp += 90; s.hp += 90; s.armor = Math.min(0.80, s.armor + 0.15); s.regen += 3.5; }
  },
  {
    id: 7, name: "Essaim mortel", req: [15, 14],
    desc: "+2 drones et explosions de cadavres +65 %",
    apply: s => { s.drone += 2; s.corpseExp += 0.65; }
  }
];

const SUPER_COMBOS = [
  {
    id: 0, name: "Vortex d'acier divin", req: [1, 2],
    desc: "+4 lames titaniques, orbite à 125 px, taille +60 % et dégâts lames ×3,0",
    apply: s => {
      s.orb += 4;
      s.orbRad = Math.max(125, s.orbRad + 30);
      s.orbSize += 0.60;
      s.orbSpd *= 1.4;
      s.orbDmgMult *= 3.0;
    }
  },
  {
    id: 1, name: "Apocalypse glaciaire", req: [5, 7],
    desc: "Givre massif (+100 px), dégâts gel ×2,5 et onde de choc tous les 3 tirs",
    apply: s => { s.frostR += 100; s.frostDmg *= 2.5; s.nova += 3; s.novaEvery = 3; }
  },
  {
    id: 2, name: "Jugement écarlate", req: [3, 6],
    desc: "+8 % vol de vie, +100 PV max et +40 % dégâts globaux",
    apply: s => { s.lifesteal += 0.08; s.maxHp += 100; s.hp += 100; s.dmg *= 1.40; }
  },
  {
    id: 3, name: "Déluge arcanique", req: [0, 4],
    desc: "+3 projectiles, +3 perforation et +30 % cadence",
    apply: s => { s.multi += 3; s.pierce += 3; s.rate *= 1.30; }
  }
];

const ENEMIES_INFO = [
  { id: 0, name: "Rôdeur", waveMin: 1, role: "Éclaireur équilibré qui fonce vers le joueur le plus proche." },
  { id: 1, name: "Sprinteur", waveMin: 2, role: "Très rapide et fragile, attaque en meute." },
  { id: 2, name: "Colosse", waveMin: 3, role: "Tank massif à haute résistance." },
  { id: 3, name: "Artilleur", waveMin: 4, role: "Garde ses distances et tire des projectiles rouges." },
  { id: 5, name: "Spectre", waveMin: 6, role: "Rapide et semi-transparent, contourne les défenses." },
  { id: 6, name: "Exploseur", waveMin: 8, role: "Accélère au contact et explose en zone." },
  { id: 7, name: "Gardien", waveMin: 11, role: "Blindé, résiste aux tirs légers." },
  { id: 8, name: "Nécromancien", waveMin: 14, role: "Tire des salves multiples à distance." },
  { id: 9, name: "Brute", waveMin: 18, role: "Charge violemment à grande vitesse." }
];

const BOSSES_INFO = [
  { id: 0, name: "Colosse de Braise", wave: "Vague 5 / 30", role: "Tir circulaire à 360° et onde thermique." },
  { id: 1, name: "Faucheur Écarlate", wave: "Vague 10 / 35", role: "Charges rapides et salves en éventail." },
  { id: 2, name: "Léviathan Astral", wave: "Vague 15 / 40", role: "Barrage spiralé continu." },
  { id: 3, name: "Matriarche Virulente", wave: "Vague 20 / 45", role: "Invoque des nuées et projette des spores." },
  { id: 4, name: "Seigneur du Néant", wave: "Vague 25 / 50", role: "Combine charges, anneaux et salves." }
];

const INITIAL_PATCH_NOTES = [
  {
    version: "v1.7 — Évolution & Ranked Elo",
    date_label: "28 Nov. 2026",
    is_latest: true,
    items: [
      "Base de données PostgreSQL persistante via Railway et reconnexion automatique aux parties en cours.",
      "Choix automatique des améliorations au bout de 15 secondes si aucun bonus n’est sélectionné.",
      "Chat en direct dans le salon et en partie, plus système d’amis complet (ajout, profil détaillé, rejoindre).",
      "Équilibrage majeur : nerf du combo Mitrailleuse lourde, buff massif des lames (taille, portée et dégâts) et buff de tous les bonus hors dégâts/cadence/vitesse/régén.",
      "La zone de gel déclenche désormais les coups critiques, le vol de vie et l’onde de choc.",
      "Ajout de 3 difficultés (Facile, Medium, Ranked), nouveau système Elo (0 = Non classé) et classement Ranked à partir de 1000 Elo.",
      "Musique d’ambiance et bruitages générés en Web Audio, menu Réglages (touches + volumes) et joystick tactile mobile."
    ]
  },
  {
    version: "v1.6 — HUD Latéral & Maîtrise",
    date_label: "24 Nov. 2026",
    is_latest: false,
    items: [
      "Interface 3 colonnes libérant intégralement l’arène de jeu.",
      "Tableau des statistiques en direct, relance des bonus et maîtrise des 10 classes."
    ]
  }
];

module.exports = {
  DT, W, H, MAX_PLAYERS, MAX_WAVE, PICK_TIMEOUT, RECONNECT_GRACE,
  DIFFICULTIES, RANKS, getRankFromElo, RARITIES, MAP_THEMES,
  CLASSES, UPGRADES, COMBOS, SUPER_COMBOS,
  ENEMIES_INFO, BOSSES_INFO, INITIAL_PATCH_NOTES
};