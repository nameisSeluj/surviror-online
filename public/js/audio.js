window.SoundFX = (function () {
  var DEFAULT_KEYS = {
    up: "z",
    down: "s",
    left: "q",
    right: "d",
    dash: " ",
    pause: "p",
    reroll: "r",
    tab: "Tab"
  };

  var settings = {
    masterVol: 0.65,
    sfxVol: 0.80,
    musicVol: 0.30,
    shake: true,
    keys: Object.assign({}, DEFAULT_KEYS)
  };

  try {
    var saved = JSON.parse(localStorage.getItem("sq-settings") || "null");
    if (saved) {
      if (typeof saved.masterVol === "number") settings.masterVol = saved.masterVol;
      if (typeof saved.sfxVol === "number") settings.sfxVol = saved.sfxVol;
      if (typeof saved.musicVol === "number") settings.musicVol = saved.musicVol;
      if (typeof saved.shake === "boolean") settings.shake = saved.shake;
      if (saved.keys && typeof saved.keys === "object") {
        settings.keys = Object.assign({}, DEFAULT_KEYS, saved.keys);
      }
    }
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem("sq-settings", JSON.stringify(settings));
    } catch (e) {}
  }

  function resetKeys() {
    settings.keys = Object.assign({}, DEFAULT_KEYS);
    saveSettings();
  }

  var ctx = null;
  var musicTimer = null;
  var stepIdx = 0;
  var inCombat = false;
  var bossActive = false;

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function playTone(freq, endFreq, dur, type, vol, delay) {
    var c = ensureCtx();
    if (!c) return;
    var gainVal = vol * settings.sfxVol * settings.masterVol;
    if (gainVal <= 0.002) return;

    var now = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    }
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // Musique d'ambiance procédurale douce (arpèges mineurs)
  var NOTES_CALM = [110, 130.81, 164.81, 196, 164.81, 130.81, 146.83, 174.61];
  var NOTES_BOSS = [98, 116.54, 146.83, 174.61, 155.56, 130.81, 116.54, 103.83];

  function startMusicLoop() {
    if (musicTimer) return;
    musicTimer = setInterval(function () {
      var c = ensureCtx();
      if (!c || c.state !== "running") return;
      var mVol = settings.musicVol * settings.masterVol * (inCombat ? 0.16 : 0.10);
      if (mVol <= 0.002) return;

      var scale = bossActive ? NOTES_BOSS : NOTES_CALM;
      var f = scale[stepIdx % scale.length];
      stepIdx++;

      var now = c.currentTime;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = bossActive ? "triangle" : "sine";
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(mVol, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.44);

      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.46);
    }, 420);
  }

  function unlock() {
    ensureCtx();
    startMusicLoop();
  }

  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock, { passive: true });

  return {
    settings: settings,
    saveSettings: saveSettings,
    resetKeys: resetKeys,
    setCombatState: function (playing, hasBoss) {
      inCombat = Boolean(playing);
      bossActive = Boolean(hasBoss);
    },
    shoot: function () {
      playTone(520, 190, 0.065, "triangle", 0.14);
    },
    crit: function () {
      playTone(880, 1320, 0.09, "sine", 0.22);
    },
    kill: function (isBoss) {
      if (isBoss) {
        playTone(160, 42, 0.55, "sawtooth", 0.45);
        playTone(240, 60, 0.45, "triangle", 0.35, 0.08);
      } else {
        playTone(230, 85, 0.09, "square", 0.13);
      }
    },
    gem: function () {
      playTone(740, 1180, 0.075, "sine", 0.14);
    },
    dash: function () {
      playTone(280, 620, 0.12, "sine", 0.22);
    },
    hurt: function () {
      playTone(170, 55, 0.22, "sawtooth", 0.34);
    },
    combo: function (isSuper) {
      playTone(440, 660, 0.14, "triangle", 0.28);
      playTone(660, 880, 0.18, "triangle", 0.28, 0.1);
      if (isSuper) playTone(880, 1320, 0.28, "sine", 0.32, 0.2);
    },
    chat: function () {
      playTone(620, 780, 0.06, "sine", 0.12);
    }
  };
})();