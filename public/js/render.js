window.Render = (function () {
  var W = 800, H = 560, TAU = Math.PI * 2;
  var FONT = '"Trebuchet MS","Segoe UI",sans-serif';
  var SERIF = 'Georgia,"Times New Roman",serif';
  var BG = null;

  var FX = { PA: [], DEC: [], RINGS: [], FLOATS: [], GHOSTS: [], TR: [[], [], [], [], [], []], shake: 0, flashE: {} };

  function addRing(x, y, rMax, c, lw) {
    if (FX.RINGS.length >= 26) FX.RINGS.shift();
    FX.RINGS.push({ x: x, y: y, r: 6, rm: rMax, c: c, lw: lw || 3, l: 0.38, ml: 0.38 });
  }
  function addFloat(x, y, txt, c) {
    if (FX.FLOATS.length >= 32) FX.FLOATS.shift();
    FX.FLOATS.push({ x: x, y: y, txt: txt, c: c, l: 1.2, ml: 1.2 });
  }
  function burst(x, y, c, n, stain) {
    for (var i = 0; i < n; i++) {
      if (FX.PA.length >= 180) FX.PA.shift();
      var a = Math.random() * TAU, s = 35 + Math.random() * 125;
      FX.PA.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0.26 + Math.random() * 0.28, ml: 0.54, sz: 2 + Math.random() * 3.2, c: c });
    }
    if (stain) {
      if (FX.DEC.length >= 100) FX.DEC.shift();
      FX.DEC.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, r: 4 + Math.random() * 7, c: c, a: 0.26 });
    }
  }
  function resetFx() {
    FX.PA = []; FX.DEC = []; FX.RINGS = []; FX.FLOATS = []; FX.GHOSTS = [];
    FX.TR = [[], [], [], [], [], []]; FX.shake = 0; FX.flashE = {};
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawEnemy(ctx, e, a, tt, paused) {
    var x = e[0], y = e[1], k = e[2], bk = e[4] || 0, charging = e[5] || 0, slowed = e[6] || 0;
    var r = k === 4 ? (bk === 4 ? 36 : (bk === 3 ? 34 : (bk === 1 ? 26 : 31))) : (Sprites.ER[k] || 11);
    var c = k === 4 ? Sprites.BOSS_COLS[bk] : (Sprites.EC[k] || "#c94a4a");
    var key = k + "_" + Math.round(x / 25) + "_" + Math.round(y / 25);
    var hit = FX.flashE[key] > 0;
    var step = paused ? 0 : Math.sin(tt * ((k === 1 || k === 6 || charging) ? 22 : 12) + x * 0.09);

    ctx.fillStyle = "rgba(8,6,5,.48)";
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.94, r * 0.36, 0, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(x, y - Math.abs(step) * 1.8);
    if (k === 5) ctx.globalAlpha = 0.75;

    ctx.fillStyle = k === 6 ? (Math.floor(tt * 14) % 2 ? "#ff9f1c" : "#e04819") : (hit ? "#fff" : (slowed ? "#5bc0eb" : c));
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = charging ? "#ffd166" : (slowed ? "#aef2ff" : "#120d0a");
    ctx.lineWidth = k === 4 ? 3.2 : 2.2;
    ctx.stroke();

    if (!hit) {
      for (var s = -1; s <= 1; s += 2) {
        var ex = Math.cos(a) * r * 0.38 + Math.cos(a + 1.57) * s * r * 0.35;
        var ey = Math.sin(a) * r * 0.38 + Math.sin(a + 1.57) * s * r * 0.35;
        ctx.fillStyle = (k === 4 || k === 6) ? "#ffd166" : "#f5ebd6";
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.24, 0, TAU); ctx.fill();
        ctx.fillStyle = "#120d0a";
        ctx.beginPath(); ctx.arc(ex + Math.cos(a) * r * 0.08, ey + Math.sin(a) * r * 0.08, r * 0.12, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    if (k === 2 || k === 7 || k === 9) {
      ctx.fillStyle = "#120d0a"; rr(ctx, x - r - 1, y - r - 14, r * 2 + 2, 5, 2); ctx.fill();
      ctx.fillStyle = "#d94e4e"; rr(ctx, x - r, y - r - 13, Math.max(2, r * 2 * e[3] / 100), 3, 1); ctx.fill();
    }
  }

  function drawPlayer(ctx, S, p, i, v, aimAngle, tt, pName) {
    var c = Sprites.CO[i % 6], cd = Sprites.CO_DARK[i % 6], T = FX.TR[i];
    var skin = p[16] || 0, frostR = p[18] || 0, drones = p[21] || 0;
    var bob = S.pz ? 0 : Math.sin(tt * 15 + i) * 2.2 * Math.min(1, Math.hypot(v.vx || 0, v.vy || 0) / 6);

    if (p[4]) {
      var revBy = p[17] || 0;
      ctx.strokeStyle = revBy > 1 ? "rgba(89,184,120,.55)" : "rgba(240,230,214,.25)";
      ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(v.x, v.y, 62, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = revBy > 1 ? "#59b878" : c; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(v.x, v.y, 21, -1.57, -1.57 + TAU * p[5] / 2.2); ctx.stroke();
      ctx.fillStyle = "#5c5349"; ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(v.x, v.y, 10, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f0e6d6"; ctx.font = "bold 10px " + FONT; ctx.textAlign = "center";
      ctx.fillText(pName + " (À TERRE)", v.x, v.y - 29);
      return;
    }

    if (frostR > 0) {
      ctx.fillStyle = "rgba(124,232,255,.06)"; ctx.beginPath(); ctx.arc(v.x, v.y, frostR, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(124,232,255,.26)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(v.x, v.y, frostR, 0, TAU); ctx.stroke();
    }
    if (p[6]) {
      ctx.strokeStyle = "rgba(126,224,155,.65)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(v.x, v.y, 17 + Math.sin(tt * 14) * 1.5, 0, TAU); ctx.stroke();
    }
    if (i === S.me) {
      ctx.strokeStyle = "rgba(240,230,214,.09)"; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(v.x, v.y, p[8], 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }

    for (var k = 0; k < T.length; k += 2) {
      var f = k / T.length;
      ctx.fillStyle = "rgba(20,17,14," + (f * 0.28) + ")";
      ctx.beginPath(); ctx.arc(T[k].x, T[k].y, 4.2 * f, 0, TAU); ctx.fill();
    }

    // Arme
    var kick = (v.recoil || 0) * 4.5;
    ctx.save();
    ctx.translate(v.x, v.y - Math.abs(bob)); ctx.rotate(aimAngle);
    ctx.fillStyle = "#4a423a"; ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 2;
    rr(ctx, 4 - kick, -3, 13, 6, 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Corps & classe
    ctx.save();
    ctx.translate(v.x, v.y - Math.abs(bob));
    ctx.globalAlpha = p[6] && Math.floor(tt * 20) % 2 ? 0.45 : 1;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = cd; ctx.beginPath(); ctx.arc(0, 2, 9.5, 0.2, Math.PI - 0.2); ctx.fill();
    ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();

    if (skin !== 5 && skin !== 7) {
      ctx.fillStyle = "#f5ebd6";
      ctx.beginPath(); ctx.arc(Math.cos(aimAngle) * 3.5, Math.sin(aimAngle) * 3.5, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    Sprites.drawSkinDetail(ctx, skin, aimAngle);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Drone autonome (Ingénieur)
    if (drones > 0) {
      var dy = v.y - 20 + Math.sin(tt * 6 + i) * 2.5;
      ctx.fillStyle = "#e5a93c"; ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(v.x, dy, 5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#66f7ff"; ctx.beginPath(); ctx.arc(v.x, dy, 2, 0, TAU); ctx.fill();
    }

    // Lames orbitales
    if (p[10]) {
      var ospd = p[14] || 1;
      for (var q = 0; q < p[10]; q++) {
        var oa = S.oa * ospd + q * TAU / p[10], bx = v.x + Math.cos(oa) * 46, by = v.y + Math.sin(oa) * 46;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(oa + 1.57);
        ctx.fillStyle = "#d8cfc0"; ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }

    ctx.fillStyle = i === S.me ? "#ffd166" : "#f0e6d6"; ctx.font = "bold 10px " + FONT; ctx.textAlign = "center";
    ctx.fillText(pName, v.x, v.y - (drones > 0 ? 30 : 21));
  }

  function drawFrame(ctx, App, tt) {
    if (!BG) BG = Sprites.createArenaBg(W, H);
    var S = App.S;
    ctx.save();
    if (FX.shake > 0 && !(S && S.pz)) ctx.translate((Math.random() - 0.5) * FX.shake, (Math.random() - 0.5) * FX.shake);
    ctx.drawImage(BG, 0, 0);

    FX.DEC.forEach(function (d) { ctx.globalAlpha = d.a; ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); });
    ctx.globalAlpha = 1;
    FX.RINGS.forEach(function (rg) {
      var a = Math.max(0, rg.l / rg.ml);
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = rg.c; ctx.lineWidth = rg.lw * a;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, TAU); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    if (S && S.st !== "lobby") {
      var gemImg = Sprites.getGemSprite();
      S.G.forEach(function (g) { ctx.drawImage(gemImg, g[0] - 8, g[1] - 9 + (S.pz ? 0 : Math.sin(tt * 4.5 + g[0]) * 2)); });

      S.E.forEach(function (e) {
        var ang = 0, nd = 1e12;
        for (var j = 0; j < S.p.length; j++) {
          if (S.p[j][4] || !App.vis[j]) continue;
          var dx = App.vis[j].x - e[0], dy = App.vis[j].y - e[1], d2 = dx * dx + dy * dy;
          if (d2 < nd) { nd = d2; ang = Math.atan2(dy, dx); }
        }
        drawEnemy(ctx, e, ang, tt, S.pz);
      });

      S.B.forEach(function (b) {
        ctx.strokeStyle = "#120d0a"; ctx.lineWidth = b[5] ? 6.5 : 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(b[0] - b[2] * 0.034, b[1] - b[3] * 0.034); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.strokeStyle = Sprites.CO[b[4] % 6]; ctx.lineWidth = b[5] ? 3.8 : 2.5;
        ctx.beginPath(); ctx.moveTo(b[0] - b[2] * 0.034, b[1] - b[3] * 0.034); ctx.lineTo(b[0], b[1]); ctx.stroke();
      });

      S.X.forEach(function (xb) {
        ctx.fillStyle = "#d94e4e"; ctx.strokeStyle = "#120d0a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(xb[0], xb[1], 4.5, 0, TAU); ctx.fill(); ctx.stroke();
      });

      (S.lks || []).forEach(function (pair) {
        var v0 = App.vis[pair[0]], v1 = App.vis[pair[1]];
        if (!v0 || !v1) return;
        ctx.strokeStyle = S.flk ? "#ffd166" : "#e5a93c"; ctx.lineWidth = S.flk ? 3 : 2;
        if (!S.flk) ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(v0.x, v0.y); ctx.lineTo(v1.x, v1.y); ctx.stroke();
        if (!S.flk) ctx.setLineDash([]);
      });

      S.p.forEach(function (p, pi) {
        var v = App.vis[pi]; if (!v) return;
        var aim = 0, nd2 = 1e12;
        S.E.forEach(function (e) { var d2 = (e[0] - v.x) * (e[0] - v.x) + (e[1] - v.y) * (e[1] - v.y); if (d2 < nd2) { nd2 = d2; aim = Math.atan2(e[1] - v.y, e[0] - v.x); } });
        drawPlayer(ctx, S, p, pi, v, aim, tt, App.pName(pi));
      });

      FX.PA.forEach(function (pt) { ctx.globalAlpha = Math.max(0, pt.l / pt.ml); ctx.fillStyle = pt.c; ctx.fillRect(pt.x - pt.sz / 2, pt.y - pt.sz / 2, pt.sz, pt.sz); });
      ctx.globalAlpha = 1;
      FX.FLOATS.forEach(function (fl) {
        ctx.globalAlpha = Math.min(1, fl.l / fl.ml * 1.5); ctx.font = "bold 11px " + FONT; ctx.textAlign = "center";
        ctx.fillStyle = "#120d0a"; ctx.fillText(fl.txt, fl.x + 1, fl.y + 1);
        ctx.fillStyle = fl.c; ctx.fillText(fl.txt, fl.x, fl.y);
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // HUD
    if (S && S.st !== "lobby") {
      var me = S.p[S.me];
      ctx.fillStyle = "#120d0a"; ctx.fillRect(0, 0, W, 8);
      ctx.fillStyle = "#3fa796"; ctx.fillRect(0, 0, W * Math.min(1, S.xp / S.nd), 7);

      S.p.forEach(function (p, i) {
        var col = i % 2, row = Math.floor(i / 2), x = col ? W - 166 : 12, y = 14 + row * 22;
        var hp = Math.max(0, p[2] / p[3]);
        rr(ctx, x, y, 154, 18, 4); ctx.fillStyle = "#161310"; ctx.fill();
        if (hp > 0) { rr(ctx, x + 2, y + 2, Math.max(4, 150 * hp), 14, 2); ctx.fillStyle = p[4] ? "#5c5349" : Sprites.CO[i % 6]; ctx.fill(); }
        rr(ctx, x, y, 154, 18, 4); ctx.strokeStyle = i === S.me ? "#e5a93c" : "#463b30"; ctx.lineWidth = i === S.me ? 2 : 1.5; ctx.stroke();
        ctx.fillStyle = "#f0e6d6"; ctx.font = "bold 10px " + FONT; ctx.textAlign = "center";
        ctx.fillText(App.pName(i) + (p[4] ? " · À TERRE" : "  " + Math.ceil(p[2]) + "/" + p[3]), x + 77, y + 12);
      });

      ctx.fillStyle = "#e5a93c"; ctx.font = "bold 22px " + SERIF; ctx.textAlign = "center";
      ctx.fillText("VAGUE " + S.wv + " / " + (S.mw || 50), W / 2, 31);
      ctx.fillStyle = "#cbbba6"; ctx.font = "bold 11px " + FONT;
      var myKills = me ? (me[19] || 0) : 0;
      ctx.fillText("Restants : " + S.rem + "  ·  Niv. " + S.l + "  ·  Kills : " + S.k + " (Toi : " + myKills + ")", W / 2, 47);

      if (S.bn) {
        var bw = 340, bx = (W - bw) / 2, by = 62;
        rr(ctx, bx, by, bw, 16, 4); ctx.fillStyle = "#161310"; ctx.fill();
        if (S.bh > 0) { rr(ctx, bx + 2, by + 2, Math.max(4, (bw - 4) * S.bh / 100), 12, 2); ctx.fillStyle = "#d94e4e"; ctx.fill(); }
        rr(ctx, bx, by, bw, 16, 4); ctx.strokeStyle = "#e5a93c"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#f0e6d6"; ctx.font = "bold 9.5px " + FONT; ctx.textAlign = "center";
        ctx.fillText(S.bn.toUpperCase() + " — " + S.bh + "%", W / 2, by + 12);
      }

      var ranks = App.ency.ranks || [];
      var curRk = ranks[S.myRank || 0] || { name: "Bronze", target: 1440 };
      var nextRk = ranks[Math.min(ranks.length - 1, (S.myRank || 0) + 1)] || curRk;
      ctx.textAlign = "right"; ctx.font = "bold 10.5px " + FONT;
      ctx.fillStyle = S.tm <= nextRk.target ? "rgba(240,230,214,.65)" : "rgba(224,86,86,.8)";
      ctx.fillText("SALLE " + S.code + " · " + App.fmt(S.tm) + " / " + App.fmt(nextRk.target) + " (" + curRk.name + ")", W - 14, H - 44);

      if (S.pz && !S.mpz) {
        ctx.fillStyle = "rgba(10,8,6,.74)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#e5a93c"; ctx.font = "bold 26px " + SERIF; ctx.textAlign = "center";
        ctx.fillText("PAUSE — NIVEAU " + S.l, W / 2, H / 2 - 74);
        ctx.fillStyle = "#f0e6d6"; ctx.font = "bold 14px " + FONT;
        ctx.fillText((S.ch && S.ch.length) ? "Choisis ton amélioration (1/& , 2/é , 3/\")" : "En attente de l'escouade…", W / 2, H / 2 - 46);
      }
    }
  }

  return { FX: FX, addRing: addRing, addFloat: addFloat, burst: burst, resetFx: resetFx, drawFrame: drawFrame };
})();