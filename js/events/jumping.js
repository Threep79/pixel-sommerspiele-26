window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.createSandJump = function (isTriple) {
  let ctxInfo = null;
  let turnList = [];
  let currentRound = 0;
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_ATTEMPTS = 3;
  const BOARD_X = isTriple ? 620 : 680;
  // Beim Dreisprung: Nach dem Balken kommen 11m Tartanbahn (286px), dann eine sehr lange Sandgrube bis 22m (310px)!
  // Man kann selbst mit absolut perfektem WR-Sprung (~18.4m) NIEMALS ueber das Sandbecken hinausfliegen!
  const PX_PER_METER = isTriple ? 26 : 34;
  const PIT_START_X = isTriple ? (BOARD_X + 10.6 * PX_PER_METER) : (BOARD_X + 34);
  const PIT_WIDTH = isTriple ? 330 : 340;
  const GROUND_Y = 204;

  function resetAttemptState() {
    particles.clear();
    state = {
      phase: 'ready',
      x: 56,
      z: 0,
      vx: 0,
      vz: 0,
      animPhase: 0,
      lastKey: null,
      angle: 12,
      angleDir: 1,
      hopCount: 0,
      hopWindowTimer: 0,
      hopWindowMax: 0.42, // Knackigeres, anspruchsvolleres Rhythmus-Fenster beim Dreisprung!
      camX: 0,
      camZoom: 1.0,
      resultMeters: 0,
      foul: false,
      feedback: '',
      feedbackAge: 0,
      landSlideTimer: 0,
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
      ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' springt (Versuch ' + (currentRound + 1) + '/' + TOTAL_ATTEMPTS + ')');
    } else {
      ctxInfo.setSpectatorBanner(null);
    }
  }

  function init(info) {
    ctxInfo = info;
    turnList = info.players.map(p => ({ player: p, attempts: [], best: 0 }));
    currentRound = 0; currentTurnIdx = 0;
    resetAttemptState();
    announceTurn();
  }

  function finishAttempt(meters, foul) {
    const entry = getActiveEntry();
    entry.attempts.push({ value: foul ? 0 : meters, foul });
    if (!foul && meters > entry.best) entry.best = meters;

    if (ctxInfo.isOnline && isMyTurn()) {
      ctxInfo.onSyncOut({ kind: 'turn_done', round: currentRound, turnIdx: currentTurnIdx, value: foul ? 0 : meters, foul });
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
    } else { resetAttemptState(); announceTurn(); }
  }

  function triggerFoul() {
    state.phase = 'foul';
    state.foul = true;
    state.resultMeters = 0;
    state.feedback = 'ÜBERTRETEN! (UNGÜLTIG)';
    state.feedbackAge = 0;
    state.resultTimer = 2.0;
    OlyGame.Audio.foul();
  }

  function update(dt) {
    animT += dt;
    particles.update(dt);
    const entry = getActiveEntry();
    if (!entry || !isMyTurn()) return;

    const inp = OlyGame.Input.getPlayerInput(entry.player.slotIndex, true);

    if (state.phase === 'ready') {
      if (inp.leftPressed || inp.rightPressed || inp.actionPressed) {
        state.phase = 'run';
        state.vx = 54;
        OlyGame.Audio.step();
      }
    } else if (state.phase === 'run') {
      // Beim Dreisprung etwas schwerer auf Top-Speed zu kommen!
      const tapGain = isTriple ? 19 : 22;
      const runDrag = isTriple ? 56 : 48;
      let boost = 0;
      if (inp.leftPressed) { boost = (state.lastKey === 'R' || !state.lastKey) ? tapGain : 7; state.lastKey = 'L'; }
      if (inp.rightPressed) { boost = (state.lastKey === 'L' || !state.lastKey) ? tapGain : 7; state.lastKey = 'R'; }
      if (boost > 0) {
        state.vx = Math.min(195, state.vx + boost);
        particles.burstDust(state.x - 6, GROUND_Y, 1);
      }
      state.vx = Math.max(30, state.vx - runDrag * dt);
      state.x += state.vx * dt;
      const prevPh = state.animPhase;
      state.animPhase += state.vx * dt * 0.085;
      if (Math.floor(state.animPhase / Math.PI) > Math.floor(prevPh / Math.PI)) OlyGame.Audio.step();

      if (!isTriple) {
        if (inp.actionDown && state.x > BOARD_X - 180) {
          if (state.x > BOARD_X + 6) triggerFoul();
          else { state.phase = 'angle_aim'; state.angle = 12; state.angleDir = 1; OlyGame.Audio.beep(false); }
        }
      } else {
        // DREISPRUNG 1. HOP: realistische Hop-Weite 4.5m..6.4m (117..166px) -> landet auf der Tartanbahn!
        if (inp.actionPressed && state.x > BOARD_X - 150) {
          if (state.x > BOARD_X + 6) {
            triggerFoul();
          } else {
            state.phase = 'air';
            state.hopCount = 1;
            const boardBonus = Math.max(0.2, 1 - Math.abs(BOARD_X - state.x) / 48);
            const spdRatio = Math.min(1, state.vx / 195);
            // Flugzeit bei g=390, vz=146..165 ist ~0.78s -> vx * 0.78 = ~115..158 px!
            state.vx = 118 + spdRatio * 64 + boardBonus * 20;
            state.vz = 142 + spdRatio * 20;
            state.feedback = boardBonus > 0.78 ? '1. HOP! PERFEKT!' : '1. HOP!';
            state.feedbackAge = 0;
            OlyGame.Audio.jump();
            particles.burstDust(state.x, GROUND_Y, 5);
            if (boardBonus > 0.78) particles.burstStars(state.x, GROUND_Y - 18, 6);
          }
        }
      }

      if (state.x > BOARD_X + 8 && state.phase === 'run') triggerFoul();
    } else if (state.phase === 'angle_aim') {
      state.angle += state.angleDir * 88 * dt;
      if (state.angle >= 78) { state.angle = 78; state.angleDir = -1; }
      if (state.angle <= 12) { state.angle = 12; state.angleDir = 1; }

      if (inp.actionReleased) {
        const rad = (state.angle * Math.PI) / 180;
        const speedRatio = Math.min(1, state.vx / 195);
        const boardBonus = Math.max(0.84, 1 - Math.max(0, BOARD_X - state.x) / 160);
        const angleEff = Math.max(0.32, 1 - Math.abs(state.angle - 42) / 42);
        const targetMeters = (3.6 + speedRatio * 5.4) * angleEff * boardBonus;
        const targetDistPx = targetMeters * PX_PER_METER;
        const g = 320;
        const sin2 = Math.max(0.38, Math.sin(2 * rad));
        const launchV = Math.sqrt((targetDistPx * g) / sin2);
        state.vx = Math.cos(rad) * launchV;
        state.vz = Math.sin(rad) * launchV;
        state.phase = 'air';
        OlyGame.Audio.jump();
        state.feedbackAge = 0;
        if (angleEff > 0.88 && speedRatio > 0.75) {
          state.feedback = 'PERFEKT!';
          particles.burstStars(state.x, GROUND_Y - 18, 10);
        } else {
          state.feedback = angleEff > 0.72 ? 'SUPER!' : 'GUT!';
        }
      }
    } else if (state.phase === 'air') {
      state.x += state.vx * dt;
      state.z += state.vz * dt;
      state.vz -= (isTriple ? 390 : 320) * dt;

      if (state.z <= 0) {
        state.z = 0;
        if (isTriple && state.hopCount < 3) {
          state.phase = 'hop_window';
          state.hopWindowTimer = state.hopWindowMax;
          particles.burstDust(state.x, GROUND_Y, 5);
          OlyGame.Audio.step();
        } else {
          const distPx = Math.max(0, state.x - BOARD_X);
          const meters = Number(Math.max(1.8, distPx / PX_PER_METER).toFixed(2));
          state.resultMeters = meters;
          state.phase = 'landing';
          state.landSlideTimer = 0.62;
          state.vx = Math.min(85, Math.max(36, state.vx * 0.36));
          particles.burstSand(state.x, GROUND_Y, 28);
          particles.burstDust(state.x, GROUND_Y - 2, 8, '#fde68a');
          OlyGame.Audio.sandLand();
          OlyGame.Audio.crowdCheer(meters >= OlyGame.CONFIG.getEvent(ctxInfo.eventId).wr * 0.92);
          state.feedbackAge = 0;
          if (meters >= OlyGame.CONFIG.getEvent(ctxInfo.eventId).wr) {
            state.feedback = 'WELTREKORD! ' + meters.toFixed(2) + ' m!';
            particles.burstStars(state.x, GROUND_Y - 24, 16);
          } else {
            state.feedback = meters.toFixed(2) + ' m!';
          }
        }
      }
    } else if (state.phase === 'landing') {
      state.x += state.vx * dt;
      state.vx = Math.max(0, state.vx - 155 * dt);
      if (state.vx > 18 && Math.random() < 0.65) particles.burstSand(state.x + 4, GROUND_Y, 2);
      state.landSlideTimer -= dt;
      if (state.landSlideTimer <= 0) { state.phase = 'landed'; state.resultTimer = 1.85; }
    } else if (state.phase === 'hop_window') {
      state.x += state.vx * 0.08 * dt;
      state.hopWindowTimer -= dt;
      const progress = 1 - (state.hopWindowTimer / state.hopWindowMax); // Idealpunkt bei 0.62!

      if (inp.actionPressed) {
        // Strengere Timing-Kurve -> nur exaktes Treffen des gruenen Rings bringt Top-Weiten (~17.5-18.4m)!
        const err = Math.abs(progress - 0.62);
        const timingQuality = Math.max(0.22, 1 - err * 2.25);
        state.hopCount++;
        state.feedbackAge = 0;
        if (state.hopCount === 2) {
          // 2. STEP: ~3.6m..5.2m (94..135 px) -> landet kurz vor der Sandgrube!
          state.vx = 96 + timingQuality * 76;
          state.vz = 132 + timingQuality * 22;
          state.feedback = timingQuality > 0.80 ? '2. STEP! PERFEKT!' : (timingQuality > 0.55 ? '2. STEP! GUT' : '2. STEP! SCHWACH');
        } else {
          // 3. JUMP: ~4.2m..6.8m (108..178 px) -> landet realistisch mitten in der Sandgrube (12.5m..18.4m)!
          state.vx = 104 + timingQuality * 92;
          state.vz = 148 + timingQuality * 36;
          state.feedback = timingQuality > 0.80 ? '3. JUMP! PERFEKT!' : (timingQuality > 0.55 ? '3. JUMP! GUT' : '3. JUMP! KURZ');
        }
        state.phase = 'air';
        OlyGame.Audio.jump();
        if (timingQuality > 0.80) particles.burstStars(state.x, GROUND_Y - 16, 8);
      } else if (state.hopWindowTimer <= 0) {
        state.hopCount++;
        state.vx = 72;
        state.vz = 96;
        state.phase = 'air';
        state.feedback = 'ZU SPÄT!';
        state.feedbackAge = 0;
        OlyGame.Audio.stumble();
      }
    } else if (state.phase === 'landed' || state.phase === 'foul') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishAttempt(state.resultMeters, state.foul); return; }
    }

    if (state.feedback) state.feedbackAge = (state.feedbackAge || 0) + dt;
    const targetZoom = (state.phase === 'angle_aim' || state.phase === 'hop_window') ? 1.22 : ((state.phase === 'landing' || state.phase === 'landed') ? 1.16 : 1.0);
    state.camZoom = (state.camZoom || 1.0) + (targetZoom - (state.camZoom || 1.0)) * Math.min(1, dt * 5);
    const targetCam = Math.max(0, state.x - 165);
    state.camX += (targetCam - state.camX) * Math.min(1, dt * 7);

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) {
        syncAccum = 0;
        ctxInfo.onSyncOut({ kind: 'jump_state', round: currentRound, turnIdx: currentTurnIdx, state: { ...state } });
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'jump_state') {
      currentRound = payload.round; currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn();
    } else if (payload.kind === 'turn_done') {
      const entry = turnList[payload.turnIdx];
      if (entry && entry.attempts.length <= payload.round) {
        entry.attempts.push({ value: payload.value, foul: payload.foul });
        if (!payload.foul && payload.value > entry.best) entry.best = payload.value;
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
      } else { resetAttemptState(); announceTurn(); }
    }
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW;
    const PH = OlyGame.CONFIG.PH;
    const camX = state ? state.camX : 0;
    const entry = getActiveEntry();

    const z = state ? (state.camZoom || 1.0) : 1.0;
    const fx = state ? (state.x - camX) : 240;
    const fy = state ? (GROUND_Y - state.z - 22) : 170;
    // 3/4 Stadion-Diorama-Perspektive (organischer diagonaler Rasen + obere Stadionkante, kein flacher Himmel!)
    pctx.clearRect(0, 0, PW, PH);
    OlyGame.Sprites.drawTexturedGrass(pctx, camX, 0, 166);
    pctx.fillStyle = '#ee7b74'; pctx.fillRect(0, 0, PW, 36);
    pctx.fillStyle = 'rgba(255,255,255,0.65)'; pctx.fillRect(0, 36, PW, 2);

    for (let bi = 0, bx = 48; bx < BOARD_X - 70; bi++, bx += 152) {
      const sx = bx - camX;
      if (sx > -110 && sx < PW + 60) {
        OlyGame.Sprites.drawAdBoard(pctx, sx, 132, 92, 24, bi + 2);
        OlyGame.Sprites.drawFlowerPlanter(pctx, sx + 104, 140, bi % 2 === 1);
      }
    }

    pctx.fillStyle = '#e56f68'; pctx.fillRect(0, 162, PW, PH - 162);
    pctx.fillStyle = '#d96059'; pctx.fillRect(0, 174, PW, 52);
    pctx.fillStyle = 'rgba(255,255,255,0.85)'; pctx.fillRect(0, 174, PW, 2); pctx.fillRect(0, 226, PW, 2);
    OlyGame.Sprites.drawTrackShadows(pctx, camX, 162, PH - 162);

    [{ m: '15M', off: 450 }, { m: '10M', off: 300 }, { m: '5M', off: 150 }].forEach(d => {
      const mx = Math.round(BOARD_X - d.off - camX);
      if (mx > -30 && mx < PW + 30) {
        pctx.fillStyle = '#facc15'; pctx.fillRect(mx - 12, 152, 24, 12);
        OlyGame.Sprites.drawPixelText(pctx, d.m, mx, 154, '#111827', 1, 'center');
        pctx.fillStyle = 'rgba(255,255,255,0.35)'; pctx.fillRect(mx, 174, 2, 52);
      }
    });

    const bx = Math.round(BOARD_X - camX);
    if (bx > -50 && bx < PW + 50) {
      // Schraeger 3/4 Absprungbalken (wie sommerspiele.mp4 00:16!)
      pctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
      pctx.beginPath(); pctx.moveTo(bx - 64, 176); pctx.lineTo(bx - 14, 176); pctx.lineTo(bx + 4, 224); pctx.lineTo(bx - 46, 224); pctx.closePath(); pctx.fill();
      pctx.strokeStyle = '#ffffff'; pctx.lineWidth = 7;
      pctx.beginPath(); pctx.moveTo(bx - 10, 176); pctx.lineTo(bx + 8, 224); pctx.stroke();
      pctx.strokeStyle = '#2563eb'; pctx.lineWidth = 3;
      pctx.beginPath(); pctx.moveTo(bx - 5, 176); pctx.lineTo(bx + 13, 224); pctx.stroke();
      pctx.strokeStyle = '#ef4444'; pctx.lineWidth = 3;
      pctx.beginPath(); pctx.moveTo(bx - 2, 176); pctx.lineTo(bx + 16, 224); pctx.stroke();
      OlyGame.Sprites.drawReferee(pctx, bx - 28, 158, { seated: true, greenCoat: true });
      OlyGame.Sprites.drawReferee(pctx, bx + 6, 158, { seated: true, darkSkin: true });
    }

    if (isTriple) {
      const midTrackX = Math.round(BOARD_X + 138 - camX);
      if (midTrackX > -80 && midTrackX < PW + 80) {
        OlyGame.Sprites.drawPixelText(pctx, 'HOP  -  STEP  ->', midTrackX, 196, 'rgba(255,255,255,0.45)', 1, 'center');
      }
    }

    const pitPx = Math.round(PIT_START_X - camX);
    if (pitPx < PW + 40 && pitPx + PIT_WIDTH > -40) {
      pctx.fillStyle = '#f8fafc'; pctx.fillRect(pitPx - 3, 170, PIT_WIDTH + 6, 60);
      pctx.fillStyle = '#e5b869'; pctx.fillRect(pitPx, 173, PIT_WIDTH, 54);
      pctx.fillStyle = '#d19f4f'; pctx.fillRect(pitPx, 173, PIT_WIDTH, 7);
      pctx.fillStyle = 'rgba(180, 120, 40, 0.22)';
      for (let sy = 184; sy < 224; sy += 6) pctx.fillRect(pitPx + 4, sy, PIT_WIDTH - 8, 1);

      pctx.fillStyle = '#94a3b8'; pctx.fillRect(pitPx + 6, 134, PIT_WIDTH - 12, 30);
      pctx.fillStyle = '#f1f5f9'; pctx.fillRect(pitPx + 6, 134, PIT_WIDTH - 12, 26);
      pctx.fillStyle = '#cbd5e1'; pctx.fillRect(pitPx + 6, 156, PIT_WIDTH - 12, 4);

      const markers = isTriple ? [12, 14, 16, 18, 20] : [5, 6, 7, 8, 9];
      markers.forEach(m => {
        const mx = Math.round(BOARD_X + m * PX_PER_METER - camX);
        if (mx > pitPx + 10 && mx < pitPx + PIT_WIDTH - 16) {
          pctx.fillStyle = '#64748b'; pctx.fillRect(mx, 134, 2, 6);
          OlyGame.Sprites.drawPixelText(pctx, String(m), mx, 144, '#475569', 1, 'center');
        }
      });

      const wrM = OlyGame.CONFIG.getEvent(ctxInfo.eventId).wr;
      const wrX = Math.round(BOARD_X + wrM * PX_PER_METER - camX);
      if (wrX > pitPx && wrX < pitPx + PIT_WIDTH) {
        OlyGame.Sprites.fillPixelRoundRect(pctx, wrX - 11, 120, 22, 12, '#4d7c0f');
        OlyGame.Sprites.drawPixelText(pctx, 'WR', wrX, 123, '#bef264', 1, 'center');
        pctx.fillStyle = '#ef4444'; pctx.fillRect(wrX - 1, 132, 3, 5);
      }

      OlyGame.Sprites.drawReferee(pctx, pitPx + PIT_WIDTH + 22, 164, { seated: true, sunglasses: true, greenCoat: true });
      OlyGame.Sprites.drawLedBoard(pctx, pitPx - 64, 126, 52, 36, animT);
    }

    for (let cx = BOARD_X - 240; cx < PIT_START_X + PIT_WIDTH; cx += 62) {
      const px = cx - camX;
      if (px > -20 && px < PW + 20) OlyGame.Sprites.drawCone(pctx, px, 240);
    }

    if (entry && state) {
      let pose = 'idle';
      if (state.phase === 'run') pose = 'run';
      else if (state.phase === 'angle_aim' || state.phase === 'hop_window') pose = 'crouch';
      else if (state.phase === 'air') pose = state.vz > 60 ? 'jump_up' : (state.vz > -55 ? 'jump_peak' : 'jump_down');
      else if (state.phase === 'landing') pose = 'jump_land';
      else if (state.phase === 'foul') pose = 'stumble';
      else if (state.phase === 'landed') pose = 'celebrate';
      OlyGame.Sprites.drawAthlete(pctx, state.x - camX, GROUND_Y - state.z, entry.player.country, pose, state.animPhase, {
        shadowOffsetY: state.z
      });
    }

    particles.draw(pctx, camX);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, z, fx, fy);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.14, 0.22);

    if (entry && state) {
      OlyGame.Sprites.drawAttemptDots(ctx, entry.attempts, currentRound, TOTAL_ATTEMPTS);
      OlyGame.Sprites.drawPill(ctx, 20, 18, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);
      OlyGame.Sprites.drawPill(ctx, 20, 58, 'VERSUCH ' + (currentRound + 1) + ' / ' + TOTAL_ATTEMPTS, '#f59e0b', '#111827', false);
      if (entry.best > 0) OlyGame.Sprites.drawPill(ctx, 940, 18, 'BESTE: ' + entry.best.toFixed(2) + ' m', '#1e293b', '#fde047', true);

      const proj = OlyGame.Sprites.projectZoom(state.x - camX, GROUND_Y - state.z, z, fx, fy);
      const sx = proj.x, sy = proj.y;
      OlyGame.Sprites.drawPlayerPin(ctx, state.x - camX, GROUND_Y - state.z - 38, entry.player.slotIndex, null, z, fx, fy);

      if (state.phase === 'angle_aim') {
        OlyGame.Sprites.drawAngleArc(ctx, sx + 22, sy - 20, state.angle, 37, 47, 'IM GRÜNEN BEREICH LOSLASSEN!');
      }

      if (state.phase === 'hop_window' && isMyTurn()) {
        const progress = 1 - (state.hopWindowTimer / state.hopWindowMax);
        const outerR = Math.max(16, 86 * (1 - progress * 0.72));
        ctx.save();
        ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(sx, sy - 28, 36, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy - 28, outerR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        OlyGame.Sprites.drawBigText(ctx, (state.hopCount === 1 ? '2. STEP! ' : '3. JUMP! ') + '[LEERTASTE / A]', 480, 145, 36, '#4ade80', 'center');
      }

      if (state.phase === 'run' || state.phase === 'ready') {
        const pct = Math.min(1, state.vx / 195);
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        OlyGame.Sprites.roundRect(ctx, 22, 486, 240, 38, 10); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px "Segoe UI", sans-serif';
        ctx.fillText('ANLAUF-TEMPO', 34, 500);
        ctx.fillStyle = '#334155'; ctx.fillRect(34, 506, 214, 10);
        ctx.fillStyle = pct > 0.8 ? '#22c55e' : '#facc15'; ctx.fillRect(34, 506, 214 * pct, 10);
        ctx.restore();

        if (state.phase === 'ready' && isMyTurn()) {
          OlyGame.Sprites.drawBigText(ctx, 'A / D DRÜCKEN FÜR ANLAUF!', 480, 155, 36, '#fde047', 'center');
        } else if (state.phase === 'run' && state.x > BOARD_X - 180 && isMyTurn()) {
          OlyGame.Sprites.drawPill(ctx, 480 - 155, 92, isTriple ? '⚡ JETZT HOP! [LEERTASTE / A]' : '⚡ [LEERTASTE / A] HALTEN FÜR WINKEL!', '#16a34a', '#ffffff', false);
        }
      }

      if (state.feedback) {
        OlyGame.Sprites.drawSlantedCallout(ctx, state.feedback, 480, 148, state.foul ? '#ef4444' : '#fde047', state.feedbackAge, 48);
      }
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};

OlyGame.Events.longjump = () => OlyGame.Events.createSandJump(false);
OlyGame.Events.triplejump = () => OlyGame.Events.createSandJump(true);
