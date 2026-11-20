window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.archery = function () {
  let ctxInfo = null;
  let turnList = [];
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_ARROWS = 6;
  const TARGET_CX = 240; // in 480x270 (entspricht x=480 auf 960x540)
  const TARGET_CY = 108; // in 480x270 (entspricht y=216 auf 960x540)

  function randomWind() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const mag = Number((1.2 + Math.random() * 6.4).toFixed(1));
    return { x: dir * mag, y: Number(((Math.random() - 0.5) * 2.2).toFixed(1)), speed: mag, dir };
  }

  function resetState() {
    particles.clear();
    state = {
      phase: 'aim',
      arrowIdx: 0,
      score: 0,
      wind: randomWind(),
      aimX: TARGET_CX,
      aimY: TARGET_CY,
      swayX: 0,
      swayY: 0,
      drawTension: 0,
      flyT: 0,
      hitOffX: 0,
      hitOffY: 0,
      lastPts: 0,
      stuckArrows: [],
      closeupTimer: 0,
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
    if (!isMyTurn()) ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' beim Bogenschießen');
    else ctxInfo.setSpectatorBanner(null);
  }

  function init(info) {
    ctxInfo = info;
    turnList = info.players.map(p => ({ player: p, score: 0 }));
    currentTurnIdx = 0;
    resetState();
    announceTurn();
    const gc = document.getElementById('game-canvas');
    if (gc) gc.classList.add('crosshair-mode');
  }

  function cleanup() {
    const gc = document.getElementById('game-canvas');
    if (gc) gc.classList.remove('crosshair-mode');
  }

  function finishTurn(score) {
    const entry = getActiveEntry();
    entry.score = score;
    if (ctxInfo.isOnline && isMyTurn()) ctxInfo.onSyncOut({ kind: 'arch_done', turnIdx: currentTurnIdx, score });
    currentTurnIdx++;
    if (currentTurnIdx >= turnList.length) {
      cleanup();
      if (!ctxInfo.isOnline || ctxInfo.isHost) {
        const sorted = turnList.slice().sort((a, b) => b.score - a.score);
        ctxInfo.onFinish(sorted.map(t => ({
          id: t.player.id, name: t.player.name, country: t.player.country,
          isBot: false, playerIndex: t.player.slotIndex, value: t.score, foul: false
        })));
      }
    } else { resetState(); announceTurn(); }
  }

  function releaseArrow() {
    const distScale = 23;
    const windShiftX = state.wind.x * 2.15;
    const windShiftY = state.wind.y * 1.4 + (1 - Math.min(1, state.drawTension)) * 18;

    const finalX = state.aimX + state.swayX + windShiftX;
    const finalY = state.aimY + state.swayY + windShiftY;

    state.hitOffX = (finalX - TARGET_CX) / distScale;
    state.hitOffY = (finalY - TARGET_CY) / distScale;

    const r = Math.hypot(state.hitOffX, state.hitOffY);
    let pts = 0;
    if (r <= 0.19) pts = 10;
    else if (r <= 0.38) pts = 8;
    else if (r <= 0.58) pts = 6;
    else if (r <= 0.78) pts = 4;
    else if (r <= 1.00) pts = 2;
    else pts = 0;

    state.lastPts = pts;
    state.phase = 'fly';
    state.flyT = 0;
    OlyGame.Audio.throwSfx();
  }

  function update(dt) {
    animT += dt;
    particles.update(dt);
    const entry = getActiveEntry();
    if (!entry || !isMyTurn()) return;

    const inp = OlyGame.Input.getPlayerInput(entry.player.slotIndex, true);

    if (state.phase === 'aim' || state.phase === 'draw') {
      const moveSpd = state.phase === 'draw' ? 115 : 185;
      if (inp.mouseMoved) { state.aimX = inp.mouseX; state.aimY = inp.mouseY; }
      else if (Math.abs(inp.moveX) > 0.05 || Math.abs(inp.moveY) > 0.05) {
        state.aimX += inp.moveX * moveSpd * dt;
        state.aimY += inp.moveY * moveSpd * dt;
      }
      state.aimX = Math.max(150, Math.min(330, state.aimX));
      state.aimY = Math.max(54, Math.min(170, state.aimY));

      if (state.phase === 'aim') {
        state.swayX = Math.sin(animT * 2.2) * 2.2;
        state.swayY = Math.cos(animT * 1.7) * 2.0;
        if (inp.firePressed || inp.actionPressed) {
          state.phase = 'draw';
          state.drawTension = 0.2;
          OlyGame.Audio.poleFlex();
        }
      } else if (state.phase === 'draw') {
        state.drawTension = Math.min(1.45, state.drawTension + dt * 0.95);
        const fatigue = Math.max(0, state.drawTension - 1.0) * 14;
        state.swayX = Math.sin(animT * 3.1) * (3.2 + fatigue) + Math.cos(animT * 5.3) * (1.2 + fatigue * 0.4);
        state.swayY = Math.cos(animT * 2.5) * (3.0 + fatigue) + Math.sin(animT * 4.7) * (1.2 + fatigue * 0.4);

        if (inp.fireReleased || inp.actionReleased || state.drawTension >= 1.44) {
          releaseArrow();
        }
      }
    } else if (state.phase === 'fly') {
      state.flyT += dt * 2.4;
      if (state.flyT >= 1.0) {
        state.flyT = 1.0;
        state.phase = 'closeup';
        state.closeupTimer = 1.85;
        state.score += state.lastPts;
        state.stuckArrows.push({ ox: state.hitOffX, oy: state.hitOffY, pts: state.lastPts });
        state.feedbackAge = 0;

        if (state.lastPts === 10) {
          state.feedback = 'GOLD! +10 PKT!';
          OlyGame.Audio.perfect();
          OlyGame.Audio.crowdCheer(true);
          particles.burstStars(240 + state.hitOffX * 72, 144 + state.hitOffY * 72, 18);
        } else if (state.lastPts >= 6) {
          state.feedback = (state.lastPts === 8 ? 'SUPER! +' : 'GUT! +') + state.lastPts;
          OlyGame.Audio.perfect();
          particles.burstStars(240 + state.hitOffX * 72, 144 + state.hitOffY * 72, 9);
        } else if (state.lastPts > 0) {
          state.feedback = '+' + state.lastPts + ' PKT';
          OlyGame.Audio.step();
        } else {
          state.feedback = 'DANEBEN!';
          OlyGame.Audio.foul();
        }
      }
    } else if (state.phase === 'closeup') {
      state.closeupTimer -= dt;
      state.feedbackAge += dt;
      if (state.closeupTimer <= 0) {
        state.arrowIdx++;
        if (state.arrowIdx >= TOTAL_ARROWS) {
          state.phase = 'done';
          state.resultTimer = 2.0;
          OlyGame.Audio.liftSuccess();
        } else {
          state.phase = 'aim';
          state.wind = randomWind();
          state.drawTension = 0;
          state.feedback = '';
        }
      }
    } else if (state.phase === 'done') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishTurn(state.score); return; }
    }

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) {
        syncAccum = 0;
        ctxInfo.onSyncOut({ kind: 'arch_state', turnIdx: currentTurnIdx, state: { ...state } });
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'arch_state') { currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn(); }
    else if (payload.kind === 'arch_done') {
      const entry = turnList[payload.turnIdx];
      if (entry) entry.score = payload.score;
      currentTurnIdx = payload.turnIdx + 1;
      if (currentTurnIdx >= turnList.length) {
        cleanup();
        if (ctxInfo.isHost) {
          const sorted = turnList.slice().sort((a, b) => b.score - a.score);
          ctxInfo.onFinish(sorted.map(t => ({
            id: t.player.id, name: t.player.name, country: t.player.country,
            isBot: false, playerIndex: t.player.slotIndex, value: t.score, foul: false
          })));
        }
      } else { resetState(); announceTurn(); }
    }
  }

  // ECHTE, EXAKT RUNDE OLYMPISCHE ZIELSCHEIBE DIREKT AUF DEM 960x540 HIGH-RES CANVAS!
  function drawSmoothTargetHighRes(ctx, cx, cy, R, arrows, isCloseup) {
    ctx.save();
    const pad = R * 1.24;

    // Weicher Bodenschatten unter dem Holzstaender
    ctx.fillStyle = 'rgba(28, 48, 22, 0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + pad + R * 0.28, pad * 0.96, R * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dreibeiniger Holzstaender (hintere Stuetze + 2 schraege Vorderbeine)
    ctx.strokeStyle = '#5c3317'; ctx.lineWidth = Math.max(5, R * 0.14); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + pad * 0.5); ctx.lineTo(cx + R * 0.08, cy + pad + R * 0.24);
    ctx.stroke();

    ctx.strokeStyle = '#7c4420'; ctx.lineWidth = Math.max(6, R * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx - pad * 0.65, cy + pad * 0.72); ctx.lineTo(cx - pad * 0.84, cy + pad + R * 0.30);
    ctx.moveTo(cx + pad * 0.65, cy + pad * 0.72); ctx.lineTo(cx + pad * 0.84, cy + pad + R * 0.30);
    ctx.stroke();

    // 3D Stroh-Unterbau & abgeschrägte quadratische Scheibe (wie sommerspiele.mp4 00:10!)
    ctx.fillStyle = '#cbd5e1';
    OlyGame.Sprites.roundRect(ctx, cx - pad, cy - pad, pad * 2, pad * 2, Math.max(6, R * 0.12));
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    OlyGame.Sprites.roundRect(ctx, cx - pad + 4, cy - pad + 4, pad * 2 - 8, pad * 2 - 10, Math.max(5, R * 0.1));
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.lineWidth = 2;
    ctx.stroke();

    // 5 GESTRICHEN RUNDE OLYMPISCHE RINGE + feine Trennlinien!
    const rings = [
      { f: 0.97, col: '#ffffff', stroke: '#cbd5e1' },
      { f: 0.78, col: '#1e293b', stroke: '#334155' },
      { f: 0.58, col: '#0ea5e9', stroke: '#0284c7' },
      { f: 0.38, col: '#ef4444', stroke: '#dc2626' },
      { f: 0.19, col: '#facc15', stroke: '#ca8a04' },
      { f: 0.08, col: '#fef08a', stroke: '#eab308' }
    ];
    rings.forEach(rg => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * rg.f, 0, Math.PI * 2);
      ctx.fillStyle = rg.col;
      ctx.fill();
      ctx.strokeStyle = rg.stroke;
      ctx.lineWidth = isCloseup ? 2 : 1;
      ctx.stroke();
    });

    // Kleines Kreuz in der goldenen Mitte
    if (isCloseup) {
      ctx.strokeStyle = 'rgba(120,53,15,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
      ctx.stroke();
    }

    // Steckende Pfeile mit Schatten & blauer Befiederung!
    (arrows || []).forEach((ar, idx) => {
      if (Math.hypot(ar.ox, ar.oy) > 1.32) return;
      const ax = cx + ar.ox * R;
      const ay = cy + ar.oy * R;
      const isNewest = idx === arrows.length - 1;
      const len = isCloseup ? 64 : 18;
      const tailX = ax + len * 0.42;
      const tailY = ay - len;

      // Schlagschatten des Pfeils auf der Scheibe
      ctx.strokeStyle = 'rgba(15,23,42,0.32)';
      ctx.lineWidth = isCloseup ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + len * 0.52, ay + len * 0.22); ctx.stroke();

      // Pfeilschaft
      ctx.strokeStyle = isNewest ? '#0f172a' : '#475569';
      ctx.lineWidth = isCloseup ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tailX, tailY); ctx.stroke();

      // Befiederung (Vanes)
      if (isCloseup) {
        ctx.fillStyle = isNewest ? '#38bdf8' : '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX - 10, tailY + 6);
        ctx.lineTo(tailX - 3, tailY + 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = isNewest ? '#0284c7' : '#64748b';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX + 10, tailY + 8);
        ctx.lineTo(tailX + 2, tailY + 15);
        ctx.closePath();
        ctx.fill();
        // Kleine Nocke
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(tailX, tailY, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = isNewest ? '#38bdf8' : '#94a3b8';
        ctx.beginPath(); ctx.arc(tailX, tailY, 3, 0, Math.PI * 2); ctx.fill();
      }
    });

    ctx.restore();
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW, PH = OlyGame.CONFIG.PH;
    const entry = getActiveEntry();

    pctx.clearRect(0, 0, PW, PH);

    if (state && state.phase === 'closeup') {
      // --- DRAMATISCHER ZIELSCHEIBEN-ZOOM (mit weichgezeichnetem Hintergrund & gestochen runder Zielscheibe!) ---
      ctx.save();
      if (!OlyGame.Sprites.drawFullBackdrop(ctx, 'range_archery', 1.45, 240, 108)) {
        ctx.fillStyle = '#74c855'; ctx.fillRect(0, 0, 960, 540);
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.fillRect(0, 0, 960, 540);
      ctx.restore();

      // Grosse, 100% runde High-Res Zielscheibe in der Mitte (wie sommerspiele.mp4 00:10!)
      drawSmoothTargetHighRes(ctx, 480, 290, 148, state.stuckArrows, true);

      // Partikel (goldene Sterne) drueber
      particles.draw(pctx, 0);
      OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);
    } else {
      // --- HAUPTANSICHT BOGENSCHIESS-ANLAGE (960x540 range_archery.png) ---
      if (!OlyGame.Sprites.drawFullBackdrop(ctx, 'range_archery')) {
        ctx.fillStyle = '#74c855'; ctx.fillRect(0, 0, 960, 540);
      }

      // 100% runde High-Res Haupt-Zielscheibe am Ende der Sandbahn!
      drawSmoothTargetHighRes(ctx, TARGET_CX * 2, TARGET_CY * 2, 46, state ? state.stuckArrows : [], false);

      // 2.5D Blumenkaesten & Bogenschuetze im Pixel-Vordergrund
      OlyGame.Sprites.drawFlowerPlanter(pctx, 36, 250, false);
      OlyGame.Sprites.drawFlowerPlanter(pctx, 94, 250, true);
      OlyGame.Sprites.drawFlowerPlanter(pctx, 356, 250, true);
      OlyGame.Sprites.drawFlowerPlanter(pctx, 414, 250, false);

      if (entry && state) {
        const pose = state.phase === 'draw' ? 'archery_draw' : 'archery_back';
        OlyGame.Sprites.drawAthlete(pctx, 240, 258, entry.player.country, pose, animT);

        // Gebogener Sportbogen
        const bx = 227, by = 219;
        const bend = state.phase === 'draw' ? Math.min(6, state.drawTension * 5) : 1;
        pctx.strokeStyle = '#38bdf8'; pctx.lineWidth = 2;
        pctx.beginPath(); pctx.moveTo(bx + 2, by - 17); pctx.quadraticCurveTo(bx - 10 - bend, by, bx + 2, by + 17); pctx.stroke();
        pctx.strokeStyle = '#f8fafc'; pctx.lineWidth = 1;
        pctx.beginPath();
        pctx.moveTo(bx + 2, by - 17);
        pctx.lineTo(state.phase === 'draw' ? 248 : bx + 2, by);
        pctx.lineTo(bx + 2, by + 17);
        pctx.stroke();

        // Fliegender Pfeil
        if (state.phase === 'fly') {
          const t = state.flyT;
          const tx = TARGET_CX + state.hitOffX * 23;
          const ty = TARGET_CY + state.hitOffY * 23;
          const ax = 240 + (tx - 240) * t;
          const ay = 218 + (ty - 218) * t - Math.sin(t * Math.PI) * 28;
          const len = Math.max(4, (1 - t * 0.72) * 22);
          OlyGame.Sprites.drawPixelLimb(pctx, ax, ay, ax, ay + len, 2, '#f8fafc', '#0284c7');
        }
      }

      particles.draw(pctx, 0);
      OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);

      // High-Res Bogen-Visier
      if (state && (state.phase === 'aim' || state.phase === 'draw')) {
        const vx = (state.aimX + state.swayX) * 2;
        const vy = (state.aimY + state.swayY) * 2;
        const ringR = state.phase === 'draw' ? Math.max(12, 42 - Math.min(1, state.drawTension) * 28) : 32;
        const isFull = state.drawTension >= 0.88 && state.drawTension <= 1.15;

        ctx.save();
        ctx.strokeStyle = isFull ? '#4ade80' : (state.drawTension > 1.15 ? '#ef4444' : '#ffffff');
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(vx, vy, ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(vx - 12, vy); ctx.lineTo(vx + 12, vy);
        ctx.moveTo(vx, vy - 12); ctx.lineTo(vx, vy + 12);
        ctx.stroke();
        ctx.fillStyle = isFull ? '#22c55e' : '#facc15';
        ctx.beginPath(); ctx.arc(vx, vy, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // --- SAUBERES HIGH-RES HUD (KEINE UEBERLAPPUNG MEHR MIT SCHUETZEN ODER PB/WR!) ---
    if (entry && state) {
      OlyGame.Sprites.drawBigText(ctx, String(state.score), 26, 16, 48, '#ffffff', 'left');
      OlyGame.Sprites.drawPill(ctx, 26, 72, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);

      // Obere Mittel-Leiste: Wind + 6 Pfeile
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      OlyGame.Sprites.roundRect(ctx, 315, 14, 330, 44, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(342, 36, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.font = '900 18px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state.wind.dir < 0 ? '◄' : '►', 342, 36);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 17px "Segoe UI", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(state.wind.speed.toFixed(1) + ' M/S', 366, 37);
      for (let i = 0; i < TOTAL_ARROWS; i++) {
        const ax = 478 + i * 24;
        const used = i < state.arrowIdx, cur = i === state.arrowIdx;
        ctx.fillStyle = used ? '#475569' : (cur ? '#38bdf8' : '#e2e8f0');
        ctx.fillRect(ax, 25, 4, 22);
        ctx.beginPath(); ctx.moveTo(ax + 2, 20); ctx.lineTo(ax - 3, 27); ctx.lineTo(ax + 7, 27); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Hinweis-Badge sauber UNTEN LINKS (weit weg vom Schuetzen in der Mitte & von PB/WR rechts!)
      if (state.phase === 'aim' && isMyTurn()) {
        OlyGame.Sprites.drawPill(ctx, 20, 492, 'ZIELEN & [KLICK / LEERTASTE] HALTEN', 'rgba(15,23,42,0.9)', '#fde047', false);
      } else if (state.phase === 'draw' && isMyTurn()) {
        const pct = Math.min(1, state.drawTension);
        OlyGame.Sprites.drawPill(ctx, 20, 492, pct > 0.85 ? '⚡ JETZT LOSLASSEN!' : 'SPANNUNG: ' + Math.round(pct * 100) + '%', pct > 0.85 ? '#16a34a' : '#f59e0b', '#ffffff', false);
      }

      if (state.feedback) {
        OlyGame.Sprites.drawSlantedCallout(ctx, state.feedback, 480, 118, state.lastPts >= 8 ? '#fde047' : (state.lastPts > 0 ? '#4ade80' : '#ef4444'), state.feedbackAge, 48);
      }
      if (state.phase === 'done') {
        OlyGame.Sprites.drawSlantedCallout(ctx, 'GESAMT: ' + state.score + ' / 60 PKT!', 480, 220, '#4ade80', 0.3, 46);
      }
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn, cleanup };
};
