window.OlyGame = window.OlyGame || {};

OlyGame.Audio = (function () {
  const STORAGE_KEY = 'pixel_sommerspiele_audio_v1';
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuf = null;
  let pinkBuf = null;
  let footToggle = false;

  // Lautstaerke 0.0 .. 1.0 + Stummschaltung
  let musicVol = 0.65;
  let sfxVol = 0.80;
  let musicMuted = false;
  let sfxMuted = false;

  // Gespeicherte Lautstaerke laden
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (typeof saved.musicVol === 'number') musicVol = Math.max(0, Math.min(1, saved.musicVol));
    if (typeof saved.sfxVol === 'number') sfxVol = Math.max(0, Math.min(1, saved.sfxVol));
    if (typeof saved.musicMuted === 'boolean') musicMuted = saved.musicMuted;
    if (typeof saved.sfxMuted === 'boolean') sfxMuted = saved.sfxMuted;
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ musicVol, sfxVol, musicMuted, sfxMuted }));
    } catch (e) {}
  }

  function effMusicVol() { return musicMuted ? 0 : musicVol; }
  function effSfxVol() { return sfxMuted ? 0 : sfxVol; }

  // --- CUSTOM MP3 LOADER (assets/audio/*.mp3 mit nahtlosem Fallback!) ---
  const CUSTOM_FILES = {
    musik_menue: 'assets/audio/musik_menue.mp3',
    schritt: 'assets/audio/schritt.mp3',
    schwimmen: 'assets/audio/schwimmen.mp3',
    startschuss: 'assets/audio/startschuss.mp3',
    sprung: 'assets/audio/sprung.mp3',
    sand: 'assets/audio/sand.mp3',
    wurf: 'assets/audio/wurf.mp3',
    stumble: 'assets/audio/stumble.mp3',
    foul: 'assets/audio/foul.mp3',
    schuss: 'assets/audio/schuss.mp3',
    tontaube: 'assets/audio/tontaube.mp3',
    hantel: 'assets/audio/hantel.mp3',
    jubel: 'assets/audio/jubel.mp3',
    fanfare: 'assets/audio/fanfare.mp3'
  };

  const customBank = {}; // key -> { ready: bool, el: HTMLAudioElement }
  let customMenuAudio = null;

  function probeCustomAudio() {
    Object.keys(CUSTOM_FILES).forEach((key) => {
      const a = new Audio();
      a.preload = 'auto';
      const entry = { ready: false, el: a };
      customBank[key] = entry;
      a.addEventListener('canplaythrough', () => {
        entry.ready = true;
        if (key === 'musik_menue') {
          a.loop = true;
          a.volume = effMusicVol();
          customMenuAudio = a;
          // Falls Menue-Musik schon laeuft, nahtlos auf eigene MP3 umschalten!
          if (musicWanted && effMusicVol() > 0) {
            stopSynthMusicLoop();
            a.play().catch(() => {});
          }
        }
      }, { once: true });
      a.addEventListener('error', () => {
        entry.ready = false;
      }, { once: true });
      a.src = CUSTOM_FILES[key];
    });
  }
  probeCustomAudio();

  function playCustomSfx(key, volScale, pitchJitter) {
    const entry = customBank[key];
    const v = effSfxVol() * (volScale || 1.0);
    if (!entry || !entry.ready || v <= 0.001) return false;
    try {
      const inst = entry.el.cloneNode(true);
      inst.volume = Math.max(0, Math.min(1, v));
      if (pitchJitter) {
        inst.playbackRate = 1 + (Math.random() - 0.5) * pitchJitter;
      }
      inst.play().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- WEB AUDIO API ENGINE (Eingebauter Fallback mit echten Master-Gain-Nodes!) ---
  let musicWanted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensureCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();
        musicGain.gain.value = effMusicVol();
        sfxGain.gain.value = effSfxVol();
        musicGain.connect(ctx.destination);
        sfxGain.connect(ctx.destination);
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (ctx && !noiseBuf) buildNoiseBuffers();
    return ctx;
  }

  function applyVolumes() {
    if (musicGain && ctx) {
      musicGain.gain.setTargetAtTime(effMusicVol(), ctx.currentTime, 0.02);
    }
    if (sfxGain && ctx) {
      sfxGain.gain.setTargetAtTime(effSfxVol(), ctx.currentTime, 0.02);
    }
    if (customMenuAudio) {
      customMenuAudio.volume = effMusicVol();
      if (effMusicVol() <= 0.001) customMenuAudio.pause();
      else if (musicWanted) customMenuAudio.play().catch(() => {});
    }
    if (musicWanted && effMusicVol() > 0.001 && !customMenuAudio) {
      if (ctx && ctx.state === 'running' && !musicTimer) startSynthMusicLoop();
    } else if (effMusicVol() <= 0.001) {
      stopSynthMusicLoop();
    }
  }

  function buildNoiseBuffers() {
    const sr = ctx.sampleRate;
    const len = sr * 2;
    noiseBuf = ctx.createBuffer(1, len, sr);
    pinkBuf = ctx.createBuffer(1, len, sr);
    const w = noiseBuf.getChannelData(0);
    const p = pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      w[i] = white;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  function unlockOnGesture() {
    const c = ensureCtx();
    if (musicWanted && effMusicVol() > 0.001) {
      if (customMenuAudio) {
        customMenuAudio.volume = effMusicVol();
        customMenuAudio.play().catch(() => {});
      } else if (c && !musicTimer) {
        startSynthMusicLoop();
      }
    }
  }
  window.addEventListener('pointerdown', unlockOnGesture, { passive: true });
  window.addEventListener('keydown', unlockOnGesture, { passive: true });

  function playWarmSynth(freq, dur, vol, type, cutoff, attack, detune, toMusicBus) {
    const c = ensureCtx();
    if (!c) return;
    const dest = toMusicBus ? musicGain : sfxGain;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    if (detune) osc.detune.setValueAtTime(detune, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff || 1600, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, (cutoff || 1600) * 0.45), now + dur);

    const atk = attack || 0.012;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol || 0.06, now + atk);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function playFilteredNoise(opts, toMusicBus) {
    const c = ensureCtx();
    if (!c || !noiseBuf) return;
    const dest = toMusicBus ? musicGain : sfxGain;
    const now = c.currentTime;
    const dur = opts.dur || 0.15;
    const src = c.createBufferSource();
    src.buffer = opts.pink ? pinkBuf : noiseBuf;
    const offset = Math.random() * 1.2;

    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.setValueAtTime(opts.freqStart || 1000, now);
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.freqEnd), now + dur);
    if (opts.q) filter.Q.value = opts.q;

    const gain = c.createGain();
    const atk = opts.attack || 0.005;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(opts.vol || 0.12, now + atk);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(now, offset, dur + 0.02);
  }

  function playThump(freqStart, freqEnd, dur, vol, toMusicBus) {
    const c = ensureCtx();
    if (!c) return;
    const dest = toMusicBus ? musicGain : sfxGain;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), now + dur);
    gain.gain.setValueAtTime(vol || 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // --- EINGEBAUTE OLYMPISCHE HINTERGRUNDMUSIK (Fallback wenn keine musik_menue.mp3 vorliegt) ---
  const BPM = 124;
  const STEP_MS = (60 / BPM / 4) * 1000;
  const MELODY = [
    72, 0, 76, 0, 79, 0, 76, 79,  84, 0, 0, 79, 76, 0, 72, 0,
    74, 0, 77, 0, 81, 0, 77, 81,  79, 0, 0, 0,  76, 0, 74, 0,
    72, 0, 76, 0, 79, 0, 81, 79,  84, 0, 86, 0, 88, 0, 84, 0,
    81, 0, 79, 76, 74, 0, 76, 0,  79, 0, 0, 0,  74, 0, 71, 0
  ];
  const BASS = [
    48, 0, 48, 0, 55, 0, 48, 0,  48, 0, 52, 0, 55, 0, 52, 0,
    53, 0, 53, 0, 57, 0, 53, 0,  55, 0, 55, 0, 59, 0, 55, 0,
    45, 0, 45, 0, 52, 0, 45, 0,  48, 0, 52, 0, 55, 0, 52, 0,
    53, 0, 53, 0, 55, 0, 55, 0,  55, 0, 50, 0, 47, 0, 55, 0
  ];
  const CHORDS = {
    0: [60, 64, 67], 16: [65, 69, 72], 24: [62, 67, 71],
    32: [57, 60, 64], 40: [60, 64, 67], 48: [65, 69, 72], 56: [62, 67, 71]
  };
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function tickMusic() {
    if (effMusicVol() <= 0.001 || !musicWanted || customMenuAudio || !ctx || ctx.state !== 'running') return;
    const s = musicStep % 64;
    const beat = s % 16;

    if (beat === 0 || beat === 4 || beat === 8 || beat === 12) playThump(130, 42, 0.13, 0.12, true);
    if (beat === 4 || beat === 12) {
      playFilteredNoise({ dur: 0.11, vol: 0.06, filterType: 'bandpass', freqStart: 1900, freqEnd: 1100, q: 1.0 }, true);
      playThump(210, 110, 0.06, 0.05, true);
    }
    if (beat % 2 === 0) {
      playFilteredNoise({ dur: 0.035, vol: beat % 4 === 2 ? 0.026 : 0.015, filterType: 'highpass', freqStart: 7500 }, true);
    }
    const bNote = BASS[s];
    if (bNote) playWarmSynth(midiToFreq(bNote), 0.16, 0.06, 'triangle', 750, 0.008, 0, true);
    if (CHORDS[s]) {
      CHORDS[s].forEach(n => playWarmSynth(midiToFreq(n), 0.72, 0.019, 'sawtooth', 1100, 0.04, 0, true));
    }
    const mNote = MELODY[s];
    if (mNote) {
      const f = midiToFreq(mNote);
      playWarmSynth(f, 0.24, 0.04, 'sawtooth', 2200, 0.015, -4, true);
      playWarmSynth(f, 0.24, 0.03, 'triangle', 2600, 0.015, 4, true);
    }
    musicStep = (musicStep + 1) % 64;
  }

  function startSynthMusicLoop() {
    if (musicTimer || customMenuAudio) return;
    const c = ensureCtx();
    if (!c) return;
    musicStep = 0;
    musicTimer = setInterval(tickMusic, STEP_MS);
  }

  function stopSynthMusicLoop() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setMenuMusic(shouldPlay) {
    musicWanted = !!shouldPlay;
    if (musicWanted && effMusicVol() > 0.001) {
      if (customMenuAudio) {
        customMenuAudio.volume = effMusicVol();
        customMenuAudio.play().catch(() => {});
      } else if (ctx && ctx.state === 'running') {
        startSynthMusicLoop();
      }
    } else {
      stopSynthMusicLoop();
      if (customMenuAudio) customMenuAudio.pause();
    }
  }

  return {
    getMusicVolume: () => musicVol,
    getSfxVolume: () => sfxVol,
    isMusicMuted: () => musicMuted,
    isSfxMuted: () => sfxMuted,
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, v));
      if (musicVol > 0) musicMuted = false;
      saveSettings();
      ensureCtx();
      applyVolumes();
    },
    setSfxVolume(v) {
      sfxVol = Math.max(0, Math.min(1, v));
      if (sfxVol > 0) sfxMuted = false;
      saveSettings();
      ensureCtx();
      applyVolumes();
    },
    toggleMusicMute() {
      musicMuted = !musicMuted;
      saveSettings();
      ensureCtx();
      applyVolumes();
      return musicMuted;
    },
    toggleSfxMute() {
      sfxMuted = !sfxMuted;
      saveSettings();
      ensureCtx();
      applyVolumes();
      return sfxMuted;
    },
    setMenuMusic,

    click() {
      if (effSfxVol() <= 0.001) return;
      playThump(520, 320, 0.04, 0.055);
      playFilteredNoise({ dur: 0.025, vol: 0.032, filterType: 'highpass', freqStart: 2500 });
    },

    step() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('schritt', 0.85, 0.14)) return;
      footToggle = !footToggle;
      const p = footToggle ? 1.0 : 0.91;
      playThump(92 * p, 44, 0.055, 0.09);
      playFilteredNoise({ dur: 0.048, vol: 0.07, pink: true, filterType: 'bandpass', freqStart: 1350 * p, freqEnd: 780, q: 1.4 });
    },

    swimStroke(strong) {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('schwimmen', strong ? 1.0 : 0.72, 0.14)) return;
      const v = strong ? 0.15 : 0.1;
      playFilteredNoise({ dur: 0.24, vol: v, pink: true, filterType: 'bandpass', freqStart: 380, freqEnd: 1350, q: 1.1, attack: 0.03 });
      setTimeout(() => {
        if (effSfxVol() <= 0.001) return;
        playFilteredNoise({ dur: 0.18, vol: v * 0.65, pink: true, filterType: 'lowpass', freqStart: 1100, freqEnd: 320, attack: 0.02 });
      }, 60);
    },

    swimTurn() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('schwimmen', 1.0, 0.06)) return;
      playThump(120, 50, 0.18, 0.13);
      playFilteredNoise({ dur: 0.36, vol: 0.16, pink: true, filterType: 'bandpass', freqStart: 260, freqEnd: 1600, q: 0.9, attack: 0.03 });
    },

    breath() {
      if (effSfxVol() <= 0.001) return;
      playFilteredNoise({ dur: 0.16, vol: 0.055, pink: true, filterType: 'bandpass', freqStart: 900, freqEnd: 1400, q: 2.2, attack: 0.04 });
    },

    beep(high) {
      if (effSfxVol() <= 0.001) return;
      const f = high ? 880 : 523.25;
      playWarmSynth(f, high ? 0.28 : 0.15, 0.085, 'triangle', 2200, 0.008);
      playWarmSynth(f * 2, high ? 0.22 : 0.1, 0.028, 'sine', 3000, 0.008);
    },

    gun() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('startschuss', 1.0, 0)) return;
      playThump(180, 38, 0.14, 0.24);
      playFilteredNoise({ dur: 0.16, vol: 0.3, filterType: 'lowpass', freqStart: 3800, freqEnd: 450, attack: 0.002 });
      setTimeout(() => {
        if (effSfxVol() <= 0.001) return;
        playFilteredNoise({ dur: 0.34, vol: 0.12, pink: true, filterType: 'bandpass', freqStart: 950, freqEnd: 350, q: 0.7, attack: 0.02 });
      }, 95);
    },

    jump() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('sprung', 0.9, 0.08)) return;
      playThump(115, 52, 0.09, 0.14);
      playFilteredNoise({ dur: 0.14, vol: 0.075, pink: true, filterType: 'bandpass', freqStart: 420, freqEnd: 1200, q: 1.2, attack: 0.02 });
    },

    sandLand() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('sand', 1.0, 0.08)) return;
      playThump(95, 36, 0.14, 0.17);
      playFilteredNoise({ dur: 0.28, vol: 0.16, pink: true, filterType: 'lowpass', freqStart: 1650, freqEnd: 480, attack: 0.01 });
    },

    throwSfx() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('wurf', 0.95, 0.08)) return;
      playFilteredNoise({ dur: 0.24, vol: 0.13, pink: true, filterType: 'bandpass', freqStart: 350, freqEnd: 1850, q: 1.8, attack: 0.03 });
      playThump(160, 70, 0.1, 0.085);
    },

    poleFlex() {
      if (effSfxVol() <= 0.001) return;
      playWarmSynth(145, 0.28, 0.055, 'triangle', 600, 0.04);
      playFilteredNoise({ dur: 0.2, vol: 0.065, pink: true, filterType: 'bandpass', freqStart: 600, freqEnd: 1100, q: 2.0 });
    },

    stumble() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('stumble', 0.95, 0.08)) return;
      playThump(155, 65, 0.11, 0.15);
      playFilteredNoise({ dur: 0.12, vol: 0.13, filterType: 'bandpass', freqStart: 1100, freqEnd: 650, q: 2.4 });
      setTimeout(() => {
        if (effSfxVol() <= 0.001) return;
        playThump(120, 55, 0.08, 0.095);
        playFilteredNoise({ dur: 0.09, vol: 0.085, filterType: 'bandpass', freqStart: 950, freqEnd: 500, q: 2.0 });
      }, 90);
    },

    foul() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('foul', 0.95, 0)) return;
      playWarmSynth(155, 0.24, 0.095, 'sawtooth', 520, 0.015);
      playWarmSynth(116, 0.32, 0.085, 'sawtooth', 460, 0.02);
      setTimeout(() => {
        if (effSfxVol() <= 0.001) return;
        playWarmSynth(130, 0.38, 0.095, 'sawtooth', 420, 0.015);
      }, 210);
    },

    perfect() {
      if (effSfxVol() <= 0.001) return;
      playWarmSynth(523.25, 0.16, 0.07, 'triangle', 2200, 0.01);
      setTimeout(() => playWarmSynth(659.25, 0.18, 0.07, 'triangle', 2400, 0.01), 75);
      setTimeout(() => playWarmSynth(783.99, 0.28, 0.08, 'triangle', 2600, 0.01), 150);
    },

    crowdCheer(longCheer) {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('jubel', longCheer ? 1.0 : 0.72, 0.04)) return;
      const d = longCheer ? 1.5 : 0.85;
      playFilteredNoise({ dur: d, vol: 0.13, pink: true, filterType: 'bandpass', freqStart: 750, freqEnd: 1150, q: 0.75, attack: 0.18 });
      playFilteredNoise({ dur: d * 0.85, vol: 0.075, pink: true, filterType: 'bandpass', freqStart: 1600, freqEnd: 2100, q: 1.0, attack: 0.25 });
    },

    shotgun() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('schuss', 1.0, 0.06)) return;
      playThump(140, 34, 0.16, 0.25);
      playFilteredNoise({ dur: 0.2, vol: 0.26, filterType: 'lowpass', freqStart: 2800, freqEnd: 320, attack: 0.002 });
    },

    shatter() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('tontaube', 1.0, 0.12)) return;
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          if (effSfxVol() <= 0.001) return;
          playFilteredNoise({ dur: 0.055, vol: 0.095, filterType: 'highpass', freqStart: 2800 + i * 650, attack: 0.002 });
          playWarmSynth(1400 + i * 320, 0.045, 0.028, 'triangle', 4000, 0.002);
        }, i * 24);
      }
    },

    barbellClank() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('hantel', 1.0, 0.06)) return;
      playThump(85, 34, 0.2, 0.22);
      playWarmSynth(412, 0.18, 0.05, 'triangle', 2600, 0.003);
      playWarmSynth(685, 0.14, 0.038, 'sine', 3000, 0.003);
      playFilteredNoise({ dur: 0.12, vol: 0.085, filterType: 'bandpass', freqStart: 1800, freqEnd: 900, q: 2.2 });
    },

    liftSuccess() {
      if (effSfxVol() <= 0.001) return;
      this.perfect();
      this.crowdCheer(true);
    },

    fanfare() {
      if (effSfxVol() <= 0.001) return;
      if (playCustomSfx('fanfare', 1.0, 0)) {
        setTimeout(() => this.crowdCheer(true), 450);
        return;
      }
      const notes = [
        [523.25, 0, 0.22], [659.25, 190, 0.22], [783.99, 380, 0.22],
        [1046.5, 580, 0.48], [783.99, 1080, 0.22], [1046.5, 1300, 0.85]
      ];
      notes.forEach(([f, delay, d]) => {
        setTimeout(() => {
          if (effSfxVol() <= 0.001) return;
          playWarmSynth(f, d, 0.08, 'sawtooth', 2200, 0.02, -5);
          playWarmSynth(f, d, 0.065, 'sawtooth', 2200, 0.02, 5);
          playWarmSynth(f * 0.5, d, 0.048, 'triangle', 1000, 0.02);
        }, delay);
      });
      setTimeout(() => this.crowdCheer(true), 550);
    }
  };
})();
