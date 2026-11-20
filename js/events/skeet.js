window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.skeet = function () {
  let ctxInfo = null;
  let turnList = [];
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_CLAYS = 15;

  function resetState() {
    particles.clear();
    state = {
      phase: 'ready',
      score: 0,
      spawned: 0,
      remaining: TOTAL_CLAYS,
      ammo: 2,
      reloadTimer: 0,
      spawnTimer: 0.75,
      clays: [],
      aimX: 240,
      aimY: 112,
      recoil: 0,
      muzzleFlash: 0,
      popups: [],
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
    if (!isMyTurn()) ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' beim Tontaubenschießen');
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

  function spawnVolley() {
    if (state.spawned >= TOTAL_CLAYS) return;
    // Mehr spannende Doppel-Wuerfe (65%) & deutlich flottere, steilere Flugbahnen!
    const doubleShot = (state.spawned <= TOTAL_CLAYS - 2) && (Math.random() < 0.65);
    const count = doubleShot ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const fromLeft = (i === 0) ? (Math.random() < 0.5) : !((state.spawned % 2) === 0);
      const startX = fromLeft ? 14 : 466;
      const startY = 148 + (Math.random() - 0.5) * 32;
      const speedX = (158 + Math.random() * 72) * (fromLeft ? 1 : -1);
      const speedY = -84 - Math.random() * 34;
      const bonus = Math.random() < 0.26;
      state.clays.push({
        id: state.spawned + 1,
        x: startX, y: startY, vx: speedX, vy: speedY, bonus, hit: false
      });
      state.spawned++;
    }
    state.ammo = 2;
  }

  function fireAtCrosshair() {
    if (state.ammo <= 0) return;
    state.ammo--;
    state.muzzleFlash = 0.12;
    state.recoil = 9;
    OlyGame.Audio.shotgun();

    // Praeziserer, anspruchsvollerer Trefferradius (19px statt 28px, Volltreffer 9px!)
    let bestIdx = -1, bestDist = 999;
    for (let i = 0; i < state.clays.length; i++) {
      const cl = state.clays[i];
      if (cl.hit) continue;
      const d = Math.hypot(cl.x - state.aimX, cl.y - state.aimY);
      if (d <= 19 && d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      const cl = state.clays[bestIdx];
      cl.hit = true;
      const isBullseye = bestDist <= 9.5;
      const pts = cl.bonus ? (isBullseye ? 40 : 25) : (isBullseye ? 25 : 15);
      state.score += pts;
      state.remaining = Math.max(0, state.remaining - 1);
      OlyGame.Audio.shatter();
      particles.burstDust(cl.x, cl.y, 12, cl.bonus ? '#38bdf8' : '#ef4444');
      if (isBullseye) particles.burstStars(cl.x, cl.y, 8);
      state.popups.push({
        x: cl.x, y: cl.y,
        text: (isBullseye ? 'PERFEKT! +' : '+') + pts,
        color: isBullseye ? '#fde047' : '#ffffff',
        life: 0.95
      });
    } else {
      state.popups.push({ x: state.aimX, y: state.aimY, text: 'DANEBEN', color: '#f87171', life: 0.6 });
    }

    if (state.ammo === 0) state.reloadTimer = 0.62;
  }

  function finishTurn(score) {
    const entry = getActiveEntry();
    entry.score = score;
    if (ctxInfo.isOnline && isMyTurn()) ctxInfo.onSyncOut({ kind: 'skeet_done', turnIdx: currentTurnIdx, score });
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

  function update(dt) {
    animT += dt;
    particles.update(dt);
    const entry = getActiveEntry();
    if (!entry || !isMyTurn()) return;

    const inp = OlyGame.Input.getPlayerInput(entry.player.slotIndex, true);
    if (inp.mouseMoved) { state.aimX = inp.mouseX; state.aimY = inp.mouseY; }
    else if (Math.abs(inp.moveX) > 0.05 || Math.abs(inp.moveY) > 0.05) {
      state.aimX += inp.moveX * 305 * dt;
      state.aimY += inp.moveY * 305 * dt;
    }
    state.aimX = Math.max(24, Math.min(456, state.aimX));
    state.aimY = Math.max(26, Math.min(200, state.aimY));

    if (state.phase === 'ready') {
      if (inp.firePressed || inp.actionPressed) { state.phase = 'playing'; state.spawnTimer = 0.55; OlyGame.Audio.beep(true); }
      return;
    }

    if (state.phase === 'playing') {
      if (state.muzzleFlash > 0) state.muzzleFlash -= dt;
      if (state.recoil > 0) state.recoil = Math.max(0, state.recoil - 45 * dt);
      if (state.reloadTimer > 0) {
        state.reloadTimer -= dt;
        if (state.reloadTimer <= 0) { state.ammo = 2; OlyGame.Audio.click(); }
      }

      if (inp.firePressed) fireAtCrosshair();

      const activeClays = state.clays.filter(c => !c.hit);
      if (activeClays.length === 0 && state.spawned < TOTAL_CLAYS) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) { spawnVolley(); state.spawnTimer = 0.72; }
      }

      for (let i = state.clays.length - 1; i >= 0; i--) {
        const cl = state.clays[i];
        if (cl.hit) { state.clays.splice(i, 1); continue; }
        cl.x += cl.vx * dt;
        cl.y += cl.vy * dt;
        cl.vy += 64 * dt; // Staerkere, dynamischere Parabel!
        if (Math.random() < 0.45) particles.spawn(cl.x, cl.y, 0, 0, 'rgba(255,255,255,0.55)', 2, 0.26, 0);
        if (cl.x < -30 || cl.x > 510 || cl.y > 215) {
          state.clays.splice(i, 1);
          state.remaining = Math.max(0, state.remaining - 1);
        }
      }

      for (let i = state.popups.length - 1; i >= 0; i--) {
        state.popups[i].life -= dt; state.popups[i].y -= 20 * dt;
        if (state.popups[i].life <= 0) state.popups.splice(i, 1);
      }

      if (state.spawned >= TOTAL_CLAYS && state.clays.length === 0) {
        state.phase = 'done'; state.resultTimer = 2.2; OlyGame.Audio.liftSuccess();
      }
    } else if (state.phase === 'done') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishTurn(state.score); return; }
    }

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) { syncAccum = 0; ctxInfo.onSyncOut({ kind: 'skeet_state', turnIdx: currentTurnIdx, state: { ...state } }); }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'skeet_state') { currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn(); }
    else if (payload.kind === 'skeet_done') {
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

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW, PH = OlyGame.CONFIG.PH;
    const entry = getActiveEntry();

    pctx.clearRect(0, 0, PW, PH);
    if (!OlyGame.Sprites.drawFullBackdrop(ctx, 'range_skeet')) {
      ctx.fillStyle = '#73c657'; ctx.fillRect(0, 0, OlyGame.CONFIG.CW, OlyGame.CONFIG.CH);
    }

    OlyGame.Sprites.drawReferee(pctx, 64, 236, { seated: false });
    OlyGame.Sprites.drawReferee(pctx, 416, 236, { seated: false, darkSkin: true });
    OlyGame.Sprites.drawFlowerPlanter(pctx, 18, 248, false);
    OlyGame.Sprites.drawFlowerPlanter(pctx, 438, 248, true);

    if (state) {
      state.clays.forEach(cl => {
        const cx = Math.round(cl.x), cy = Math.round(cl.y);
        OlyGame.Sprites.fillPixelEllipse(pctx, cx, 178, 5, 2, 'rgba(0,0,0,0.16)');
        OlyGame.Sprites.fillPixelEllipse(pctx, cx, cy, 7, 3, cl.bonus ? '#0284c7' : '#b91c1c');
        OlyGame.Sprites.fillPixelEllipse(pctx, cx, cy - 1, 6, 2, cl.bonus ? '#38bdf8' : '#ef4444');
        pctx.fillStyle = '#ffffff'; pctx.fillRect(cx - 2, cy - 2, 3, 1);
      });
    }

    if (entry && state) {
      const sx = 240, sy = 246;
      // Gewehrlauf hinter dem Schuetzen Richtung Fadenkreuz
      const ang = Math.atan2(state.aimY - (sy - 30), state.aimX - (sx + 6));
      const barrelLen = 34 - state.recoil * 0.5;
      const tipX = sx + 6 + Math.cos(ang) * barrelLen;
      const tipY = sy - 30 + Math.sin(ang) * barrelLen;
      OlyGame.Sprites.drawPixelLimb(pctx, sx + 6, sy - 30, tipX, tipY, 3, '#334155', '#0f172a');

      // Einheitlicher knuffiger 2x Pixel-Schuetze + roter Gehoerschutz!
      OlyGame.Sprites.drawAthlete(pctx, sx, sy, entry.player.country, 'archery_back', animT);
      pctx.fillStyle = '#ef4444';
      pctx.fillRect(sx - 11, sy - 42, 4, 8);
      pctx.fillRect(sx + 7, sy - 42, 4, 8);
      pctx.fillStyle = '#1e293b';
      pctx.fillRect(sx - 8, sy - 46, 16, 2);

      if (state.muzzleFlash > 0) {
        OlyGame.Sprites.fillPixelEllipse(pctx, tipX, tipY, 8, 8, '#fde047');
        OlyGame.Sprites.fillPixelEllipse(pctx, tipX, tipY, 4, 4, '#ffffff');
      }
    }

    particles.draw(pctx, 0);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.1, 0.18);

    if (state) {
      const fx = state.aimX * 2, fy = state.aimY * 2;
      const onTarget = state.clays.some(cl => !cl.hit && Math.hypot(cl.x - state.aimX, cl.y - state.aimY) <= 19);
      const r = 24 + state.recoil * 1.4;
      ctx.save();
      ctx.strokeStyle = onTarget ? '#4ade80' : '#ffffff';
      ctx.lineWidth = onTarget ? 4 : 3;
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx - r - 9, fy); ctx.lineTo(fx - 8, fy);
      ctx.moveTo(fx + 8, fy); ctx.lineTo(fx + r + 9, fy);
      ctx.moveTo(fx, fy - r - 9); ctx.lineTo(fx, fy - 8);
      ctx.moveTo(fx, fy + 8); ctx.lineTo(fx, fy + r + 9);
      ctx.stroke();
      ctx.fillStyle = onTarget ? '#22c55e' : '#ef4444';
      ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (entry && state) {
      OlyGame.Sprites.drawBigText(ctx, String(state.score), 26, 16, 48, '#ffffff', 'left');
      OlyGame.Sprites.drawPill(ctx, 26, 72, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);
      OlyGame.Sprites.drawBigText(ctx, String(state.remaining), 934, 16, 48, '#ffffff', 'right');
      OlyGame.Sprites.drawPill(ctx, 934, 72, 'SCHEIBEN ÜBRIG', '#1e293b', '#94a3b8', true);

      ctx.save();
      ctx.fillStyle = 'rgba(30,41,59,0.9)'; OlyGame.Sprites.roundRect(ctx, 434, 14, 92, 46, 12); ctx.fill();
      for (let i = 0; i < 2; i++) {
        const ax = 454 + i * 32;
        ctx.fillStyle = i < state.ammo ? '#dc2626' : '#475569'; ctx.fillRect(ax, 22, 16, 22);
        ctx.fillStyle = i < state.ammo ? '#facc15' : '#64748b'; ctx.fillRect(ax, 44, 16, 8);
      }
      ctx.restore();

      state.popups.forEach(p => {
        OlyGame.Sprites.drawSlantedCallout(ctx, p.text, p.x * 2, p.y * 2 - 22, p.color, 0.95 - p.life, 32);
      });

      if (state.phase === 'ready' && isMyTurn()) OlyGame.Sprites.drawBigText(ctx, 'KLICK / [LEERTASTE / A] ZUM STARTEN!', 480, 210, 36, '#fde047', 'center');
      if (state.phase === 'done') OlyGame.Sprites.drawBigText(ctx, 'RUNDE BEENDET: ' + state.score + ' PKT!', 480, 200, 44, '#4ade80', 'center');
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn, cleanup };
};
