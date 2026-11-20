window.OlyGame = window.OlyGame || {};

(function () {
  const CFG = OlyGame.CONFIG;

  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = CFG.PW;
  pixelCanvas.height = CFG.PH;
  const pctx = pixelCanvas.getContext('2d');
  pctx.imageSmoothingEnabled = false;

  const gameCanvas = document.getElementById('game-canvas');
  const gctx = gameCanvas.getContext('2d');
  gctx.imageSmoothingEnabled = false;

  OlyGame.Input.bindCanvas(gameCanvas);

  const app = {
    screen: 'title',
    lobbyType: 'local', // local, host, client
    gameMode: 'single', // single, full, custom
    selectedEvents: ['sprint100'],
    players: [],
    activeEditSlot: 0,
    localPlayerIds: [],
    myOnlineProfile: { name: 'Spieler', country: 'GER' },
    tournamentQueue: [],
    tournamentIndex: 0,
    tournamentScores: {},
    activeEventId: null,
    activeEventInstance: null,
    eventFinished: false,
    lastEventResults: null,
    inCeremony: false,

    // Xbox-Controller Menue-Fokus Zustand!
    nav: {
      titleIdx: 0,
      lobbyZone: 'events', // 'events' (4x3 Karten) oder 'flags' (5x3 Flaggen)
      eventIdx: 0,
      flagIdx: 0,
      resultIdx: 0
    }
  };

  function cleanupActiveEvent() {
    if (app.activeEventInstance && app.activeEventInstance.cleanup) {
      try { app.activeEventInstance.cleanup(); } catch (e) {}
    }
    app.activeEventInstance = null;
    app.eventFinished = false;
    if (gameCanvas) gameCanvas.classList.remove('crosshair-mode');
  }

  function showScreen(name) {
    app.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) homeBtn.classList.toggle('hidden', name === 'title');
    OlyGame.Audio.setMenuMusic(name === 'title' || name === 'lobby');
    applyGamepadFocusVisuals();
  }

  function setSpectatorBanner(text) {
    const el = document.getElementById('hud-spectator-badge');
    if (!el) return;
    if (text) { el.textContent = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  function createFlagCanvas(countryCode, w, h) {
    const c = document.createElement('canvas');
    c.width = w || 42; c.height = h || 27;
    OlyGame.Sprites.drawFlag(c.getContext('2d'), countryCode, 0, 0, c.width, c.height);
    return c;
  }

  // --- ANIMIERTER START-BANNER ---
  const titleCanvas = document.getElementById('title-preview-canvas');
  const tctx = titleCanvas ? titleCanvas.getContext('2d') : null;
  const titleOff = document.createElement('canvas');
  titleOff.width = 480; titleOff.height = 115;
  const toctx = titleOff.getContext('2d');
  let titleAnimT = 0;

  function renderTitleBanner(dt) {
    if (!tctx || app.screen !== 'title') return;
    titleAnimT += dt;
    toctx.imageSmoothingEnabled = false;
    toctx.clearRect(0, 0, 480, 115);

    OlyGame.Sprites.drawStadiumBackdrop(tctx, titleAnimT * 20, 46, titleAnimT);
    OlyGame.Sprites.drawTexturedGrass(toctx, titleAnimT * 30, 44, 16);
    for (let bx = -Math.floor((titleAnimT * 30) % 120); bx < 520; bx += 120) {
      OlyGame.Sprites.drawFlowerPlanter(toctx, bx + 40, 46);
    }
    toctx.fillStyle = '#e56f68'; toctx.fillRect(0, 60, 480, 55);
    for (let i = 0; i < 3; i++) {
      const ly = 60 + i * 18;
      if (i % 2 === 1) { toctx.fillStyle = '#dc635c'; toctx.fillRect(0, ly, 480, 18); }
      toctx.fillStyle = 'rgba(255,255,255,0.74)'; toctx.fillRect(0, ly, 480, 1);
    }
    const runners = [
      { country: 'GER', y: 76, speed: 68, off: 20 },
      { country: 'JAM', y: 94, speed: 78, off: 165 },
      { country: 'USA', y: 112, speed: 72, off: 300 },
      { country: 'BRA', y: 94, speed: 64, off: 410 },
      { country: 'FRA', y: 76, speed: 70, off: 260 }
    ];
    runners.sort((a, b) => a.y - b.y).forEach((r, idx) => {
      const x = ((titleAnimT * r.speed + r.off) % 540) - 30;
      OlyGame.Sprites.drawAthlete(toctx, x, r.y, r.country, 'run', titleAnimT * 8 + idx * 1.4);
    });
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(titleOff, 0, 0, titleCanvas.width, titleCanvas.height);
  }

  // --- ANIMIERTE ATHLETEN-VORSCHAU AUF DEM KLEMMBRETT (wie Menü_Vorschlag.jpg!) ---
  const lobbyAthCanvas = document.getElementById('lobby-athlete-canvas');
  const lathCtx = lobbyAthCanvas ? lobbyAthCanvas.getContext('2d') : null;
  let lobbyAnimT = 0;

  function renderLobbyAthletePreview(dt) {
    if (!lathCtx || app.screen !== 'lobby') return;
    lobbyAnimT += dt;
    lathCtx.imageSmoothingEnabled = false;
    lathCtx.clearRect(0, 0, 64, 64);

    let countryCode = 'GER';
    if (app.lobbyType === 'local') {
      const pl = app.players[app.activeEditSlot] || app.players[0];
      if (pl) countryCode = pl.country;
    } else {
      countryCode = app.myOnlineProfile.country || 'GER';
    }
    OlyGame.Sprites.drawAthlete(lathCtx, 32, 56, countryCode, 'run', lobbyAnimT * 7.5, { scale: 1.35 });
  }

  // --- LOBBY INITIALISIERUNG ---
  function initLocalLobby() {
    OlyGame.Network.disconnect();
    app.lobbyType = 'local';
    app.players = [{ id: 'local_0', name: 'Spieler 1', country: 'GER', slotIndex: 0 }];
    app.activeEditSlot = 0;
    app.localPlayerIds = ['local_0'];
    app.gameMode = 'single';
    app.selectedEvents = ['sprint100'];
    app.nav.lobbyZone = 'events';
    app.nav.eventIdx = 0;
    showScreen('lobby');
    renderLobby();
  }

  function initHostLobby() {
    app.lobbyType = 'host';
    app.gameMode = 'single';
    app.selectedEvents = ['sprint100'];
    app.activeEditSlot = 0;
    showScreen('lobby');
    setNetworkBanner('Erstelle Online-Raumcode...');
    setupNetworkHandlers();

    OlyGame.Network.createRoom(
      (code, myId) => {
        app.players = [{ id: myId, name: app.myOnlineProfile.name || 'Host', country: app.myOnlineProfile.country || 'GER', slotIndex: 0, peerId: myId }];
        app.localPlayerIds = [myId];
        setNetworkBanner('Raum bereit! Teile den Code "' + code + '" mit bis zu 3 Freunden.');
        renderLobby();
      },
      (err) => setNetworkBanner('Fehler: ' + err)
    );
  }

  function joinOnlineLobby(code) {
    const errEl = document.getElementById('join-error');
    if (errEl) errEl.textContent = 'Verbinde mit Raum ' + code + '...';
    app.lobbyType = 'client';
    setupNetworkHandlers();

    OlyGame.Network.joinRoom(
      code,
      (joinedCode, myId) => {
        if (errEl) errEl.textContent = '';
        app.localPlayerIds = [myId];
        showScreen('lobby');
        setNetworkBanner('Verbunden mit Raum "' + joinedCode + '"! Warte auf Host...');
        OlyGame.Network.sendToHost('join_hello', {
          id: myId, name: app.myOnlineProfile.name || 'Spieler', country: app.myOnlineProfile.country || 'GER'
        });
        renderLobby();
      },
      (err) => { if (errEl) errEl.textContent = err; }
    );
  }

  function setNetworkBanner(msg) {
    const el = document.getElementById('network-banner');
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  function broadcastLobbyState() {
    if (app.lobbyType !== 'host') return;
    OlyGame.Network.broadcast('lobby_sync', { players: app.players, gameMode: app.gameMode, selectedEvents: app.selectedEvents });
  }

  function setupNetworkHandlers() {
    const Net = OlyGame.Network;
    Net.clearHandlers();
    Net.on('room_full', () => { alert('Dieser Raum ist bereits voll (max. 4 Spieler).'); Net.disconnect(); showScreen('title'); });
    Net.on('host_disconnected', () => { alert('Verbindung zum Host unterbrochen.'); Net.disconnect(); cleanupActiveEvent(); OlyGame.Ceremony.stop(); showScreen('title'); });
    Net.on('join_hello', (payload, fromId) => {
      if (app.lobbyType !== 'host' || app.players.length >= 4) return;
      if (!app.players.find(p => p.id === fromId)) {
        app.players.push({
          id: fromId, name: payload.name || ('Spieler ' + (app.players.length + 1)),
          country: payload.country || CFG.COUNTRIES[app.players.length % 15].code,
          slotIndex: app.players.length, peerId: fromId
        });
      }
      reassignSlots(); broadcastLobbyState(); renderLobby();
    });
    Net.on('profile_update', (payload, fromId) => {
      if (app.lobbyType !== 'host') return;
      const pl = app.players.find(p => p.id === fromId);
      if (pl) {
        if (payload.name) pl.name = payload.name.slice(0, 14);
        if (payload.country) pl.country = payload.country;
        broadcastLobbyState(); renderLobby();
      }
    });
    Net.on('client_disconnected', (payload, fromId) => {
      if (app.lobbyType !== 'host') return;
      app.players = app.players.filter(p => p.id !== fromId);
      reassignSlots(); broadcastLobbyState(); renderLobby();
    });
    Net.on('lobby_sync', (payload) => {
      if (app.lobbyType !== 'client') return;
      app.players = payload.players || [];
      app.gameMode = payload.gameMode || 'single';
      app.selectedEvents = payload.selectedEvents || ['sprint100'];
      renderLobby();
    });
    Net.on('start_match', (payload) => {
      app.players = payload.players; app.tournamentQueue = payload.queue; app.tournamentIndex = 0;
      initTournamentScores(); startEventAtIndex(0);
    });
    Net.on('event_sync', (payload, fromId) => {
      if (app.lobbyType === 'host' && fromId) Net.broadcast('event_sync', payload, fromId);
      if (app.activeEventInstance && !app.eventFinished && app.activeEventInstance.onSyncIn) app.activeEventInstance.onSyncIn(payload, fromId);
    });
    Net.on('event_results', (payload) => handleEventResults(payload.results, true));
    Net.on('next_event', (payload) => startEventAtIndex(payload.index));
    Net.on('show_ceremony', (payload) => openCeremony(payload.ranked));
    Net.on('return_lobby', () => {
      cleanupActiveEvent(); OlyGame.Ceremony.stop();
      document.getElementById('results-overlay').classList.add('hidden');
      showScreen('lobby'); renderLobby();
    });
  }

  function reassignSlots() {
    app.players.forEach((p, idx) => { p.slotIndex = idx; });
    if (app.activeEditSlot >= app.players.length) app.activeEditSlot = Math.max(0, app.players.length - 1);
    if (app.lobbyType === 'local') app.localPlayerIds = app.players.map(p => p.id);
  }

  // --- LOBBY RENDERING (KLEMMBRETT + 4x3 SAMMELKARTEN!) ---
  function renderLobby() {
    const isOnline = app.lobbyType !== 'local';
    const isClient = app.lobbyType === 'client';

    document.getElementById('lobby-title').textContent =
      app.lobbyType === 'local' ? 'LOKALE LOBBY' : (app.lobbyType === 'host' ? 'ONLINE HOST' : 'ONLINE GAST');

    const roomBox = document.getElementById('room-code-box');
    const codeSpan = document.getElementById('display-room-code');
    if (isOnline && OlyGame.Network.getRoomCode()) {
      roomBox.classList.remove('hidden'); codeSpan.textContent = OlyGame.Network.getRoomCode();
    } else roomBox.classList.add('hidden');

    // Spieler-Tabs oben auf dem Klemmbrett (nur im lokalen Modus bei >1 Spieler)
    const tabsRow = document.getElementById('player-tabs-row');
    tabsRow.innerHTML = '';
    if (!isOnline && app.players.length > 1) {
      tabsRow.classList.remove('hidden');
      app.players.forEach((pl, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'p-slot-tab' + (idx === app.activeEditSlot ? ' active' : '');
        b.textContent = 'P' + (idx + 1) + ' ' + pl.country;
        b.onclick = () => { app.activeEditSlot = idx; OlyGame.Audio.click(); renderLobby(); };
        tabsRow.appendChild(b);
      });
    } else {
      tabsRow.classList.add('hidden');
    }

    // Aktiver Spieler im Klemmbrett-Kopf
    let curLabel = 'P1', curName = 'Spieler 1', curCountry = 'GER';
    if (!isOnline) {
      const pl = app.players[app.activeEditSlot] || app.players[0];
      if (pl) { curLabel = 'P' + (app.activeEditSlot + 1); curName = pl.name; curCountry = pl.country; }
    } else {
      const meIdx = app.players.findIndex(p => p.id === OlyGame.Network.getMyId());
      curLabel = meIdx >= 0 ? ('P' + (meIdx + 1)) : 'DU';
      curName = app.myOnlineProfile.name;
      curCountry = app.myOnlineProfile.country;
    }

    document.getElementById('active-p-label').textContent = curLabel;
    const nameInp = document.getElementById('active-player-name');
    if (document.activeElement !== nameInp) nameInp.value = curName;

    const remBtn = document.getElementById('btn-remove-active-player');
    remBtn.classList.toggle('hidden', isOnline || app.players.length <= 1);

    const bigFlag = document.getElementById('active-flag-big');
    if (bigFlag) OlyGame.Sprites.drawFlag(bigFlag.getContext('2d'), curCountry, 0, 0, bigFlag.width, bigFlag.height);

    // 5x3 Flaggen-Raster (15 Nationen exakt wie Menü_Vorschlag.jpg!)
    const picker = document.getElementById('flag-picker-grid');
    picker.innerHTML = '';
    const countries = CFG.getPickerCountries();
    countries.forEach((c, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flag-btn' + (c.code === curCountry ? ' selected' : '');
      btn.dataset.flagIdx = idx;
      btn.title = c.name;
      btn.appendChild(createFlagCanvas(c.code, 42, 27));
      const lbl = document.createElement('span');
      lbl.textContent = c.code;
      btn.appendChild(lbl);
      btn.onclick = () => selectCountryForCurrent(c.code);
      picker.appendChild(btn);
    });

    // Online-Spielerliste
    const roster = document.getElementById('online-roster');
    roster.classList.toggle('hidden', !isOnline);
    if (isOnline) {
      roster.innerHTML = '';
      app.players.forEach((pl, i) => {
        const row = document.createElement('div');
        row.className = 'roster-row';
        row.innerHTML = '<span class="roster-dot" style="background:' + CFG.PLAYER_COLORS[i % 4] + '"></span>' +
          '<span>P' + (i + 1) + ' ' + escapeHtml(pl.name) + ' (' + pl.country + ')' + (pl.id === OlyGame.Network.getMyId() ? ' ★' : '') + '</span>';
        roster.appendChild(row);
      });
    }

    document.getElementById('local-player-controls').classList.toggle('hidden', isOnline);
    const addBtn = document.getElementById('btn-add-local-player');
    if (addBtn) addBtn.disabled = app.players.length >= 4;

    // 3 Ordner-Tabs
    document.querySelectorAll('#mode-tabs .f-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gamemode === app.gameMode);
      btn.disabled = isClient;
    });

    // 4x3 SAMMELKARTEN (mit deinen 12 ausgeschnittenen Artworks!)
    const evWrap = document.getElementById('event-selector');
    evWrap.innerHTML = '';
    CFG.EVENTS.forEach((ev, idx) => {
      const isSel = app.gameMode === 'full' || app.selectedEvents.includes(ev.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'event-card' + (isSel ? ' selected' : '');
      card.dataset.evIdx = idx;
      card.disabled = isClient;

      const badgeCls = ev.mode === 'simultaneous' ? 'badge-lanes' : 'badge-turns';
      card.innerHTML =
        '<div class="card-art-wrap">' +
          '<img class="card-art-img" src="' + ev.cardImg + '" alt="' + ev.name + '">' +
          '<span class="card-corner-badge ' + badgeCls + '">' + ev.badge + '</span>' +
          '<span class="card-check-dot">✓</span>' +
        '</div>' +
        '<span class="card-title">' + ev.name + '</span>';

      card.onclick = () => toggleOrSelectEvent(idx);
      evWrap.appendChild(card);
    });

    const startBtn = document.getElementById('btn-start-match');
    startBtn.disabled = isClient || app.players.length === 0;
    startBtn.innerHTML = isClient ? 'WARTE AUF<br>HOST...' : '▶ WETTKAMPF<br>STARTEN!';

    applyGamepadFocusVisuals();
  }

  function selectCountryForCurrent(code) {
    OlyGame.Audio.click();
    if (app.lobbyType === 'local') {
      const pl = app.players[app.activeEditSlot];
      if (pl) pl.country = code;
      renderLobby();
    } else {
      app.myOnlineProfile.country = code;
      if (app.lobbyType === 'host') {
        const me = app.players.find(p => p.id === OlyGame.Network.getMyId());
        if (me) me.country = code;
        broadcastLobbyState(); renderLobby();
      } else {
        OlyGame.Network.sendToHost('profile_update', { name: app.myOnlineProfile.name, country: code });
        renderLobby();
      }
    }
  }

  function toggleOrSelectEvent(idx) {
    if (app.lobbyType === 'client') return;
    const ev = CFG.EVENTS[idx];
    if (!ev) return;
    OlyGame.Audio.click();
    app.nav.eventIdx = idx;
    if (app.gameMode === 'full') {
      // Im Komplett-Turnier direkt auf Eigenes wechseln oder einfach ignorieren
      return;
    } else if (app.gameMode === 'single') {
      app.selectedEvents = [ev.id];
    } else if (app.gameMode === 'custom') {
      if (app.selectedEvents.includes(ev.id)) {
        if (app.selectedEvents.length > 1) app.selectedEvents = app.selectedEvents.filter(x => x !== ev.id);
      } else app.selectedEvents.push(ev.id);
    }
    broadcastLobbyState();
    renderLobby();
  }

  // --- VOLLSTAENDIGE XBOX-CONTROLLER MENUE-NAVIGATION! ---
  function clearGamepadFocus() {
    document.querySelectorAll('.gp-focus').forEach(el => el.classList.remove('gp-focus'));
  }

  function getVisibleResultsButtons() {
    const wrap = document.getElementById('results-actions');
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('button')).filter(b => !b.classList.contains('hidden') && !b.disabled);
  }

  function applyGamepadFocusVisuals() {
    clearGamepadFocus();
    if (!OlyGame.Input.isGamepadEnabled() || OlyGame.Input.getConnectedCount() === 0) return;

    // 1. Modals offen?
    if (!document.getElementById('modal-help').classList.contains('hidden') ||
        !document.getElementById('modal-records').classList.contains('hidden')) {
      return;
    }

    // 2. Startscreen
    if (app.screen === 'title') {
      const items = Array.from(document.querySelectorAll('#screen-title .nav-item'));
      const el = items[app.nav.titleIdx % items.length];
      if (el) el.classList.add('gp-focus');
      return;
    }

    // 3. Lobby (Flaggen-Raster ODER 4x3 Sammelkarten!)
    if (app.screen === 'lobby') {
      if (app.nav.lobbyZone === 'flags') {
        const flags = document.querySelectorAll('#flag-picker-grid .flag-btn');
        const el = flags[app.nav.flagIdx % flags.length];
        if (el) el.classList.add('gp-focus');
      } else {
        const cards = document.querySelectorAll('#event-selector .event-card');
        const el = cards[app.nav.eventIdx % cards.length];
        if (el) el.classList.add('gp-focus');
      }
      return;
    }

    // 4. Ergebnis-Overlay nach einer Disziplin!
    if (app.screen === 'game' && !document.getElementById('results-overlay').classList.contains('hidden')) {
      const btns = getVisibleResultsButtons();
      if (btns.length > 0) {
        app.nav.resultIdx = ((app.nav.resultIdx % btns.length) + btns.length) % btns.length;
        btns[app.nav.resultIdx].classList.add('gp-focus');
      }
    }
  }

  function handleMenuController() {
    const m = OlyGame.Input.getMenuInput();
    const anyDir = m.up || m.down || m.left || m.right;
    if (!anyDir && !m.confirm && !m.back && !m.lb && !m.rb && !m.start && !m.xBtn && !m.yBtn) return;

    // 1. Modals mit B schliessen
    const helpOpen = !document.getElementById('modal-help').classList.contains('hidden');
    const recOpen = !document.getElementById('modal-records').classList.contains('hidden');
    if (helpOpen || recOpen) {
      if (m.back || m.confirm) {
        document.getElementById('modal-help').classList.add('hidden');
        document.getElementById('modal-records').classList.add('hidden');
        OlyGame.Audio.click();
        applyGamepadFocusVisuals();
      }
      return;
    }

    // 2. Startscreen Navigation
    if (app.screen === 'title') {
      const items = Array.from(document.querySelectorAll('#screen-title .nav-item'));
      if (m.right || m.down) { app.nav.titleIdx = (app.nav.titleIdx + 1) % items.length; OlyGame.Audio.click(); }
      else if (m.left || m.up) { app.nav.titleIdx = (app.nav.titleIdx - 1 + items.length) % items.length; OlyGame.Audio.click(); }
      else if (m.confirm || m.start) {
        const target = items[app.nav.titleIdx % items.length];
        if (target) target.click();
      }
      applyGamepadFocusVisuals();
      return;
    }

    // 3. Lobby Navigation (D-Pad/Stick, LB/RB fuer Ordner-Tabs, X fuer Flaggen<->Karten, START fuer Wettkampf!)
    if (app.screen === 'lobby') {
      if (m.start && app.lobbyType !== 'client') {
        OlyGame.Audio.click();
        startMatch();
        return;
      }
      if (m.back) {
        document.getElementById('btn-leave-lobby').click();
        return;
      }
      if (m.xBtn) {
        app.nav.lobbyZone = app.nav.lobbyZone === 'events' ? 'flags' : 'events';
        OlyGame.Audio.click();
        applyGamepadFocusVisuals();
        return;
      }
      if ((m.lb || m.rb) && app.lobbyType !== 'client') {
        const modes = ['single', 'full', 'custom'];
        const cur = modes.indexOf(app.gameMode);
        const next = (cur + (m.rb ? 1 : -1) + modes.length) % modes.length;
        app.gameMode = modes[next];
        if (app.gameMode === 'single' && app.selectedEvents.length !== 1) app.selectedEvents = [app.selectedEvents[0] || 'sprint100'];
        OlyGame.Audio.click();
        broadcastLobbyState();
        renderLobby();
        return;
      }
      if (m.yBtn && app.lobbyType === 'local' && app.players.length > 1) {
        app.activeEditSlot = (app.activeEditSlot + 1) % app.players.length;
        OlyGame.Audio.click();
        renderLobby();
        return;
      }

      if (app.nav.lobbyZone === 'flags') {
        const total = CFG.getPickerCountries().length; // 15 (5x3)
        if (m.right) { app.nav.flagIdx = (app.nav.flagIdx + 1) % total; OlyGame.Audio.click(); }
        if (m.left)  { app.nav.flagIdx = (app.nav.flagIdx - 1 + total) % total; OlyGame.Audio.click(); }
        if (m.down)  { app.nav.flagIdx = (app.nav.flagIdx + 5) % total; OlyGame.Audio.click(); }
        if (m.up)    { app.nav.flagIdx = (app.nav.flagIdx - 5 + total) % total; OlyGame.Audio.click(); }
        if (m.confirm) {
          const c = CFG.getPickerCountries()[app.nav.flagIdx];
          if (c) selectCountryForCurrent(c.code);
        }
      } else {
        const total = CFG.EVENTS.length; // 12 (4x3)
        if (m.right) { app.nav.eventIdx = (app.nav.eventIdx + 1) % total; OlyGame.Audio.click(); }
        if (m.left)  { app.nav.eventIdx = (app.nav.eventIdx - 1 + total) % total; OlyGame.Audio.click(); }
        if (m.down)  { app.nav.eventIdx = (app.nav.eventIdx + 4) % total; OlyGame.Audio.click(); }
        if (m.up)    { app.nav.eventIdx = (app.nav.eventIdx - 4 + total) % total; OlyGame.Audio.click(); }
        if (m.confirm) {
          if (app.gameMode === 'single') {
            const ev = CFG.EVENTS[app.nav.eventIdx];
            if (ev && app.selectedEvents[0] === ev.id) {
              // Zweites A auf bereits gewaehlte Einzeldisziplin startet direkt!
              startMatch();
              return;
            }
          }
          toggleOrSelectEvent(app.nav.eventIdx);
        }
      }
      applyGamepadFocusVisuals();
      return;
    }

    // 4. Ergebnis-Overlay nach Disziplin! (Endlich per Controller auf "Weiter", "Nochmal", "Siegerehrung" druecken!)
    if (app.screen === 'game' && !document.getElementById('results-overlay').classList.contains('hidden')) {
      const btns = getVisibleResultsButtons();
      if (btns.length === 0) return;
      if (m.right || m.down) { app.nav.resultIdx = (app.nav.resultIdx + 1) % btns.length; OlyGame.Audio.click(); }
      else if (m.left || m.up) { app.nav.resultIdx = (app.nav.resultIdx - 1 + btns.length) % btns.length; OlyGame.Audio.click(); }
      else if (m.confirm || m.start) {
        const target = btns[app.nav.resultIdx % btns.length];
        if (target) target.click();
      } else if (m.back) {
        const lobbyBtn = document.getElementById('btn-results-lobby');
        if (lobbyBtn && !lobbyBtn.disabled) lobbyBtn.click();
      }
      applyGamepadFocusVisuals();
      return;
    }

    // 5. Siegerehrung -> A / B / Start zurueck zur Lobby
    if (app.screen === 'game' && app.inCeremony && app.lobbyType !== 'client') {
      if (m.confirm || m.back || m.start) {
        if (app.lobbyType === 'host') OlyGame.Network.broadcast('return_lobby', {});
        app.inCeremony = false; OlyGame.Ceremony.stop(); showScreen('lobby'); renderLobby();
      }
    }
  }

  // --- WETTKAMPF & TURNIER ---
  function initTournamentScores() {
    app.tournamentScores = {};
    app.players.forEach(p => {
      app.tournamentScores[p.id] = { id: p.id, name: p.name, country: p.country, playerIndex: p.slotIndex, points: 0, gold: 0, silver: 0, bronze: 0 };
    });
  }

  function startMatch() {
    const queue = app.gameMode === 'full' ? CFG.EVENTS.map(e => e.id) : app.selectedEvents.slice();
    if (queue.length === 0) return;
    app.tournamentQueue = queue;
    app.tournamentIndex = 0;
    initTournamentScores();
    if (app.lobbyType === 'host') OlyGame.Network.broadcast('start_match', { players: app.players, queue: app.tournamentQueue });
    startEventAtIndex(0);
  }

  function startEventAtIndex(idx) {
    cleanupActiveEvent();
    app.tournamentIndex = idx;
    app.inCeremony = false;
    app.eventFinished = false;
    OlyGame.Ceremony.stop();
    document.getElementById('results-overlay').classList.add('hidden');
    showScreen('game');

    const eventId = app.tournamentQueue[idx];
    app.activeEventId = eventId;
    const evMeta = CFG.getEvent(eventId);

    document.getElementById('hud-event-name').textContent = evMeta.name;
    const hIcon = document.getElementById('hud-event-icon');
    if (hIcon) { hIcon.src = evMeta.iconImg; hIcon.classList.remove('hidden'); }
    const progEl = document.getElementById('hud-tournament-progress');
    if (app.tournamentQueue.length > 1) {
      progEl.textContent = 'DISZIPLIN ' + (idx + 1) + ' / ' + app.tournamentQueue.length;
      progEl.classList.remove('hidden');
    } else progEl.classList.add('hidden');

    document.getElementById('controls-bar').innerHTML = evMeta.controlsHint;

    const instance = OlyGame.Events[eventId]();
    app.activeEventInstance = instance;

    instance.init({
      eventId,
      players: app.players,
      localPlayerIds: app.localPlayerIds,
      isOnline: app.lobbyType !== 'local',
      isHost: app.lobbyType === 'host',
      setSpectatorBanner,
      onSyncOut: (payload) => {
        if (app.lobbyType === 'host') OlyGame.Network.broadcast('event_sync', payload);
        else if (app.lobbyType === 'client') OlyGame.Network.sendToHost('event_sync', payload);
      },
      onFinish: (results) => {
        if (app.eventFinished) return;
        if (app.lobbyType === 'host') OlyGame.Network.broadcast('event_results', { results });
        handleEventResults(results, false);
      }
    });
  }

  function handleEventResults(results) {
    app.eventFinished = true;
    if (gameCanvas) gameCanvas.classList.remove('crosshair-mode');
    app.lastEventResults = results;
    setSpectatorBanner(null);

    const evMeta = CFG.getEvent(app.activeEventId);
    const isTournament = app.tournamentQueue.length > 1;

    results.forEach((r, rankIdx) => {
      if (!r.isBot && !r.foul && r.value > 0) {
        const rec = OlyGame.Records.submitScore(app.activeEventId, r.value, r.name);
        r.newPB = rec.newPB; r.newWR = rec.newWR;
      }
      if (!r.isBot && app.tournamentScores[r.id]) {
        const ts = app.tournamentScores[r.id];
        const pts = r.foul ? 0 : (CFG.TOURNAMENT_POINTS[rankIdx] || 1);
        ts.points += pts;
        if (!r.foul) {
          if (rankIdx === 0) ts.gold++;
          else if (rankIdx === 1) ts.silver++;
          else if (rankIdx === 2) ts.bronze++;
        }
      }
    });

    document.getElementById('results-title').textContent = '★ ERGEBNIS: ' + evMeta.name + ' ★';
    document.getElementById('results-subtitle').textContent = isTournament
      ? ('Disziplin ' + (app.tournamentIndex + 1) + ' von ' + app.tournamentQueue.length + ' abgeschlossen')
      : 'Einzeldisziplin abgeschlossen';

    let html = '<table class="data-table"><thead><tr><th>Platz</th><th>Athlet</th><th>Land</th><th>Leistung</th></tr></thead><tbody>';
    results.forEach((r, i) => {
      const medal = i === 0 ? '🥇 ' : (i === 1 ? '🥈 ' : (i === 2 ? '🥉 ' : (i + 1) + '. '));
      const valText = r.foul ? 'Ungültig' : OlyGame.Records.formatValue(app.activeEventId, r.value);
      const tags = (r.isBot ? '<span class="bot-tag">BOT</span>' : '') +
        (r.newWR ? '<span class="record-tag">WR!</span>' : (r.newPB ? '<span class="record-tag">NEUE PB!</span>' : ''));
      html += '<tr class="' + (r.isBot ? '' : 'is-human') + '">' +
        '<td><strong>' + medal + '</strong></td>' +
        '<td>' + escapeHtml(r.name) + tags + '</td>' +
        '<td>' + escapeHtml(CFG.getCountry(r.country).name) + '</td>' +
        '<td><strong>' + valText + '</strong></td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('results-table-wrap').innerHTML = html;

    const tWrap = document.getElementById('tournament-standings-wrap');
    if (isTournament) {
      tWrap.classList.remove('hidden');
      const ranked = getRankedTournamentPlayers();
      let thtml = '<table class="data-table"><thead><tr><th>Rang</th><th>Spieler</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Punkte</th></tr></thead><tbody>';
      ranked.forEach((t, i) => {
        thtml += '<tr class="is-human"><td><strong>' + (i + 1) + '.</strong></td>' +
          '<td>' + escapeHtml(t.name) + ' (' + t.country + ')</td>' +
          '<td>' + t.gold + '</td><td>' + t.silver + '</td><td>' + t.bronze + '</td>' +
          '<td><strong>' + t.points + ' Pkt</strong></td></tr>';
      });
      thtml += '</tbody></table>';
      document.getElementById('tournament-table-wrap').innerHTML = thtml;
    } else tWrap.classList.add('hidden');

    const isClient = app.lobbyType === 'client';
    const hasMore = app.tournamentIndex < app.tournamentQueue.length - 1;
    const btnNext = document.getElementById('btn-results-next');
    const btnCeremony = document.getElementById('btn-results-ceremony');
    const btnRetry = document.getElementById('btn-results-retry');
    const btnLobby = document.getElementById('btn-results-lobby');

    btnNext.classList.toggle('hidden', !hasMore); btnNext.disabled = isClient;
    btnCeremony.classList.toggle('hidden', hasMore); btnCeremony.disabled = isClient;
    btnRetry.classList.toggle('hidden', isTournament || isClient);
    btnLobby.disabled = isClient;

    app.nav.resultIdx = 0; // Fokus automatisch auf primaeren Button ("Naechste Disziplin" oder "Siegerehrung")!
    document.getElementById('results-overlay').classList.remove('hidden');
    applyGamepadFocusVisuals();
  }

  function getRankedTournamentPlayers() {
    return Object.values(app.tournamentScores).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gold !== a.gold) return b.gold - a.gold;
      return b.silver - a.silver;
    });
  }

  function openCeremony(ranked) {
    document.getElementById('results-overlay').classList.add('hidden');
    cleanupActiveEvent();
    app.inCeremony = true;
    document.getElementById('hud-event-name').textContent = '★ SIEGEREHRUNG ★';
    const hIcon = document.getElementById('hud-event-icon'); if (hIcon) hIcon.classList.add('hidden');
    document.getElementById('controls-bar').innerHTML = 'Herzlichen Glückwunsch! Drücke <span class="xb xb-a">A</span>, <kbd>Leertaste</kbd> oder klicke ins Bild für die Lobby.';
    OlyGame.Ceremony.start(ranked);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function renderRecordsModal() {
    let html = '<table class="data-table"><thead><tr><th>Disziplin</th><th>Weltrekord (WR)</th><th>Deine Bestleistung (PB)</th><th>Rekordhalter</th></tr></thead><tbody>';
    CFG.EVENTS.forEach(ev => {
      const pb = OlyGame.Records.getPB(ev.id);
      html += '<tr><td><img src="' + ev.iconImg + '" style="width:36px;height:20px;object-fit:cover;vertical-align:middle;margin-right:8px;border-radius:3px;border:1px solid #000;"><strong>' + ev.name + '</strong></td>' +
        '<td>' + OlyGame.Records.formatValue(ev.id, ev.wr) + '</td>' +
        '<td><strong>' + (pb ? OlyGame.Records.formatValue(ev.id, pb.value) : '---') + '</strong></td>' +
        '<td>' + (pb ? escapeHtml(pb.holder) : '---') + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('records-table-container').innerHTML = html;
  }

  // --- LAUTSTAERKEREGLER ---
  const volMusicSlider = document.getElementById('vol-music');
  const volMusicVal = document.getElementById('vol-music-val');
  const btnMusic = document.getElementById('btn-music');
  const volSfxSlider = document.getElementById('vol-sfx');
  const volSfxVal = document.getElementById('vol-sfx-val');
  const btnSound = document.getElementById('btn-sound');

  function syncAudioUI() {
    const mv = Math.round(OlyGame.Audio.getMusicVolume() * 100);
    const sv = Math.round(OlyGame.Audio.getSfxVolume() * 100);
    const mm = OlyGame.Audio.isMusicMuted() || mv === 0;
    const sm = OlyGame.Audio.isSfxMuted() || sv === 0;
    if (volMusicSlider) volMusicSlider.value = mm ? 0 : mv;
    if (volMusicVal) volMusicVal.textContent = (mm ? 0 : mv) + '%';
    if (btnMusic) btnMusic.textContent = mm ? '🔇' : '🎵';
    if (volSfxSlider) volSfxSlider.value = sm ? 0 : sv;
    if (volSfxVal) volSfxVal.textContent = (sm ? 0 : sv) + '%';
    if (btnSound) btnSound.textContent = sm ? '🔇' : '🔊';
  }
  syncAudioUI();

  volMusicSlider.addEventListener('input', (e) => { OlyGame.Audio.setMusicVolume(Number(e.target.value) / 100); syncAudioUI(); });
  btnMusic.onclick = () => { OlyGame.Audio.toggleMusicMute(); syncAudioUI(); };
  volSfxSlider.addEventListener('input', (e) => { OlyGame.Audio.setSfxVolume(Number(e.target.value) / 100); syncAudioUI(); });
  volSfxSlider.addEventListener('change', () => OlyGame.Audio.click());
  btnSound.onclick = () => { OlyGame.Audio.toggleSfxMute(); syncAudioUI(); };

  // --- UI LISTENERS ---
  document.getElementById('btn-mode-local').onclick = () => { OlyGame.Audio.click(); initLocalLobby(); };
  document.getElementById('btn-mode-host').onclick = () => { OlyGame.Audio.click(); initHostLobby(); };
  document.getElementById('btn-mode-join').onclick = () => {
    OlyGame.Audio.click();
    document.getElementById('join-panel').classList.remove('hidden');
    document.getElementById('input-room-code').focus();
  };
  document.getElementById('btn-cancel-join').onclick = () => document.getElementById('join-panel').classList.add('hidden');
  document.getElementById('btn-do-join').onclick = () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code.length < 4) { document.getElementById('join-error').textContent = 'Bitte gültigen Raumcode eingeben.'; return; }
    joinOnlineLobby(code);
  };

  document.getElementById('btn-add-local-player').onclick = () => {
    if (app.players.length >= 4) return;
    OlyGame.Audio.click();
    const idx = app.players.length;
    app.players.push({
      id: 'local_' + Date.now() + '_' + idx,
      name: 'Spieler ' + (idx + 1),
      country: CFG.getPickerCountries()[idx % 15].code,
      slotIndex: idx
    });
    app.activeEditSlot = idx;
    reassignSlots(); renderLobby();
  };

  document.getElementById('btn-remove-active-player').onclick = () => {
    if (app.lobbyType !== 'local' || app.players.length <= 1) return;
    OlyGame.Audio.click();
    app.players.splice(app.activeEditSlot, 1);
    reassignSlots(); renderLobby();
  };

  document.getElementById('active-player-name').addEventListener('input', (e) => {
    const val = e.target.value.slice(0, 14) || ('Spieler ' + (app.activeEditSlot + 1));
    if (app.lobbyType === 'local') {
      const pl = app.players[app.activeEditSlot];
      if (pl) pl.name = val;
    } else {
      app.myOnlineProfile.name = val;
      if (app.lobbyType === 'host') {
        const me = app.players.find(p => p.id === OlyGame.Network.getMyId());
        if (me) me.name = val;
        broadcastLobbyState();
      } else {
        OlyGame.Network.sendToHost('profile_update', { name: val, country: app.myOnlineProfile.country });
      }
    }
  });

  document.getElementById('btn-copy-code').onclick = () => {
    const code = OlyGame.Network.getRoomCode(); if (!code) return;
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    const btn = document.getElementById('btn-copy-code');
    btn.textContent = 'KOPIERT!';
    setTimeout(() => { btn.textContent = 'KOPIEREN'; }, 1400);
  };

  document.querySelectorAll('#mode-tabs .f-tab').forEach(btn => {
    btn.onclick = () => {
      if (app.lobbyType === 'client') return;
      OlyGame.Audio.click();
      app.gameMode = btn.dataset.gamemode;
      if (app.gameMode === 'single' && app.selectedEvents.length !== 1) app.selectedEvents = [app.selectedEvents[0] || 'sprint100'];
      broadcastLobbyState(); renderLobby();
    };
  });

  document.getElementById('btn-start-match').onclick = () => { OlyGame.Audio.click(); startMatch(); };
  document.getElementById('btn-leave-lobby').onclick = () => { OlyGame.Audio.click(); OlyGame.Network.disconnect(); showScreen('title'); };
  document.getElementById('btn-home').onclick = () => {
    OlyGame.Audio.click(); OlyGame.Network.disconnect(); cleanupActiveEvent();
    app.inCeremony = false; OlyGame.Ceremony.stop();
    document.getElementById('results-overlay').classList.add('hidden');
    showScreen('title');
  };

  document.getElementById('btn-abort-event').onclick = () => {
    OlyGame.Audio.click();
    if (app.lobbyType === 'host') OlyGame.Network.broadcast('return_lobby', {});
    cleanupActiveEvent(); app.inCeremony = false; OlyGame.Ceremony.stop();
    document.getElementById('results-overlay').classList.add('hidden');
    showScreen('lobby'); renderLobby();
  };

  document.getElementById('btn-results-next').onclick = () => {
    OlyGame.Audio.click();
    const nextIdx = app.tournamentIndex + 1;
    if (app.lobbyType === 'host') OlyGame.Network.broadcast('next_event', { index: nextIdx });
    startEventAtIndex(nextIdx);
  };

  document.getElementById('btn-results-ceremony').onclick = () => {
    OlyGame.Audio.click();
    const ranked = app.tournamentQueue.length > 1 ? getRankedTournamentPlayers() : (app.lastEventResults || []).slice(0, 3);
    if (app.lobbyType === 'host') OlyGame.Network.broadcast('show_ceremony', { ranked });
    openCeremony(ranked);
  };

  document.getElementById('btn-results-retry').onclick = () => { OlyGame.Audio.click(); startEventAtIndex(app.tournamentIndex); };
  document.getElementById('btn-results-lobby').onclick = () => {
    OlyGame.Audio.click();
    if (app.lobbyType === 'host') OlyGame.Network.broadcast('return_lobby', {});
    cleanupActiveEvent(); document.getElementById('results-overlay').classList.add('hidden');
    showScreen('lobby'); renderLobby();
  };

  gameCanvas.addEventListener('click', () => {
    if (app.inCeremony && app.lobbyType !== 'client') {
      if (app.lobbyType === 'host') OlyGame.Network.broadcast('return_lobby', {});
      app.inCeremony = false; OlyGame.Ceremony.stop(); showScreen('lobby'); renderLobby();
    }
  });

  document.getElementById('btn-help').onclick = () => document.getElementById('modal-help').classList.remove('hidden');
  document.getElementById('btn-open-records').onclick = () => { renderRecordsModal(); document.getElementById('modal-records').classList.remove('hidden'); };
  document.getElementById('btn-reset-records').onclick = () => {
    if (confirm('Alle lokal gespeicherten Bestleistungen (PB) wirklich löschen?')) { OlyGame.Records.reset(); renderRecordsModal(); }
  };
  document.querySelectorAll('.btn-close').forEach(b => {
    b.onclick = () => document.getElementById(b.dataset.close).classList.add('hidden');
  });

  OlyGame.Audio.setMenuMusic(true);

  // --- ABGESICHERTER 60-FPS HAUPT-LOOP ---
  let lastTime = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    try {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      OlyGame.Input.poll(dt);

      // Controller-Menue-Navigation immer aktiv wenn kein aktives Live-Event laeuft!
      const inMenuOrOverlay = (app.screen !== 'game') || app.inCeremony || app.eventFinished ||
        !document.getElementById('modal-help').classList.contains('hidden') ||
        !document.getElementById('modal-records').classList.contains('hidden');
      if (inMenuOrOverlay) {
        handleMenuController();
      }

      if (app.screen === 'title') {
        renderTitleBanner(dt);
      } else if (app.screen === 'lobby') {
        renderLobbyAthletePreview(dt);
      } else if (app.screen === 'game') {
        if (app.inCeremony) {
          OlyGame.Ceremony.update(dt);
          OlyGame.Ceremony.render(pctx, gctx);
          const inp = OlyGame.Input.getPlayerInput(0, true);
          if (inp.actionPressed && app.lobbyType !== 'client') {
            if (app.lobbyType === 'host') OlyGame.Network.broadcast('return_lobby', {});
            app.inCeremony = false; OlyGame.Ceremony.stop(); showScreen('lobby'); renderLobby();
          }
        } else if (app.activeEventInstance) {
          if (!app.eventFinished) app.activeEventInstance.update(dt);
          if (app.activeEventInstance) app.activeEventInstance.render(pctx, gctx);
        }
      }

      OlyGame.Input.endFrame();
    } catch (err) {
      console.error('Game loop error:', err);
    }
  }

  requestAnimationFrame(loop);
})();
