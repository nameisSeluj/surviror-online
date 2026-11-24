window.UI = (function () {
  var ov = document.getElementById("ov");
  var pk = document.getElementById("pk");
  var leftHud = document.getElementById("leftHud");
  var rightHud = document.getElementById("rightHud");
  var subModal = document.getElementById("subModal");
  var tabModal = document.getElementById("tabModal");
  var tq = document.getElementById("tt");

  var ovKey = "", pkKey = "", leftKey = "", rightKey = "";
  var lbTab = 1, encyTab = "classes", authMode = "login", authErr = "";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toast(m, c) {
    var d = document.createElement("div");
    d.className = "t"; d.style.color = c; d.textContent = m;
    tq.appendChild(d);
    setTimeout(function () { d.remove(); }, 2100);
  }

  function setOv(key, html, fn) {
    if (ovKey === key) return;
    ovKey = key;
    if (!html) { ov.style.display = "none"; return; }
    ov.style.display = "flex";
    ov.innerHTML = html;
    if (fn) fn();
  }

  function clearKeys() {
    ovKey = ""; pkKey = ""; leftKey = ""; rightKey = "";
  }

  function setSideHudsVisible(show) {
    if (show) {
      leftHud.classList.add("active");
      rightHud.classList.add("active");
    } else {
      leftHud.classList.remove("active");
      rightHud.classList.remove("active");
      leftHud.innerHTML = "";
      rightHud.innerHTML = "";
    }
  }

  function rankBadge(App, rkIdx) {
    var rk = (App.ency.ranks || [])[rkIdx] || { name: "Bronze", col: "#cd7f32" };
    return '<span class="rank-pill" style="color:' + rk.col + '">' + esc(rk.name) + "</span>";
  }

  function getMasteryInfo(cm) {
    var xp = (cm.kills || 0) + (cm.wins || 0) * 250 + (cm.games || 0) * 30;
    var tiers = [
      { name: "Novice", min: 0, col: "#9c8e7c" },
      { name: "Apprenti", min: 150, col: "#59b878" },
      { name: "Adepte", min: 500, col: "#5b8fd9" },
      { name: "Vétéran", min: 1200, col: "#b06be8" },
      { name: "Maître", min: 2500, col: "#e5a93c" },
      { name: "Grand Maître", min: 5000, col: "#ff6b6b" }
    ];
    var idx = 0;
    for (var i = 0; i < tiers.length; i++) {
      if (xp >= tiers[i].min) idx = i;
    }
    var cur = tiers[idx];
    var next = tiers[idx + 1] || null;
    var pct = next ? Math.min(100, Math.round(((xp - cur.min) / (next.min - cur.min)) * 100)) : 100;
    return { xp: xp, tier: cur, next: next, pct: pct, isMax: !next };
  }

  function buildSkinSelect(App, id, selectedIdx, takenMap) {
    var classes = App.ency.classes || [];
    var opts = classes.map(function (cl) {
      var takenBy = takenMap && takenMap[cl.id];
      var label = takenBy ? (cl.name + " (Prise par " + takenBy + ")") : (cl.name + " — " + cl.bonus);
      return '<option value="' + cl.id + '"' + (cl.id === selectedIdx ? " selected" : "") + (takenBy ? " disabled" : "") + ">" + esc(label) + "</option>";
    }).join("");
    return '<select id="' + id + '">' + opts + "</select>";
  }

  function renderAuthSection(App) {
    if (App.user) {
      var u = App.user;
      return '<div class="auth-box"><div class="auth-top">' +
        '<div>Connecté : <b style="color:#ffd166">' + esc(u.username) + "</b> " + rankBadge(App, u.rank) + "</div>" +
        '<button type="button" class="back" id="btnLogout" style="padding:3px 8px;font-size:.70rem">Déconnexion</button>' +
        '</div><div class="auth-stats"><span>Parties : <b>' + u.games + "</b></span><span>Victoires : <b>" + u.wins +
        "</b></span><span>Kills : <b>" + u.kills + "</b></span><span>Record : <b>Vague " + u.bestWave + "</b></span></div></div>";
    }
    var isReg = authMode === "register";
    return '<div class="auth-box"><div class="auth-top">' +
      "<b>" + (isReg ? "Créer un compte (sauvegarde rang & maîtrise)" : "Connexion compte joueur") + "</b>" +
      '<button type="button" id="toggleAuth" style="padding:3px 8px;font-size:.70rem">' + (isReg ? "Déjà un compte ?" : "Créer un compte") + "</button>" +
      '</div><div class="row">' +
      '<input id="authUser" maxlength="18" placeholder="Pseudo (3-18 car.)" style="width:145px">' +
      '<input id="authPass" type="password" maxlength="32" placeholder="Mot de passe" style="width:135px">' +
      '<button type="button" class="main" id="authSubmit" style="padding:5px 11px;font-size:.74rem">' + (isReg ? "S'inscrire" : "Connexion") + "</button>" +
      "</div>" + (authErr ? '<div class="auth-err">' + esc(authErr) + "</div>" : "") + "</div>";
  }

  function showHome(App, msg) {
    setSideHudsVisible(false);
    pk.style.display = "none";
    var classes = App.ency.classes || [];
    var curClass = classes[App.selectedSkin] || { bonus: "" };

    setOv("home_" + (App.user ? App.user.id + "_" + App.user.games + "_" + App.user.rank : 0) + "_" + authMode + "_" + authErr + "_" + (msg || ""),
      '<div class="pn"><h2>Survivor Squad</h2>' +
      renderAuthSection(App) +
      (msg ? '<p style="color:#e05656;font-weight:700">' + esc(msg) + "</p>" : "") +
      '<div class="skin-bar">' +
        '<img class="skin-img" id="skImg" src="' + Sprites.getSkinDataUrl(App.selectedSkin, 0) + '" alt="">' +
        '<div class="skin-ctrl">' + buildSkinSelect(App, "skSelect", App.selectedSkin, null) +
        '<span id="skBonus">' + esc(curClass.bonus) + "</span></div>" +
      "</div>" +
      '<div class="row">' +
        (!App.user ? '<input id="guestNick" maxlength="14" placeholder="Pseudo invité" value="' + esc(App.guestNick) + '" style="width:140px">' : "") +
        '<button type="button" class="main" id="btnCreate">Créer une salle</button>' +
        '<input id="joinCode" maxlength="4" placeholder="CODE" value="' + esc(App.urlRoom) + '" style="width:82px;text-transform:uppercase;text-align:center">' +
        '<button type="button" id="btnJoin">Rejoindre</button>' +
      "</div>" +
      '<div class="row">' +
        '<button type="button" id="btnProfile">Profil &amp; Maîtrise</button>' +
        '<button type="button" id="btnLB">Classement</button>' +
        '<button type="button" id="btnEncy">Encyclopédie</button>' +
        '<button type="button" id="btnPatch">Patch Notes</button>' +
      "</div></div>",
      function () {
        var skSel = document.getElementById("skSelect");
        skSel.onchange = function () {
          App.setSkin(parseInt(skSel.value, 10) || 0);
          var cl = (App.ency.classes || [])[App.selectedSkin];
          if (cl) document.getElementById("skBonus").textContent = cl.bonus;
          document.getElementById("skImg").src = Sprites.getSkinDataUrl(App.selectedSkin, 0);
        };

        if (App.user) {
          document.getElementById("btnLogout").onclick = function () { App.logout(); };
        } else {
          document.getElementById("toggleAuth").onclick = function () {
            authMode = authMode === "login" ? "register" : "login";
            authErr = ""; ovKey = ""; showHome(App);
          };
          document.getElementById("authSubmit").onclick = function () {
            var u = document.getElementById("authUser").value;
            var p = document.getElementById("authPass").value;
            App.authenticate(authMode, u, p, function (err) {
              authErr = err || ""; ovKey = ""; showHome(App);
            });
          };
        }

        document.getElementById("btnCreate").onclick = function () {
          var gn = document.getElementById("guestNick");
          if (gn) App.setGuestNick(gn.value);
          App.connectAndEnter("create", "");
        };
        document.getElementById("btnJoin").onclick = function () {
          var gn = document.getElementById("guestNick");
          if (gn) App.setGuestNick(gn.value);
          var c = document.getElementById("joinCode").value.trim().toUpperCase();
          if (c) App.connectAndEnter("join", c);
        };
        document.getElementById("btnProfile").onclick = function () { openProfile(App); };
        document.getElementById("btnLB").onclick = function () { openLeaderboard(App, 1); };
        document.getElementById("btnEncy").onclick = function () { openEncyclopedia(App); };
        document.getElementById("btnPatch").onclick = function () { openPatchNotes(App); };
      }
    );
  }

  function showRoomLobby(App, d) {
    setSideHudsVisible(false);
    var classes = App.ency.classes || [];
    var ranks = App.ency.ranks || [];
    var mySkin = (d.skins && d.skins[d.me] !== undefined) ? d.skins[d.me] : App.selectedSkin;
    var takenMap = {};
    for (var ti = 0; ti < d.n; ti++) {
      if (ti !== d.me && d.skins) takenMap[d.skins[ti]] = App.pName(ti);
    }
    var slotsHtml = "";
    for (var si = 0; si < 6; si++) {
      if (si < d.n) {
        var sIdx = (d.skins && d.skins[si]) || 0;
        var rIdx = (d.ranks && d.ranks[si]) || 0;
        var clName = classes[sIdx] ? classes[sIdx].name : "";
        var rkName = ranks[rIdx] ? ranks[rIdx].name : "Bronze";
        slotsHtml += '<div class="slot on" style="background:' + Sprites.CO[si] + '"><img src="' + Sprites.getSkinDataUrl(sIdx, si) + '" alt=""><div class="slot-txt">' + esc(App.pName(si)) + "<small>" + esc(clName + " · " + rkName) + "</small></div></div>";
      } else {
        slotsHtml += '<div class="slot"><div class="slot-txt">Emplacement J' + (si + 1) + "</div></div>";
      }
    }
    var isHost = d.me === 0;
    var curCl = classes[mySkin] || { bonus: "" };

    setOv("lobby_" + d.code + "_" + d.n + "_" + (d.skins || []).join(",") + "_" + (d.names || []).join(","),
      '<div class="pn"><h2>Salle ' + esc(d.code) + " (" + d.n + "/6)</h2>" +
      '<div class="slots">' + slotsHtml + "</div>" +
      '<div class="skin-bar"><img class="skin-img" src="' + Sprites.getSkinDataUrl(mySkin, d.me) + '" alt="">' +
        '<div class="skin-ctrl">' + buildSkinSelect(App, "wSkSelect", mySkin, takenMap) + "<span>" + esc(curCl.bonus) + "</span></div>" +
      "</div>" +
      '<div class="row"><input id="lk" readonly value="' + location.origin + "/?room=" + d.code + '" style="width:230px;font-size:.74rem"><button id="cp">Copier</button></div>' +
      '<div class="row">' +
        '<button class="back" id="wBack">← Quitter</button>' +
        '<button id="wProfile">Profil</button>' +
        '<button id="wLB">Classement</button>' +
        '<button id="wEncy">Encyclopédie</button>' +
        '<button id="wPatch">Patch Notes</button>' +
        (isHost ? '<button class="main" id="st">Lancer la partie</button>' : '<span style="color:var(--gold);font-weight:700;font-size:.78rem">En attente de l’hôte…</span>') +
      "</div></div>",
      function () {
        document.getElementById("wSkSelect").onchange = function () {
          var ns = parseInt(this.value, 10) || 0;
          App.setSkin(ns);
          App.send({ t: "skin", sk: ns });
        };
        document.getElementById("wBack").onclick = function () { App.leaveRoom(); };
        document.getElementById("wProfile").onclick = function () { openProfile(App); };
        document.getElementById("wLB").onclick = function () { openLeaderboard(App, d.n); };
        document.getElementById("wEncy").onclick = function () { openEncyclopedia(App); };
        document.getElementById("wPatch").onclick = function () { openPatchNotes(App); };
        document.getElementById("cp").onclick = function () {
          var i = document.getElementById("lk"); i.select();
          if (navigator.clipboard) navigator.clipboard.writeText(i.value);
          this.textContent = "Copié";
        };
        var stBtn = document.getElementById("st");
        if (stBtn) stBtn.onclick = function () { App.send({ t: "start" }); };
      }
    );
  }

  // --- HUD externe gauche : Salle, Escouade, Inventaire & Contrôles ---
  function renderLeftHud(App, d) {
    var themes = App.ency.themes || [];
    var ranks = App.ency.ranks || [];
    var classes = App.ency.classes || [];
    var upgrades = App.ency.upgrades || [];
    var combos = App.ency.combos || [];
    var supers = App.ency.super_combos || [];

    var curTheme = themes[d.th || 0] || { name: "Arène de Braises", accent: "#e5a93c" };
    var curRk = ranks[d.myRank || 0] || { name: "Bronze", target: 1440 };
    var nextRk = ranks[Math.min(ranks.length - 1, (d.myRank || 0) + 1)] || curRk;
    var timeOk = d.tm <= nextRk.target;

    var key = Math.floor(d.tm) + "|" + d.th + "|" + d.k + "|" + JSON.stringify(d.p) + "|" + JSON.stringify(d.inv) + "|" + JSON.stringify(d.cmb) + "|" + JSON.stringify(d.sup);
    if (key === leftKey) return;
    leftKey = key;

    // 1. Bloc Salle & Chrono
    var infoHtml = '<div class="hud-sec">' +
      '<div class="hud-title"><span>Salle ' + esc(d.code) + "</span><span>" + esc(curRk.name) + "</span></div>" +
      '<div class="map-pill" style="border-color:' + curTheme.accent + ';color:' + curTheme.accent + '"><span>' + esc(curTheme.name) + '</span><small style="color:var(--muted)">Boss : ' + esc(curTheme.boss || "") + "</small></div>" +
      '<div style="display:flex;justify-content:space-between;font-size:.73rem">' +
        '<span>Chrono : <b style="color:' + (timeOk ? "#59b878" : "#e05656") + '">' + App.fmt(d.tm) + "</b></span>" +
        '<span>Cible : <b>' + App.fmt(nextRk.target) + "</b></span>" +
      "</div>" +
      '<div style="display:flex;justify-content:space-between;font-size:.71rem;color:#cbbba6">' +
        '<span>Kills totaux : <b>' + d.k + "</b></span>" +
        '<span>Relances : <b style="color:var(--gold)">' + (d.rr || 0) + "</b></span>" +
      "</div>" +
    "</div>";

    // 2. Bloc Escouade (PV, état, kills)
    var squadHtml = '<div class="hud-sec"><div class="hud-title"><span>Escouade (' + d.n + "/6)</span><span>" + (d.flk ? "Lien ×2" : "") + "</span></div>";
    d.p.forEach(function (p, i) {
      var isMe = i === d.me;
      var down = p[4];
      var hpPct = Math.max(0, Math.min(100, (p[2] / p[3]) * 100));
      var cl = classes[p[16] || 0] || { name: "" };
      var barCol = down ? "#5c5349" : Sprites.CO[i % 6];
      squadHtml += '<div class="sq-card' + (isMe ? " me" : "") + (down ? " down" : "") + '">' +
        '<div class="sq-top"><div class="sq-who"><img src="' + Sprites.getSkinDataUrl(p[16] || 0, i) + '" alt=""><b>' + esc(App.pName(i)) + "</b></div>" +
        '<span style="font-weight:800;font-size:.69rem">' + (down ? "À TERRE" : Math.ceil(p[2]) + "/" + p[3]) + "</span></div>" +
        '<div class="sq-bar"><div class="sq-fill" style="width:' + hpPct + "%;background:" + barCol + '"></div></div>' +
        '<div class="sq-sub"><span>' + esc(cl.name) + '</span><span>Kills : <b style="color:var(--text)">' + (p[19] || 0) + "</b></span></div>" +
      "</div>";
    });
    squadHtml += "</div>";

    // 3. Bloc Inventaire & Synergies
    var me = d.p[d.me];
    var mySk = me ? (me[16] || 0) : App.selectedSkin;
    var myCl = classes[mySk] || { name: "Recrue", bonus: "" };
    var invHtml = '<div class="hud-sec"><div class="hud-title"><span>Équipement</span><span>' + esc(myCl.name) + "</span></div>" +
      '<div class="inv-wrap">' +
      '<div class="inv-lbl"><img src="' + Sprites.getSkinDataUrl(mySk, d.me) + '" alt=""><span>' + esc(myCl.bonus) + "</span></div>";

    (d.sup || []).forEach(function (it) {
      if (supers[it.id]) invHtml += '<span class="inv-sup">✦ ' + esc(supers[it.id].name) + "</span>";
    });
    (d.cmb || []).forEach(function (it) {
      if (combos[it.id]) invHtml += '<span class="inv-cmb">★ ' + esc(combos[it.id].name) + " N." + it.lvl + "</span>";
    });
    (d.inv || []).forEach(function (cnt, idx) {
      if (cnt > 0 && upgrades[idx]) {
        invHtml += '<span class="inv-item"><img src="' + Sprites.UP_IMGS[idx] + '" alt="">' + esc(upgrades[idx].short) + " <em>×" + cnt + "</em></span>";
      }
    });
    invHtml += "</div></div>";

    // 4. Boutons rapides hors du canvas
    var dashCd = me ? me[9] : 0;
    var actHtml = '<div class="hud-sec"><div class="hud-actions">' +
      '<button type="button" data-act="tab">Stats [Tab]</button>' +
      '<button type="button" data-act="pause">Pause [P]</button>' +
      '<button type="button" class="full-w" data-act="dash">' + (dashCd > 0 ? "Esquive (" + dashCd.toFixed(1) + "s)" : "Esquive [Espace]") + "</button>" +
    "</div></div>";

    leftHud.innerHTML = infoHtml + squadHtml + invHtml + actHtml;
  }

  // --- HUD externe droite : Tableau de toutes les statistiques modifiées ---
  function renderRightHud(App, d) {
    var st = d.stMe;
    if (!st) return;
    var key = JSON.stringify(st);
    if (key === rightKey) return;
    rightKey = key;

    function row(lbl, val, isBoosted, isGold) {
      var cls = isGold ? "gold-val" : (isBoosted ? "boosted" : "");
      return "<tr><td>" + lbl + '</td><td class="' + cls + '">' + val + "</td></tr>";
    }

    var offRows =
      row("Dégâts", "×" + st.dmg.toFixed(2), st.dmg > 1.01, st.dmg >= 2.0) +
      row("Cadence de tir", st.rate.toFixed(1) + " /s", st.rate > 2.0, false) +
      row("Projectiles / salve", st.multi, st.multi > 1, st.multi >= 4) +
      row("Perforation", "+" + st.pierce, st.pierce > 0, false) +
      row("Ricochets", "+" + st.bounce, st.bounce > 0, false) +
      row("Chance critique", st.crit + " %", st.crit > 0, st.crit >= 40) +
      row("Dégâts critiques", "×" + st.critMult.toFixed(1), st.critMult > 2.2, false) +
      row("Vitesse projectiles", st.projSpd + " %", st.projSpd > 100, false) +
      row("Onde de choc", st.nova > 0 ? ("Niv." + st.nova + " (/" + st.novaEvery + " tirs)") : "Inactive", st.nova > 0, st.nova > 0) +
      row("Déflagration", st.corpseExp > 0 ? (st.corpseExp + " % dég.") : "Inactive", st.corpseExp > 0, false) +
      row("Drones autonomes", st.drone, st.drone > 0, st.drone > 0);

    var defRows =
      row("Points de vie", st.hp + " / " + st.maxHp, st.maxHp > 100, false) +
      row("Armure (réduction)", st.armor + " %", st.armor > 0, st.armor >= 25) +
      row("Régénération", "+" + st.regen.toFixed(1) + " PV/s", st.regen > 0, false) +
      row("Vol de vie", st.lifesteal.toFixed(1) + " %", st.lifesteal > 0, false) +
      row("Vitesse déplacement", st.speed + " %", st.speed > 100, false);

    var utilRows =
      row("Lames orbitales", st.orb + " (" + st.orbSpd + " %)", st.orb > 0, st.orb >= 4) +
      row("Ralentissement givre", st.frostSlow > 0 ? ("-" + st.frostSlow + " %") : "Inactif", st.frostSlow > 0, false) +
      row("Portée aimant", st.magnet + " px", st.magnet > 85, false) +
      row("Gain d’expérience", st.xpMult + " %", st.xpMult > 100, false);

    rightHud.innerHTML =
      '<div class="hud-sec"><div class="hud-title"><span>Stats Offensives</span><span>En direct</span></div><table class="stat-tbl"><tbody>' + offRows + "</tbody></table></div>" +
      '<div class="hud-sec"><div class="hud-title"><span>Stats Défensives</span><span></span></div><table class="stat-tbl"><tbody>' + defRows + "</tbody></table></div>" +
      '<div class="hud-sec"><div class="hud-title"><span>Contrôle &amp; Utilitaire</span><span></span></div><table class="stat-tbl"><tbody>' + utilRows + "</tbody></table></div>";
  }

  function buildStatsTable(App, d, liveMode) {
    var rows = d.stats || [];
    var classes = App.ency.classes || [];
    var combos = App.ency.combos || [];
    var supers = App.ency.super_combos || [];
    if (!rows.length) return "";

    var body = rows.map(function (r) {
      var isMe = r.i === d.me;
      var clName = classes[r.skin] ? classes[r.skin].name : "";
      var tags = [];
      (r.sup || []).forEach(function (s) { if (supers[s.id]) tags.push('<span class="b-tag s">✦ ' + esc(supers[s.id].name) + "</span>"); });
      (r.cmb || []).forEach(function (c) { if (combos[c.id]) tags.push('<span class="b-tag c">★ ' + esc(combos[c.id].name) + " N." + c.lvl + "</span>"); });
      var pState = "";
      if (liveMode && d.p && d.p[r.i]) {
        var pa = d.p[r.i];
        pState = pa[4] ? '<span style="color:#d94e4e;font-weight:800">À terre</span>' : '<span style="color:#59b878">' + Math.ceil(pa[2]) + "/" + pa[3] + "</span>";
      }
      return '<tr class="' + (isMe ? "me-row" : "") + '">' +
        '<td><img class="p-ava" src="' + Sprites.getSkinDataUrl(r.skin || 0, r.i) + '" alt=""><b>' + esc(r.name) + (isMe ? " (TOI)" : "") + '</b> <small style="color:var(--muted)">(' + esc(clName) + ")</small></td>" +
        "<td>" + rankBadge(App, r.rank || 0) + "</td>" +
        (liveMode ? "<td>" + pState + "</td>" : "") +
        "<td><b>" + r.kills + "</b></td>" +
        "<td>" + Math.round(r.dmg) + "</td>" +
        "<td>" + Math.round(r.taken) + "</td>" +
        "<td>" + r.rev + "</td>" +
        "<td>" + r.gems + "</td>" +
        '<td style="white-space:normal">' + (tags.length ? tags.join(" ") : "—") + "</td>" +
      "</tr>";
    }).join("");

    return '<div class="tbl-wrap"><table class="stbl"><thead><tr><th>Joueur</th><th>Rang</th>' +
      (liveMode ? "<th>PV</th>" : "") + "<th>Kills</th><th>Dégâts</th><th>Subis</th><th>Réanim.</th><th>Gemmes</th><th>Combos</th></tr></thead><tbody>" +
      body + "</tbody></table></div>";
  }

  function updateTabModal(App) {
    if (!App.tabHeld || !App.S || App.S.st !== "play") {
      tabModal.style.display = "none";
      return;
    }
    tabModal.style.display = "flex";
    tabModal.innerHTML = '<div class="tab-box"><div class="modal-head"><h3>Escouade — Vague ' + App.S.wv + "/50</h3><span>Temps : <b>" + App.fmt(App.S.tm) + "</b></span></div>" + buildStatsTable(App, App.S, true) + "</div>";
  }

  function renderUpgradeCards(App, d) {
    var me = d.p[d.me];
    var rr = d.rr || 0;
    var kk = JSON.stringify(d.ch) + "|" + (me ? me[7] : 0) + "|" + rr;
    if (kk === pkKey) return;
    pkKey = kk;

    var rarities = App.ency.rarities || [];
    var badges = ["1 / &", "2 / é", '3 / "'];
    if (d.ch && d.ch.length) {
      pk.style.display = "flex";
      var cardsHtml = d.ch.map(function (u, i) {
        var uIdx = u[0], uTitle = u[1], uDesc = u[2], hint = u[3], rarIdx = u[4] || 0;
        var rar = rarities[rarIdx] || { name: "Commun", col: "#b8aea0" };
        var cTag = "";
        if (hint && hint.txt) {
          var cls = hint.type === "fuse" || hint.type === "sup" ? "fuse" : (hint.type === "full" ? "full" : "");
          cTag = '<div class="cmbTag ' + cls + '">' + esc(hint.txt) + "</div>";
        }
        return '<button type="button" data-i="' + i + '" style="--rar-col:' + rar.col + '"><i>' + badges[i] + "</i>" +
          '<span class="rar-pill">' + esc(rar.name) + "</span>" +
          '<div class="pk-top"><img class="pk-ico" src="' + Sprites.UP_IMGS[uIdx] + '" alt=""><b>' + esc(uTitle) + "</b></div>" +
          "<small>" + esc(uDesc) + "</small>" + cTag + "</button>";
      }).join("");

      var actionsHtml = '<div class="pk-actions">' +
        '<button type="button" class="reroll-btn" data-reroll="1"' + (rr <= 0 ? " disabled" : "") + ">Relancer [R] (" + rr + ")</button>" +
        (me && me[7] > 1 ? '<span class="pend-pill">Choix restants : +' + (me[7] - 1) + "</span>" : "") +
      "</div>";

      pk.innerHTML = '<div class="pk-cards">' + cardsHtml + "</div>" + actionsHtml;
    } else {
      pk.innerHTML = "";
      pk.style.display = "none";
    }
  }

  // --- Onglet Profil & Maîtrise des classes ---
  function openProfile(App) {
    var u = App.user;
    var classes = App.ency.classes || [];
    var body = "";

    if (!u) {
      body = '<div class="promo-box miss">Tu joues actuellement en mode invité. Connecte-toi ou crée un compte sur l’accueil pour enregistrer tes statistiques et débloquer la maîtrise des 10 classes.</div>';
    } else {
      var winRate = u.games > 0 ? Math.round((u.wins / u.games) * 100) : 0;
      var bestTimeTxt = u.bestTime !== null ? App.fmt(u.bestTime) : "—";

      body += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
        '<div><b style="font-size:1rem;color:#ffd166">' + esc(u.username) + "</b> " + rankBadge(App, u.rank) + "</div>" +
        '<span style="font-size:.75rem;color:var(--muted)">Taux de victoire : <b style="color:var(--green)">' + winRate + " %</b></span>" +
      "</div>";

      body += '<div class="stats">' +
        "<div><b>" + u.games + "</b><small>PARTIES</small></div>" +
        "<div><b>" + u.wins + "</b><small>VICTOIRES V50</small></div>" +
        "<div><b>Vague " + u.bestWave + "</b><small>RECORD VAGUE</small></div>" +
        "<div><b>" + bestTimeTxt + "</b><small>MEILLEUR CHRONO</small></div>" +
      "</div>";

      body += '<div class="stats">' +
        "<div><b>" + u.kills + "</b><small>ÉLIMINATIONS</small></div>" +
        "<div><b>" + (u.totalDmg || 0).toLocaleString("fr-FR") + "</b><small>DÉGÂTS TOTAUX</small></div>" +
        "<div><b>" + (u.totalRevives || 0) + "</b><small>RÉANIMATIONS</small></div>" +
        "<div><b>" + (u.totalGems || 0) + "</b><small>GEMMES</small></div>" +
      "</div>";

      body += '<h4 style="margin:6px 0 2px;color:var(--gold);font-family:Georgia,serif;text-transform:uppercase;font-size:.82rem">Maîtrise des classes</h4>';
      body += '<div class="ency-grid">' + classes.map(function (c) {
        var cm = (u.mastery && u.mastery[c.id]) || { games: 0, wins: 0, kills: 0, dmg: 0, bestWave: 0 };
        var m = getMasteryInfo(cm);
        return '<div class="mast-card' + (m.isMax ? " mastered" : "") + '">' +
          '<div class="mast-head">' +
            '<div class="mast-left"><img class="skin-img" style="width:30px;height:30px" src="' + Sprites.getSkinDataUrl(c.id, c.id) + '" alt=""><div><b style="font-size:.78rem">' + esc(c.name) + '</b><div style="font-size:.64rem;color:var(--muted)">' + esc(c.passive) + "</div></div></div>" +
            '<span class="mast-tier" style="color:' + m.tier.col + '">' + esc(m.tier.name) + "</span>" +
          "</div>" +
          '<div class="mast-bar"><div class="mast-fill" style="width:' + m.pct + "%;background:" + m.tier.col + '"></div></div>' +
          '<div class="mast-meta"><span>Parties : <b>' + cm.games + "</b> · Vict. : <b>" + cm.wins + "</b></span><span>Kills : <b>" + cm.kills + "</b> · Max V." + cm.bestWave + "</span></div>" +
        "</div>";
      }).join("") + "</div>";
    }

    subModal.style.display = "flex";
    subModal.innerHTML = '<div class="modal-box">' +
      '<div class="modal-head"><button class="back" id="closeSub">← Fermer</button><h3>Profil &amp; Maîtrise</h3><span></span></div>' +
      body +
    "</div>";
    document.getElementById("closeSub").onclick = function () { subModal.style.display = "none"; };
  }

  function openLeaderboard(App, tabN) {
    if (tabN >= 1 && tabN <= 6) lbTab = tabN;
    var tabs = [1, 2, 3, 4, 5, 6].map(function (n) {
      return '<button type="button" class="' + (lbTab === n ? "act" : "") + '" data-n="' + n + '">' + n + "J</button>";
    }).join("");
    var list = (App.lb && App.lb[lbTab]) || [];
    var classes = App.ency.classes || [];
    var rows = list.length ? list.map(function (e, idx) {
      var pls = (e.pl || []).map(function (p, pi) {
        var cl = classes[p.skin || 0] ? classes[p.skin || 0].name : "";
        return '<span style="margin-right:6px"><img class="p-ava" src="' + Sprites.getSkinDataUrl(p.skin || 0, pi) + '" alt="">' + esc(p.name) + " (" + esc(cl) + ")</span>";
      }).join("");
      return '<tr><td class="' + (idx < 3 ? "top" : "") + '">#' + (idx + 1) + "</td><td><b>" + App.fmt(e.t) + '</b></td><td style="text-align:left;white-space:normal">' + pls + "</td><td>" + esc(e.d || "") + "</td></tr>";
    }).join("") : '<tr><td colspan="4" style="padding:12px;color:var(--muted)">Aucun temps enregistré pour cette taille d’escouade.</td></tr>';

    subModal.style.display = "flex";
    subModal.innerHTML = '<div class="modal-box">' +
      '<div class="modal-head"><button class="back" id="closeSub">← Fermer</button><h3>Classement Vague 50</h3><span></span></div>' +
      '<div class="tabs-bar" id="lbTabs">' + tabs + "</div>" +
      '<div class="tbl-wrap"><table class="stbl"><thead><tr><th>#</th><th>Temps</th><th style="text-align:left">Escouade</th><th>Date</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    "</div>";
    document.getElementById("closeSub").onclick = function () { subModal.style.display = "none"; };
    document.getElementById("lbTabs").onclick = function (e) {
      var b = e.target.closest("button");
      if (b) openLeaderboard(App, +b.dataset.n);
    };
  }

  function openPatchNotes(App) {
    var html = (App.patchNotes || []).map(function (p) {
      var lis = (p.items || []).map(function (it) { return "<li>" + esc(it) + "</li>"; }).join("");
      return '<div class="pn-ver' + (p.latest ? " latest" : "") + '"><h4><span>' + esc(p.version) + "</span><small>" + esc(p.date) + "</small></h4><ul>" + lis + "</ul></div>";
    }).join("");
    subModal.style.display = "flex";
    subModal.innerHTML = '<div class="modal-box"><div class="modal-head"><button class="back" id="closeSub">← Fermer</button><h3>Patch Notes</h3><span></span></div>' + html + "</div>";
    document.getElementById("closeSub").onclick = function () { subModal.style.display = "none"; };
  }

  function openEncyclopedia(App) {
    var E = App.ency || {};
    var tabs = [
      { id: "classes", lbl: "Classes (10)" },
      { id: "upgrades", lbl: "Bonus (17)" },
      { id: "combos", lbl: "Combos & Fusions" },
      { id: "enemies", lbl: "Monstres & Boss" },
      { id: "themes", lbl: "Zones (5)" },
      { id: "waves", lbl: "Vagues (1-50)" }
    ].map(function (t) {
      return '<button type="button" class="' + (encyTab === t.id ? "act" : "") + '" data-t="' + t.id + '">' + t.lbl + "</button>";
    }).join("");

    var body = "";
    if (encyTab === "classes") {
      body = '<div class="ency-grid">' + (E.classes || []).map(function (c) {
        return '<div class="e-card" style="display:flex;gap:8px;align-items:center"><img class="skin-img" style="width:34px;height:34px" src="' + Sprites.getSkinDataUrl(c.id, c.id) + '" alt=""><div><b>' + esc(c.name) + " · " + esc(c.passive) + "</b><em>" + esc(c.bonus) + "</em></div></div>";
      }).join("") + "</div>";
    } else if (encyTab === "upgrades") {
      body = '<div class="ency-grid">' + (E.upgrades || []).map(function (u) {
        return '<div class="e-card" style="display:flex;gap:8px;align-items:center"><img class="pk-ico" src="' + Sprites.UP_IMGS[u.id] + '" alt=""><div><b>' + esc(u.short) + "</b><em>" + esc(u.desc) + "</em></div></div>";
      }).join("") + "</div>";
    } else if (encyTab === "combos") {
      var cHtml = (E.combos || []).map(function (c) {
        return '<div class="e-card"><b>★ ' + esc(c.name) + "</b><span>Recette : " + esc(c.req.join(" + ")) + "</span><em>" + esc(c.desc) + "</em></div>";
      }).join("");
      var sHtml = (E.super_combos || []).map(function (s) {
        return '<div class="e-card sup"><b>✦ ' + esc(s.name) + "</b><span>Fusion : " + esc(s.req.join(" + ")) + "</span><em>" + esc(s.desc) + "</em></div>";
      }).join("");
      body = '<div class="ency-grid">' + cHtml + '</div><div class="ency-grid">' + sHtml + "</div>";
    } else if (encyTab === "enemies") {
      var mHtml = (E.enemies || []).map(function (m) {
        return '<div class="e-card"><b>' + esc(m.name) + " (Dès vague " + m.waveMin + ")</b><em>" + esc(m.role) + "</em></div>";
      }).join("");
      var bHtml = (E.bosses || []).map(function (b) {
        return '<div class="e-card sup"><b>BOSS : ' + esc(b.name) + " (" + b.wave + ")</b><em>" + esc(b.role) + "</em></div>";
      }).join("");
      body = '<div class="ency-grid">' + bHtml + mHtml + "</div>";
    } else if (encyTab === "themes") {
      body = '<div class="ency-grid">' + (E.themes || []).map(function (t) {
        return '<div class="e-card" style="border-color:' + t.accent + '"><b style="color:' + t.accent + '">' + esc(t.name) + " (Vagues " + esc(t.waves) + ")</b><em>Boss associé : " + esc(t.boss) + "</em></div>";
      }).join("") + "</div>";
    } else if (encyTab === "waves") {
      var wRows = (E.waves || []).map(function (w) {
        return "<tr><td><b>Vague " + w.wave + "</b></td><td>" + (w.boss ? '<b style="color:#e05656">' + esc(w.boss) + "</b>" : "—") + "</td><td>" + w.baseCount + "</td><td>×" + w.hpMult + '</td><td style="text-align:left;white-space:normal">' + esc(w.enemies.join(", ")) + "</td></tr>";
      }).join("");
      body = '<div class="tbl-wrap"><table class="stbl"><thead><tr><th>Vague</th><th>Boss</th><th>Effectif base</th><th>PV ×</th><th style="text-align:left">Bestiaire actif</th></tr></thead><tbody>' + wRows + "</tbody></table></div>";
    }

    subModal.style.display = "flex";
    subModal.innerHTML = '<div class="modal-box">' +
      '<div class="modal-head"><button class="back" id="closeSub">← Fermer</button><h3>Encyclopédie du Jeu</h3><span></span></div>' +
      '<div class="tabs-bar" id="encyTabs">' + tabs + "</div>" + body +
    "</div>";
    document.getElementById("closeSub").onclick = function () { subModal.style.display = "none"; };
    document.getElementById("encyTabs").onclick = function (e) {
      var b = e.target.closest("button");
      if (b) { encyTab = b.dataset.t; openEncyclopedia(App); }
    };
  }

  function updateFromState(App, d) {
    var playing = d.st === "play";
    setSideHudsVisible(playing);

    if (playing) {
      renderLeftHud(App, d);
      renderRightHud(App, d);
      if (App.tabHeld) updateTabModal(App);
    } else if (App.tabHeld) {
      App.tabHeld = false;
      tabModal.style.display = "none";
    }

    if (d.st === "lobby") {
      showRoomLobby(App, d);
    } else if (d.st === "win" || d.st === "over") {
      var isWin = d.st === "win";
      var myStat = (d.stats || []).find(function (x) { return x.i === d.me; });
      if (myStat && App.user) App.user.rank = myStat.rank;
      var ranks = App.ency.ranks || [];
      var promo = "";
      if (isWin && myStat) {
        promo = myStat.promoted
          ? '<div class="promo-box">PROMOTION RANKED : ' + ranks[myStat.oldRank].name + " → " + ranks[myStat.rank].name + " !</div>"
          : '<div class="promo-box miss">Rang actuel : ' + ranks[myStat.rank].name + " · Temps : " + App.fmt(d.tm) + "</div>";
      }
      var isHost = d.me === 0;
      setOv(d.st + "_" + d.k + "_" + d.wv,
        '<div class="pn wide"><h2 style="color:' + (isWin ? "#59b878" : "#e05656") + '">' + (isWin ? "Victoire — Vague 50 !" : "Défaite") + "</h2>" +
        promo +
        '<div class="stats"><div><b>Vague ' + d.wv + "/50</b><small>ATTEINTE</small></div><div><b>" + App.fmt(d.tm) + "</b><small>TEMPS</small></div><div><b>Niv. " + d.l + "</b><small>ESCOUADE</small></div><div><b>" + d.k + "</b><small>ÉLIMINÉS</small></div></div>" +
        buildStatsTable(App, d, false) +
        '<div class="row"><button class="back" id="endHome">← Accueil</button><button id="endProfile">Profil</button><button id="endLB">Classement ' + d.n + "J</button>" +
        (isHost ? '<button class="main" id="rs">Rejouer</button>' : '<span style="color:var(--muted);font-size:.76rem">Seul l’hôte peut relancer</span>') +
        "</div></div>",
        function () {
          document.getElementById("endHome").onclick = function () { App.leaveRoom(); };
          document.getElementById("endProfile").onclick = function () { openProfile(App); };
          document.getElementById("endLB").onclick = function () { openLeaderboard(App, d.n); };
          var rs = document.getElementById("rs");
          if (rs) rs.onclick = function () { App.send({ t: "restart" }); };
        }
      );
    } else if (d.mpz) {
      setOv("mpz_" + d.pby,
        '<div class="pn"><h2>Jeu en pause</h2><p>Pause activée par ' + esc(App.pName(d.pby)) + ".</p>" +
        '<div class="row"><button class="back" id="pzLeave">← Quitter</button><button id="pzEncy">Encyclopédie</button><button class="main" id="resume">Reprendre [P]</button></div></div>',
        function () {
          document.getElementById("pzLeave").onclick = function () { App.leaveRoom(); };
          document.getElementById("pzEncy").onclick = function () { openEncyclopedia(App); };
          document.getElementById("resume").onclick = function () { App.send({ t: "pause" }); };
        }
      );
    } else {
      setOv("play", null);
    }

    renderUpgradeCards(App, d);
  }

  pk.onclick = function (e) {
    if (!window.App) return;
    var rrBtn = e.target.closest("[data-reroll]");
    if (rrBtn && !rrBtn.disabled) {
      window.App.send({ t: "reroll" });
      return;
    }
    var b = e.target.closest("[data-i]");
    if (b) window.App.send({ t: "pick", k: +b.dataset.i });
  };

  leftHud.onclick = function (e) {
    if (!window.App) return;
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "pause") window.App.send({ t: "pause" });
    else if (act === "dash") window.App.send({ t: "dash" });
    else if (act === "tab") {
      window.App.tabHeld = !window.App.tabHeld;
      updateTabModal(window.App);
    }
  };

  return {
    toast: toast, clearKeys: clearKeys, showHome: showHome,
    updateFromState: updateFromState, updateTabModal: updateTabModal,
    closeModals: function () { subModal.style.display = "none"; }
  };
})();