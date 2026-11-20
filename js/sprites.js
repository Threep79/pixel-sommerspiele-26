window.OlyGame = window.OlyGame || {};

OlyGame.Sprites = (function () {
  const FW = 40, FH = 40;
  const NPC_W = 48, NPC_H = 52;

  const athleteSheets = {};
  OlyGame.CONFIG.COUNTRIES.forEach(c => {
    const img = new Image();
    img.src = 'assets/sprites/athlete_' + c.code + '.png';
    athleteSheets[c.code] = img;
  });

  const npcSheet = new Image();
  npcSheet.src = 'assets/sprites/npcs.png';

  const bgImages = {};
  ['stadium_far', 'arena_weightlifting', 'range_skeet', 'pool_deck', 'range_archery', 'turf_tile'].forEach(name => {
    const img = new Image();
    img.src = 'assets/bg/' + name + '.png';
    bgImages[name] = img;
  });

  const propImages = {};
  ['planter_warm', 'planter_cool', 'led_board', 'ad_0', 'ad_1', 'ad_2', 'ad_3', 'ad_4', 'ad_5'].forEach(name => {
    const img = new Image();
    img.src = 'assets/props/' + name + '.png';
    propImages[name] = img;
  });

  function isReady(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  // 5x7 PIXEL BITMAP FONT
  const FONT = {
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'B': ['11110','10001','10001','11110','10001','10001','11110'],
    'C': ['01110','10001','10000','10000','10000','10001','01110'],
    'D': ['11110','10001','10001','10001','10001','10001','11110'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'F': ['11111','10000','10000','11110','10000','10000','10000'],
    'G': ['01110','10001','10000','10111','10001','10001','01110'],
    'H': ['10001','10001','10001','11111','10001','10001','10001'],
    'I': ['01110','00100','00100','00100','00100','00100','01110'],
    'J': ['00111','00010','00010','00010','10010','10010','01100'],
    'K': ['10001','10010','10100','11000','10100','10010','10001'],
    'L': ['10000','10000','10000','10000','10000','10000','11111'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
    'N': ['10001','11001','10101','10011','10001','10001','10001'],
    'O': ['01110','10001','10001','10001','10001','10001','01110'],
    'P': ['11110','10001','10001','11110','10000','10000','10000'],
    'Q': ['01110','10001','10001','10001','10101','10010','01101'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'S': ['01111','10000','10000','01110','00001','00001','11110'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    'U': ['10001','10001','10001','10001','10001','10001','01110'],
    'V': ['10001','10001','10001','10001','01010','01010','00100'],
    'W': ['10001','10001','10001','10101','10101','11011','10001'],
    'X': ['10001','10001','01010','00100','01010','10001','10001'],
    'Y': ['10001','10001','01010','00100','00100','00100','00100'],
    'Z': ['11111','00001','00010','00100','01000','10000','11111'],
    '0': ['01110','10011','10101','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00110','01000','10000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','11110','00001','00001','10001','01110'],
    '6': ['01110','10000','11110','10001','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00001','01110'],
    "'": ['00100','00100','01000','00000','00000','00000','00000'],
    '.': ['00000','00000','00000','00000','00000','01100','01100'],
    '-': ['00000','00000','00000','11111','00000','00000','00000'],
    '!': ['00100','00100','00100','00100','00100','00000','00100'],
    '>': ['10000','01000','00100','00010','00100','01000','10000'],
    ' ': ['00000','00000','00000','00000','00000','00000','00000']
  };

  function drawPixelText(pctx, text, x, y, color, scale, align, shadowColor) {
    const str = String(text || '').toUpperCase();
    const sc = scale || 1;
    const charW = 6 * sc;
    const totalW = str.length * charW - sc;
    let sx = Math.round(x);
    if (align === 'center') sx = Math.round(x - totalW / 2);
    else if (align === 'right') sx = Math.round(x - totalW);
    const sy = Math.round(y);
    for (let cIdx = 0; cIdx < str.length; cIdx++) {
      const ch = FONT[str[cIdx]] || FONT[' '];
      const cx = sx + cIdx * charW;
      for (let r = 0; r < 7; r++) {
        const row = ch[r];
        for (let col = 0; col < 5; col++) {
          if (row[col] === '1') {
            if (shadowColor) { pctx.fillStyle = shadowColor; pctx.fillRect(cx + col * sc + sc, sy + r * sc + sc, sc, sc); }
            pctx.fillStyle = color; pctx.fillRect(cx + col * sc, sy + r * sc, sc, sc);
          }
        }
      }
    }
  }

  function drawPixelLimb(pctx, x0, y0, x1, y1, thickness, color, shadeColor) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const half = Math.floor(thickness / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(x0 + dx * t) - half;
      const py = Math.round(y0 + dy * t) - half;
      if (shadeColor) { pctx.fillStyle = shadeColor; pctx.fillRect(px, py + 1, thickness, thickness); }
      pctx.fillStyle = color; pctx.fillRect(px, py, thickness, thickness);
    }
  }

  function fillPixelRoundRect(pctx, x, y, w, h, color) {
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    pctx.fillStyle = color;
    if (rw <= 2 || rh <= 2) { pctx.fillRect(rx, ry, rw, rh); return; }
    pctx.fillRect(rx + 1, ry, rw - 2, rh);
    pctx.fillRect(rx, ry + 1, rw, rh - 2);
  }

  function fillPixelEllipse(pctx, cx, cy, rx, ry, color) {
    pctx.fillStyle = color;
    const x0 = Math.round(cx), y0 = Math.round(cy);
    for (let dy = -ry; dy <= ry; dy++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.01))));
      if (span > 0) pctx.fillRect(x0 - span, y0 + dy, span * 2, 1);
    }
  }

  // C64/AMIGA LAENDERFLAGGEN
  function drawFlag(ctx, countryCode, x, y, w, h) {
    const c = OlyGame.CONFIG.getCountry(countryCode);
    const f = c.flag;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    if (f.type === 'h3') {
      const sh = Math.floor(rh / 3);
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, sh);
      ctx.fillStyle = f.colors[1]; ctx.fillRect(rx, ry + sh, rw, sh);
      ctx.fillStyle = f.colors[2]; ctx.fillRect(rx, ry + sh * 2, rw, rh - sh * 2);
    } else if (f.type === 'h2') {
      const sh = Math.floor(rh / 2);
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, sh);
      ctx.fillStyle = f.colors[1]; ctx.fillRect(rx, ry + sh, rw, rh - sh);
    } else if (f.type === 'v3') {
      const sw = Math.floor(rw / 3);
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, sw, rh);
      ctx.fillStyle = f.colors[1]; ctx.fillRect(rx + sw, ry, sw, rh);
      ctx.fillStyle = f.colors[2]; ctx.fillRect(rx + sw * 2, ry, rw - sw * 2, rh);
    } else if (f.type === 'dot') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[1];
      const r = Math.max(2, Math.floor(rh * 0.28));
      ctx.fillRect(rx + Math.floor(rw / 2) - r, ry + Math.floor(rh / 2) - r, r * 2, r * 2);
    } else if (f.type === 'plus') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[1];
      const bw = Math.max(2, Math.floor(rh * 0.22)), len = Math.floor(rh * 0.65);
      ctx.fillRect(rx + Math.floor((rw - bw) / 2), ry + Math.floor((rh - len) / 2), bw, len);
      ctx.fillRect(rx + Math.floor((rw - len) / 2), ry + Math.floor((rh - bw) / 2), len, bw);
    } else if (f.type === 'nordic') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[1];
      const bw = Math.max(2, Math.floor(rh * 0.22));
      ctx.fillRect(rx, ry + Math.floor((rh - bw) / 2), rw, bw);
      ctx.fillRect(rx + Math.floor(rw * 0.3), ry, bw, rh);
    } else if (f.type === 'usa') {
      ctx.fillStyle = f.colors[1]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[0];
      for (let i = 0; i < rh; i += 3) ctx.fillRect(rx, ry + i, rw, 2);
      ctx.fillStyle = f.colors[2]; ctx.fillRect(rx, ry, Math.floor(rw * 0.45), Math.floor(rh * 0.55));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx + 2, ry + 2, 1, 1); ctx.fillRect(rx + 5, ry + 2, 1, 1); ctx.fillRect(rx + 3, ry + 5, 1, 1);
    } else if (f.type === 'uk') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[1];
      ctx.fillRect(rx, ry + Math.floor(rh * 0.35), rw, Math.max(3, Math.floor(rh * 0.3)));
      ctx.fillRect(rx + Math.floor(rw * 0.4), ry, Math.max(3, Math.floor(rw * 0.2)), rh);
      ctx.fillStyle = f.colors[2];
      ctx.fillRect(rx, ry + Math.floor(rh * 0.42), rw, Math.max(2, Math.floor(rh * 0.16)));
      ctx.fillRect(rx + Math.floor(rw * 0.44), ry, Math.max(2, Math.floor(rw * 0.12)), rh);
    } else if (f.type === 'cross_x') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[2];
      ctx.fillRect(rx, ry + Math.floor(rh * 0.25), Math.floor(rw * 0.22), Math.floor(rh * 0.5));
      ctx.fillRect(rx + rw - Math.floor(rw * 0.22), ry + Math.floor(rh * 0.25), Math.floor(rw * 0.22), Math.floor(rh * 0.5));
      ctx.strokeStyle = f.colors[1]; ctx.lineWidth = Math.max(2, Math.floor(rh * 0.16));
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry + rh); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx, ry + rh); ctx.stroke();
    } else if (f.type === 'diamond') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[1];
      ctx.beginPath();
      ctx.moveTo(rx + rw / 2, ry + 2); ctx.lineTo(rx + rw - 2, ry + rh / 2);
      ctx.lineTo(rx + rw / 2, ry + rh - 2); ctx.lineTo(rx + 2, ry + rh / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = f.colors[2];
      const r = Math.max(2, Math.floor(rh * 0.2));
      ctx.fillRect(rx + Math.floor(rw / 2) - r, ry + Math.floor(rh / 2) - r, r * 2, r * 2);
    } else if (f.type === 'aus') {
      ctx.fillStyle = f.colors[0]; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = f.colors[2];
      ctx.fillRect(rx, ry + 3, Math.floor(rw * 0.45), 2);
      ctx.fillRect(rx + Math.floor(rw * 0.2), ry, 2, Math.floor(rh * 0.45));
      ctx.fillStyle = f.colors[1];
      ctx.fillRect(rx + Math.floor(rw * 0.7), ry + Math.floor(rh * 0.3), 2, 2);
      ctx.fillRect(rx + Math.floor(rw * 0.8), ry + Math.floor(rh * 0.6), 2, 2);
      ctx.fillRect(rx + Math.floor(rw * 0.6), ry + Math.floor(rh * 0.7), 2, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    ctx.restore();
  }

  // --- LINELESS 43-FRAME CHIBI-ATHLET (12-FRAME SPRINT MIT KNIEGELENKEN!) ---
  function getFrameIndex(pose, phase) {
    const p = Math.abs(phase || 0);
    if (pose === 'run' || pose === 'vault_run') return Math.floor((p / (Math.PI * 2)) * 16) % 16;
    if (pose === 'idle') return 16 + (Math.floor(p * 1.4) % 2);
    if (pose === 'crouch') return 18;
    if (pose === 'hurdle_up') return 19;
    if (pose === 'hurdle_peak' || pose === 'hurdle') return 20;
    if (pose === 'hurdle_down') return 21;
    if (pose === 'jump_up') return 22;
    if (pose === 'jump_peak' || pose === 'jump') return 23;
    if (pose === 'jump_down') return 24;
    if (pose === 'jump_land') return 25;
    if (pose === 'vault_carry') return 26;
    if (pose === 'vault_bend') return 27;
    if (pose === 'vault_clear') return 28;
    if (pose === 'vault_land') return 29;
    if (pose === 'throw_aim') return 30;
    if (pose === 'throw_release') return 31;
    if (pose === 'spin') return 32 + (Math.floor((p / (Math.PI * 2)) * 8) % 8);
    if (pose === 'stumble') return 40;
    if (pose === 'front') return 41;
    if (pose === 'celebrate') return 42 + (Math.floor(p * 4.8) % 2);
    if (pose === 'lift_ready') return 44;
    if (pose === 'lift_pull') return 45;
    if (pose === 'lift_clean') return 46;
    if (pose === 'lift_jerk') return 47;
    if (pose === 'archery_back') return 53;
    if (pose === 'archery_draw') return 54;
    if (pose === 'javelin_ready') return 55;
    if (pose === 'javelin_run') return 56 + (Math.floor((p / (Math.PI * 2)) * 4) % 4);
    return 16;
  }

  function drawAthlete(pctx, x, y, countryCode, pose, phase, opts) {
    const o = opts || {};
    const rx = Math.round(x), ry = Math.round(y);
    const sc = o.scale || 1.0;
    const sheet = athleteSheets[countryCode] || athleteSheets['GER'];

    pctx.save();
    pctx.translate(rx, ry);

    if (!o.noShadow) {
      const shY = Math.round(o.shadowOffsetY || 0);
      const scaleSh = Math.max(0.36, 1 - Math.abs(shY) / 115) * sc;
      fillPixelEllipse(pctx, 0, shY, Math.round(11 * scaleSh), Math.round(3.6 * scaleSh), 'rgba(72, 18, 24, 0.24)');
    }
    if (o.facing === -1) pctx.scale(-1, 1);

    if (isReady(sheet)) {
      const frame = getFrameIndex(pose, phase);
      const dw = Math.round(FW * sc), dh = Math.round(FH * sc);
      const ox = Math.round(-20 * sc), oy = Math.round(-37 * sc);

      if (pose === 'vault_clear' && o.bodyRot) {
        pctx.translate(0, Math.round(-18 * sc));
        pctx.rotate(o.bodyRot);
        pctx.drawImage(sheet, frame * FW, 0, FW, FH, ox, Math.round(-20 * sc), dw, dh);
      } else {
        pctx.drawImage(sheet, frame * FW, 0, FW, FH, ox, oy, dw, dh);
      }

      if (pose === 'spin') {
        const ang = (phase || 0) % (Math.PI * 2);
        if (Math.sin(ang) >= -0.35) {
          const sx = Math.round(Math.cos(ang) * 8 * sc);
          fillPixelEllipse(pctx, sx, Math.round(-20 * sc), 4, 4, '#1e293b');
          fillPixelEllipse(pctx, sx - 1, Math.round(-21 * sc), 2, 2, '#64748b');
          pctx.fillStyle = '#e2e8f0'; pctx.fillRect(sx - 2, Math.round(-22 * sc), 1, 1);
        }
      }
    }
    pctx.restore();
  }

  function drawSwimmer(pctx, x, y, countryCode, phase, dir, breathing, diving) {
    const rx = Math.round(x), ry = Math.round(y);
    const sheet = athleteSheets[countryCode] || athleteSheets['GER'];
    pctx.save();
    pctx.translate(rx, ry);
    if (dir === 1) pctx.scale(1, -1);

    fillPixelEllipse(pctx, 2, 3, 9, 15, 'rgba(8, 42, 92, 0.34)');
    if (isReady(sheet)) {
      let frame = 52;
      if (!diving) {
        const idx = Math.floor((Math.abs(phase || 0) / (Math.PI * 2)) * 4) % 4;
        frame = 48 + (breathing ? 2 : idx);
      }
      pctx.drawImage(sheet, frame * FW, 0, FW, FH, -22, -22, 44, 44);
    }
    pctx.restore();
  }

  // Ruhiger, statischer Untergrund ohne wandernde Schattenbalken
  function drawTrackShadows(pctx, camX, topY, height) {
    // intentionally clean: no sliding shadow bars over turf or track
  }

  // Suesse schwebende Kamera-Drohne ueber dem Schwimmbecken (wie sommerspiele.mp4 00:11!)
  function drawCameraDrone(pctx, x, y, animT) {
    const rx = Math.round(x);
    const ry = Math.round(y + Math.sin((animT || 0) * 3.2) * 2.5);
    const propSpin = Math.floor((animT || 0) * 22) % 2 === 0;
    pctx.save();
    // Weicher Schatten auf dem Wasser darunter
    fillPixelEllipse(pctx, rx + 4, ry + 18, 14, 5, 'rgba(8, 42, 92, 0.24)');
    // 4 Ausleger-Arme
    drawPixelLimb(pctx, rx - 14, ry - 7, rx + 14, ry + 7, 2, '#92400e');
    drawPixelLimb(pctx, rx - 14, ry + 7, rx + 14, ry - 7, 2, '#92400e');
    // 4 drehende Rotoren
    const rotors = [[-14, -7], [14, -7], [-14, 7], [14, 7]];
    rotors.forEach(([dx, dy]) => {
      fillPixelEllipse(pctx, rx + dx, ry + dy, 5, 5, 'rgba(226, 232, 240, 0.35)');
      pctx.fillStyle = propSpin ? '#f8fafc' : '#94a3b8';
      pctx.fillRect(rx + dx - (propSpin ? 4 : 1), ry + dy - (propSpin ? 1 : 4), propSpin ? 8 : 2, propSpin ? 2 : 8);
      pctx.fillStyle = '#ca8a04';
      pctx.fillRect(rx + dx - 1, ry + dy - 1, 2, 2);
    });
    // Mittelkoerper + Kamera-Linse
    fillPixelRoundRect(pctx, rx - 7, ry - 5, 14, 10, '#d97706');
    fillPixelRoundRect(pctx, rx - 5, ry - 3, 10, 6, '#f59e0b');
    fillPixelEllipse(pctx, rx, ry + 1, 3, 3, '#1e293b');
    pctx.fillStyle = '#38bdf8'; pctx.fillRect(rx - 1, ry, 2, 2);
    pctx.restore();
  }

  // --- KAMERA-ZOOM & TILT-SHIFT MINIATUR-DIORAMA-EFFEKT! ---
  // Zeichnet pctx (480x270) mit optionalem weichem Kamera-Zoom + Fokus auf Display-Canvas (960x540)
  function compositePixelLayer(ctx, pctx, zoom, focusPxX, focusPxY) {
    const CW = OlyGame.CONFIG.CW, CH = OlyGame.CONFIG.CH;
    const z = zoom || 1.0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (z <= 1.002) {
      ctx.drawImage(pctx.canvas, 0, 0, CW, CH);
    } else {
      const fx = (focusPxX !== undefined ? focusPxX : 240) * 2;
      const fy = (focusPxY !== undefined ? focusPxY : 135) * 2;
      // Zoom-Zentrum sanft begrenzen, damit keine leeren Raender entstehen!
      const halfW = (CW / 2) / z;
      const halfH = (CH / 2) / z;
      const clampedX = Math.max(halfW, Math.min(CW - halfW, fx));
      const clampedY = Math.max(halfH, Math.min(CH - halfH, fy));
      ctx.translate(CW / 2, CH / 2);
      ctx.scale(z, z);
      ctx.translate(-clampedX, -clampedY);
      ctx.drawImage(pctx.canvas, 0, 0, CW, CH);
    }
    ctx.restore();
  }

  // Transformiert eine Pixel-Koordinate (px, py) durch den aktuellen Kamera-Zoom fuer praezise High-Res Pins/Arcs!
  function projectZoom(px, py, zoom, focusPxX, focusPxY) {
    const CW = OlyGame.CONFIG.CW, CH = OlyGame.CONFIG.CH;
    const z = zoom || 1.0;
    const sx = px * 2, sy = py * 2;
    if (z <= 1.002) return { x: sx, y: sy };
    const fx = (focusPxX !== undefined ? focusPxX : 240) * 2;
    const fy = (focusPxY !== undefined ? focusPxY : 135) * 2;
    const halfW = (CW / 2) / z, halfH = (CH / 2) / z;
    const cx = Math.max(halfW, Math.min(CW - halfW, fx));
    const cy = Math.max(halfH, Math.min(CH - halfH, fy));
    return {
      x: (sx - cx) * z + CW / 2,
      y: (sy - cy) * z + CH / 2
    };
  }

  // Echte optische Miniatur-Tilt-Shift-Unschaerfe (wie in sommerspiele.mp4!)
  const tiltCanvas = document.createElement('canvas');
  tiltCanvas.width = 480;
  tiltCanvas.height = 80;
  const tiltCtx = tiltCanvas.getContext('2d');

  function applyBlurredBand(ctx, srcY, bandH, fromTop) {
    const CW = OlyGame.CONFIG.CW;
    const bw = 480, bh = Math.max(12, Math.min(80, Math.round(bandH / 2)));
    try {
      tiltCtx.clearRect(0, 0, bw, bh);
      tiltCtx.save();
      tiltCtx.filter = 'blur(2.6px)';
      tiltCtx.drawImage(ctx.canvas, 0, srcY, CW, bandH, 0, 0, bw, bh);
      tiltCtx.restore();

      // Weiche Alpha-Ausblendung zur Bildmitte hin (destination-in Maske)
      tiltCtx.save();
      tiltCtx.globalCompositeOperation = 'destination-in';
      const g = tiltCtx.createLinearGradient(0, 0, 0, bh);
      if (fromTop) {
        g.addColorStop(0, 'rgba(0,0,0,0.92)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0.92)');
      }
      tiltCtx.fillStyle = g;
      tiltCtx.fillRect(0, 0, bw, bh);
      tiltCtx.restore();

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tiltCanvas, 0, 0, bw, bh, 0, srcY, CW, bandH);
      ctx.restore();
    } catch (e) {}
  }

  function drawTiltShiftOverlay(ctx, topStrength, bottomStrength) {
    const CW = OlyGame.CONFIG.CW, CH = OlyGame.CONFIG.CH;
    if (topStrength !== 0) {
      applyBlurredBand(ctx, 0, 96, true);
    }
    if (bottomStrength !== 0) {
      applyBlurredBand(ctx, CH - 84, 84, false);
    }
    // Sehr sanfte warme Sommer-Vignette fuer echte Tiefe
    ctx.save();
    if (topStrength !== 0) {
      const gTop = ctx.createLinearGradient(0, 0, 0, 72);
      gTop.addColorStop(0, 'rgba(255, 246, 232, ' + ((topStrength || 0.12) * 0.65) + ')');
      gTop.addColorStop(1, 'rgba(255, 246, 232, 0)');
      ctx.fillStyle = gTop;
      ctx.fillRect(0, 0, CW, 72);
    }
    if (bottomStrength !== 0) {
      const gBot = ctx.createLinearGradient(0, CH - 64, 0, CH);
      gBot.addColorStop(0, 'rgba(34, 14, 24, 0)');
      gBot.addColorStop(1, 'rgba(34, 14, 24, ' + ((bottomStrength || 0.2) * 0.65) + ')');
      ctx.fillStyle = gBot;
      ctx.fillRect(0, CH - 64, CW, 64);
    }
    ctx.restore();
  }

  // --- STADION-HINTERGRUENDE & PROPS (LED-TAFELN, FOTOGRAFEN, SCHILDER) ---
  function drawStadiumBackdrop(ctx, camX, destH_px, animT, zoom, focusPxX, focusPxY) {
    const img = bgImages.stadium_far;
    const destH = Math.round((destH_px || 64) * 2);
    ctx.save();
    if (zoom && zoom > 1.002) {
      const CW = OlyGame.CONFIG.CW, CH = OlyGame.CONFIG.CH;
      const fx = (focusPxX !== undefined ? focusPxX : 240) * 2;
      const fy = (focusPxY !== undefined ? focusPxY : 135) * 2;
      const halfW = (CW / 2) / zoom, halfH = (CH / 2) / zoom;
      const cx = Math.max(halfW, Math.min(CW - halfW, fx));
      const cy = Math.max(halfH, Math.min(CH - halfH, fy));
      ctx.translate(CW / 2, CH / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
    if (isReady(img)) {
      ctx.imageSmoothingEnabled = true;
      const w = img.naturalWidth;
      const scroll = ((Math.floor((camX || 0) * 0.45 * 2) % w) + w) % w;
      ctx.drawImage(img, -scroll, 0, w, destH);
      ctx.drawImage(img, w - scroll, 0, w, destH);

      const t = animT || 0;
      for (let i = 0; i < 6; i++) {
        const pulse = Math.sin(t * (3.7 + i * 1.1) + i * 19.3);
        if (pulse > 0.94) {
          const fx = ((i * 173 + Math.floor(t * 20) * 31) % 920) + 20;
          const fy = destH * 0.48 + (i % 3) * (destH * 0.14);
          ctx.fillStyle = 'rgba(255, 255, 240, 0.92)';
          ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.beginPath(); ctx.arc(fx, fy, 11, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(0, 0, 960, destH);
    }
    ctx.restore();
  }

  function drawFullBackdrop(ctx, bgName, zoom, focusPxX, focusPxY) {
    const img = bgImages[bgName];
    if (!isReady(img)) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const CW = OlyGame.CONFIG.CW, CH = OlyGame.CONFIG.CH;
    if (zoom && zoom > 1.002) {
      const fx = (focusPxX !== undefined ? focusPxX : 240) * 2;
      const fy = (focusPxY !== undefined ? focusPxY : 135) * 2;
      const halfW = (CW / 2) / zoom, halfH = (CH / 2) / zoom;
      const cx = Math.max(halfW, Math.min(CW - halfW, fx));
      const cy = Math.max(halfH, Math.min(CH - halfH, fy));
      ctx.translate(CW / 2, CH / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(img, 0, 0, CW, CH);
    ctx.restore();
    return true;
  }

  function drawStadiumStands(pctx, camX, bottomY) {
    const img = bgImages.stadium_far;
    if (isReady(img)) {
      pctx.save();
      pctx.imageSmoothingEnabled = true;
      const tileW = 480;
      const scroll = ((Math.floor((camX || 0) * 0.45) % tileW) + tileW) % tileW;
      pctx.drawImage(img, -scroll, 0, tileW, bottomY);
      pctx.drawImage(img, tileW - scroll, 0, tileW, bottomY);
      pctx.restore();
    } else {
      pctx.fillStyle = '#60a5fa'; pctx.fillRect(0, 0, pctx.canvas.width, bottomY);
    }
  }

  // Organischer, sonnengefleckter Stadionrasen mit diagonalen Maehstreifen (turf_tile.png!)
  function drawTexturedGrass(pctx, camX, y, h) {
    const PW = pctx.canvas.width;
    const tile = bgImages.turf_tile;
    if (isReady(tile)) {
      pctx.save();
      pctx.beginPath();
      pctx.rect(0, y, PW, h);
      pctx.clip();
      const tw = tile.naturalWidth;  // 256
      const th = tile.naturalHeight; // 256
      const ox = ((Math.floor(camX || 0) % tw) + tw) % tw;
      for (let ty = y - (y % th); ty < y + h + th; ty += th) {
        for (let tx = -ox; tx < PW + tw; tx += tw) {
          pctx.drawImage(tile, tx, ty);
        }
      }
      pctx.restore();
    } else {
      pctx.fillStyle = '#74c855';
      pctx.fillRect(0, y, PW, h);
    }
  }

  // 2.5D Gerundete LED-Punktmatrix-Tafel mit animierten Lichtpunkten!
  function drawLedBoard(pctx, x, y, w, h, animT) {
    const rx = Math.round(x), ry = Math.round(y);
    const img = propImages.led_board;
    if (isReady(img)) {
      pctx.drawImage(img, rx, ry, w, h);
    } else {
      fillPixelRoundRect(pctx, rx, ry, w, h, '#2563eb');
    }
    const t = Math.floor((animT || 0) * 6);
    for (let dy = Math.floor(h * 0.36); dy < h - 8; dy += 4) {
      for (let dx = 8; dx < w - 10; dx += 4) {
        if (((dx + dy + t * 2) % 16) < 4) {
          pctx.fillStyle = '#e0f2fe';
          pctx.fillRect(rx + dx, ry + dy, 2, 2);
        }
      }
    }
  }

  // 2.5D Fiktive Retro-Werbebanden (6 verschiedene Sponsoren: TURBO KOLA, RETROBIT, SPIKE PRO, MEGA VOLT, GOLD CUP, PIXEL '26 - null Ueberlappung!)
  function drawAdBoard(pctx, x, y, w, h, sponsorIdx) {
    const rx = Math.round(x), ry = Math.round(y);
    const idx = Math.abs(Math.floor(typeof sponsorIdx === 'number' ? sponsorIdx : 0)) % 6;
    const img = propImages['ad_' + idx];
    if (isReady(img)) {
      pctx.drawImage(img, rx, ry - 4, 92, 28);
    } else {
      fillPixelRoundRect(pctx, rx, ry, w || 88, h || 22, '#be3b42');
    }
  }

  // 2.5D Schattierter Blumenkasten mit ueppigen Blueten!
  function drawFlowerPlanter(pctx, x, y, cool) {
    const rx = Math.round(x), ry = Math.round(y);
    const img = cool ? propImages.planter_cool : propImages.planter_warm;
    if (isReady(img)) {
      pctx.drawImage(img, rx - 4, ry - 12, 36, 28);
    }
  }

  function drawCone(pctx, x, y) {
    const rx = Math.round(x), ry = Math.round(y);
    fillPixelEllipse(pctx, rx, ry + 1, 5, 2, 'rgba(0,0,0,0.22)');
    pctx.fillStyle = '#9a3412'; pctx.fillRect(rx - 4, ry - 1, 8, 2);
    pctx.fillStyle = '#f97316'; pctx.fillRect(rx - 3, ry - 4, 6, 3);
    pctx.fillStyle = '#fef08a'; pctx.fillRect(rx - 2, ry - 6, 4, 2);
    pctx.fillStyle = '#f97316'; pctx.fillRect(rx - 1, ry - 8, 2, 2);
  }

  function drawReferee(pctx, x, y, opts) {
    const o = opts || {};
    const rx = Math.round(x), ry = Math.round(y);
    fillPixelEllipse(pctx, rx, ry + 1, 9, 3, 'rgba(0,0,0,0.2)');
    if (isReady(npcSheet)) {
      let tileIdx = 0;
      if (o.juryDesk) tileIdx = o.darkSkin ? 8 : 7;
      else if (o.sleeping) tileIdx = 3;
      else if (o.sunglasses) tileIdx = 4;
      else if (o.seated && o.greenCoat) tileIdx = 2;
      else if (o.seated) tileIdx = 1;
      pctx.drawImage(npcSheet, tileIdx * NPC_W, 0, NPC_W, NPC_H, rx - 24, ry - 48, NPC_W, NPC_H);
      if (o.sleeping) {
        const zOff = Math.floor((o.t || 0) * 6) % 10;
        drawPixelText(pctx, 'Z', rx + 7, ry - 36 - zOff, '#ffffff', 1, 'left', 'rgba(0,0,0,0.35)');
        drawPixelText(pctx, 'Z', rx + 12, ry - 42 - zOff, 'rgba(255,255,255,0.75)', 1, 'left');
      }
    }
  }

  function drawCameraman(pctx, x, y, t) {
    const rx = Math.round(x), ry = Math.round(y);
    fillPixelEllipse(pctx, rx + 4, ry + 1, 13, 3, 'rgba(0,0,0,0.2)');
    if (isReady(npcSheet)) {
      pctx.drawImage(npcSheet, 5 * NPC_W, 0, NPC_W, NPC_H, rx - 16, ry - 48, NPC_W, NPC_H);
      if (Math.floor((t || 0) * 3) % 2 === 0) {
        pctx.fillStyle = '#ef4444'; pctx.fillRect(rx + 15, ry - 25, 2, 2);
      }
    }
  }

  function drawPhotographer(pctx, x, y, t, flipX) {
    const rx = Math.round(x), ry = Math.round(y);
    pctx.save();
    pctx.translate(rx, ry);
    if (flipX) pctx.scale(-1, 1);
    fillPixelEllipse(pctx, 0, 1, 10, 3, 'rgba(0,0,0,0.24)');
    if (isReady(npcSheet)) {
      pctx.drawImage(npcSheet, 6 * NPC_W, 0, NPC_W, NPC_H, -24, -48, NPC_W, NPC_H);
      // Gelegentlicher Kamera-Blitz!
      if (Math.sin((t || 0) * 5.2 + rx) > 0.94) {
        fillPixelEllipse(pctx, 6, -32, 6, 6, 'rgba(255,255,240,0.85)');
      }
    }
    pctx.restore();
  }

  // --- HIGH-RES HUD & SCHRAEGE ARCADE-WERTUNGEN ("GUT!", "SUPER!", "PERFEKT!") ---
  function drawPlayerPin(ctx, px, py, playerIndex, labelText, zoom, focusPxX, focusPxY) {
    const pos = projectZoom(px, py, zoom, focusPxX, focusPxY);
    const x = pos.x, y = pos.y;
    const color = OlyGame.CONFIG.PLAYER_COLORS[playerIndex % 4];
    const label = labelText || OlyGame.CONFIG.PLAYER_LABELS[playerIndex % 4];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.arc(x + 2, y - 20, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - 22, 18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7, y - 9); ctx.lineTo(x + 7, y - 9); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 21);
    ctx.restore();
  }

  // Schraege, dynamisch hereinspringende Wertung wie "GREAT!" in sommerspiele.mp4 (00:16)!
  function drawSlantedCallout(ctx, text, x, y, color, ageSec, size) {
    const t = Math.max(0, ageSec === undefined ? 0.3 : ageSec);
    // Elastischer Pop-In-Bounce in den ersten 0.22s
    const pop = t < 0.16 ? (0.4 + (t / 0.16) * 0.78) : (t < 0.26 ? (1.18 - ((t - 0.16) / 0.1) * 0.18) : 1.0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.14); // Dynamischer -8 Grad Winkel!
    ctx.scale(pop, pop);
    ctx.font = '900 italic ' + (size || 46) + 'px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Kraeftiger Schatten + weisse Umrandung fuer maximale Lesbarkeit
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillText(text, 4, 6);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color || '#fde047';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawPill(ctx, x, y, text, bgColor, textColor, alignRight) {
    ctx.save();
    ctx.font = '900 17px "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    const w = tw + 28, h = 34;
    const rx = alignRight ? x - w : x;
    ctx.fillStyle = bgColor || 'rgba(15,23,42,0.88)';
    roundRect(ctx, rx, y, w, h, 17);
    ctx.fill();
    ctx.fillStyle = textColor || '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, rx + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  function drawBigText(ctx, text, x, y, size, color, align) {
    ctx.save();
    ctx.font = '900 italic ' + (size || 46) + 'px "Segoe UI", sans-serif';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(text, x + 3, y + 4);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawRecordBadges(ctx, eventId) {
    const ev = OlyGame.CONFIG.getEvent(eventId);
    const pb = OlyGame.Records.getPB(eventId);
    const wrStr = 'WR ' + OlyGame.Records.formatValue(eventId, ev.wr);
    const pbStr = 'PB ' + (pb ? OlyGame.Records.formatValue(eventId, pb.value) : '---');
    drawPill(ctx, 944, 486, wrStr, '#0ea5e9', '#ffffff', true);
    drawPill(ctx, 785, 486, pbStr, 'rgba(30,41,59,0.92)', '#f8fafc', true);
  }

  function drawAttemptDots(ctx, results, currentIdx, total) {
    const cx = 480, cy = 34, gap = 42;
    const startX = cx - ((total - 1) * gap) / 2;
    ctx.save();
    for (let i = 0; i < total; i++) {
      const x = startX + i * gap;
      const res = results[i];
      let bg = 'rgba(51,65,85,0.88)', txt = String(i + 1);
      if (res) { bg = res.foul ? '#ef4444' : '#22c55e'; txt = res.foul ? '✕' : '✓'; }
      else if (i === currentIdx) { bg = '#0ea5e9'; }
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(x, cy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, cy + 1);
    }
    ctx.restore();
  }

  function drawAngleArc(ctx, cx, cy, angleDeg, optMin, optMax, caption) {
    ctx.save();
    const r = 88;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r + 8, -85 * Math.PI / 180, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(cx, cy, r - 6, -optMax * Math.PI / 180, -optMin * Math.PI / 180); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, -85 * Math.PI / 180, 0); ctx.stroke();

    const rad = -angleDeg * Math.PI / 180;
    const tx = cx + Math.cos(rad) * (r + 14);
    const ty = cy + Math.sin(rad) * (r + 14);
    const inSweet = angleDeg >= optMin && angleDeg <= optMax;
    ctx.strokeStyle = inSweet ? '#4ade80' : '#facc15'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = inSweet ? '#4ade80' : '#facc15';
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffffff'; ctx.font = '900 22px "Segoe UI", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(angleDeg) + '°', cx + 22, cy - 16);
    if (caption) drawPill(ctx, cx - 20, cy + 14, caption, inSweet ? '#16a34a' : '#f59e0b', '#ffffff', false);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // --- REICHES JUICE-PARTIKELSYSTEM (WOELKCHEN, PIXEL-STERNE, QUADRATISCHE SAND-SPRITZER!) ---
  function createParticles() {
    const list = [];
    return {
      spawn(x, y, vx, vy, color, size, life, gravity, shape) {
        list.push({
          x, y, vx, vy,
          color: color || '#fff',
          size: size || 2,
          life: life || 0.5,
          maxLife: life || 0.5,
          gravity: gravity || 0,
          shape: shape || 'square' // 'square', 'puff', 'star'
        });
      },
      // Dichte, weiche Staubwoelkchen wie in sommerspiele.mp4 (00:04 & 00:18!)
      burstDust(x, y, count, color) {
        const col = color || 'rgba(255, 240, 232, 0.9)';
        for (let i = 0; i < (count || 4); i++) {
          this.spawn(
            x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 4,
            -18 - Math.random() * 28, -6 - Math.random() * 14,
            col, 3 + Math.floor(Math.random() * 4), 0.38 + Math.random() * 0.28, 12, 'puff'
          );
        }
      },
      // Aufspritzende quadratische Sand-Pixel bei der Landung im Weit-/Dreisprung!
      burstSand(x, y, count) {
        const cols = ['#e5b869', '#f3ce84', '#c99645', '#fde68a'];
        for (let i = 0; i < (count || 18); i++) {
          const ang = -Math.PI * (0.12 + Math.random() * 0.76);
          const spd = 28 + Math.random() * 68;
          this.spawn(
            x + (Math.random() - 0.5) * 10, y - 2,
            Math.cos(ang) * spd, Math.sin(ang) * spd,
            cols[i % cols.length], 2 + (i % 3), 0.45 + Math.random() * 0.35, 195, 'square'
          );
        }
      },
      // Leuchtende Pixel-Sterne (4-zackig wie in sommerspiele.mp4!)
      burstStars(x, y, count) {
        const cols = ['#fde047', '#fef08a', '#ffffff', '#facc15'];
        for (let i = 0; i < (count || 8); i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 20 + Math.random() * 42;
          this.spawn(
            x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6,
            Math.cos(ang) * spd, Math.sin(ang) * spd - 14,
            cols[i % cols.length], 2 + (i % 2), 0.48 + Math.random() * 0.38, 22, 'star'
          );
        }
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt;
          if (p.life <= 0) { list.splice(i, 1); continue; }
          p.vy += p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      },
      draw(pctx, camX) {
        const ox = camX || 0;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const a = Math.max(0, Math.min(1, p.life / p.maxLife));
          const px = Math.round(p.x - ox), py = Math.round(p.y);
          pctx.globalAlpha = a;
          pctx.fillStyle = p.color;
          if (p.shape === 'star') {
            const s = p.size;
            pctx.fillRect(px - s, py, s * 2 + 1, 1);
            pctx.fillRect(px, py - s, 1, s * 2 + 1);
            pctx.fillRect(px - 1, py - 1, 3, 3);
          } else if (p.shape === 'puff') {
            const r = Math.max(1, Math.round(p.size * (0.65 + (1 - a) * 0.55)));
            fillPixelEllipse(pctx, px, py, r, Math.max(1, r - 1), p.color);
          } else {
            pctx.fillRect(px, py, p.size, p.size);
          }
        }
        pctx.globalAlpha = 1;
      },
      clear() { list.length = 0; }
    };
  }

  return {
    drawPixelText, drawPixelLimb, fillPixelRoundRect, fillPixelEllipse,
    drawFlag, drawAthlete, drawSwimmer, getAthleteSheet: (cc) => athleteSheets[cc] || athleteSheets['GER'], drawTrackShadows, drawCameraDrone,
    compositePixelLayer, projectZoom, drawTiltShiftOverlay,
    drawStadiumBackdrop, drawFullBackdrop, drawStadiumStands,
    drawTexturedGrass, drawLedBoard, drawAdBoard, drawFlowerPlanter, drawCone,
    drawReferee, drawCameraman, drawPhotographer,
    drawPlayerPin, drawSlantedCallout, drawPill, drawBigText,
    drawRecordBadges, drawAttemptDots, drawAngleArc, roundRect,
    createParticles
  };
})();
