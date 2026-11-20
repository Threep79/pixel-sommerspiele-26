window.OlyGame = window.OlyGame || {};

OlyGame.Ceremony = (function () {
  let podium = [];
  let animT = 0;
  let confetti = [];
  let fireworks = [];
  let active = false;
  let fwTimer = 0.3;

  function start(rankedPlayers) {
    podium = (rankedPlayers || []).slice(0, 3);
    animT = 0; active = true; confetti = []; fireworks = []; fwTimer = 0.3;
    const cols = ['#facc15', '#38bdf8', '#ef4444', '#4ade80', '#a855f7', '#fb923c', '#ffffff'];
    for (let i = 0; i < 150; i++) {
      confetti.push({
        x: Math.random() * 480, y: Math.random() * -270,
        vx: (Math.random() - 0.5) * 28, vy: 22 + Math.random() * 38,
        w: 3 + Math.floor(Math.random() * 3), h: 2 + Math.floor(Math.random() * 2),
        color: cols[i % cols.length]
      });
    }
    OlyGame.Audio.fanfare();
  }
  function stop() { active = false; }

  function spawnFirework() {
    const cx = 70 + Math.random() * 340, cy = 22 + Math.random() * 52;
    const cols = ['#fde047', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#ffffff'];
    const col = cols[Math.floor(Math.random() * cols.length)];
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2, spd = 22 + Math.random() * 24;
      fireworks.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.7 + Math.random() * 0.4, maxLife: 1.0, color: col });
    }
  }

  function update(dt) {
    if (!active) return;
    animT += dt;
    fwTimer -= dt;
    if (fwTimer <= 0) { spawnFirework(); fwTimer = 0.85 + Math.random() * 0.55; }
    confetti.forEach(c => {
      c.x += c.vx * dt + Math.sin(animT * 3.2 + c.y * 0.08) * 12 * dt;
      c.y += c.vy * dt;
      if (c.y > 276) { c.y = -8; c.x = Math.random() * 480; }
    });
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i]; f.life -= dt;
      if (f.life <= 0) { fireworks.splice(i, 1); continue; }
      f.vy += 28 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    }
  }

  function render(pctx, ctx) {
    if (!active) return;
    const PW = OlyGame.CONFIG.PW, PH = OlyGame.CONFIG.PH;
    pctx.clearRect(0, 0, PW, PH);

    OlyGame.Sprites.drawStadiumBackdrop(ctx, 0, 74, animT * 1.4);
    OlyGame.Sprites.drawTexturedGrass(pctx, 0, 72, 118);

    pctx.fillStyle = '#ee7b74'; pctx.fillRect(0, 190, PW, PH - 190);
    pctx.fillStyle = 'rgba(255,255,255,0.72)'; pctx.fillRect(0, 190, PW, 2);

    // Roter Teppich mit Goldsaum zum Podest
    pctx.fillStyle = '#b91c1c';
    pctx.beginPath(); pctx.moveTo(148, 210); pctx.lineTo(332, 210); pctx.lineTo(366, PH); pctx.lineTo(114, PH); pctx.closePath(); pctx.fill();
    pctx.fillStyle = '#dc2626';
    pctx.beginPath(); pctx.moveTo(156, 210); pctx.lineTo(324, 210); pctx.lineTo(354, PH); pctx.lineTo(126, PH); pctx.closePath(); pctx.fill();
    pctx.strokeStyle = '#facc15'; pctx.lineWidth = 2;
    pctx.beginPath(); pctx.moveTo(152, 210); pctx.lineTo(120, PH); pctx.moveTo(328, 210); pctx.lineTo(360, PH); pctx.stroke();

    // Wimpelgirlande
    pctx.strokeStyle = '#f8fafc'; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.moveTo(0, 82); pctx.quadraticCurveTo(120, 102, 240, 84); pctx.quadraticCurveTo(360, 102, 480, 82); pctx.stroke();
    const bCols = ['#ef4444', '#facc15', '#38bdf8', '#4ade80', '#a855f7'];
    for (let i = 0; i < 24; i++) {
      const bx = 10 + i * 20, by = 84 + Math.round(Math.sin((i % 12) / 12 * Math.PI) * 12);
      pctx.fillStyle = bCols[i % 5];
      pctx.beginPath(); pctx.moveTo(bx - 5, by); pctx.lineTo(bx + 5, by); pctx.lineTo(bx, by + 9); pctx.closePath(); pctx.fill();
    }

    OlyGame.Sprites.drawLedBoard(pctx, 14, 114, 52, 36, animT);
    OlyGame.Sprites.drawLedBoard(pctx, 414, 114, 52, 36, animT);
    OlyGame.Sprites.drawReferee(pctx, 90, 166, { seated: false });
    OlyGame.Sprites.drawReferee(pctx, 390, 166, { seated: false, darkSkin: true });
    OlyGame.Sprites.drawFlowerPlanter(pctx, 74, 206, false);
    OlyGame.Sprites.drawFlowerPlanter(pctx, 108, 212, true);
    OlyGame.Sprites.drawFlowerPlanter(pctx, 344, 212, true);
    OlyGame.Sprites.drawFlowerPlanter(pctx, 378, 206, false);

    [{ idx: 1, x: 170, top: 104 }, { idx: 0, x: 240, top: 88 }, { idx: 2, x: 310, top: 112 }].forEach(fp => {
      const pl = podium[fp.idx]; if (!pl) return;
      pctx.fillStyle = '#cbd5e1'; pctx.fillRect(fp.x - 1, fp.top, 2, 174 - fp.top);
      pctx.fillStyle = '#facc15'; pctx.fillRect(fp.x - 2, fp.top - 2, 4, 3);
      OlyGame.Sprites.drawFlag(pctx, pl.country, fp.x + 1, fp.top + 2, 26, 17);
    });

    // Proportionales, schickes 3D-Podest (204px breit, 20/30/15px hoch!)
    const baseY = 216;
    OlyGame.Sprites.fillPixelEllipse(pctx, 240, baseY + 2, 112, 7, 'rgba(35,10,18,0.28)');
    // Stufe 2
    pctx.fillStyle = '#1e40af'; pctx.fillRect(138, baseY - 20, 68, 20);
    pctx.fillStyle = '#2563eb'; pctx.fillRect(140, baseY - 19, 64, 17);
    pctx.fillStyle = '#60a5fa'; pctx.fillRect(136, baseY - 24, 70, 5);
    pctx.fillStyle = '#bfdbfe'; pctx.fillRect(138, baseY - 24, 66, 2);
    // Stufe 3
    pctx.fillStyle = '#1e40af'; pctx.fillRect(274, baseY - 15, 68, 15);
    pctx.fillStyle = '#2563eb'; pctx.fillRect(276, baseY - 14, 64, 12);
    pctx.fillStyle = '#60a5fa'; pctx.fillRect(274, baseY - 19, 70, 5);
    pctx.fillStyle = '#bfdbfe'; pctx.fillRect(276, baseY - 19, 66, 2);
    // Stufe 1
    pctx.fillStyle = '#1e3a8a'; pctx.fillRect(204, baseY - 30, 72, 30);
    pctx.fillStyle = '#2563eb'; pctx.fillRect(206, baseY - 29, 68, 28);
    pctx.fillStyle = '#38bdf8'; pctx.fillRect(202, baseY - 34, 76, 5);
    pctx.fillStyle = '#e0f2fe'; pctx.fillRect(204, baseY - 34, 72, 2);
    pctx.fillStyle = '#facc15'; pctx.fillRect(204, baseY - 29, 72, 2);
    pctx.strokeStyle = 'rgba(224,242,254,0.6)'; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.arc(235, baseY - 22, 4, 0, Math.PI * 2); pctx.stroke();
    pctx.beginPath(); pctx.arc(245, baseY - 22, 4, 0, Math.PI * 2); pctx.stroke();

    [{ n: '2', x: 172, y: baseY - 13, rim: '#cbd5e1' }, { n: '1', x: 240, y: baseY - 14, rim: '#facc15' }, { n: '3', x: 308, y: baseY - 11, rim: '#fb923c' }].forEach(nb => {
      OlyGame.Sprites.fillPixelRoundRect(pctx, nb.x - 8, nb.y - 3, 16, 13, nb.rim);
      OlyGame.Sprites.fillPixelRoundRect(pctx, nb.x - 7, nb.y - 2, 14, 11, '#f8fafc');
      OlyGame.Sprites.drawPixelText(pctx, nb.n, nb.x, nb.y, '#1e293b', 1, 'center');
    });

    const spots = [
      { idx: 1, x: 172, y: baseY - 23, medal: '#cbd5e1' },
      { idx: 0, x: 240, y: baseY - 33, medal: '#facc15' },
      { idx: 2, x: 308, y: baseY - 18, medal: '#fb923c' }
    ];
    spots.forEach(sp => {
      const pl = podium[sp.idx]; if (!pl) return;
      OlyGame.Sprites.drawAthlete(pctx, sp.x, sp.y, pl.country, 'celebrate', animT + sp.idx, { scale: 1.15 });
      const bounceY = Math.round(Math.abs(Math.sin((animT + sp.idx) * 4.8)) * -2);
      pctx.fillStyle = '#0ea5e9'; pctx.fillRect(sp.x - 3, sp.y - 22 + bounceY, 6, 3);
      OlyGame.Sprites.fillPixelEllipse(pctx, sp.x, sp.y - 18 + bounceY, 3, 3, sp.medal);
      if (sp.idx === 0) {
        const py = sp.y - 38 + bounceY;
        pctx.fillStyle = '#facc15'; pctx.fillRect(sp.x + 9, py, 9, 7); pctx.fillRect(sp.x + 12, py + 7, 3, 4); pctx.fillRect(sp.x + 10, py + 11, 7, 2);
        pctx.fillStyle = '#fef08a'; pctx.fillRect(sp.x + 10, py + 1, 2, 4);
      } else if (sp.idx === 1) {
        const fy = sp.y - 31 + bounceY;
        pctx.fillStyle = '#16a34a'; pctx.fillRect(sp.x + 9, fy + 4, 3, 6);
        OlyGame.Sprites.fillPixelEllipse(pctx, sp.x + 10, fy + 2, 5, 4, '#22c55e');
        pctx.fillStyle = '#ef4444'; pctx.fillRect(sp.x + 7, fy, 3, 3);
        pctx.fillStyle = '#facc15'; pctx.fillRect(sp.x + 11, fy - 1, 3, 3);
      }
    });

    OlyGame.Sprites.drawPhotographer(pctx, 64, 258, animT, false);
    OlyGame.Sprites.drawPhotographer(pctx, 416, 258, animT, true);

    fireworks.forEach(f => {
      pctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife));
      pctx.fillStyle = f.color; pctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 2);
    });
    pctx.globalAlpha = 1;
    confetti.forEach(c => { pctx.fillStyle = c.color; pctx.fillRect(Math.round(c.x), Math.round(c.y), c.w, c.h); });

    OlyGame.Sprites.compositePixelLayer(ctx, pctx, 1.0);
    OlyGame.Sprites.drawTiltShiftOverlay(ctx, 0.10, 0.16);

    spots.forEach(sp => {
      const pl = podium[sp.idx]; if (!pl) return;
      if (pl.playerIndex >= 0) OlyGame.Sprites.drawPlayerPin(ctx, sp.x, sp.y - 44, pl.playerIndex);
      ctx.save(); ctx.font = '900 18px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillText(pl.name, sp.x * 2 + 2, 460);
      ctx.fillStyle = '#ffffff'; ctx.fillText(pl.name, sp.x * 2, 458);
      ctx.restore();
    });

    OlyGame.Sprites.drawPill(ctx, 24, 22, '🏆 SIEGEREHRUNG', 'rgba(30,27,75,0.92)', '#fde047', false);
    OlyGame.Sprites.drawPill(ctx, 936, 488, '[Xbox A / LEERTASTE / KLICK] Weiter zur Lobby', 'rgba(15,23,42,0.9)', '#fde047', true);
  }

  return { start, stop, update, render, isActive: () => active };
})();
