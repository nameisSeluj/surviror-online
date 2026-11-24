(function () {
  var cv = document.getElementById("c");
  var ctx = cv.getContext("2d");
  var W = 800, H = 560;

  var App = window.App = {
    ws: null,
    S: null,
    vis: [],
    token: "",
    user: null,
    guestNick: "",
    selectedSkin: 0,
    urlRoom: (new URLSearchParams(location.search).get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
    lb: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    patchNotes: [],
    ency: {},
    tabHeld: false,

    fmt: function (s) {
      s = Math.floor(s || 0);
      return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
    },
    pName: function (i) {
      return (App.S && App.S.names && App.S.names[i]) ? App.S.names[i] : ("J" + (i + 1));
    },
    send: function (obj) {
      if (App.ws && App.ws.readyState === 1) App.ws.send(JSON.stringify(obj));
    },
    setSkin: function (sk) {
      App.selectedSkin = sk;
      try { localStorage.setItem("sq-skin", String(sk)); } catch (e) {}
    },
    setGuestNick: function (nick) {
      App.guestNick = String(nick || "").trim().slice(0, 14);
      try { localStorage.setItem("sq-nick", App.guestNick); } catch (e) {}
    },
    authenticate: function (mode, username, password, cb) {
      fetch("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password, skin: App.selectedSkin })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) return cb(data.error);
          App.token = data.token;
          App.user = data.user;
          App.selectedSkin = data.user.skin || 0;
          try { localStorage.setItem("sq-token", App.token); } catch (e) {}
          cb(null);
        })
        .catch(function () { cb("Erreur réseau"); });
    },
    logout: function () {
      App.token = ""; App.user = null;
      try { localStorage.removeItem("sq-token"); } catch (e) {}
      UI.clearKeys(); UI.showHome(App);
    },
    connectAndEnter: function (action, code) {
      if (App.ws) { try { App.ws.close(); } catch (e) {} }
      var ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
      App.ws = ws;
      ws.onopen = function () {
        App.send({ t: action, c: code, token: App.token, n: App.guestNick, sk: App.selectedSkin });
      };
      ws.onmessage = function (ev) {
        var d = JSON.parse(ev.data);
        if (d.t === "err") {
          ws.close(); App.ws = null; App.S = null;
          UI.clearKeys(); UI.showHome(App, d.m);
          return;
        }
        if (d.t === "user" && d.user) {
          App.user = d.user;
          return;
        }
        onSnapshot(d);
      };
      ws.onclose = function () {
        if (App.ws === ws) {
          App.ws = null; App.S = null;
          UI.clearKeys(); UI.showHome(App, "Connexion fermée.");
        }
      };
    },
    leaveRoom: function () {
      if (App.ws) { var old = App.ws; App.ws = null; try { old.close(); } catch (e) {} }
      App.S = null; App.vis = []; App.tabHeld = false;
      Render.resetFx(); UI.clearKeys();
      history.replaceState(null, "", location.pathname);
      UI.showHome(App);
    }
  };

  try {
    App.token = localStorage.getItem("sq-token") || "";
    App.guestNick = localStorage.getItem("sq-nick") || "";
    App.selectedSkin = parseInt(localStorage.getItem("sq-skin"), 10) || 0;
  } catch (e) {}

  var lastHp = [], lastE = [];
  function onSnapshot(d) {
    if (d.lb) App.lb = d.lb;
    if (d.code && App.urlRoom !== d.code) {
      App.urlRoom = d.code;
      history.replaceState(null, "", "?room=" + d.code);
    }

    (d.ev || []).forEach(function (v) {
      if (v[2] === 5 || v[2] === 6) {
        var isSup = v[2] === 6;
        Render.burst(v[0], v[1], isSup ? "#e05656" : "#e5a93c", isSup ? 32 : 20, false);
        Render.addRing(v[0], v[1], isSup ? 95 : 65, isSup ? "#e05656" : "#e5a93c", 3.5);
        if (v[3] === d.me) UI.toast(isSup ? "SUPER-COMBO ACTIVÉ !" : "COMBO ACTIVÉ !", isSup ? "#ff9e9e" : "#e5a93c");
        return;
      }
      if (v[2] === 7) { Render.addRing(v[0], v[1], v[3] || 85, "#ff9f1c", 3); return; }
      if (v[2] === 8) { Render.addFloat(v[0], v[1] - 14, "CRIT !", "#ffd166"); return; }
      var col = Sprites.EC[v[2]] || "#c94a4a";
      Render.burst(v[0], v[1], col, v[2] === 4 ? 36 : 8, true);
      if (v[2] === 4) Render.FX.shake = 10;
    });

    d.p.forEach(function (p, i) {
      if (lastHp[i] !== undefined && p[2] < lastHp[i]) {
        if (i === d.me) Render.FX.shake = 6;
        if (App.vis[i]) Render.addFloat(App.vis[i].x, App.vis[i].y - 16, "-" + Math.ceil(lastHp[i] - p[2]), "#d94e4e");
      }
      lastHp[i] = p[2];
    });

    d.E.forEach(function (e, idx) {
      if (lastE[idx] && e[3] < lastE[idx][3]) {
        Render.FX.flashE[e[2] + "_" + Math.round(e[0] / 25) + "_" + Math.round(e[1] / 25)] = 0.07;
      }
    });
    lastE = d.E;

    if (App.S && d.st === "play" && d.wv > App.S.wv) {
      UI.toast(d.wv === 50 ? "VAGUE FINALE 50 !" : ("Vague " + d.wv), d.wv % 5 === 0 ? "#d94e4e" : "#e5a93c");
    }

    App.S = d;
    UI.updateFromState(App, d);
  }

  // Contrôles clavier & pointeur
  var keys = {}, ptr = null, lastIn = "", idle = 0;
  var pickMap = { Digit1: 0, Numpad1: 0, "1": 0, "&": 0, Digit2: 1, Numpad2: 1, "2": 1, "é": 1, Digit3: 2, Numpad3: 2, "3": 2, '"': 2 };

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "Tab") {
      e.preventDefault();
      if (App.S && App.S.st === "play" && !App.tabHeld) { App.tabHeld = true; UI.updateTabModal(App); }
      return;
    }
    if (e.key === "Escape") { UI.closeModals(); if (App.tabHeld) { App.tabHeld = false; UI.updateTabModal(App); } }
    keys[e.key] = 1;
    if (e.key === " ") e.preventDefault();
    if (App.S && App.S.st === "play" && (e.key === "p" || e.key === "P")) App.send({ t: "pause" });
    if (App.S && App.S.ch && (e.key === "r" || e.key === "R") && (App.S.rr || 0) > 0) App.send({ t: "reroll" });
    var slot = pickMap[e.code] !== undefined ? pickMap[e.code] : pickMap[e.key];
    if (App.S && App.S.ch && slot !== undefined) App.send({ t: "pick", k: slot });
    if (e.key === " " || e.key === "Shift") App.send({ t: "dash" });
  });

  document.addEventListener("keyup", function (e) {
    if (e.key === "Tab") { e.preventDefault(); App.tabHeld = false; UI.updateTabModal(App); return; }
    keys[e.key] = 0;
  });

  function canvasPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  cv.addEventListener("pointerdown", function (e) { ptr = canvasPos(e); });
  window.addEventListener("pointermove", function (e) { if (ptr) ptr = canvasPos(e); });
  window.addEventListener("pointerup", function () { ptr = null; });

  document.getElementById("dash").addEventListener("pointerdown", function (e) { e.preventDefault(); App.send({ t: "dash" }); });

  setInterval(function () {
    if (!App.S) return;
    var dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.q || keys.a) dx--;
    if (keys.ArrowRight || keys.d) dx++;
    if (keys.ArrowUp || keys.z || keys.w) dy--;
    if (keys.ArrowDown || keys.s) dy++;
    var v = App.vis[App.S.me];
    if (ptr && v) {
      var ex = ptr.x - v.x, ey = ptr.y - v.y, l = Math.hypot(ex, ey);
      if (l > 10) { dx = ex / l; dy = ey / l; }
    }
    var k = dx + "," + dy;
    if (k !== lastIn || ++idle > 10) { lastIn = k; idle = 0; App.send({ t: "in", x: dx, y: dy }); }
  }, 33);

  // Boucle de rendu
  var lastFrame = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    var FX = Render.FX;
    if (!(App.S && App.S.pz)) {
      FX.shake = Math.max(0, FX.shake - dt * 32);
      for (var fk in FX.flashE) { FX.flashE[fk] -= dt; if (FX.flashE[fk] <= 0) delete FX.flashE[fk]; }
      FX.PA = FX.PA.filter(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; return p.l > 0; });
      FX.RINGS = FX.RINGS.filter(function (rg) { rg.r += (rg.rm - rg.r) * Math.min(1, dt * 10); rg.l -= dt; return rg.l > 0; });
      FX.FLOATS = FX.FLOATS.filter(function (fl) { fl.y -= 22 * dt; fl.l -= dt; return fl.l > 0; });
    }
    if (App.S) {
      for (var i = 0; i < App.S.p.length; i++) {
        var p = App.S.p[i];
        if (!App.vis[i]) App.vis[i] = { x: p[0], y: p[1], vx: 0, vy: 0, recoil: 0, sc: p[13] };
        var v = App.vis[i];
        v.vx = (p[0] - v.x) * 0.5; v.vy = (p[1] - v.y) * 0.5;
        v.x += v.vx; v.y += v.vy;
        v.recoil = Math.max(0, (v.recoil || 0) - dt * 8);
        if (p[13] !== v.sc) { v.sc = p[13]; v.recoil = 1; }
        var T = FX.TR[i];
        if (App.S.st === "play" && !p[4] && !App.S.pz) { T.push({ x: v.x, y: v.y }); if (T.length > 14) T.shift(); }
        else if (p[4]) T.length = 0;
      }
    }
    Render.drawFrame(ctx, App, now / 1000);
    requestAnimationFrame(loop);
  }

  // Chargement initial des données (BDD + session)
  Promise.all([
    fetch("/api/data").then(function (r) { return r.json(); }),
    App.token
      ? fetch("/api/auth/me", { headers: { Authorization: "Bearer " + App.token } }).then(function (r) { return r.ok ? r.json() : null; })
      : Promise.resolve(null)
  ]).then(function (res) {
    if (res[0]) {
      App.lb = res[0].leaderboard || App.lb;
      App.patchNotes = res[0].patchNotes || [];
      App.ency = res[0].encyclopedia || {};
    }
    if (res[1] && res[1].user) {
      App.user = res[1].user;
      App.selectedSkin = res[1].user.skin || 0;
    }
    UI.showHome(App);
    requestAnimationFrame(loop);
  });
})();