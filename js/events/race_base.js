window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.createTrackRace = function (variant) {
  const isHurdles = variant === 'hurdles110';
  const is400 = variant === 'sprint400';

  let ctxInfo = null;
  let racers = [];
  let hurdles = [];
  let phase = 'countdown';
  let countdownTimer = 2.8;
  let countdownStage = 0;
  let raceTime = 0;
  let animT = 0;
  let finishDelay = 0;
  let syncAccum = 0;
  let camX = 0;
  let callout = null;
  const particles = OlyGame.Sprites.createParticles();

  const TRACK_METERS = is400 ? 400 : (isHurdles ? 110 : 100);
  const PX_PER_METER = is400 ? 11.5 : 22;
  const TIME_MULT = is400 ? 2.05 : 1.0;
  const START_X = 92;
  const FINISH_X = START_X + TRACK_METERS * PX_PER_METER;

  // 3/4 SCHRAEGE STADION-PERSPEKTIVE (genau wie sommerspiele.mp4!)
  // Keine flache Himmel-Leiste oben: die warme korallenrote Laufbahn fuellt die gesamte Kamera!
  const TRACK_TOP = 54;
  const LANE_H = 34;
  const LANE_Y = [81, 115, 149, 183, 217, 251];
  // Schraege Perspektiv-Neigung fuer Start, Huerden, Distanzlinien & Ziel:
  // Obere Bahnen liegen leicht weiter links, untere leicht weiter rechts (wie im Video!)
  const SLANT = 0.34;
  function slantOffset(y) {
    return (y - 150) * SLANT;
  }

  function buildRacers(players) {
    const list = [];
    const used = new Set(players.map(p => p.country));
    const avail = OlyGame.CONFIG.COUNTRIES.filter(c => !used.has(c.code));
    let botIdx = 0;

    for (let lane = 0; lane < 6; lane++) {
      if (lane < players.length) {
        const p = players[lane];
        list.push({
          id: p.id, name: p.name, country: p.country, isBot: false,
          playerIndex: p.slotIndex, lane,
          x: START_X, y: LANE_Y[lane], z: 0, vz: 0, vx: 0,
          animPhase: 0, lastKey: null,
          stamina: 100, exhausted: false,
          stumbleTimer: 0, finished: false, finishTime: null,
          hurdleCleared: -1, starTimer: 0
        });
      } else {
        const c = avail[botIdx % avail.length] || OlyGame.CONFIG.COUNTRIES[botIdx % 16];
        const bName = OlyGame.CONFIG.BOT_NAMES[botIdx % OlyGame.CONFIG.BOT_NAMES.length];
        const skill = 0.78 + (botIdx % 4) * 0.055 + Math.random() * 0.04;
        list.push({
          id: 'bot_' + lane, name: bName, country: c.code, isBot: true,
          playerIndex: -1, lane,
          x: START_X, y: LANE_Y[lane], z: 0, vz: 0, vx: 0,
          animPhase: Math.random() * 6, stamina: 100, exhausted: false,
          skill, stumbleTimer: 0, finished: false, finishTime: null,
          hurdleCleared: -1, starTimer: 0
        });
        botIdx++;
      }
    }
    return list;
  }

  function buildHurdles() {
    const arr = [];
    if (!isHurdles) return arr;
    for (let h = 0; h < 10; h++) {
      const mx = 14 + h * 9.5;
      const hx = START_X + mx * PX_PER_METER;
      for (let lane = 0; lane < 6; lane++) {
        arr.push({ idx: h, lane, x: hx, knocked: false });
      }
    }
    return arr;
  }

  function init(info) {
    ctxInfo = info;
    particles.clear();
    racers = buildRacers(info.players);
    hurdles = buildHurdles();
    phase = 'countdown';
    countdownTimer = 2.8;
    countdownStage = 0;
    raceTime = 0;
    animT = 0;
    finishDelay = 0;
    camX = 0;
    callout = null;
    syncAccum = 0;
    if (info.setSpectatorBanner) info.setSpectatorBanner(null);
  }

  function isLocalControlled(r) {
    return !r.isBot && ctxInfo.localPlayerIds.includes(r.id);
  }

  function updateRacerPhysics(r, dt, inp) {
    if (r.finished) {
      r.vx = Math.max(0, r.vx - 140 * dt);
      r.x += r.vx * dt;
      r.animPhase += r.vx * dt * 0.1;
      return;
    }

    if (r.stumbleTimer > 0) r.stumbleTimer -= dt;
    if (r.starTimer > 0) r.starTimer -= dt;

    if (r.z > 0 || r.vz !== 0) {
      r.z += r.vz * dt;
      r.vz -= 640 * dt;
      if (r.z <= 0) {
        r.z = 0; r.vz = 0;
        particles.burstDust(r.x + slantOffset(r.y), r.y, 4);
        if (isLocalControlled(r)) OlyGame.Audio.step();
      }
    }

    const maxSpeed = is400 ? 226 : (isHurdles ? 196 : 228);
    const metersDone = Math.max(0, (r.x - START_X) / PX_PER_METER);
    const inFinalStraight = is400 && metersDone >= 300;

    if (r.isBot) {
      const paceFactor = is400 ? (metersDone < 280 ? 0.88 : 1.03) : 1.0;
      const targetV = maxSpeed * r.skill * paceFactor * (r.stumbleTimer > 0 ? 0.55 : 1);
      r.vx += (targetV - r.vx) * Math.min(1, dt * 2.8);
      if (isHurdles && r.z === 0) {
        const nextH = hurdles.find(h => h.lane === r.lane && !h.knocked && h.x > r.x && h.x - r.x < 30);
        if (nextH && Math.random() < 0.92) r.vz = 144;
      }
    } else if (inp) {
      let boost = 0;
      if (inp.leftPressed) { boost = (r.lastKey === 'R' || r.lastKey === null) ? 26 : 10; r.lastKey = 'L'; }
      if (inp.rightPressed) { boost = (r.lastKey === 'L' || r.lastKey === null) ? 26 : 10; r.lastKey = 'R'; }

      if (is400) {
        if (r.exhausted) {
          r.stamina = Math.min(100, r.stamina + 18 * dt);
          if (r.stamina >= 28) r.exhausted = false;
          boost *= 0.42;
        } else if (boost > 0) {
          const drain = (r.vx > maxSpeed * 0.80) ? 4.4 : 1.1;
          r.stamina = Math.max(0, r.stamina - drain);
          if (r.stamina <= 1) {
            r.exhausted = true;
            if (isLocalControlled(r)) callout = { text: 'LAKTAT! KURZ LOCKER!', color: '#f87171', age: 0, life: 0.9 };
          }
        } else if (r.vx < maxSpeed * 0.78) {
          r.stamina = Math.min(100, r.stamina + 11 * dt);
        }
        if (inFinalStraight && !r.exhausted && boost > 0 && r.stamina > 12) boost *= 1.15;
      }

      if (boost > 0 && r.stumbleTimer <= 0) {
        const cap = (is400 && r.exhausted) ? maxSpeed * 0.68 : maxSpeed * 1.07;
        r.vx = Math.min(cap, r.vx + boost);
        if (r.z === 0 && Math.random() < 0.55) particles.burstDust(r.x + slantOffset(r.y) - 8, r.y, 1);
        if (r.vx > maxSpeed * 0.88) r.starTimer = 0.25;
      }

      const drag = r.stumbleTimer > 0 ? 150 : (is400 ? 60 : 72);
      r.vx = Math.max(0, r.vx - drag * dt);

      if (isHurdles && inp.actionPressed && r.z === 0 && r.stumbleTimer <= 0) {
        r.vz = 145;
        OlyGame.Audio.jump();
        particles.burstDust(r.x + slantOffset(r.y), r.y, 4);
      }
    }

    r.x += r.vx * dt;
    const prevPhase = r.animPhase;
    if (r.z === 0) r.animPhase += r.vx * dt * 0.085;

    if (isLocalControlled(r) && r.z === 0 && r.vx > 35) {
      if (Math.floor(r.animPhase / Math.PI) > Math.floor(prevPhase / Math.PI)) OlyGame.Audio.step();
    }

    const wx = r.x + slantOffset(r.y);
    if (r.vx > maxSpeed * 0.68 && r.z === 0 && Math.random() < 0.62) {
      particles.burstDust(wx - 12, r.y - 2, 1);
    }
    if (r.starTimer > 0 && Math.random() < 0.7) {
      particles.spawn(
        wx - 14, r.y - 14 - r.z + (Math.random() - 0.5) * 14,
        -44 - Math.random() * 24, (Math.random() - 0.5) * 14,
        Math.random() < 0.65 ? '#fde047' : '#ffffff', 2 + Math.floor(Math.random() * 2), 0.45, 0, 'star'
      );
    }

    if (isHurdles) {
      for (let i = 0; i < hurdles.length; i++) {
        const h = hurdles[i];
        if (h.lane !== r.lane || h.knocked) continue;
        if (Math.abs(r.x - h.x) < 8) {
          if (r.z < 9) {
            h.knocked = true;
            r.stumbleTimer = 0.45;
            r.vx *= 0.5;
            if (isLocalControlled(r)) OlyGame.Audio.stumble();
            particles.burstDust(h.x + slantOffset(r.y), r.y, 6, '#fde047');
          } else if (r.hurdleCleared < h.idx) {
            r.hurdleCleared = h.idx;
            r.vx = Math.min(maxSpeed * 1.06, r.vx + 14);
            r.starTimer = 0.35;
            if (!r.isBot) {
              particles.burstStars(wx, r.y - 22, 8);
              if (isLocalControlled(r)) callout = { text: 'PERFEKT!', color: '#fde047', age: 0, life: 0.75 };
            }
          }
        }
      }
    }

    if (r.x >= FINISH_X && !r.finished) {
      r.finished = true;
      r.finishTime = Number((raceTime * TIME_MULT).toFixed(2));
      if (isLocalControlled(r)) {
        OlyGame.Audio.perfect();
        OlyGame.Audio.crowdCheer(false);
        callout = { text: 'IM ZIEL!', color: '#4ade80', age: 0, life: 1.4 };
      }
    }
  }

  function update(dt) {
    animT += dt;
    particles.update(dt);
    if (callout) { callout.age += dt; if (callout.age > callout.life) callout = null; }

    if (phase === 'countdown') {
      countdownTimer -= dt;
      if (countdownTimer <= 1.9 && countdownStage === 0) { countdownStage = 1; OlyGame.Audio.beep(false); }
      else if (countdownTimer <= 0.95 && countdownStage === 1) { countdownStage = 2; OlyGame.Audio.beep(false); }
      else if (countdownTimer <= 0) {
        phase = 'running';
        OlyGame.Audio.gun();
        OlyGame.Audio.crowdCheer(false);
        callout = { text: 'LOS!', color: '#fde047', age: 0, life: 0.65 };
      }
      return;
    }

    if (phase === 'running') {
      raceTime += dt;
      const singleLocal = ctxInfo.localPlayerIds.length === 1;

      racers.forEach(r => {
        if (isLocalControlled(r)) {
          const inp = OlyGame.Input.getPlayerInput(r.playerIndex, singleLocal);
          updateRacerPhysics(r, dt, inp);
        } else if (r.isBot && (!ctxInfo.isOnline || ctxInfo.isHost)) {
          updateRacerPhysics(r, dt, null);
        } else if (!ctxInfo.isOnline) {
          updateRacerPhysics(r, dt, null);
        } else if (!r.finished) {
          r.x += r.vx * dt * 0.4;
          r.animPhase += r.vx * dt * 0.1;
        }
      });

      const humans = racers.filter(r => !r.isBot);
      const focusX = humans.length > 0 ? Math.max(...humans.map(h => h.x)) : Math.max(...racers.map(r => r.x));
      const targetCam = Math.max(0, Math.min(FINISH_X - 310, focusX - 210));
      camX += (targetCam - camX) * Math.min(1, dt * 7);

      if (ctxInfo.isOnline) {
        syncAccum += dt;
        if (syncAccum >= 0.045) {
          syncAccum = 0;
          if (ctxInfo.isHost) {
            ctxInfo.onSyncOut({
              kind: 'race_full', raceTime,
              racers: racers.map(r => ({
                id: r.id, x: r.x, z: r.z, vx: r.vx, animPhase: r.animPhase,
                stamina: r.stamina, stumbleTimer: r.stumbleTimer, finished: r.finished, finishTime: r.finishTime
              })),
              knocked: hurdles.filter(h => h.knocked).map(h => h.lane + '_' + h.idx)
            });
          } else {
            const myR = racers.find(r => isLocalControlled(r));
            if (myR) {
              ctxInfo.onSyncOut({
                kind: 'race_player', id: myR.id, x: myR.x, z: myR.z, vx: myR.vx,
                animPhase: myR.animPhase, stamina: myR.stamina, stumbleTimer: myR.stumbleTimer,
                finished: myR.finished, finishTime: myR.finishTime
              });
            }
          }
        }
      }

      const allHumansDone = racers.filter(r => !r.isBot).every(r => r.finished);
      const allDone = racers.every(r => r.finished);
      if (allDone || (allHumansDone && finishDelay > 1.6)) {
        racers.forEach(r => {
          if (!r.finished) {
            const rem = Math.max(1, FINISH_X - r.x);
            r.finishTime = Number(((raceTime + rem / Math.max(85, r.vx || 130)) * TIME_MULT).toFixed(2));
            r.finished = true;
          }
        });
        phase = 'finished';
        if (!ctxInfo.isOnline || ctxInfo.isHost) {
          const sorted = racers.slice().sort((a, b) => a.finishTime - b.finishTime);
          ctxInfo.onFinish(sorted.map(r => ({
            id: r.id, name: r.name, country: r.country, isBot: r.isBot,
            playerIndex: r.playerIndex, value: r.finishTime, foul: false
          })));
        }
      } else if (allHumansDone) {
        finishDelay += dt;
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'race_player' && ctxInfo.isHost) {
      const r = racers.find(x => x.id === payload.id);
      if (r) Object.assign(r, payload);
    } else if (payload.kind === 'race_full' && !ctxInfo.isHost) {
      raceTime = payload.raceTime;
      if (phase === 'countdown' && raceTime > 0) phase = 'running';
      payload.racers.forEach(pr => {
        const r = racers.find(x => x.id === pr.id);
        if (!r || isLocalControlled(r)) return;
        Object.assign(r, pr);
      });
      if (payload.knocked) {
        const kset = new Set(payload.knocked);
        hurdles.forEach(h => { if (kset.has(h.lane + '_' + h.idx)) h.knocked = true; });
      }
    }
  }

  // Zeichnet eine schraege 3/4-Linie ueber alle 6 Bahnen!
  function drawSlantedLine(pctx, worldX, color, width) {
    const xTop = worldX + slantOffset(TRACK_TOP) - camX;
    const xBot = worldX + slantOffset(TRACK_TOP + 6 * LANE_H) - camX;
    if (Math.max(xTop, xBot) < -30 || Math.min(xTop, xBot) > OlyGame.CONFIG.PW + 30) return;
    pctx.strokeStyle = color;
    pctx.lineWidth = width || 2;
    pctx.beginPath();
    pctx.moveTo(xTop, TRACK_TOP);
    pctx.lineTo(xBot, TRACK_TOP + 6 * LANE_H);
    pctx.stroke();
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW;
    const PH = OlyGame.CONFIG.PH;
    pctx.clearRect(0, 0, PW, PH);

    // 1. OBERER INFIELD-RASEN + 2.5D SPONSOR-BANDEN & BLUMENKAESTEN (3/4 Blick von oben - kein flacher Himmel!)
    OlyGame.Sprites.drawTexturedGrass(pctx, camX, 0, TRACK_TOP + 2);
    // Warmes Beton-Curb zwischen Rasen und Tartanbahn
    pctx.fillStyle = '#e2e8f0'; pctx.fillRect(0, TRACK_TOP - 4, PW, 4);
    pctx.fillStyle = '#cbd5e1'; pctx.fillRect(0, TRACK_TOP - 2, PW, 2);

    const boardSpacing = 152;
    const firstBoard = Math.floor(camX / boardSpacing) * boardSpacing;
    for (let bx = firstBoard; bx < camX + PW + boardSpacing; bx += boardSpacing) {
      // Im Zielbereich Platz frei lassen fuer die LED-Anzeigetafel & Presse-Fotografen (keine Ueberlappung!)
      if (bx > FINISH_X - 115 && bx < FINISH_X + 165) continue;
      const sx = bx - camX;
      const idx = Math.abs(Math.floor(bx / boardSpacing));
      OlyGame.Sprites.drawAdBoard(pctx, sx, 22, 92, 24, idx);
      OlyGame.Sprites.drawFlowerPlanter(pctx, sx + 104, 34, idx % 2 === 1);
    }

    // 2. WARME KORALLENROTE 3/4-TARTANBAHN + DIAGONALE STADIONDACH-SCHATTEN (wie sommerspiele.mp4!)
    pctx.fillStyle = '#ee7b74';
    pctx.fillRect(0, TRACK_TOP, PW, PH - TRACK_TOP);

    // Abwechselnde sanfte Bahnschattierung + feine Tartan-Textur + klare weisse Bahnlinien
    for (let i = 0; i < 6; i++) {
      const ly = TRACK_TOP + i * LANE_H;
      if (i % 2 === 1) { pctx.fillStyle = '#e67069'; pctx.fillRect(0, ly, PW, LANE_H); }
      pctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let gx = -Math.floor(camX % 28); gx < PW; gx += 28) {
        pctx.fillRect(gx + (i * 7) % 14, ly + 10, 2, 1);
        pctx.fillRect(gx + 14, ly + 24, 2, 1);
      }
      pctx.fillStyle = 'rgba(255,255,255,0.72)';
      pctx.fillRect(0, ly, PW, 2);
    }
    pctx.fillStyle = 'rgba(255,255,255,0.85)';
    pctx.fillRect(0, TRACK_TOP + 6 * LANE_H, PW, 2);
    OlyGame.Sprites.drawTrackShadows(pctx, camX, TRACK_TOP, PH - TRACK_TOP);

    // 3. SCHRAEGE PERSPEKTIV-LINIEN (Start, Distanzen, Ziel!) + GROSSE GEMALTE BAHNNUMMERN (wie sommerspiele.mp4 00:19!)
    drawSlantedLine(pctx, START_X + 10, '#ffffff', 3);

    const stepM = is400 ? 50 : 10;
    for (let m = stepM; m < TRACK_METERS; m += stepM) {
      const wx = START_X + m * PX_PER_METER;
      const isLast100 = is400 && m === 300;
      drawSlantedLine(pctx, wx, isLast100 ? 'rgba(250,204,21,0.65)' : 'rgba(255,255,255,0.22)', isLast100 ? 3 : 2);
      const lx = Math.round(wx + slantOffset(TRACK_TOP + 12) - camX);
      if (lx > -30 && lx < PW + 30) {
        OlyGame.Sprites.drawPixelText(pctx, isLast100 ? 'ZIELGERADE!' : (m + 'M'), lx + 6, TRACK_TOP + 6, isLast100 ? '#fde047' : 'rgba(255,255,255,0.48)', 1, 'left');
      }
    }

    // Startbloecke & grosse diagonale Bahnnummern (1-6) am Start und Ziel!
    for (let i = 0; i < 6; i++) {
      const ly = LANE_Y[i];
      const so = slantOffset(ly);
      const sx = Math.round(START_X + so - camX);
      if (sx > -40 && sx < PW + 50) {
        // 3D-Startblock
        pctx.fillStyle = 'rgba(60,15,20,0.22)'; pctx.fillRect(sx - 18, ly - 2, 14, 7);
        pctx.fillStyle = '#475569'; pctx.fillRect(sx - 16, ly - 5, 12, 7);
        pctx.fillStyle = '#94a3b8'; pctx.fillRect(sx - 14, ly - 7, 5, 5);
        OlyGame.Sprites.drawPixelText(pctx, String(i + 1), sx + 22, ly - 12, 'rgba(255,255,255,0.36)', 2, 'left');
      }
      const fxNum = Math.round(FINISH_X + so - camX);
      if (fxNum > -60 && fxNum < PW + 60) {
        OlyGame.Sprites.drawPixelText(pctx, String(i + 1), fxNum + 18, ly - 12, 'rgba(255,255,255,0.36)', 2, 'left');
      }
    }

    // Schraege Karo-Ziellinie + Presse-Fotografen & LED-Anzeigetafel!
    const fxTop = FINISH_X + slantOffset(TRACK_TOP) - camX;
    const fxBot = FINISH_X + slantOffset(TRACK_TOP + 6 * LANE_H) - camX;
    if (Math.max(fxTop, fxBot) > -40 && Math.min(fxTop, fxBot) < PW + 80) {
      for (let fy = TRACK_TOP; fy < TRACK_TOP + 6 * LANE_H; fy += 6) {
        const fxRow = Math.round(FINISH_X + slantOffset(fy) - camX);
        pctx.fillStyle = ((fy / 6) % 2 === 0) ? '#ffffff' : '#1e293b'; pctx.fillRect(fxRow, fy, 5, 6);
        pctx.fillStyle = ((fy / 6) % 2 === 0) ? '#1e293b' : '#ffffff'; pctx.fillRect(fxRow + 5, fy, 5, 6);
      }
      OlyGame.Sprites.drawLedBoard(pctx, Math.round(fxTop - 26), 8, 56, 38, animT);
      OlyGame.Sprites.drawPhotographer(pctx, Math.round(fxTop + 44), 48, animT, true);
      OlyGame.Sprites.drawPhotographer(pctx, Math.round(fxTop + 72), 52, animT, true);
    }

    // 4. SCHRAEGE HUERDEN & GROESSERE CHIBI-ATHLETEN (scale 1.18 + Motion-Trail!)
    for (let lane = 0; lane < 6; lane++) {
      const ly = LANE_Y[lane];
      const so = slantOffset(ly);

      if (isHurdles) {
        for (let i = 0; i < hurdles.length; i++) {
          const h = hurdles[i];
          if (h.lane !== lane) continue;
          const hx = Math.round(h.x + so - camX);
          if (hx < -30 || hx > PW + 30) continue;
          if (h.knocked) {
            pctx.fillStyle = 'rgba(55,15,20,0.2)'; pctx.fillRect(hx + 2, ly - 1, 18, 4);
            pctx.fillStyle = '#64748b'; pctx.fillRect(hx + 2, ly - 3, 16, 2);
            pctx.fillStyle = '#38bdf8'; pctx.fillRect(hx + 12, ly - 6, 8, 5);
            pctx.fillStyle = '#facc15'; pctx.fillRect(hx + 14, ly - 4, 4, 3);
          } else {
            // Schraege 3/4-Huerde ueber die volle Bahnbreite (wie sommerspiele.mp4 00:03!)
            const xTopH = hx - 5, xBotH = hx + 5;
            pctx.fillStyle = 'rgba(55,15,20,0.22)'; pctx.fillRect(hx - 6, ly, 16, 4);
            pctx.fillStyle = '#94a3b8';
            pctx.fillRect(xTopH - 2, ly - 20, 2, 16);
            pctx.fillRect(xBotH - 2, ly - 10, 2, 14);
            // Schraege blau-gelbe Huerden-Latte!
            OlyGame.Sprites.drawPixelLimb(pctx, xTopH - 1, ly - 21, xBotH - 1, ly - 11, 4, '#0ea5e9', '#0284c7');
            OlyGame.Sprites.drawPixelLimb(pctx, xTopH, ly - 20, xBotH, ly - 10, 2, '#facc15');
          }
        }
      }

      const r = racers[lane];
      const rx = r.x + so - camX;
      let pose = 'idle';
      if (phase === 'countdown') pose = countdownTimer < 1.8 ? 'crouch' : 'idle';
      else if (phase === 'running' || r.vx > 8) {
        if (r.stumbleTimer > 0) pose = 'stumble';
        else if (r.z > 2) {
          if (isHurdles) pose = r.vz > 45 ? 'hurdle_up' : (r.vz > -45 ? 'hurdle_peak' : 'hurdle_down');
          else pose = r.vz > 45 ? 'jump_up' : (r.vz > -45 ? 'jump_peak' : 'jump_down');
        }
        else pose = 'run';
      }
      OlyGame.Sprites.drawAthlete(pctx, rx, ly - r.z, r.country, pose, r.animPhase, {
        shadowOffsetY: r.z
      });
    }

    particles.draw(pctx, camX);

    // 5. COMPOSITING + ECHTER OPTISCHER TILT-SHIFT MINIATUR-BLUR!
    OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.16, 0.22);

    const localHumans = [];
    racers.forEach(r => {
      if (!r.isBot) {
        const rx = r.x + slantOffset(r.y) - camX;
        if (rx > -16 && rx < PW + 16) OlyGame.Sprites.drawPlayerPin(ctx, rx, r.y - r.z - 40, r.playerIndex);
        if (isLocalControlled(r)) localHumans.push(r);
      }
    });

    const sorted = racers.slice().sort((a, b) => b.x - a.x);
    const firstHuman = localHumans[0] || racers.find(r => !r.isBot);
    if (firstHuman) {
      const rank = sorted.indexOf(firstHuman) + 1;
      OlyGame.Sprites.drawBigText(ctx, rank + '. PLATZ', 24, 16, 40, '#ffffff', 'left');
      if (is400) {
        const curM = Math.min(400, Math.floor(Math.max(0, (firstHuman.x - START_X) / PX_PER_METER)));
        OlyGame.Sprites.drawPill(ctx, 24, 66, curM + 'm / 400m', curM >= 300 ? '#dc2626' : '#1e293b', '#fde047', false);
      }
    }
    OlyGame.Sprites.drawBigText(ctx, (raceTime * TIME_MULT).toFixed(2), 936, 16, 44, '#ffffff', 'right');

    if (is400) {
      localHumans.forEach((r, idx) => {
        const bx = 22 + idx * 215, by = 482;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        OlyGame.Sprites.roundRect(ctx, bx, by, 200, 44, 10); ctx.fill();
        ctx.fillStyle = '#cbd5e1'; ctx.font = '800 12px "Segoe UI", sans-serif';
        ctx.fillText(OlyGame.CONFIG.PLAYER_LABELS[r.playerIndex] + ' AUSDAUER', bx + 10, by + 15);
        if (r.exhausted) { ctx.fillStyle = '#ef4444'; ctx.textAlign = 'right'; ctx.fillText('LAKTAT!', bx + 190, by + 15); ctx.textAlign = 'left'; }
        ctx.fillStyle = '#334155'; ctx.fillRect(bx + 10, by + 23, 180, 12);
        const pct = Math.max(0, Math.min(1, r.stamina / 100));
        ctx.fillStyle = r.exhausted ? '#ef4444' : (pct > 0.4 ? '#22c55e' : '#facc15');
        ctx.fillRect(bx + 10, by + 23, 180 * pct, 12);
        ctx.restore();
      });
    }

    if (phase === 'countdown') {
      const msg = countdownTimer > 1.9 ? 'AUF DIE PLÄTZE...' : (countdownTimer > 0.95 ? 'FERTIG...' : 'GLEICH LOS!');
      OlyGame.Sprites.drawBigText(ctx, msg, 480, 200, 52, '#fde047', 'center');
    }

    if (callout) OlyGame.Sprites.drawSlantedCallout(ctx, callout.text, 480, 150, callout.color, callout.age, 48);
    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};

OlyGame.Events.sprint100 = () => OlyGame.Events.createTrackRace('sprint100');
OlyGame.Events.sprint400 = () => OlyGame.Events.createTrackRace('sprint400');
OlyGame.Events.hurdles110 = () => OlyGame.Events.createTrackRace('hurdles110');
