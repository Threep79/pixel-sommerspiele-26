window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.polevault = function () {
  let ctxInfo = null;
  let turnList = [];
  let currentRound = 0;
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_ATTEMPTS = 3;
  const HEIGHTS = [4.60, 5.00, 5.40, 5.80, 6.10, 6.30];
  const BOX_X = 640;
  const GROUND_Y = 212;

  function resetState(entry) {
    particles.clear();
    const defaultIdx = Math.min(HEIGHTS.length - 1, entry ? entry.heightIdx : 1);
    state = {
      phase: 'choose',
      heightIdx: defaultIdx,
      barMeters: HEIGHTS[defaultIdx],
      x: 56,
      z: 0,
      vx: 0,
      vz: 0,
      animPhase: 0,
      lastKey: null,
      poleBend: 0,
      barFall: 0,
      barHit: false,
      camX: 0,
      camZoom: 1.0,
      feedback: '',
      feedbackAge: 0,
      matLandTimer: 0,
      matCleared: false,
      matSquish: 0,
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
      ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' beim Stabhochsprung (Versuch ' + (currentRound + 1) + '/' + TOTAL_ATTEMPTS + ')');
    } else {
      ctxInfo.setSpectatorBanner(null);
    }
  }

  function init(info) {
    ctxInfo = info;
    turnList = info.players.map(p => ({ player: p, attempts: [], best: 0, heightIdx: 1 }));
    currentRound = 0; currentTurnIdx = 0;
    resetState(turnList[0]);
    announceTurn();
  }

  function finishAttempt(cleared, barMeters) {
    const entry = getActiveEntry();
    entry.attempts.push({ value: cleared ? barMeters : 0, foul: !cleared });
    if (cleared && barMeters > entry.best) {
      entry.best = barMeters;
      entry.heightIdx = Math.min(HEIGHTS.length - 1, state.heightIdx + 1);
    }
    if (ctxInfo.isOnline && isMyTurn()) {
      ctxInfo.onSyncOut({ kind: 'pv_done', round: currentRound, turnIdx: currentTurnIdx, cleared, barMeters, heightIdx: state.heightIdx });
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

  function barPixelHeight(meters) {
    // 4.60m -> 68px, 6.30m -> 122px ueber Boden!
    return 68 + (meters - 4.60) * 32;
  }

  function update(dt) {
    animT += dt;
    particles.update(dt);
    const entry = getActiveEntry();
    if (!entry || !isMyTurn()) return;

    const inp = OlyGame.Input.getPlayerInput(entry.player.slotIndex, true);

    if (state.phase === 'choose') {
      if (inp.leftPressed) { state.heightIdx = Math.max(0, state.heightIdx - 1); state.barMeters = HEIGHTS[state.heightIdx]; OlyGame.Audio.click(); }
      if (inp.rightPressed) { state.heightIdx = Math.min(HEIGHTS.length - 1, state.heightIdx + 1); state.barMeters = HEIGHTS[state.heightIdx]; OlyGame.Audio.click(); }
      if (inp.actionPressed) {
        state.phase = 'run';
        state.vx = 48;
        OlyGame.Audio.beep(true);
      }
    } else if (state.phase === 'run') {
      // Anspruchsvollerer Anlauf (niedrigerer Boost, mehr Luftwiderstand -> echtes Sprinten noetig!)
      let boost = 0;
      if (inp.leftPressed) { boost = (state.lastKey === 'R' || !state.lastKey) ? 18.5 : 7; state.lastKey = 'L'; }
      if (inp.rightPressed) { boost = (state.lastKey === 'L' || !state.lastKey) ? 18.5 : 7; state.lastKey = 'R'; }
      if (boost > 0) {
        state.vx = Math.min(185, state.vx + boost);
        particles.burstDust(state.x - 6, GROUND_Y, 1);
      }
      state.vx = Math.max(28, state.vx - 54 * dt);
      state.x += state.vx * dt;
      const prevPh = state.animPhase;
      state.animPhase += state.vx * dt * 0.085;
      if (Math.floor(state.animPhase / Math.PI) > Math.floor(prevPh / Math.PI)) OlyGame.Audio.step();

      if (inp.actionDown && state.x > BOX_X - 135 && state.x < BOX_X - 10) {
        state.phase = 'plant';
        state.poleBend = 0;
        OlyGame.Audio.poleFlex();
      }
      if (state.x >= BOX_X - 6) {
        state.phase = 'failed';
        state.feedback = 'DURCHGELAUFEN!';
        state.feedbackAge = 0;
        state.resultTimer = 2.0;
        OlyGame.Audio.foul();
      }
    } else if (state.phase === 'plant') {
      // Zuegige, präzise Stab-Biegung -> engerer Sweet-Spot (0.74..0.90) fuer hohe Latten!
      state.poleBend = Math.min(1.16, state.poleBend + dt * 1.15);
      const progress = Math.min(1, state.poleBend);
      state.x = Math.min(BOX_X + 8, state.x + state.vx * 0.32 * dt);
      state.z = Math.sin(progress * Math.PI * 0.52) * (38 + (state.vx / 185) * 34);
      if (Math.random() < 0.35) particles.burstDust(state.x, GROUND_Y - state.z, 1, 'rgba(255,255,255,0.65)');

      if (inp.actionReleased || state.poleBend >= 1.15) {
        // Realistisch kalibrierte Sprunghoehe:
        // Max-Hoehe z_peak = z_start + vz^2 / (2*340).
        // Bei perfektem Speed (1.0) + perfektem Sweet-Spot (1.0): z_start ~70 + 190^2/680 (~53) = ~125px (knapp ueber 6.30m!)
        // Bei mittelmaessigem Speed/Timing: z_peak ~85px (schafft 5.00m, reisst aber 5.80m!)
        const err = Math.abs(state.poleBend - 0.82);
        const releaseQuality = Math.max(0.15, 1 - err * 2.8);
        const speedRatio = Math.min(1, state.vx / 185);
        state.vz = 56 + speedRatio * 74 + releaseQuality * 62;
        state.vx = 52 + releaseQuality * 28;
        state.phase = 'fly';
        OlyGame.Audio.throwSfx();
        if (releaseQuality > 0.82) particles.burstStars(state.x, GROUND_Y - state.z, 8);
      }
    } else if (state.phase === 'fly') {
      state.x += state.vx * dt;
      state.z += state.vz * dt;
      state.vz -= 340 * dt;

      const barH = barPixelHeight(state.barMeters);
      if (!state.barHit && Math.abs(state.x - (BOX_X + 26)) < 11) {
        if (state.z < barH) {
          state.barHit = true;
          OlyGame.Audio.stumble();
        }
      }
      if (state.barHit) state.barFall = Math.min(barH, state.barFall + 175 * dt);

      if (state.z <= 18 && state.vz < 0) {
        state.z = 18;
        state.phase = 'mat_land';
        state.matLandTimer = 0.68;
        state.matSquish = 1.0;
        state.matCleared = (!state.barHit && state.x > BOX_X + 22);
        state.feedbackAge = 0;
        particles.burstDust(state.x, GROUND_Y - 12, 10, 'rgba(255,255,255,0.82)');
        OlyGame.Audio.sandLand();
        if (state.matCleared) {
          state.feedback = 'PERFEKT! ' + state.barMeters.toFixed(2) + ' m!';
          OlyGame.Audio.liftSuccess();
          particles.burstStars(state.x, GROUND_Y - 28, 16);
        } else {
          state.feedback = 'LATTE GERISSEN!';
          OlyGame.Audio.foul();
        }
      }
    } else if (state.phase === 'mat_land') {
      state.matLandTimer -= dt;
      state.matSquish = Math.max(0, state.matSquish - dt * 2.2);
      if (state.barHit) state.barFall = Math.min(barPixelHeight(state.barMeters), state.barFall + 175 * dt);
      if (state.matLandTimer <= 0) {
        state.phase = state.matCleared ? 'cleared' : 'failed';
        state.resultTimer = state.matCleared ? 1.7 : 1.5;
      }
    } else if (state.phase === 'cleared' || state.phase === 'failed') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishAttempt(state.phase === 'cleared', state.barMeters); return; }
    }

    if (state.feedback) state.feedbackAge = (state.feedbackAge || 0) + dt;
    const targetZoom = (state.phase === 'plant' || state.phase === 'fly') ? 1.18 : ((state.phase === 'mat_land' || state.phase === 'cleared') ? 1.15 : 1.0);
    state.camZoom = (state.camZoom || 1.0) + (targetZoom - (state.camZoom || 1.0)) * Math.min(1, dt * 4.5);
    const maxCam = BOX_X - 300;
    const targetCam = Math.max(0, Math.min(maxCam, state.x - 170));
    state.camX += (targetCam - state.camX) * Math.min(1, dt * 6.5);

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) {
        syncAccum = 0;
        ctxInfo.onSyncOut({ kind: 'pv_state', round: currentRound, turnIdx: currentTurnIdx, state: { ...state } });
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'pv_state') {
      currentRound = payload.round; currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn();
    } else if (payload.kind === 'pv_done') {
      const entry = turnList[payload.turnIdx];
      if (entry && entry.attempts.length <= payload.round) {
        entry.attempts.push({ value: payload.cleared ? payload.barMeters : 0, foul: !payload.cleared });
        if (payload.cleared && payload.barMeters > entry.best) {
          entry.best = payload.barMeters;
          entry.heightIdx = Math.min(HEIGHTS.length - 1, (payload.heightIdx !== undefined ? payload.heightIdx : entry.heightIdx) + 1);
        }
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
    const camX = state ? state.camX : 0;
    const entry = getActiveEntry();

    const z = state ? (state.camZoom || 1.0) : 1.0;
    const fx = state ? (state.x - camX) : 240;
    const fy = state ? (GROUND_Y - state.z - 28) : 170;
    // 3/4 Stadion-Diorama-Perspektive (organischer diagonaler Rasen ueber den gesamten Hintergrund!)
    pctx.clearRect(0, 0, PW, PH);
    OlyGame.Sprites.drawTexturedGrass(pctx, camX, 0, 184);
    pctx.fillStyle = '#ee7b74'; pctx.fillRect(0, 0, PW, 32);
    pctx.fillStyle = 'rgba(255,255,255,0.6)'; pctx.fillRect(0, 32, PW, 2);

    for (let bi = 0, bx = 36; bx < BOX_X - 110; bi++, bx += 152) {
      const sx = bx - camX;
      if (sx > -110 && sx < PW + 60) {
        OlyGame.Sprites.drawAdBoard(pctx, sx, 148, 92, 24, bi + 4);
        OlyGame.Sprites.drawFlowerPlanter(pctx, sx + 104, 158, bi % 2 === 1);
      }
    }

    const bxScreen = Math.round(BOX_X - camX);
    if (bxScreen > -120 && bxScreen < PW + 260) {
      OlyGame.Sprites.drawReferee(pctx, bxScreen - 195, 144, { seated: true, sleeping: true, t: animT, greenCoat: true });
      OlyGame.Sprites.drawCameraman(pctx, bxScreen - 122, 138, animT);
      OlyGame.Sprites.drawReferee(pctx, bxScreen + 132, 174, { seated: false });
      OlyGame.Sprites.drawCameraman(pctx, bxScreen + 158, 172, animT);
    }

    // Anlaufbahn
    pctx.fillStyle = '#e56f68'; pctx.fillRect(0, 180, PW, PH - 180);
    pctx.fillStyle = '#dc635c'; pctx.fillRect(0, 188, PW, 46);
    pctx.fillStyle = 'rgba(255,255,255,0.8)'; pctx.fillRect(0, 188, PW, 2); pctx.fillRect(0, 234, PW, 2);
    OlyGame.Sprites.drawTrackShadows(pctx, camX, 180, PH - 180);

    [{ m: '15M', off: 420 }, { m: '10M', off: 280 }, { m: '5M', off: 140 }].forEach(d => {
      const mx = Math.round(BOX_X - d.off - camX);
      if (mx > -30 && mx < PW + 30) {
        pctx.fillStyle = '#facc15'; pctx.fillRect(mx - 12, 170, 24, 12);
        OlyGame.Sprites.drawPixelText(pctx, d.m, mx, 172, '#111827', 1, 'center');
      }
    });

    // --- 2.5D / 3D STABHOCHSPRUNG-ANLAGE (U-Ausschnitt Matte, Hinterer & Vorderer Staender + diagonale Latte!) ---
    const barH = state ? barPixelHeight(state.barMeters) : 80;
    const barDrop = state ? state.barFall : 0;

    if (bxScreen > -160 && bxScreen < PW + 160) {
      // Gruene Einstichzone + versenkter 3D-Einstichkasten
      pctx.fillStyle = 'rgba(34, 197, 94, 0.24)'; pctx.fillRect(bxScreen - 130, 190, 118, 42);
      // HINTERER Sprungstaender (tiefer im Raum, links-oben fuer 3D-Tiefe!)
      const backPostX = bxScreen + 14;
      const backBaseY = 186;
      const backBarY = Math.round(backBaseY - barH + barDrop);
      pctx.fillStyle = '#64748b'; pctx.fillRect(backPostX - 4, backBaseY - 3, 10, 5); // Sockel
      pctx.fillStyle = '#94a3b8'; pctx.fillRect(backPostX, backBaseY - 134, 3, 134);
      pctx.fillStyle = '#cbd5e1'; pctx.fillRect(backPostX, backBaseY - 134, 1, 134);
      pctx.fillStyle = '#facc15'; pctx.fillRect(backPostX - 2, backBarY + 1, 7, 2);

      // 3D-ROTE SPRUNGMATTE MIT U-AUSSCHNITT UM DEN EINSTICHKASTEN (exakt wie Screenshot 6!)
      const mx = bxScreen + 4;
      // Weicher Bodenschatten
      pctx.fillStyle = 'rgba(35,10,16,0.28)';
      pctx.beginPath(); pctx.moveTo(mx - 8, 242); pctx.lineTo(mx + 114, 242); pctx.lineTo(mx + 102, 184); pctx.lineTo(mx + 4, 184); pctx.closePath(); pctx.fill();

      // Hinterer Teil der Matte (hinter dem Kasten)
      pctx.fillStyle = '#dc2626';
      pctx.beginPath(); pctx.moveTo(mx + 4, 178); pctx.lineTo(mx + 96, 178); pctx.lineTo(mx + 110, 224); pctx.lineTo(mx + 14, 224); pctx.closePath(); pctx.fill();
      // Helle obere Polsterflaeche (2.5D-Perspektive)
      pctx.fillStyle = '#ef4444';
      pctx.beginPath(); pctx.moveTo(mx + 8, 181); pctx.lineTo(mx + 92, 181); pctx.lineTo(mx + 104, 218); pctx.lineTo(mx + 18, 218); pctx.closePath(); pctx.fill();
      // Linker vorderer Fluegel vor dem U-Ausschnitt
      pctx.fillStyle = '#dc2626';
      pctx.beginPath(); pctx.moveTo(mx - 12, 214); pctx.lineTo(mx + 22, 214); pctx.lineTo(mx + 28, 232); pctx.lineTo(mx - 6, 232); pctx.closePath(); pctx.fill();
      pctx.fillStyle = '#f87171'; pctx.fillRect(mx - 8, 216, 26, 6);
      // Dicke dunkle 3D-Vorderseite der Matte
      pctx.fillStyle = '#991b1b';
      pctx.fillRect(mx - 6, 232, 116, 10);
      pctx.fillStyle = '#7f1d1d';
      pctx.fillRect(mx - 6, 238, 116, 4);
      // Polster-Trennnaehte
      pctx.fillStyle = '#b91c1c'; pctx.fillRect(mx + 56, 179, 2, 53);

      // Versenkter 3D-Einstichkasten im U-Ausschnitt!
      pctx.fillStyle = '#1e293b'; pctx.fillRect(bxScreen - 8, GROUND_Y - 5, 16, 9);
      pctx.fillStyle = '#475569'; pctx.fillRect(bxScreen - 6, GROUND_Y - 3, 12, 5);
      pctx.fillStyle = '#94a3b8'; pctx.fillRect(bxScreen - 6, GROUND_Y + 1, 12, 2);

      // Pylonen am Rand
      for (let ci = -120; ci <= -24; ci += 36) OlyGame.Sprites.drawCone(pctx, bxScreen + ci, 244);

      // DIAGONALE 3D-SPRUNGLATTE (vom hinteren zum vorderen Staender!)
      const frontPostX = bxScreen + 36;
      const frontBaseY = 236;
      const frontBarY = Math.round(frontBaseY - barH + barDrop);
      OlyGame.Sprites.drawPixelLimb(pctx, backPostX + 1, backBarY, frontPostX + 1, frontBarY, 3, state && state.barHit ? '#ef4444' : '#facc15', '#b45309');
      // Rot-weisse Markierungsstreifen entlang der 3D-Latte
      for (let t = 0.2; t <= 0.8; t += 0.25) {
        const lx = Math.round(backPostX + 1 + (frontPostX - backPostX) * t);
        const ly = Math.round(backBarY + (frontBarY - backBarY) * t);
        pctx.fillStyle = '#ffffff'; pctx.fillRect(lx - 1, ly - 1, 3, 3);
      }
    }

    // Athlet & Fiberglas-Stab
    if (entry && state) {
      const ax = state.x - camX;
      const ay = GROUND_Y - state.z;

      let pose = 'idle', bodyRot = 0;
      const bounceOffset = state.phase === 'mat_land' ? Math.sin(state.matSquish * Math.PI) * 5 : 0;
      if (state.phase === 'run') pose = 'vault_run';
      else if (state.phase === 'plant') pose = 'vault_bend';
      else if (state.phase === 'fly') {
        pose = 'vault_clear';
        bodyRot = Math.max(-0.5, Math.min(0.9, -state.vz * 0.004));
      } else if (state.phase === 'mat_land') pose = 'vault_land';
      else if (state.phase === 'cleared') pose = 'celebrate';
      else if (state.phase === 'failed') pose = 'stumble';

      OlyGame.Sprites.drawAthlete(pctx, ax, ay + bounceOffset, entry.player.country, pose, state.animPhase, {
        shadowOffsetY: state.z, bodyRot
      });
    }

    // VORDERER 3D-Sprungstaender (VOR dem Athleten fuer echten Tiefen-Effekt!)
    if (bxScreen > -160 && bxScreen < PW + 160) {
      const frontPostX = bxScreen + 36;
      const frontBaseY = 236;
      const frontBarY = Math.round(frontBaseY - barH + barDrop);
      pctx.fillStyle = '#334155'; pctx.fillRect(frontPostX - 5, frontBaseY - 3, 12, 6);
      pctx.fillStyle = '#64748b'; pctx.fillRect(frontPostX, frontBaseY - 140, 4, 140);
      pctx.fillStyle = '#cbd5e1'; pctx.fillRect(frontPostX, frontBaseY - 140, 2, 140);
      pctx.fillStyle = '#facc15'; pctx.fillRect(frontPostX - 2, frontBarY + 1, 8, 2);
      // Kleines digitales Hoehenschild am Sockel (wie Screenshot 6!)
      OlyGame.Sprites.fillPixelRoundRect(pctx, frontPostX - 24, frontBaseY - 8, 22, 12, '#1e293b');
      OlyGame.Sprites.drawPixelText(pctx, state ? state.barMeters.toFixed(1) : '5.0', frontPostX - 13, frontBaseY - 5, '#facc15', 1, 'center');
    }

    particles.draw(pctx, camX);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, z, fx, fy);

    if (entry && state && (state.phase === 'choose' || state.phase === 'run' || state.phase === 'plant' || state.phase === 'fly')) {
      const ax = state.x - camX, ay = GROUND_Y - state.z;
      ctx.save(); ctx.lineCap = 'round';
      if (state.phase === 'run' || state.phase === 'choose') {
        const p0 = OlyGame.Sprites.projectZoom(ax - 16, ay - 16, z, fx, fy);
        const p1 = OlyGame.Sprites.projectZoom(ax + 52, ay - 24, z, fx, fy);
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 6 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y + 1); ctx.lineTo(p1.x, p1.y + 1); ctx.stroke();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4.2 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        const mid1 = { x: p0.x + (p1.x - p0.x) * 0.48, y: p0.y + (p1.y - p0.y) * 0.48 };
        const mid2 = { x: p0.x + (p1.x - p0.x) * 0.60, y: p0.y + (p1.y - p0.y) * 0.60 };
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4.4 * z;
        ctx.beginPath(); ctx.moveTo(mid1.x, mid1.y); ctx.lineTo(mid2.x, mid2.y); ctx.stroke();
      } else if (state.phase === 'plant') {
        const p0 = OlyGame.Sprites.projectZoom(bxScreen, GROUND_Y, z, fx, fy);
        const p2 = OlyGame.Sprites.projectZoom(ax + 5, ay - 26, z, fx, fy);
        const pc = OlyGame.Sprites.projectZoom((bxScreen + ax + 5) / 2 + 24 * state.poleBend, (GROUND_Y + ay - 26) / 2 - 26 * state.poleBend, z, fx, fy);
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 6.5 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(pc.x, pc.y, p2.x, p2.y); ctx.stroke();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4.4 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(pc.x, pc.y, p2.x, p2.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.4 * z; ctx.setLineDash([10 * z, 18 * z]);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(pc.x, pc.y, p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);
      } else if (state.phase === 'fly') {
        const p0 = OlyGame.Sprites.projectZoom(bxScreen, GROUND_Y, z, fx, fy);
        const p1 = OlyGame.Sprites.projectZoom(bxScreen - 18, GROUND_Y - 76, z, fx, fy);
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 5.5 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3.8 * z;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      ctx.restore();
    }

    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.14, 0.22);

    if (entry && state) {
      OlyGame.Sprites.drawAttemptDots(ctx, entry.attempts, currentRound, TOTAL_ATTEMPTS);
      OlyGame.Sprites.drawPill(ctx, 20, 18, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);
      OlyGame.Sprites.drawPill(ctx, 20, 58, 'LATTE: ' + state.barMeters.toFixed(2) + ' m', '#f59e0b', '#111827', false);
      if (entry.best > 0) OlyGame.Sprites.drawPill(ctx, 940, 18, 'BESTE: ' + entry.best.toFixed(2) + ' m', '#1e293b', '#fde047', true);

      OlyGame.Sprites.drawPlayerPin(ctx, state.x - camX, GROUND_Y - state.z - 40, entry.player.slotIndex, null, z, fx, fy);

      if (state.phase === 'choose' && isMyTurn()) {
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.92)';
        OlyGame.Sprites.roundRect(ctx, 240, 160, 480, 152, 16); ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fde047'; ctx.font = '900 22px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('SPRUNGHÖHE WÄHLEN', 480, 198);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 44px "Segoe UI", sans-serif';
        ctx.fillText('◄  ' + state.barMeters.toFixed(2) + ' m  ►', 480, 254);
        ctx.fillStyle = '#94a3b8'; ctx.font = '700 15px "Segoe UI", sans-serif';
        ctx.fillText('[← / →] Höhe ändern   •   [LEERTASTE / Xbox A] Anlauf starten', 480, 292);
        ctx.restore();
      }

      if (state.phase === 'run') {
        const pct = Math.min(1, state.vx / 185);
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        OlyGame.Sprites.roundRect(ctx, 22, 486, 240, 38, 10); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px "Segoe UI", sans-serif';
        ctx.fillText('ANLAUF-TEMPO', 34, 500);
        ctx.fillStyle = '#334155'; ctx.fillRect(34, 506, 214, 10);
        ctx.fillStyle = pct > 0.82 ? '#22c55e' : '#facc15'; ctx.fillRect(34, 506, 214 * pct, 10);
        ctx.restore();
        if (state.x > BOX_X - 150 && isMyTurn()) {
          OlyGame.Sprites.drawPill(ctx, 480 - 150, 92, '⚡ EINSTECHEN! [LEERTASTE / A] HALTEN', '#16a34a', '#ffffff', false);
        }
      }

      if (state.phase === 'plant') {
        const gx = 480, gy = 456;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        OlyGame.Sprites.roundRect(ctx, gx - 140, gy - 26, 280, 52, 12); ctx.fill();
        ctx.fillStyle = '#334155'; ctx.fillRect(gx - 120, gy - 2, 240, 14);
        // Engerer, anspruchsvollerer gruener Sweet-Spot (0.72..0.90)
        ctx.fillStyle = '#22c55e'; ctx.fillRect(gx - 120 + 240 * (0.72 / 1.16), gy - 2, 240 * (0.18 / 1.16), 14);
        const cur = Math.min(1, state.poleBend / 1.16);
        ctx.fillStyle = '#fde047'; ctx.fillRect(gx - 120 + 240 * cur - 3, gy - 7, 6, 24);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 13px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('STAB-SPANNUNG: IM GRÜNEN BEREICH LOSLASSEN!', gx, gy - 10);
        ctx.restore();
      }

      if (state.feedback) {
        OlyGame.Sprites.drawSlantedCallout(ctx, state.feedback, 480, 148, state.phase === 'cleared' ? '#4ade80' : '#ef4444', state.feedbackAge, 46);
      }
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};
