window.Sprites = (function () {
  var TAU = Math.PI * 2;
  var CO = ["#59b878", "#5b8fd9", "#e09a3e", "#d96277", "#9b6bd9", "#45b8b0"];
  var CO_DARK = ["#2b663f", "#2c4f87", "#8c5a19", "#853040", "#573485", "#226964"];
  var EC = ["#c94a4a", "#d97b38", "#7e52a0", "#cbb042", "#9e2a3b", "#4fb3bf", "#ff6b2b", "#b8432e", "#4e8c6f", "#8e44ad"];
  var ER = [11, 8, 17, 10, 30, 10, 9, 13, 12, 13];
  var BOSS_COLS = ["#9e2a3b", "#c4492b", "#3b7a9e", "#7a3b9e", "#b88628"];

  function svgUri(inner) {
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' + inner + "</svg>");
  }

  var UP_IMGS = [
    svgUri('<path d="M24 4L28 8L13 23L9 19Z" fill="#e5a93c"/><path d="M7 21L11 25L6 28L4 26Z" fill="#d94e4e"/>'),
    svgUri('<path d="M18 3L8 17h7l-2 12 11-14h-7z" fill="#ffd166" stroke="#8c5a19" stroke-width="1.5"/>'),
    svgUri('<path d="M6 24L12 8M16 24V6M26 24L20 8" stroke="#5b8fd9" stroke-width="3" stroke-linecap="round"/>'),
    svgUri('<line x1="3" y1="16" x2="29" y2="16" stroke="#e5a93c" stroke-width="3"/><polygon points="29,16 22,11 22,21" fill="#ffd166"/><rect x="13" y="7" width="4" height="18" rx="1" fill="#d96277"/>'),
    svgUri('<path d="M5 22c6 0 11-4 14-11l7 4c-3 7-9 11-18 11z" fill="#59b878"/>'),
    svgUri('<path d="M8 7v10a8 8 0 0016 0V7h-4v10a4 4 0 01-8 0V7z" fill="#d94e4e"/><rect x="8" y="6" width="4" height="4" fill="#e0e6ed"/><rect x="20" y="6" width="4" height="4" fill="#e0e6ed"/>'),
    svgUri('<path d="M16 27S5 19.5 5 12a6 6 0 0111-3.3A6 6 0 0127 12c0 7.5-11 15-11 15z" fill="#59b878"/><path d="M16 11v8M12 15h8" stroke="#14110e" stroke-width="2.4"/>'),
    svgUri('<circle cx="16" cy="16" r="9" fill="none" stroke="#9c8e7c" stroke-dasharray="3 3" stroke-width="1.6"/><polygon points="16,2 19,7 16,10 13,7" fill="#e0e6ed"/><polygon points="16,30 19,25 16,22 13,25" fill="#e0e6ed"/>'),
    svgUri('<path d="M16 3L27 7v8c0 7.5-4.8 12.2-11 14C9.8 27.2 5 22.5 5 15V7z" fill="#5b8fd9"/><path d="M16 10v10M11 15h10" stroke="#f0e6d6" stroke-width="2.6"/>'),
    svgUri('<polygon points="16,2 20,11 30,12 22,19 25,29 16,23 7,29 10,19 2,12 12,11" fill="#ffd166"/>'),
    svgUri('<circle cx="16" cy="16" r="4" fill="#ff9f1c"/><circle cx="16" cy="16" r="9" fill="none" stroke="#e5a93c" stroke-width="2.2"/><circle cx="16" cy="16" r="14" fill="none" stroke="#e05656" stroke-width="1.8" stroke-dasharray="4 3"/>'),
    svgUri('<polyline points="5,25 15,8 25,22 28,12" fill="none" stroke="#45b8b0" stroke-width="2.8" stroke-linecap="round"/><circle cx="15" cy="8" r="2.8" fill="#ffd166"/>'),
    svgUri('<g stroke="#7ce8ff" stroke-width="2.3" stroke-linecap="round"><line x1="16" y1="3" x2="16" y2="29"/><line x1="4.7" y1="9.5" x2="27.3" y2="22.5"/><line x1="27.3" y1="9.5" x2="4.7" y2="22.5"/></g>'),
    svgUri('<path d="M16 4C16 4 7 14 7 20a9 9 0 0018 0C25 14 16 4 16 4z" fill="#e05656" stroke="#120d0a" stroke-width="1.5"/>'),
    svgUri('<polygon points="16,2 20,10 29,8 24,16 30,23 21,23 18,30 13,23 4,25 9,17 3,10 12,10" fill="#ff9f1c" stroke="#d94e4e" stroke-width="1.5"/>'),
    svgUri('<polygon points="16,3 27,9 27,23 16,29 5,23 5,9" fill="none" stroke="#66f7ff" stroke-width="2.6"/><circle cx="16" cy="16" r="5" fill="#45b8b0"/>'),
    svgUri('<path d="M4 16h18M17 10l8 6-8 6" fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="11" x2="11" y2="11" stroke="#9be8d8" stroke-width="2"/>')
  ];

  function drawSkinDetail(g, skin, aimAngle) {
    g.save();
    if (skin === 1) {
      g.strokeStyle = "#cfd6de"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 0, 11, -2.5, -0.64); g.stroke();
      g.fillStyle = "#d94e4e"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-2, -11); g.lineTo(0, -17); g.lineTo(3, -11); g.closePath(); g.fill(); g.stroke();
    } else if (skin === 2) {
      g.fillStyle = "#1c1917"; g.fillRect(-10.5, -5.5, 21, 3.5);
      g.strokeStyle = "#120d0a"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-10, -4); g.lineTo(-17, -8); g.moveTo(-10, -3); g.lineTo(-16, -1); g.stroke();
    } else if (skin === 3) {
      g.fillStyle = "#f0e6d6"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-9, -5); g.quadraticCurveTo(-17, -12, -13, -17); g.quadraticCurveTo(-10, -11, -6, -8); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(9, -5); g.quadraticCurveTo(17, -12, 13, -17); g.quadraticCurveTo(10, -11, 6, -8); g.closePath(); g.fill(); g.stroke();
    } else if (skin === 4) {
      g.fillStyle = "#3a285c"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(-13, -6); g.lineTo(13, -6); g.lineTo(2, -20); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#ffd166"; g.beginPath(); g.arc(1, -11, 2, 0, TAU); g.fill();
    } else if (skin === 5) {
      g.strokeStyle = "#120d0a"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(6, -9); g.lineTo(8, -16); g.stroke();
      g.fillStyle = "#66f7ff"; g.beginPath(); g.arc(8, -16, 2.2, 0, TAU); g.fill();
      g.save(); g.rotate(aimAngle);
      g.fillStyle = "#66f7ff"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.2;
      g.fillRect(1, -4.5, 7.5, 9); g.strokeRect(1, -4.5, 7.5, 9);
      g.restore();
    } else if (skin === 6) {
      g.fillStyle = "#ffd166"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-8, -8); g.lineTo(-9, -16); g.lineTo(-4, -12); g.lineTo(0, -17); g.lineTo(4, -12); g.lineTo(9, -16); g.lineTo(8, -8);
      g.closePath(); g.fill(); g.stroke();
    } else if (skin === 7) {
      g.fillStyle = "#181512"; g.strokeStyle = "#0a0807"; g.lineWidth = 1.8;
      g.beginPath(); g.arc(0, -1, 11.8, Math.PI * 0.85, Math.PI * 2.15); g.closePath(); g.fill(); g.stroke();
      var ex = Math.cos(aimAngle) * 4, ey = Math.sin(aimAngle) * 4;
      g.fillStyle = "#ff6b6b"; g.beginPath(); g.arc(ex - 2, ey, 1.7, 0, TAU); g.arc(ex + 2, ey, 1.7, 0, TAU); g.fill();
    } else if (skin === 8) {
      g.fillStyle = "#e5a93c"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, -2, 11.2, Math.PI, TAU); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#ff9f1c"; g.fillRect(-7, -5, 6, 4); g.fillRect(1, -5, 6, 4);
      g.strokeStyle = "#120d0a"; g.strokeRect(-7, -5, 6, 4); g.strokeRect(1, -5, 6, 4);
    } else if (skin === 9) {
      g.fillStyle = "#7a1c28"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-12, -2); g.lineTo(-15, -11); g.lineTo(-6, -7); g.lineTo(6, -7); g.lineTo(15, -11); g.lineTo(12, -2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#fff";
      g.beginPath(); g.moveTo(-3, 4); g.lineTo(-1.5, 8); g.lineTo(0, 4); g.moveTo(0, 4); g.lineTo(1.5, 8); g.lineTo(3, 4); g.fill();
    }
    g.restore();
  }

  var SKIN_CACHE = {};
  function getSkinDataUrl(skinIdx, colIdx) {
    var k = skinIdx + "_" + colIdx;
    if (SKIN_CACHE[k]) return SKIN_CACHE[k];
    var cnv = document.createElement("canvas"); cnv.width = 48; cnv.height = 48;
    var g = cnv.getContext("2d");
    var c = CO[colIdx % 6], cd = CO_DARK[colIdx % 6];
    g.translate(24, 28);
    g.fillStyle = c; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill();
    g.fillStyle = cd; g.beginPath(); g.arc(0, 2, 9.5, 0.2, Math.PI - 0.2); g.fill();
    g.strokeStyle = "#120d0a"; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.stroke();
    if (skinIdx !== 5 && skinIdx !== 7) {
      g.fillStyle = "#f5ebd6"; g.beginPath(); g.arc(3.5, 0, 4.5, 0, TAU); g.fill();
      g.strokeStyle = "#120d0a"; g.lineWidth = 1.5; g.stroke();
    }
    drawSkinDetail(g, skinIdx, 0);
    SKIN_CACHE[k] = cnv.toDataURL();
    return SKIN_CACHE[k];
  }

  var GEM_SPR = null;
  function getGemSprite() {
    if (GEM_SPR) return GEM_SPR;
    GEM_SPR = document.createElement("canvas"); GEM_SPR.width = 16; GEM_SPR.height = 18;
    var g = GEM_SPR.getContext("2d");
    g.fillStyle = "#3fa796"; g.strokeStyle = "#120d0a"; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(8, 2); g.lineTo(13, 9); g.lineTo(8, 16); g.lineTo(3, 9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#9be8d8"; g.beginPath(); g.moveTo(8, 4); g.lineTo(10.5, 9); g.lineTo(8, 9); g.closePath(); g.fill();
    return GEM_SPR;
  }

  var BG_CACHE = {};
  function createArenaBg(W, H, theme) {
    var tid = theme ? theme.id : 0;
    if (BG_CACHE[tid]) return BG_CACHE[tid];

    var bgColor = (theme && theme.bg) || "#221e1a";
    var rgb = (theme && theme.tile) || [35, 31, 27];
    var borderCol = (theme && theme.border) || "#463b30";
    var accentCol = (theme && theme.accent) || "#e5a93c";

    var bg = document.createElement("canvas"); bg.width = W; bg.height = H;
    var g = bg.getContext("2d");
    g.fillStyle = bgColor; g.fillRect(0, 0, W, H);
    var ts = 48;
    for (var y = 0; y < H; y += ts) {
      for (var x = 0; x < W; x += ts) {
        var v = ((x * 17 + y * 31 + tid * 13) % 11) - 5;
        g.fillStyle = "rgb(" + Math.max(8, rgb[0] + v) + "," + Math.max(8, rgb[1] + v) + "," + Math.max(8, rgb[2] + v) + ")";
        g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      }
    }

    // Motif central discret assorti au thème
    g.save();
    g.strokeStyle = accentCol;
    g.globalAlpha = 0.12;
    g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, H / 2, 110, 0, TAU); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 185, 0, TAU); g.stroke();
    g.restore();

    var vg = g.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.68);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(8,6,5,.58)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#120f0c"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.strokeStyle = borderCol; g.lineWidth = 2.5; g.strokeRect(6, 6, W - 12, H - 12);

    BG_CACHE[tid] = bg;
    return bg;
  }

  return {
    CO: CO, CO_DARK: CO_DARK, EC: EC, ER: ER, BOSS_COLS: BOSS_COLS,
    UP_IMGS: UP_IMGS, drawSkinDetail: drawSkinDetail,
    getSkinDataUrl: getSkinDataUrl, getGemSprite: getGemSprite, createArenaBg: createArenaBg
  };
})();