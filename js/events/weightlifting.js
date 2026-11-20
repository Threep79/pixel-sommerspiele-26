window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.weightlifting = function () {
  let ctxInfo = null;
  let turnList = [];
  let currentRound = 0;
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_ATTEMPTS = 3;
  const MIN_KG = 140;
  const MAX_KG = 270;
  // Athleten-Fusslinie exakt auf der Holz-Hebebuehne:
  const LIFTER_Y = 186;

  function resetState(entry) {
    particles.clear();
    const startKg = entry && entry.best > 0 ? Math.min(MAX_KG, entry.best + 10) : 170;
    state = {
      phase: 'choose', // choose, prep, timing (Umsetzen), pull_anim (Zug auf Schulter!), clean_pause, mash (Ausstossen!), success, fail
      weightKg: startKg,
      prepTimer: 0,
      pullTimer: 0,
      cleanPauseTimer: 0,
      cursor: 0.08,
      cursorDir: 1,
      targetPos: 0.65,
      targetWidth: 0.20,
      liftProgress: 0,
      holdTimer: 0,
      attemptTime: 9.0,
      lastKey: null,
      shake: 0,
      lamps: [0, 0, 0],
      camZoom: 1.0,
      feedback: '',
      feedbackAge: 0,
      resultTimer: 0
    };
  }

  function getActiveEntry() { return turnList[currentTurnIdx]; }
  function isMyTurn() {
    const e = getActiveEntry();
    return !!(e && ctxInfo.localPlayerIds.includes(e.player.id));
  }

  function announceTurn() {
    const e = getActiveEntry();
    if (!e || !ctxInfo.setSpectatorBanner) return;
    if (!isMyTurn()) {
      ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' beim Gewichtheben (Versuch ' + (currentRound + 1) + '/' + TOTAL_ATTEMPTS + ')');
    } else {
      ctxInfo.setSpectatorBanner(null);
    }
  }

  function init(info) {
    ctxInfo = info;
    turnList = info.players.map(p => ({ player: p, attempts: [], best: 0 }));
    currentRound = 0; currentTurnIdx = 0;
    resetState(turnList[0]);
    announceTurn();
  }

  function finishAttempt(success, kg) {
    const entry = getActiveEntry();
    entry.attempts.push({ value: success ? kg : 0, foul: !success });
    if (success && kg > entry.best) entry.best = kg;

    if (ctxInfo.isOnline && isMyTurn()) {
      ctxInfo.onSyncOut({ kind: 'wl_done', round: currentRound, turnIdx: currentTurnIdx, success, kg });
    }
    currentTurnIdx++;
    if (currentTurnIdx >= turnList.length) { currentTurnIdx = 0; currentRound++; }
    if (currentRound >= TOTAL_ATTEMPTS) {
      if (!ctxInfo.isOnline || ctxInfo.isHost) {
        const sorted = turnList.slice().sort((a, b) => b.best - a.best);
        ctxInfo.onFinish(sorted.map(t => ({
          id: t.player.id, name: t.player.name, country: t.player.country,
          isBot: false, playerIndex: t.player.slotIndex, value: t.best, foul: t.best <= 0
        })));
      }
    } else { resetState(getActiveEntry()); announceTurn(); }
  }

  function update(dt) {
    animT += dt;
    particles.update(dt);
    const entry = getActiveEntry();
    if (!entry || !isMyTurn()) return;

    const inp = OlyGame.Input.getPlayerInput(entry.player.slotIndex, true);
    // Stark skalierende Schwierigkeit bei hohen Gewichten (210 - 270 kg sind echte Pruefungen!)
    const diff = Math.max(0, Math.min(1, (state.weightKg - MIN_KG) / (MAX_KG - MIN_KG)));

    if (state.phase === 'choose') {
      if (inp.leftPressed) { state.weightKg = Math.max(MIN_KG, state.weightKg - 10); OlyGame.Audio.click(); }
      if (inp.rightPressed) { state.weightKg = Math.min(MAX_KG, state.weightKg + 10); OlyGame.Audio.click(); }
      if (inp.actionPressed) {
        state.phase = 'prep';
        state.prepTimer = 0.95;
        state.feedback = 'KONZENTRATION...';
        state.feedbackAge = 0;
        particles.burstDust(240, 174, 10, 'rgba(255,255,255,0.85)');
        OlyGame.Audio.beep(false);
      }
    } else if (state.phase === 'prep') {
      state.prepTimer -= dt;
      if (state.prepTimer <= 0) {
        state.phase = 'timing';
        state.targetPos = 0.56 + diff * 0.20;
        // Bei 260-270 kg deutlich engeres Timing-Fenster!
        state.targetWidth = Math.max(0.085, 0.21 - diff * 0.12);
        state.cursor = 0.06;
        state.cursorDir = 1;
        state.attemptTime = 9.0;
        state.feedback = '1. UMSETZEN: ZIELBEREICH TREFFEN!';
        state.feedbackAge = 0;
        OlyGame.Audio.beep(true);
      }
    } else if (state.phase === 'timing') {
      state.attemptTime -= dt;
      // Deutlich schnellerer Balken bei hohen Gewichten
      const spd = 0.85 + diff * 1.05;
      state.cursor += state.cursorDir * spd * dt;
      if (state.cursor >= 0.96) { state.cursor = 0.96; state.cursorDir = -1; }
      if (state.cursor <= 0.04) { state.cursor = 0.04; state.cursorDir = 1; }

      if (inp.actionPressed) {
        const dist = Math.abs(state.cursor - state.targetPos);
        if (dist <= state.targetWidth * 0.54) {
          // Erst kurze Zug-Animation (vom Boden -> Huefte -> Schulter), damit die Bewegung 100% organisch aussieht!
          state.phase = 'pull_anim';
          state.pullTimer = 0.32;
          state.feedback = 'STARK ANGEZOGEN!';
          state.feedbackAge = 0;
          OlyGame.Audio.barbellClank();
        } else {
          state.phase = 'fail';
          state.lamps = [-1, -1, -1];
          state.feedback = 'ZIEL VERFEHLT! (UNGÜLTIG)';
          state.feedbackAge = 0;
          state.resultTimer = 2.1;
          OlyGame.Audio.barbellClank();
          OlyGame.Audio.foul();
        }
      } else if (state.attemptTime <= 0) {
        state.phase = 'fail'; state.lamps = [-1, -1, -1];
        state.feedback = 'ZEIT ABGELAUFEN!'; state.feedbackAge = 0;
        state.resultTimer = 1.9; OlyGame.Audio.foul();
      }
    } else if (state.phase === 'pull_anim') {
      state.pullTimer -= dt;
      if (state.pullTimer <= 0) {
        state.phase = 'clean_pause';
        state.cleanPauseTimer = 0.72;
        state.liftProgress = 0.25;
        state.feedback = 'AUF DER SCHULTER! BEREIT!';
        state.feedbackAge = 0;
        OlyGame.Audio.perfect();
        particles.burstDust(240, 184, 8, 'rgba(255,255,255,0.85)');
      }
    } else if (state.phase === 'clean_pause') {
      state.cleanPauseTimer -= dt;
      if (state.cleanPauseTimer <= 0) {
        state.phase = 'mash';
        state.holdTimer = 0;
        state.feedback = '2. AUSSTOSSEN! [A / D] VOLLGAS!';
        state.feedbackAge = 0;
        OlyGame.Audio.beep(true);
      }
    } else if (state.phase === 'mash') {
      state.attemptTime -= dt;
      // Schwere Gewichte ziehen VIEL staerker nach unten! (Bei 260kg muss man wirklich kaempfen!)
      const gravityPull = 0.22 + diff * 0.44;
      state.liftProgress = Math.max(0.0, state.liftProgress - gravityPull * dt);

      let push = 0;
      if (inp.leftPressed) { push = (state.lastKey === 'R' || !state.lastKey) ? 0.068 : 0.022; state.lastKey = 'L'; OlyGame.Audio.step(); }
      if (inp.rightPressed) { push = (state.lastKey === 'L' || !state.lastKey) ? 0.068 : 0.022; state.lastKey = 'R'; OlyGame.Audio.step(); }
      if (push > 0) {
        state.liftProgress = Math.min(1, state.liftProgress + push * (1.0 - diff * 0.34));
        state.shake = 2.8;
        if (Math.random() < 0.55) {
          particles.spawn(240 + (Math.random() - 0.5) * 18, 148, (Math.random() - 0.5) * 26, -16, '#7dd3fc', 2, 0.45, 75);
        }
      }
      state.shake = Math.max(0, state.shake - 10 * dt);

      const reqHold = 1.25 + diff * 0.45;
      if (state.liftProgress >= state.targetPos) {
        state.holdTimer += dt;
        state.feedback = 'ÜBER KOPF HALTEN! ' + Math.max(0, reqHold - state.holdTimer).toFixed(1) + 's';
        if (state.holdTimer >= reqHold) {
          state.phase = 'success';
          state.lamps = [1, 1, 1];
          state.feedback = '3x WEISS! ' + state.weightKg + ' KG!';
          state.feedbackAge = 0;
          state.resultTimer = 2.5;
          OlyGame.Audio.liftSuccess();
          particles.burstStars(240, 134, 18);
        }
      } else {
        state.holdTimer = Math.max(0, state.holdTimer - dt * 0.65);
      }

      if (state.attemptTime <= 0 && state.phase === 'mash') {
        state.phase = 'fail'; state.lamps = [-1, -1, -1];
        state.feedback = 'HANTEL ABGESETZT! (UNGÜLTIG)'; state.feedbackAge = 0;
        state.resultTimer = 2.1;
        OlyGame.Audio.barbellClank(); OlyGame.Audio.foul();
      }
    } else if (state.phase === 'success' || state.phase === 'fail') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishAttempt(state.phase === 'success', state.weightKg); return; }
    }

    if (state.feedback) state.feedbackAge = (state.feedbackAge || 0) + dt;
    const targetZoom = (state.phase === 'mash' || state.phase === 'success') ? 1.24 : (state.phase === 'clean_pause' || state.phase === 'pull_anim' ? 1.15 : 1.0);
    state.camZoom = (state.camZoom || 1.0) + (targetZoom - (state.camZoom || 1.0)) * Math.min(1, dt * 4);

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) {
        syncAccum = 0;
        ctxInfo.onSyncOut({ kind: 'wl_state', round: currentRound, turnIdx: currentTurnIdx, state: { ...state } });
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'wl_state') {
      currentRound = payload.round; currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn();
    } else if (payload.kind === 'wl_done') {
      const entry = turnList[payload.turnIdx];
      if (entry && entry.attempts.length <= payload.round) {
        entry.attempts.push({ value: payload.success ? payload.kg : 0, foul: !payload.success });
        if (payload.success && payload.kg > entry.best) entry.best = payload.kg;
      }
      currentTurnIdx = payload.turnIdx + 1; currentRound = payload.round;
      if (currentTurnIdx >= turnList.length) { currentTurnIdx = 0; currentRound++; }
      if (currentRound >= TOTAL_ATTEMPTS) {
        if (ctxInfo.isHost) {
          const sorted = turnList.slice().sort((a, b) => b.best - a.best);
          ctxInfo.onFinish(sorted.map(t => ({
            id: t.player.id, name: t.player.name, country: t.player.country,
            isBot: false, playerIndex: t.player.slotIndex, value: t.best, foul: t.best <= 0
          })));
        }
      } else { resetState(getActiveEntry()); announceTurn(); }
    }
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW;
    const PH = OlyGame.CONFIG.PH;
    const entry = getActiveEntry();

    const z = state ? (state.camZoom || 1.0) : 1.0;
    pctx.clearRect(0, 0, PW, PH);
    if (!OlyGame.Sprites.drawFullBackdrop(ctx, 'arena_weightlifting', z, 240, 152)) {
      ctx.fillStyle = '#0a4a94'; ctx.fillRect(0, 0, OlyGame.CONFIG.CW, OlyGame.CONFIG.CH);
    }

    // 3 Kampfrichter-Signallichter an der Rueckwand
    OlyGame.Sprites.fillPixelRoundRect(pctx, 208, 78, 64, 18, '#0f172a');
    for (let i = 0; i < 3; i++) {
      const lv = state ? state.lamps[i] : 0;
      const lcol = lv === 1 ? '#ffffff' : (lv === -1 ? '#ef4444' : '#334155');
      OlyGame.Sprites.fillPixelEllipse(pctx, 222 + i * 18, 87, 5, 5, lcol);
    }

    OlyGame.Sprites.drawReferee(pctx, 40, 180, { juryDesk: true, darkSkin: false });
    OlyGame.Sprites.drawReferee(pctx, 440, 180, { juryDesk: true, darkSkin: true });
    OlyGame.Sprites.drawFlowerPlanter(pctx, 18, 250, false);
    OlyGame.Sprites.drawFlowerPlanter(pctx, 438, 250, true);

    // --- EXAKTE HAND-GEKOPPELTE HANTEL-ANIMATION (KEIN SCHWEBENDES GEWICHT MEHR!) ---
    if (entry && state) {
      const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
      let pose = 'front';
      let barY = LIFTER_Y - 9;
      if (state.phase === 'choose' || state.phase === 'fail') { pose = 'front'; barY = LIFTER_Y - 9; }
      else if (state.phase === 'prep' || state.phase === 'timing') { pose = 'lift_ready'; barY = LIFTER_Y - 9; }
      else if (state.phase === 'pull_anim') { pose = 'lift_pull'; barY = LIFTER_Y - 15; }
      else if (state.phase === 'clean_pause') { pose = 'lift_clean'; barY = LIFTER_Y - 19; }
      else if (state.phase === 'mash') {
        if (state.liftProgress < state.targetPos * 0.72) {
          pose = 'lift_clean';
          barY = LIFTER_Y - 19 - (state.liftProgress / (state.targetPos * 0.72)) * 4;
        } else { pose = 'lift_jerk'; barY = LIFTER_Y - 32; }
      } else if (state.phase === 'success') { pose = 'lift_jerk'; barY = LIFTER_Y - 32; }

      // Athlet zeichnen
      OlyGame.Sprites.drawAthlete(pctx, 240 + sx, LIFTER_Y, entry.player.country, pose, animT * 2);

      // Olympia-Hantel exakt an barY (direkt durch die Haende!) zeichnen
      const plates = Math.max(2, Math.min(5, Math.floor((state.weightKg - 120) / 28)));
      const bend = (pose === 'lift_jerk' || pose === 'lift_clean' || pose === 'lift_pull') ? 4 : 0;

      // Bodenschatten der Hantelscheiben
      OlyGame.Sprites.fillPixelEllipse(pctx, 172 + sx, LIFTER_Y + 1, 14, 3, 'rgba(15,23,42,0.28)');
      OlyGame.Sprites.fillPixelEllipse(pctx, 308 + sx, LIFTER_Y + 1, 14, 3, 'rgba(15,23,42,0.28)');

      // Biegsame Chrom-Stange
      pctx.strokeStyle = '#cbd5e1';
      pctx.lineWidth = 3;
      pctx.beginPath();
      pctx.moveTo(160 + sx, barY + bend);
      pctx.quadraticCurveTo(240 + sx, barY - 1, 320 + sx, barY + bend);
      pctx.stroke();
      pctx.strokeStyle = '#f8fafc';
      pctx.lineWidth = 1;
      pctx.beginPath();
      pctx.moveTo(164 + sx, barY + bend - 1);
      pctx.quadraticCurveTo(240 + sx, barY - 2, 316 + sx, barY + bend - 1);
      pctx.stroke();

      // Griff-Haende-Ueberlappung (kleine Hautfarben-Knoechel auf der Stange, damit sie sichtbar UMFASST wird!)
      if (pose !== 'front') {
        const c = OlyGame.CONFIG.getCountry(entry.player.country);
        const gripSpan = pose === 'lift_jerk' ? 8.5 : 7.5;
        pctx.fillStyle = c.skin;
        pctx.fillRect(Math.round(240 - gripSpan - 2 + sx), Math.round(barY - 2), 4, 4);
        pctx.fillRect(Math.round(240 + gripSpan - 2 + sx), Math.round(barY - 2), 4, 4);
      }

      // Gewichtsscheiben links & rechts (mit realistischem 3D-Glanz!)
      for (let i = 0; i < plates; i++) {
        const col = i === plates - 1 ? '#38bdf8' : (i === plates - 2 ? '#facc15' : '#dc2626');
        const hi = i === plates - 1 ? '#bae6fd' : (i === plates - 2 ? '#fef08a' : '#f87171');
        const h = 26 - i * 3;
        const py = Math.round(barY + bend - h / 2);
        const lx = Math.round(176 - i * 6 + sx);
        const rx = Math.round(299 + i * 6 + sx);
        OlyGame.Sprites.fillPixelRoundRect(pctx, lx, py, 5, h, col);
        pctx.fillStyle = hi; pctx.fillRect(lx + 1, py + 2, 2, h - 4);
        OlyGame.Sprites.fillPixelRoundRect(pctx, rx, py, 5, h, col);
        pctx.fillStyle = hi; pctx.fillRect(rx + 1, py + 2, 2, h - 4);
      }
    }

    particles.draw(pctx, 0);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, z, 240, 152);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.12, 0.22);

    if (entry && state) {
      OlyGame.Sprites.drawAttemptDots(ctx, entry.attempts, currentRound, TOTAL_ATTEMPTS);
      OlyGame.Sprites.drawPill(ctx, 22, 18, state.weightKg + ' KG', '#0ea5e9', '#ffffff', false);
      OlyGame.Sprites.drawPill(ctx, 22, 58, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);

      if (state.phase === 'timing' || state.phase === 'mash' || state.phase === 'clean_pause' || state.phase === 'pull_anim') {
        OlyGame.Sprites.drawBigText(ctx, String(Math.ceil(Math.max(0, state.attemptTime))).padStart(2, '0'), 936, 14, 46, '#ffffff', 'right');
      }

      if (state.phase === 'choose' && isMyTurn()) {
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.92)';
        OlyGame.Sprites.roundRect(ctx, 240, 155, 480, 155, 16); ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fde047'; ctx.font = '900 22px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('GEWICHT FÜR VERSUCH ' + (currentRound + 1) + ' WÄHLEN', 480, 194);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 46px "Segoe UI", sans-serif';
        ctx.fillText('◄  ' + state.weightKg + ' KG  ►', 480, 250);
        ctx.fillStyle = '#94a3b8'; ctx.font = '700 15px "Segoe UI", sans-serif';
        ctx.fillText('[← / →] Gewicht ändern   •   [LEERTASTE / Xbox A] Bühne betreten', 480, 290);
        ctx.restore();
      }

      if (state.phase === 'timing' || state.phase === 'mash') {
        const bx = 250, by = 450, bw = 460, bh = 32;
        ctx.save();
        ctx.fillStyle = '#1e293b';
        OlyGame.Sprites.roundRect(ctx, bx, by, bw, bh, 16); ctx.fill();

        const fillRatio = state.phase === 'timing' ? state.cursor : state.liftProgress;
        ctx.fillStyle = fillRatio >= state.targetPos ? '#22c55e' : '#fde047';
        OlyGame.Sprites.roundRect(ctx, bx + 4, by + 4, Math.max(12, (bw - 8) * fillRatio), bh - 8, 12); ctx.fill();

        const tx = bx + bw * state.targetPos;
        if (state.phase === 'timing') {
          ctx.fillStyle = 'rgba(34,197,94,0.4)';
          ctx.fillRect(tx - (bw * state.targetWidth) / 2, by, bw * state.targetWidth, bh);
        }
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.moveTo(tx - 12, by - 2); ctx.lineTo(tx + 12, by - 2); ctx.lineTo(tx, by + 11); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx - 12, by + bh + 2); ctx.lineTo(tx + 12, by + bh + 2); ctx.lineTo(tx, by + bh - 11); ctx.closePath(); ctx.fill();
        OlyGame.Sprites.drawPill(ctx, tx - 42, by - 44, 'ZIEL', '#f59e0b', '#ffffff', false);
        ctx.restore();
      }

      if (state.feedback) {
        const col = state.phase === 'fail' ? '#ef4444' : (state.phase === 'success' ? '#4ade80' : '#fde047');
        OlyGame.Sprites.drawSlantedCallout(ctx, state.feedback, 480, 118, col, state.feedbackAge, 36);
      }
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};
