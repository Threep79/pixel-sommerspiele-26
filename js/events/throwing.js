window.OlyGame = window.OlyGame || {};
OlyGame.Events = OlyGame.Events || {};

OlyGame.Events.createThrowEvent = function (isJavelin) {
  let ctxInfo = null;
  let turnList = [];
  let currentRound = 0;
  let currentTurnIdx = 0;
  let state = null;
  let syncAccum = 0;
  let animT = 0;
  const particles = OlyGame.Sprites.createParticles();

  const TOTAL_ATTEMPTS = 3;
  const LINE_X = isJavelin ? 680 : 168;
  const GROUND_Y = 192;
  const PX_PER_METER = isJavelin ? 6.2 : 20.5;

  function resetState() {
    particles.clear();
    state = {
      phase: 'ready',
      x: isJavelin ? 58 : LINE_X - 42,
      vx: 0,
      animPhase: 0,
      spinAngle: 0,
      lastKey: null,
      power: 0,
      spinTimer: 3.2,
      angle: 14,
      angleDir: 1,
      projX: 0, projY: 0, projVx: 0, projVy: 0, projRot: 0,
      camX: 0,
      camZoom: 1.0,
      resultMeters: 0,
      foul: false,
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
    if (!isMyTurn()) ctxInfo.setSpectatorBanner('👀 LIVE: ' + e.player.name + ' wirft (Versuch ' + (currentRound + 1) + '/' + TOTAL_ATTEMPTS + ')');
    else ctxInfo.setSpectatorBanner(null);
  }

  function init(info) {
    ctxInfo = info;
    turnList = info.players.map(p => ({ player: p, attempts: [], best: 0 }));
    currentRound = 0; currentTurnIdx = 0;
    resetState();
    announceTurn();
  }

  function finishAttempt(meters, foul) {
    const entry = getActiveEntry();
    entry.attempts.push({ value: foul ? 0 : meters, foul });
    if (!foul && meters > entry.best) entry.best = meters;

    if (ctxInfo.isOnline && isMyTurn()) {
      ctxInfo.onSyncOut({ kind: 'throw_done', round: currentRound, turnIdx: currentTurnIdx, value: foul ? 0 : meters, foul });
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
    } else { resetState(); announceTurn(); }
  }

  function launchProjectile(powerRatio, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const optAngle = isJavelin ? 38 : 42;
    const angleEff = Math.max(0.28, 1 - Math.abs(angleDeg - optAngle) / 38);
    const baseMax = isJavelin ? 100.5 : 23.9;
    const distMeters = Math.max(isJavelin ? 22 : 6.5, baseMax * (0.34 + 0.66 * powerRatio) * (0.42 + 0.58 * angleEff));
    const targetDistPx = distMeters * PX_PER_METER;
    const g = isJavelin ? 155 : 240;
    const sin2 = Math.max(0.36, Math.sin(2 * rad));
    const speed = Math.sqrt((targetDistPx * g) / sin2);

    state.projX = state.x + 14;
    state.projY = GROUND_Y - 34;
    state.projVx = Math.cos(rad) * speed;
    state.projVy = -Math.sin(rad) * speed;
    state.projRot = -rad;
    state.phase = 'fly';
    OlyGame.Audio.throwSfx();

    state.feedbackAge = 0;
    if (angleEff > 0.90 && powerRatio > 0.80) {
      state.feedback = 'PERFEKT!';
      particles.burstStars(state.projX, state.projY, 16);
    } else if (angleEff > 0.76) {
      state.feedback = 'SUPER!';
      particles.burstStars(state.projX, state.projY, 8);
    } else {
      state.feedback = 'GUT!';
    }
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

    if (isJavelin) {
      if (state.phase === 'ready') {
        if (inp.leftPressed || inp.rightPressed || inp.actionPressed) {
          state.phase = 'run';
          state.vx = 48;
          OlyGame.Audio.step();
        }
      } else if (state.phase === 'run') {
        let boost = 0;
        if (inp.leftPressed) { boost = (state.lastKey === 'R' || !state.lastKey) ? 17.5 : 6.5; state.lastKey = 'L'; }
        if (inp.rightPressed) { boost = (state.lastKey === 'L' || !state.lastKey) ? 17.5 : 6.5; state.lastKey = 'R'; }
        if (boost > 0) {
          state.vx = Math.min(192, state.vx + boost);
          particles.burstDust(state.x - 10, GROUND_Y, 1);
          if (state.vx > 155) {
            particles.spawn(state.x - 14, GROUND_Y - 14 + (Math.random() - 0.5) * 14, -36, (Math.random() - 0.5) * 10, '#fde047', 2, 0.38, 0, 'star');
          }
        }
        state.vx = Math.max(26, state.vx - 56 * dt);
        state.x += state.vx * dt;
        const prevPh = state.animPhase;
        state.animPhase += state.vx * dt * 0.085;
        if (Math.floor(state.animPhase / Math.PI) > Math.floor(prevPh / Math.PI)) OlyGame.Audio.step();

        if (inp.actionDown && state.x > LINE_X - 180) {
          if (state.x > LINE_X + 6) triggerFoul();
          else { state.phase = 'aim'; state.angle = 12; state.angleDir = 1; OlyGame.Audio.beep(false); }
        }
        if (state.x > LINE_X + 8 && state.phase === 'run') triggerFoul();
      } else if (state.phase === 'aim') {
        state.x += 18 * dt;
        state.angle += state.angleDir * 108 * dt;
        if (state.angle >= 80) { state.angle = 80; state.angleDir = -1; }
        if (state.angle <= 10) { state.angle = 10; state.angleDir = 1; }

        if (state.x > LINE_X + 6) triggerFoul();
        else if (inp.actionReleased) {
          const pRatio = Math.min(1, state.vx / 190);
          launchProjectile(pRatio, state.angle);
        }
      }
    } else {
      if (state.phase === 'ready') {
        if (inp.leftPressed || inp.rightPressed || inp.actionPressed) {
          state.phase = 'spin'; state.spinTimer = 3.2; state.power = 10; state.x = LINE_X - 42; OlyGame.Audio.step();
        }
      } else if (state.phase === 'spin') {
        state.spinTimer -= dt;
        let boost = 0;
        if (inp.leftPressed) { boost = (state.lastKey === 'R' || !state.lastKey) ? 5.0 : 1.8; state.lastKey = 'L'; OlyGame.Audio.step(); }
        if (inp.rightPressed) { boost = (state.lastKey === 'L' || !state.lastKey) ? 5.0 : 1.8; state.lastKey = 'R'; OlyGame.Audio.step(); }
        if (boost > 0) {
          state.power = Math.min(100, state.power + boost);
          particles.burstDust(state.x, GROUND_Y, 2);
        }
        state.power = Math.max(8, state.power - 15.5 * dt);
        const spinSpeed = 3.2 + (state.power / 100) * 12.0;
        state.spinAngle += spinSpeed * dt;
        const progress = 1 - Math.max(0, state.spinTimer / 3.2);
        state.x = (LINE_X - 42) + progress * 30;

        if (state.spinTimer <= 0) {
          state.phase = 'aim'; state.x = LINE_X - 10; state.angle = 14; state.angleDir = 1; OlyGame.Audio.beep(false);
        }
      } else if (state.phase === 'aim') {
        state.angle += state.angleDir * 106 * dt;
        if (state.angle >= 80) { state.angle = 80; state.angleDir = -1; }
        if (state.angle <= 12) { state.angle = 12; state.angleDir = 1; }
        if (inp.actionPressed) launchProjectile(state.power / 100, state.angle);
      }
    }

    if (state.phase === 'fly') {
      const g = isJavelin ? 155 : 240;
      state.projX += state.projVx * dt;
      state.projY += state.projVy * dt;
      state.projVy += g * dt;
      state.projRot = Math.atan2(state.projVy, state.projVx);

      if (isJavelin && Math.random() < 0.85) {
        particles.spawn(state.projX - 6, state.projY, -18, (Math.random() - 0.5) * 10, Math.random() < 0.6 ? '#fde047' : '#ffffff', 2 + (Math.random() < 0.5 ? 1 : 0), 0.5, 0, Math.random() < 0.55 ? 'star' : 'puff');
      }

      const targetCam = Math.max(0, state.projX - 240);
      state.camX += (targetCam - state.camX) * Math.min(1, dt * 6.5);

      if (state.projY >= GROUND_Y) {
        state.projY = GROUND_Y;
        const distMeters = Number(Math.max(1.5, (state.projX - LINE_X) / PX_PER_METER).toFixed(2));
        state.resultMeters = distMeters;
        state.phase = 'landed';
        state.resultTimer = 2.4;
        particles.burstDust(state.projX, GROUND_Y, 12, '#86efac');
        OlyGame.Audio.sandLand();
        OlyGame.Audio.crowdCheer(distMeters >= OlyGame.CONFIG.getEvent(ctxInfo.eventId).wr * 0.85);
        state.feedbackAge = 0;
        if (distMeters >= OlyGame.CONFIG.getEvent(ctxInfo.eventId).wr) {
          state.feedback = 'WELTREKORD! ' + distMeters.toFixed(2) + ' m!';
          particles.burstStars(state.projX, GROUND_Y - 18, 16);
        } else {
          state.feedback = distMeters.toFixed(2) + ' m!';
        }
      }
    } else if (state.phase === 'landed' || state.phase === 'foul') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) { finishAttempt(state.resultMeters, state.foul); return; }
    } else if (isJavelin) {
      const targetCam = Math.max(0, state.x - 165);
      state.camX += (targetCam - state.camX) * Math.min(1, dt * 7);
    }

    if (state.feedback) state.feedbackAge = (state.feedbackAge || 0) + dt;
    const targetZoom = (state.phase === 'aim' || state.phase === 'spin') ? 1.24 : (state.phase === 'landed' ? 1.15 : 1.0);
    state.camZoom = (state.camZoom || 1.0) + (targetZoom - (state.camZoom || 1.0)) * Math.min(1, dt * 4.5);

    if (ctxInfo.isOnline) {
      syncAccum += dt;
      if (syncAccum >= 0.05) {
        syncAccum = 0;
        ctxInfo.onSyncOut({ kind: 'throw_state', round: currentRound, turnIdx: currentTurnIdx, state: { ...state } });
      }
    }
  }

  function onSyncIn(payload) {
    if (!payload) return;
    if (payload.kind === 'throw_state') {
      currentRound = payload.round; currentTurnIdx = payload.turnIdx; state = payload.state; announceTurn();
    } else if (payload.kind === 'throw_done') {
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
      } else { resetState(); announceTurn(); }
    }
  }

  function render(pctx, ctx) {
    const PW = OlyGame.CONFIG.PW;
    const PH = OlyGame.CONFIG.PH;
    const camX = state ? state.camX : 0;
    const entry = getActiveEntry();

    const z = state ? (state.camZoom || 1.0) : 1.0;
    const focusWorldX = (state && (state.phase === 'fly' || state.phase === 'landed')) ? state.projX : (state ? state.x : 240);
    const fx = focusWorldX - camX;
    const fy = GROUND_Y - 26;
    pctx.clearRect(0, 0, PW, PH);

    // 1. ECHTE 3/4 STADION-PERSPEKTIVE (genau wie sommerspiele.mp4 00:06-00:07!):
    // Organischer, diagonal gemaehter Sonnenrasen fuellt den gesamten Hintergrund (KEINE flachen vertikalen Streifen, KEINE flache Himmelswand!)
    OlyGame.Sprites.drawTexturedGrass(pctx, camX, 0, PH);

    // Oberer Stadionrand (leicht unscharf durch echten Tilt-Shift!) mit Werbebanden & Blumenkaesten weit oben
    pctx.fillStyle = '#e56f68';
    pctx.fillRect(0, 0, PW, 36);
    pctx.fillStyle = 'rgba(255,255,255,0.65)';
    pctx.fillRect(0, 36, PW, 2);
    for (let bi = 0, bx = 20; bx < 1600; bi++, bx += 160) {
      const sx = bx - camX;
      if (sx > -110 && sx < PW + 60) {
        OlyGame.Sprites.drawAdBoard(pctx, sx, 16, 92, 24, bi);
        OlyGame.Sprites.drawFlowerPlanter(pctx, sx + 104, 28, bi % 2 === 1);
      }
    }

    const lx = Math.round(LINE_X - camX);

    // 2. SCHRAEGE 3/4-ANLAUFBAHN (Speer) oder STOSSKREIS (Kugel) wie in sommerspiele.mp4 00:06 & 00:11!
    if (isJavelin) {
      // Schraege Abwurflinie (oben links -> unten rechts, +0.44 Neigung!)
      const topX = lx - 48;
      const botX = lx + 46;
      if (botX > -30) {
        // Warme korallenrote Tartan-Anlaufbahn mit schraegem Abschluss am Rasen!
        pctx.fillStyle = '#ee7b74';
        pctx.beginPath();
        pctx.moveTo(0, 92); pctx.lineTo(topX, 92);
        pctx.lineTo(botX, PH); pctx.lineTo(0, PH);
        pctx.closePath(); pctx.fill();

        // Mittlere Bahn-Spur
        pctx.fillStyle = '#e56d66';
        pctx.beginPath();
        pctx.moveTo(0, 152); pctx.lineTo(lx - 18, 152);
        pctx.lineTo(lx + 24, 232); pctx.lineTo(0, 232);
        pctx.closePath(); pctx.fill();

        // Weisse Bahn-Randlinien
        pctx.fillStyle = 'rgba(255,255,255,0.72)';
        pctx.fillRect(0, 152, Math.max(0, lx - 18), 2);
        pctx.fillRect(0, 232, Math.max(0, lx + 24), 2);

        // Dezente gruene Abwurfzone vor der schraegen Abwurflinie
        pctx.fillStyle = 'rgba(34,197,94,0.18)';
        pctx.beginPath();
        pctx.moveTo(lx - 135, 154); pctx.lineTo(lx - 18, 154);
        pctx.lineTo(lx + 22, 230); pctx.lineTo(lx - 95, 230);
        pctx.closePath(); pctx.fill();

        // Gestochen scharfe schraege weisse Abwurflinie!
        pctx.strokeStyle = '#ffffff'; pctx.lineWidth = 4;
        pctx.beginPath(); pctx.moveTo(topX, 92); pctx.lineTo(botX, PH); pctx.stroke();

        // Orange Pylonen entlang der Anlaufbahn (wie sommerspiele.mp4 00:06!)
        for (let cx = LINE_X - 420; cx < LINE_X - 40; cx += 72) {
          const px = cx - camX;
          if (px > -20 && px < PW + 20) {
            OlyGame.Sprites.drawCone(pctx, px, 146);
            OlyGame.Sprites.drawCone(pctx, px + 18, 240);
          }
        }
      }
      // Gelbe Distanzschilder vor der Linie (15m, 10m, 5m)
      [{ m: '15M', off: 440 }, { m: '10M', off: 290 }, { m: '5M', off: 140 }].forEach(d => {
        const mx = Math.round(LINE_X - d.off - camX);
        if (mx > -30 && mx < PW + 30) {
          pctx.fillStyle = '#facc15'; pctx.fillRect(mx - 12, 134, 24, 12);
          OlyGame.Sprites.drawPixelText(pctx, d.m, mx, 136, '#111827', 1, 'center');
        }
      });
    } else {
      // Kugelstossen: Korallenrote Plattform + schraeger Stosskreis + Sponsor-Banden, Richter & Kamera (wie sommerspiele.mp4!)
      const topX = lx - 12, botX = lx + 28;
      if (botX > -90) {
        pctx.fillStyle = '#ee7b74';
        pctx.beginPath(); pctx.moveTo(0, 128); pctx.lineTo(topX, 128); pctx.lineTo(botX, PH); pctx.lineTo(0, PH); pctx.closePath(); pctx.fill();
        OlyGame.Sprites.fillPixelEllipse(pctx, lx - 36, GROUND_Y - 2, 42, 24, '#cbd5e1');
        OlyGame.Sprites.fillPixelEllipse(pctx, lx - 36, GROUND_Y - 2, 38, 20, '#e5b869');
        pctx.strokeStyle = '#ffffff'; pctx.lineWidth = 2;
        pctx.beginPath(); pctx.ellipse(lx - 36, GROUND_Y - 2, 39, 21, 0, 0, Math.PI * 2); pctx.stroke();
        pctx.fillStyle = '#ffffff'; pctx.fillRect(lx + 2, GROUND_Y - 14, 6, 24);
        OlyGame.Sprites.fillPixelRoundRect(pctx, lx - 112, GROUND_Y - 6, 34, 13, '#1d4ed8');
        pctx.fillStyle = '#3b82f6'; pctx.fillRect(lx - 110, GROUND_Y - 5, 30, 4);
        for (let bi = 0; bi < 3; bi++) {
          OlyGame.Sprites.fillPixelEllipse(pctx, lx - 105 + bi * 9, GROUND_Y - 10, 3, 3, '#1e293b');
          pctx.fillStyle = '#cbd5e1'; pctx.fillRect(lx - 106 + bi * 9, GROUND_Y - 12, 1, 1);
        }
        OlyGame.Sprites.drawAdBoard(pctx, lx - 134, 62, 92, 24, 1);
        OlyGame.Sprites.drawFlowerPlanter(pctx, lx - 34, 76, false);
        OlyGame.Sprites.drawReferee(pctx, lx + 46, 108, { seated: true, darkSkin: true });
        OlyGame.Sprites.drawReferee(pctx, lx + 74, 108, { seated: true, greenCoat: true });
        OlyGame.Sprites.drawCameraman(pctx, lx + 106, 108, animT);
        OlyGame.Sprites.drawLedBoard(pctx, lx + 230, 74, 54, 38, animT);
      }
    }

    // 3. WEISSE WURFSEKTOR-LINIEN INS DIAGONALE GRAS + BLAUE FAEHNCHEN & ROTE DISTANZSTEINE (wie sommerspiele.mp4 00:07!)
    pctx.strokeStyle = 'rgba(255,255,255,0.88)'; pctx.lineWidth = 3;
    pctx.beginPath();
    pctx.moveTo(lx - 12, 162); pctx.lineTo(lx + 780, 96);
    pctx.moveTo(lx + 18, 222); pctx.lineTo(lx + 780, 266);
    pctx.stroke();

    const distMarks = isJavelin ? [20, 40, 60, 80, 95] : [10, 14, 18, 21, 23];
    distMarks.forEach(m => {
      const mx = Math.round(LINE_X + m * PX_PER_METER - camX);
      if (mx > -30 && mx < PW + 30) {
        // Exakte Y-Position entlang der oberen Sektorlinie fuer perfekte Perspektive!
        const frac = (m * PX_PER_METER) / 792;
        const secY = Math.round(162 - frac * 66);
        // Roter 3D-Distanzstein im Rasen
        pctx.fillStyle = 'rgba(30,65,28,0.28)'; pctx.fillRect(mx - 10, secY - 8, 22, 4);
        pctx.fillStyle = '#991b1b'; pctx.fillRect(mx - 11, secY - 22, 22, 16);
        pctx.fillStyle = '#dc2626'; pctx.fillRect(mx - 10, secY - 21, 20, 13);
        OlyGame.Sprites.drawPixelText(pctx, String(m), mx, secY - 18, '#ffffff', 1, 'center');
        // Kleines tuerkis-blaues Faehnchen an der Sektorlinie
        pctx.fillStyle = '#e2e8f0'; pctx.fillRect(mx, secY - 8, 1, 10);
        pctx.fillStyle = '#0284c7'; pctx.fillRect(mx + 1, secY - 8, 7, 4);
      }
    });

    // Kampfrichter + gelbes Laser-Messstativ an der Abwurflinie (wie sommerspiele.mp4 00:06-00:07!)
    if (lx > -70 && lx < PW + 80) {
      OlyGame.Sprites.drawReferee(pctx, lx - 66, 142, { seated: true, darkSkin: true });
      OlyGame.Sprites.drawReferee(pctx, lx - 36, 142, { seated: true, greenCoat: true });
      OlyGame.Sprites.drawReferee(pctx, lx + 8, 146, { seated: false });
      OlyGame.Sprites.drawPixelLimb(pctx, lx + 30, 134, lx + 25, 147, 2, '#ca8a04');
      OlyGame.Sprites.drawPixelLimb(pctx, lx + 30, 134, lx + 35, 147, 2, '#ca8a04');
      OlyGame.Sprites.fillPixelRoundRect(pctx, lx + 26, 127, 9, 8, '#facc15');
      pctx.fillStyle = '#0f172a'; pctx.fillRect(lx + 33, 129, 2, 4);
    }

    // 4. GROESSERER ATHLET (scale 1.22) + SPEER IN DER HAND + BODENSCHATTEN BEIM FLUG!
    if (entry && state) {
      let pose = isJavelin ? 'javelin_ready' : 'idle';
      let animVal = state.animPhase;
      if (state.phase === 'run') pose = isJavelin ? 'javelin_run' : 'run';
      else if (state.phase === 'spin') { pose = 'spin'; animVal = state.spinAngle; }
      else if (state.phase === 'aim') pose = 'throw_aim';
      else if (state.phase === 'fly') pose = 'throw_release';
      else if (state.phase === 'landed') pose = 'celebrate';
      else if (state.phase === 'foul') pose = 'stumble';

      OlyGame.Sprites.drawTrackShadows(pctx, camX, 92, PH - 92);
      const ax = state.x - camX;
      OlyGame.Sprites.drawAthlete(pctx, ax, GROUND_Y, entry.player.country, pose, animVal);

      if (state.phase !== 'fly' && state.phase !== 'landed') {
        if (!isJavelin && state.phase !== 'spin') {
          OlyGame.Sprites.fillPixelEllipse(pctx, Math.round(ax - 11), GROUND_Y - 21, 4, 4, '#1e293b');
          OlyGame.Sprites.fillPixelEllipse(pctx, Math.round(ax - 12), GROUND_Y - 22, 2, 2, '#64748b');
          pctx.fillStyle = '#e2e8f0'; pctx.fillRect(Math.round(ax - 13), GROUND_Y - 23, 1, 1);
        }
      }

      if (state.phase === 'fly' || state.phase === 'landed') {
        const px = state.projX - camX, py = state.projY;
        const alt = Math.max(0, GROUND_Y - py);
        const shAlpha = Math.max(0.12, 0.34 - alt * 0.0014);
        OlyGame.Sprites.fillPixelEllipse(pctx, px, GROUND_Y + 2, isJavelin ? 14 : 6, isJavelin ? 2 : 3, 'rgba(20,55,22,' + shAlpha.toFixed(2) + ')');
        if (!isJavelin) {
          OlyGame.Sprites.fillPixelEllipse(pctx, Math.round(px), Math.round(py - 4), 5, 5, '#1e293b');
          OlyGame.Sprites.fillPixelEllipse(pctx, Math.round(px - 1), Math.round(py - 5), 3, 3, '#64748b');
          pctx.fillStyle = '#e2e8f0'; pctx.fillRect(Math.round(px - 3), Math.round(py - 7), 2, 2);
        }
      }
    }

    particles.draw(pctx, camX);

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, z, fx, fy);

    if (isJavelin && entry && state) {
      function drawSleekJavelin(cx, cy, rotRad, showHandGrip) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotRad);
        const s = z;
        // Schlanker roter Schaft (endet EXAKT vor der silbernen Spitze - NULL Rot unter der Spitze!)
        ctx.fillStyle = '#991b1b';
        ctx.beginPath(); ctx.moveTo(-48 * s, 0.2 * s); ctx.lineTo(44 * s, -2.0 * s); ctx.lineTo(44 * s, 2.2 * s); ctx.lineTo(-48 * s, 1.4 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.moveTo(-48 * s, -1.0 * s); ctx.lineTo(44 * s, -2.4 * s); ctx.lineTo(44 * s, 0.6 * s); ctx.lineTo(-48 * s, 0.4 * s); ctx.closePath(); ctx.fill();
        // Weisse Griffwicklung in der Mitte
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(-7 * s, -2.4 * s, 14 * s, 4.8 * s);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-7 * s, 0.4 * s, 14 * s, 2.0 * s);
        // Rein silber-weisse Metallspitze (0% Rot!)
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath(); ctx.moveTo(43 * s, -2.2 * s); ctx.lineTo(68 * s, 0); ctx.lineTo(43 * s, 2.2 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(43 * s, -2.2 * s); ctx.lineTo(68 * s, 0); ctx.lineTo(43 * s, 0.2 * s); ctx.closePath(); ctx.fill();
        if (showHandGrip) {
          const cObj = OlyGame.CONFIG.getCountry(entry.player.country);
          ctx.fillStyle = cObj.skin;
          ctx.beginPath(); ctx.ellipse(0, 0.5 * s, 4.5 * s, 4.2 * s, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      if (state.phase !== 'fly' && state.phase !== 'landed') {
        const ax = state.x - camX, isAim = state.phase === 'aim', isRun = state.phase === 'run';
        const runStep = Math.floor((Math.abs(state.animPhase || 0) / (Math.PI * 2)) * 4) % 4;
        const runBob = (isRun && (runStep === 0 || runStep === 2)) ? -1.8 : 0;
        const handPxX = isAim ? (ax - 12) : (ax - 8);
        const handPxY = isAim ? (GROUND_Y - 19) : (GROUND_Y - 23 + runBob);
        const hp = OlyGame.Sprites.projectZoom(handPxX, handPxY, z, fx, fy);
        drawSleekJavelin(hp.x, hp.y, -((isAim ? state.angle : 14) * Math.PI) / 180, true);
      } else {
        const pp = OlyGame.Sprites.projectZoom(state.projX - camX, state.projY, z, fx, fy);
        drawSleekJavelin(pp.x, pp.y, state.phase === 'landed' ? 0.85 : state.projRot, false);
      }
    }

    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.14, 0.22);

    if (entry && state) {
      OlyGame.Sprites.drawAttemptDots(ctx, entry.attempts, currentRound, TOTAL_ATTEMPTS);
      OlyGame.Sprites.drawPill(ctx, 20, 18, entry.player.name + ' (' + entry.player.country + ')', OlyGame.CONFIG.PLAYER_COLORS[entry.player.slotIndex % 4], '#ffffff', false);
      OlyGame.Sprites.drawPill(ctx, 20, 58, 'VERSUCH ' + (currentRound + 1) + ' / ' + TOTAL_ATTEMPTS, '#f59e0b', '#111827', false);
      if (entry.best > 0) OlyGame.Sprites.drawPill(ctx, 940, 18, 'BESTE: ' + entry.best.toFixed(2) + ' m', '#1e293b', '#fde047', true);

      const proj = OlyGame.Sprites.projectZoom(state.x - camX, GROUND_Y, z, fx, fy);
      const sx = proj.x, sy = proj.y;

      if (state.phase === 'ready' && isMyTurn()) {
        OlyGame.Sprites.drawBigText(ctx, isJavelin ? 'A / D FÜR ANLAUF!' : 'A / D FÜR DREHSTOSS-SCHWUNG!', 480, 155, 36, '#fde047', 'center');
      }

      if (isJavelin && (state.phase === 'run' || state.phase === 'ready' || state.phase === 'aim')) {
        const pct = Math.min(1, state.vx / 192);
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        OlyGame.Sprites.roundRect(ctx, 22, 482, 260, 42, 10); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px "Segoe UI", sans-serif';
        ctx.fillText('ANLAUF-TEMPO', 34, 498);
        ctx.fillStyle = '#fde047'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(pct * 100) + '%', 270, 498); ctx.textAlign = 'left';
        ctx.fillStyle = '#334155'; ctx.fillRect(34, 505, 236, 11);
        ctx.fillStyle = pct > 0.85 ? '#22c55e' : (pct > 0.55 ? '#facc15' : '#fb923c');
        ctx.fillRect(34, 505, 236 * pct, 11);
        ctx.restore();
      }

      if (isJavelin && state.phase === 'run' && state.x > LINE_X - 180 && isMyTurn()) {
        OlyGame.Sprites.drawPill(ctx, 480 - 155, 92, '⚡ [LEERTASTE / A] HALTEN FÜR WURFWINKEL!', '#16a34a', '#ffffff', false);
      }

      if (!isJavelin && state.phase === 'spin') {
        const pct = state.power / 100;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        OlyGame.Sprites.roundRect(ctx, 300, 440, 360, 56, 12); ctx.fill();
        ctx.fillStyle = '#334155'; ctx.fillRect(320, 470, 320, 14);
        ctx.fillStyle = pct > 0.82 ? '#22c55e' : '#facc15'; ctx.fillRect(320, 470, 320 * pct, 14);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 15px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('DREHSCHWUNG AUFBAUEN! (' + state.spinTimer.toFixed(1) + 's)', 480, 460);
        ctx.restore();
      }

      if (state.phase === 'aim') {
        const optMin = isJavelin ? 35 : 39;
        const optMax = isJavelin ? 41 : 45;
        const cap = isJavelin ? 'IM GRÜNEN WINKEL LOSLASSEN!' : 'IM GRÜNEN WINKEL [LEERTASTE / A]!';
        // Positioniert etwas tiefer/rechts, damit die Kampfrichter oben frei sichtbar bleiben!
        OlyGame.Sprites.drawAngleArc(ctx, sx + 26, sy - 14, state.angle, optMin, optMax, cap);
      }

      if (state.feedback) {
        OlyGame.Sprites.drawSlantedCallout(ctx, state.feedback, 480, 148, state.foul ? '#ef4444' : '#fde047', state.feedbackAge, 48);
      }
    }

    OlyGame.Sprites.drawRecordBadges(ctx, ctxInfo.eventId);
  }

  return { init, update, render, onSyncIn };
};

OlyGame.Events.shotput = () => OlyGame.Events.createThrowEvent(false);
OlyGame.Events.javelin = () => OlyGame.Events.createThrowEvent(true);
