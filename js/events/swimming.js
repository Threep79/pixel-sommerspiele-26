window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.swimming100 = function () {
  let ctxInfo = null;
  let swimmers = [];
  let phase = 'countdown';
  let countdownTimer = 2.4;
  let countdownStage = 0;
  let raceTime = 0;
  let finishDelay = 0;
  let syncAccum = 0;
  let waterAnim = 0;
  let callout = null;
  let droneX = 240;
  const particles = OlyGame.Sprites.createParticles();

  const TIME_DISPLAY_MULT = 2.25;
  const LANE_X = [50, 126, 202, 278, 354, 430];
  const POOL_LENGTH = 500;

  function buildSwimmers(players) {
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
          dist: 0, speed: 0, lap: 1, animPhase: 0, lastKey: null,
          stamina: 100, exhausted: false, strokeCooldown: 0,
          rhythmFeedback: '', rhythmTimer: 0, breathingTimer: 0,
          starTimer: 0, turnBoosted: false, turnWindow: false,
          finished: false, finishTime: null
        });
      } else {
        const c = avail[botIdx % avail.length] || OlyGame.CONFIG.COUNTRIES[botIdx % 16];
        const bName = OlyGame.CONFIG.BOT_NAMES[(botIdx + 2) % OlyGame.CONFIG.BOT_NAMES.length];
        list.push({
          id: 'bot_' + lane, name: bName, country: c.code, isBot: true,
          playerIndex: -1, lane,
          dist: 0, speed: 0, lap: 1, animPhase: Math.random() * 6,
          stamina: 100, exhausted: false, breathingTimer: 0, starTimer: 0,
          skill: 0.78 + (botIdx % 4) * 0.055 + Math.random() * 0.04,
          turnBoosted: false, turnWindow: false,
          finished: false, finishTime: null
        });
        botIdx++;
      }
    }
    return list;
  }

  function isLocalControlled(s) {
    return !s.isBot && ctxInfo.localPlayerIds.includes(s.id);
  }

  function getScreenY(s) {
    if (s.dist <= POOL_LENGTH) {
      const t = s.dist / POOL_LENGTH;
      return 234 - t * 196;
    } else {
      const t = Math.min(1, (s.dist - POOL_LENGTH) / POOL_LENGTH);
      return 38 + t * 196;
    }
  }

  function init(info) {
    ctxInfo = info;
    particles.clear();
    swimmers = buildSwimmers(info.players);
    phase = 'countdown';
    countdownTimer = 2.4;
    countdownStage = 0;
    raceTime = 0;
    finishDelay = 0;
    syncAccum = 0;
    waterAnim = 0;
    callout = null;
    droneX = 240;
    if (info.setSpectatorBanner) info.setSpectatorBanner(null);
  }

  function updateSwimmer(s, dt, inp) {
    if (s.finished) return;

    const maxSpeed = 52;
    s.turnWindow = (s.dist >= POOL_LENGTH - 55 && s.dist <= POOL_LENGTH + 18 && !s.turnBoosted);
    if (s.rhythmTimer > 0) s.rhythmTimer -= dt;
    if (s.breathingTimer > 0) s.breathingTimer -= dt;
    if (s.starTimer > 0) s.starTimer -= dt;

    if (s.isBot) {
      const target = maxSpeed * s.skill;
      s.speed += (target - s.speed) * Math.min(1, dt * 3.0);
      if (s.turnWindow && s.dist >= POOL_LENGTH - 14) {
        s.turnBoosted = true;
        s.speed = maxSpeed * 1.18;
      }
    } else if (inp) {
      s.strokeCooldown += dt;
      const regen = s.exhausted ? 22 : (s.strokeCooldown > 0.42 ? 26 : 11);
      s.stamina = Math.min(100, s.stamina + regen * dt);
      if (s.exhausted && s.stamina >= 32) {
        s.exhausted = false;
        s.rhythmFeedback = 'ATEM OK!';
        s.rhythmTimer = 0.6;
      }
      if (s.strokeCooldown > 0.55 && s.breathingTimer <= 0 && s.stamina < 85) {
        s.breathingTimer = 0.35;
        OlyGame.Audio.breath();
      }

      const pressedLeft = inp.leftPressed;
      const pressedRight = inp.rightPressed;
      if ((pressedLeft || pressedRight) && !s.exhausted) {
        const isAlt = (pressedLeft && s.lastKey !== 'L') || (pressedRight && s.lastKey !== 'R');
        s.lastKey = pressedLeft ? 'L' : 'R';

        if (s.strokeCooldown < 0.16) {
          s.stamina = Math.max(0, s.stamina - 15);
          s.speed = Math.min(maxSpeed * 0.92, s.speed + (isAlt ? 7 : 3));
          s.rhythmFeedback = 'ZU HEKTISCH!';
          s.rhythmTimer = 0.45;
          OlyGame.Audio.swimStroke(false);
        } else if (s.strokeCooldown <= 0.44 && isAlt) {
          s.stamina = Math.max(0, s.stamina - 5.5);
          s.speed = Math.min(maxSpeed * 1.12, s.speed + 20);
          s.rhythmFeedback = 'PERFEKTER ZUG!';
          s.rhythmTimer = 0.45;
          s.starTimer = 0.38;
          OlyGame.Audio.swimStroke(true);
          particles.burstStars(LANE_X[s.lane], getScreenY(s), 4);
        } else {
          s.stamina = Math.max(0, s.stamina - 6.5);
          s.speed = Math.min(maxSpeed * 1.0, s.speed + (isAlt ? 14 : 7));
          OlyGame.Audio.swimStroke(false);
        }
        // Kraeftiger weisser Hand-Spritzer links/rechts beim Eintauchen!
        const side = pressedLeft ? -12 : 12;
        particles.burstDust(LANE_X[s.lane] + side, getScreenY(s), 3, 'rgba(240,249,255,0.92)');

        s.strokeCooldown = 0;
        if (s.stamina <= 2) {
          s.exhausted = true;
          s.rhythmFeedback = 'AUSSER ATEM!';
          s.rhythmTimer = 0.9;
          OlyGame.Audio.breath();
        }
      }

      if (s.turnWindow && inp.actionPressed) {
        s.turnBoosted = true;
        s.dist = Math.max(s.dist, POOL_LENGTH + 12);
        s.speed = maxSpeed * 1.32;
        s.stamina = Math.min(100, s.stamina + 38);
        s.exhausted = false;
        s.starTimer = 0.9;
        s.rhythmFeedback = 'TURBO-ROLLWENDE!';
        s.rhythmTimer = 1.0;
        OlyGame.Audio.swimTurn();
        particles.burstDust(LANE_X[s.lane], 34, 10, '#ffffff');
        particles.burstStars(LANE_X[s.lane], 36, 12);
        callout = { text: 'TURBO-WENDE!', color: '#fde047', age: 0, life: 1.0 };
      }

      const drag = s.exhausted ? 24 : 14;
      s.speed = Math.max(8, s.speed - drag * dt);
    }

    if (s.dist < 38 && s.speed < 34) s.speed = Math.min(48, s.speed + 85 * dt);
    s.dist += s.speed * dt;
    s.lap = s.dist >= POOL_LENGTH ? 2 : 1;
    s.animPhase += (2.5 + s.speed * 0.22) * dt;

    // Dichte weisse Schaumspur + gelbe Sterne bei Top-Zuegen (wie sommerspiele.mp4 00:12!)
    const sy = getScreenY(s);
    const dir = s.lap === 1 ? 1 : -1;
    if (s.speed > 12 && Math.random() < 0.78) {
      particles.spawn(
        LANE_X[s.lane] + (Math.random() - 0.5) * 11,
        sy + dir * 18,
        (Math.random() - 0.5) * 10,
        dir * (16 + Math.random() * 14),
        Math.random() < 0.65 ? 'rgba(240,249,255,0.92)' : '#7dd3fc',
        3 + Math.floor(Math.random() * 2), 0.52, 0, 'puff'
      );
    }
    if (s.starTimer > 0 && Math.random() < 0.65) {
      particles.spawn(
        LANE_X[s.lane] + (Math.random() - 0.5) * 14,
        sy + dir * 16,
        (Math.random() - 0.5) * 14,
        dir * 20,
        '#fde047', 2, 0.42, 0, 'star'
      );
    }

    if (s.dist >= POOL_LENGTH * 2) {
      s.dist = POOL_LENGTH * 2;
      s.finished = true;
      s.finishTime = Number((raceTime * TIME_DISPLAY_MULT).toFixed(2));
      if (isLocalControlled(s)) {
        OlyGame.Audio.perfect();
        OlyGame.Audio.crowdCheer(false);
        callout = { text: 'IM ZIEL!', color: '#4ade80', age: 0, life: 1.4 };
      }
    }
  }

  function update(dt) {
    waterAnim += dt;
    particles.update(dt);
    if (callout) { callout.age += dt; if (callout.age > callout.life) callout = null; }

    // Kamera-Drohne folgt sanft dem fuehrenden Schwimmer
    if (swimmers.length > 0) {
      const leader = swimmers.reduce((best, s) => s.dist > best.dist ? s : best, swimmers[0]);
      droneX += (LANE_X[leader.lane] - droneX) * Math.min(1, dt * 2.2);
    }

    if (phase === 'countdown') {
      countdownTimer -= dt;
      if (countdownTimer <= 1.6 && countdownStage === 0) { countdownStage = 1; OlyGame.Audio.beep(false); }
      else if (countdownTimer <= 0.8 && countdownStage === 1) { countdownStage = 2; OlyGame.Audio.beep(false); }
      else if (countdownTimer <= 0) {
        phase = 'running';
        OlyGame.Audio.beep(true);
        OlyGame.Audio.swimTurn();
        // Grosser Startsprung-Spritzer fuer alle 6 Bahnen!
        swimmers.forEach(s => {
          particles.burstDust(LANE_X[s.lane], 228, 9, '#ffffff');
          particles.burstDust(LANE_X[s.lane], 224, 6, '#bae6fd');
        });
      }
      return;
    }

    if (phase === 'running') {
      raceTime += dt;
      const singleLocal = ctxInfo.localPlayerIds.length === 1;

      swimmers.forEach(s => {
        if (isLocalControlled(s)) {
          const inp = OlyGame.Input.getPlayerInput(s.playerIndex, singleLocal);
          updateSwimmer(s, dt, inp);
        } else if (s.isBot && (!ctxInfo.isOnline || ctxInfo.isHost)) {
          updateSwimmer(s, dt, null);
        } else if (!ctxInfo.isOnline) {
          updateSwimmer(s, dt, null);
        }
      });

      if (ctxInfo.isOnline) {
        syncAccum += dt;
        if (syncAccum >= 0.05) {
          syncAccum = 0;
          if (ctxInfo.isHost) {
            ctxInfo.onSyncOut({
              kind: 'swim_full', raceTime,
              swimmers: swimmers.map(s => ({
                id: s.id, dist: s.dist, speed: s.speed, lap: s.lap,
                stamina: s.stamina, animPhase: s.animPhase, finished: s.finished, finishTime: s.finishTime
              }))
            });
          } else {
            const myS = swimmers.find(s => isLocalControlled(s));
            if (myS) {
              ctxInfo.onSyncOut({
                kind: 'swim_player', id: myS.id, dist: myS.dist, speed: myS.speed,
                lap: myS.lap, stamina: myS.stamina, animPhase: myS.animPhase,
                finished: myS.finished, finishTime: myS.finishTime
              });
            }
          }
        }
      }

      const allHumansDone = swimmers.filter(s => !s.isBot).every(s => s.finished);
      const allDone = swimmers.every(s => s.finished);
      if (allDone || (allHumansDone && finishDelay > 1.5)) {
        swimmers.forEach(s => {
          if (!s.finished) {
            const rem = Math.max(1, POOL_LENGTH * 2 - s.dist);
            const estReal = raceTime + rem / Math.max(25, s.speed || 36);
            s.finishTime = Number((estReal * TIME_DISPLAY_MULT).toFixed(2));
            s.finished = true;
          }
        });
        phase = 'finished';
        if (!ctxInfo.isOnline || ctxInfo.isHost) {
          const sorted = swimmers.slice().sort((a, b) => a.finishTime - b.finishTime);
          ctxInfo.onFinish(sorted.map(s => ({
            id: s.id, name: s.name, country: s.country, isBot: s.isBot,
            playerIndex: s.playerIndex, value: s.finishTime, foul: false
          })));
        }
      } else if (allHumansDone) {
        finishDelay += dt;
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'swim_player' && ctxInfo.isHost) {
      const s = swimmers.find(x => x.id === payload.id);
      if (s) Object.assign(s, payload);
    } else if (payload.kind === 'swim_full' && !ctxInfo.isHost) {
      raceTime = payload.raceTime;
      if (phase === 'countdown' && raceTime > 0) phase = 'running';
      payload.swimmers.forEach(ps => {
        const s = swimmers.find(x => x.id === ps.id);
        if (!s || isLocalControlled(s)) return;
        Object.assign(s, ps);
      });
    }
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW, PH = OlyGame.CONFIG.PH;

    pctx.clearRect(0, 0, PW, PH);
    if (!OlyGame.Sprites.drawFullBackdrop(ctx, 'pool_deck')) {
      ctx.fillStyle = '#257fd9'; ctx.fillRect(0, 0, OlyGame.CONFIG.CW, OlyGame.CONFIG.CH);
    }

    // Animierte schimmernde Sonnen-Lichtwellen auf der Wasseroberflaeche!
    for (let wy = 32; wy < PH - 28; wy += 20) {
      const wave = Math.sin(waterAnim * 2.6 + wy * 0.14) * 5;
      pctx.fillStyle = 'rgba(224, 242, 254, 0.16)';
      pctx.fillRect(0, Math.round(wy + wave), PW, 3);
      pctx.fillStyle = 'rgba(125, 211, 252, 0.10)';
      pctx.fillRect(0, Math.round(wy - wave + 9), PW, 2);
    }

    for (let i = 0; i < 6; i++) {
      OlyGame.Sprites.drawPixelText(pctx, String(i + 1), LANE_X[i], 6, '#334155', 1, 'center');
    }

    // Detaillierte 3D-Schwimmleinen mit runden Bojen & Unterwasserschatten (wie sommerspiele.mp4 00:11!)
    const dividerX = [10, 88, 164, 240, 316, 392, 468];
    dividerX.forEach(dx => {
      pctx.fillStyle = 'rgba(10, 44, 96, 0.28)';
      pctx.fillRect(dx + 3, 25, 4, PH - 50);
      for (let y = 26; y < PH - 26; y += 6) {
        const isEnd = (y < 52 || y > PH - 56);
        const wobble = Math.round(Math.sin(waterAnim * 4 + y * 0.18 + dx) * 0.6);
        const col = isEnd ? '#ef4444' : ((y % 12 === 0) ? '#f59e0b' : '#facc15');
        const hi = isEnd ? '#fca5a5' : '#fef08a';
        OlyGame.Sprites.fillPixelRoundRect(pctx, dx - 2 + wobble, y, 6, 5, col);
        pctx.fillStyle = hi; pctx.fillRect(dx - 1 + wobble, y + 1, 3, 1);
      }
    });

    particles.draw(pctx, 0);

    // Knuffige 2x Pixel-Schwimmer zeichnen
    swimmers.forEach(s => {
      const sy = getScreenY(s);
      const dir = s.lap === 1 ? -1 : 1;
      const isDiving = (phase === 'running' && s.dist < 36) || (s.turnBoosted && s.dist < POOL_LENGTH + 32);
      OlyGame.Sprites.drawSwimmer(pctx, LANE_X[s.lane], sy, s.country, s.animPhase, dir, s.breathingTimer > 0, isDiving);
    });

    // Wimpelkette quer ueber das Becken + weicher Schatten auf dem Wasser (wie sommerspiele.mp4 00:11-00:12!)
    pctx.fillStyle = 'rgba(10, 44, 96, 0.22)';
    pctx.fillRect(0, 92, PW, 4);
    pctx.fillStyle = '#f8fafc';
    pctx.fillRect(0, 76, PW, 1);
    for (let fx = 8; fx < PW; fx += 18) {
      const sway = Math.round(Math.sin(waterAnim * 3.5 + fx * 0.1) * 1);
      pctx.fillStyle = (fx % 36 === 8) ? '#facc15' : '#38bdf8';
      pctx.fillRect(fx, 77, 9, 5);
      pctx.fillRect(fx + 2 + sway, 82, 5, 3);
      pctx.fillRect(fx + 4 + sway, 85, 2, 2);
    }

    // Suesse schwebende Kamera-Drohne am oberen Beckenrand (wie sommerspiele.mp4 00:11!)
    OlyGame.Sprites.drawCameraDrone(pctx, droneX, 34, waterAnim);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.12, 0.18);

    let showTurnHint = false;
    const localSwimmers = [];
    swimmers.forEach(s => {
      if (!s.isBot) {
        const sy = getScreenY(s);
        OlyGame.Sprites.drawPlayerPin(ctx, LANE_X[s.lane], sy - 24, s.playerIndex);
        if (isLocalControlled(s)) {
          localSwimmers.push(s);
          if (s.turnWindow) showTurnHint = true;
        }
      }
    });

    const mainS = localSwimmers[0] || swimmers.find(s => !s.isBot);
    const lapLabel = mainS ? ('BAHN ' + mainS.lap + ' / 2') : 'BAHN 1 / 2';
    OlyGame.Sprites.drawPill(ctx, 22, 18, lapLabel, '#0ea5e9', '#ffffff', false);
    OlyGame.Sprites.drawBigText(ctx, (raceTime * TIME_DISPLAY_MULT).toFixed(2), 936, 14, 44, '#ffffff', 'right');

    localSwimmers.forEach((s, idx) => {
      const bx = 22 + idx * 215, by = 480;
      ctx.save();
      ctx.fillStyle = 'rgba(15,23,42,0.9)';
      OlyGame.Sprites.roundRect(ctx, bx, by, 200, 44, 10); ctx.fill();
      ctx.fillStyle = '#cbd5e1'; ctx.font = '800 12px "Segoe UI", sans-serif';
      ctx.fillText(OlyGame.CONFIG.PLAYER_LABELS[s.playerIndex] + ' AUSDAUER', bx + 10, by + 15);
      if (s.rhythmTimer > 0 && s.rhythmFeedback) {
        ctx.fillStyle = s.rhythmFeedback.includes('PERFEKT') || s.rhythmFeedback.includes('TURBO') ? '#4ade80' : '#f87171';
        ctx.textAlign = 'right';
        ctx.fillText(s.rhythmFeedback, bx + 190, by + 15); ctx.textAlign = 'left';
      }
      ctx.fillStyle = '#334155'; ctx.fillRect(bx + 10, by + 23, 180, 12);
      const pct = Math.max(0, Math.min(1, s.stamina / 100));
      ctx.fillStyle = s.exhausted ? '#ef4444' : (pct > 0.45 ? '#22c55e' : '#facc15');
      ctx.fillRect(bx + 10, by + 23, 180 * pct, 12);
      ctx.restore();
    });

    if (showTurnHint) OlyGame.Sprites.drawPill(ctx, 480 - 130, 74, '⚡ ROLLWENDE! [LEERTASTE / A]', '#16a34a', '#ffffff', false);
    if (phase === 'countdown') {
      const msg = countdownTimer > 1.6 ? 'AUF DIE BLÖCKE...' : (countdownTimer > 0.8 ? 'FERTIG...' : 'LOS!');
      OlyGame.Sprites.drawBigText(ctx, msg, 480, 220, 52, '#fde047', 'center');
    }

    if (callout) OlyGame.Sprites.drawSlantedCallout(ctx, callout.text, 480, 145, callout.color, callout.age, 44);
    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};
