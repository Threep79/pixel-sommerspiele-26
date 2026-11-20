window.OlyGame = window.OlyGame || {};

OlyGame.Input = (function () {
  const keysDown = new Set();
  const prevKeys = new Set();
  const prevPads = {};
  let gamepadEnabled = false;
  let framePads = [];
  let stickRepeatTimer = 0;

  const mouse = { x: 240, y: 110, moved: false, down: false, pressed: false, released: false };

  function bindCanvas(canvas) {
    if (!canvas) return;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouse.x = ((e.clientX - rect.left) / rect.width) * OlyGame.CONFIG.PW;
      mouse.y = ((e.clientY - rect.top) / rect.height) * OlyGame.CONFIG.PH;
      mouse.moved = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * OlyGame.CONFIG.PW;
        mouse.y = ((e.clientY - rect.top) / rect.height) * OlyGame.CONFIG.PH;
        mouse.down = true;
        mouse.pressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (mouse.down) mouse.released = true;
        mouse.down = false;
      }
    });
  }

  function readHardwarePads() {
    if (!gamepadEnabled || !navigator.getGamepads) return [];
    try {
      const raw = navigator.getGamepads();
      const list = [];
      for (let i = 0; i < raw.length; i++) {
        const p = raw[i];
        if (p && p.connected) list.push(p);
      }
      return list;
    } catch (e) { return []; }
  }

  function updateStatusBadge() {
    const el = document.getElementById('gamepad-status');
    if (!el) return;
    if (!gamepadEnabled) {
      el.textContent = 'Controller: Aus (Klick/F9)';
      el.className = 'hdr-pill pill-gamepad-off';
      el.title = 'Erst Xbox-Controller einschalten bis Logo dauerhaft leuchtet, dann hier klicken oder F9 drücken!';
      return;
    }
    const n = framePads.length;
    if (n > 0) {
      el.textContent = n === 1 ? '1 Controller aktiv' : (n + ' Controller aktiv');
      el.className = 'hdr-pill pill-gamepad-on';
      el.title = 'Aktiv: ' + (framePads[0].id || 'Gamepad') + ' – D-Pad/Stick + A/B/LB/RB/Start steuern alle Menüs (Klick = Aus)';
    } else {
      el.textContent = 'Drücke A am Controller...';
      el.className = 'hdr-pill pill-gamepad-wait';
      el.title = 'Drücke jetzt kurz A am eingeschalteten Xbox-Controller (oder klicke hier zum Deaktivieren)';
    }
  }

  function onPadConnect() { if (!gamepadEnabled) return; framePads = readHardwarePads(); updateStatusBadge(); }
  function onPadDisconnect(e) {
    if (e && e.gamepad) delete prevPads[e.gamepad.index];
    if (!gamepadEnabled) return;
    framePads = readHardwarePads(); updateStatusBadge();
  }

  function enableGamepad() {
    gamepadEnabled = true;
    window.addEventListener('gamepadconnected', onPadConnect);
    window.addEventListener('gamepaddisconnected', onPadDisconnect);
    framePads = readHardwarePads();
    updateStatusBadge();
  }
  function disableGamepad() {
    gamepadEnabled = false;
    window.removeEventListener('gamepadconnected', onPadConnect);
    window.removeEventListener('gamepaddisconnected', onPadDisconnect);
    framePads = [];
    Object.keys(prevPads).forEach(k => delete prevPads[k]);
    updateStatusBadge();
  }
  function toggleGamepad() {
    if (gamepadEnabled) disableGamepad(); else enableGamepad();
    if (OlyGame.Audio && OlyGame.Audio.click) OlyGame.Audio.click();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') { e.preventDefault(); toggleGamepad(); return; }
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keysDown.add(e.code);
  });
  window.addEventListener('keyup', (e) => { keysDown.delete(e.code); });
  window.addEventListener('blur', () => { keysDown.clear(); mouse.down = false; });

  function poll(dt) {
    if (stickRepeatTimer > 0) stickRepeatTimer = Math.max(0, stickRepeatTimer - (dt || 0.016));
    if (!gamepadEnabled) return;
    const prevLen = framePads.length;
    framePads = readHardwarePads();
    if (framePads.length !== prevLen) updateStatusBadge();
  }

  function endFrame() {
    prevKeys.clear();
    keysDown.forEach(k => prevKeys.add(k));
    mouse.pressed = false;
    mouse.released = false;
    mouse.moved = false;
    if (gamepadEnabled) {
      for (let i = 0; i < framePads.length; i++) {
        const p = framePads[i];
        prevPads[p.index] = { buttons: p.buttons.map(b => !!b.pressed), axes: p.axes.slice() };
      }
    }
  }

  function keyDown(code) { return keysDown.has(code); }
  function keyPressed(code) { return keysDown.has(code) && !prevKeys.has(code); }
  function keyReleased(code) { return !keysDown.has(code) && prevKeys.has(code); }

  function padBtnDown(p, btnIdx) { return !!(p && p.buttons[btnIdx] && p.buttons[btnIdx].pressed); }
  function padBtnPressed(p, btnIdx) { return !!(p && padBtnDown(p, btnIdx) && !(prevPads[p.index] && prevPads[p.index].buttons[btnIdx])); }
  function padBtnReleased(p, btnIdx) { return !!(p && !padBtnDown(p, btnIdx) && !!(prevPads[p.index] && prevPads[p.index].buttons[btnIdx])); }
  function padAxisDir(p, axis, dir) {
    if (!p || p.axes.length <= axis) return false;
    return dir < 0 ? p.axes[axis] < -0.55 : p.axes[axis] > 0.55;
  }
  function padAxisPressed(p, axis, dir) {
    if (!p) return false;
    const cur = padAxisDir(p, axis, dir);
    const prevAxes = prevPads[p.index] && prevPads[p.index].axes;
    const prev = prevAxes && prevAxes.length > axis ? (dir < 0 ? prevAxes[axis] < -0.55 : prevAxes[axis] > 0.55) : false;
    return cur && !prev;
  }

  function getMenuInput() {
    const out = { up: false, down: false, left: false, right: false, confirm: false, back: false, lb: false, rb: false, start: false, yBtn: false, xBtn: false };
    if (!gamepadEnabled || framePads.length === 0) return out;
    for (let i = 0; i < framePads.length; i++) {
      const p = framePads[i];
      if (padBtnPressed(p, 12) || padAxisPressed(p, 1, -1)) { out.up = true; stickRepeatTimer = 0.28; }
      if (padBtnPressed(p, 13) || padAxisPressed(p, 1, 1)) { out.down = true; stickRepeatTimer = 0.28; }
      if (padBtnPressed(p, 14) || padAxisPressed(p, 0, -1)) { out.left = true; stickRepeatTimer = 0.28; }
      if (padBtnPressed(p, 15) || padAxisPressed(p, 0, 1)) { out.right = true; stickRepeatTimer = 0.28; }
      if (padBtnPressed(p, 0)) out.confirm = true; // A
      if (padBtnPressed(p, 1)) out.back = true;    // B
      if (padBtnPressed(p, 2)) out.xBtn = true;    // X
      if (padBtnPressed(p, 3)) out.yBtn = true;    // Y
      if (padBtnPressed(p, 4)) out.lb = true;      // LB
      if (padBtnPressed(p, 5)) out.rb = true;      // RB
      if (padBtnPressed(p, 9)) out.start = true;   // Start/Menu

      if (!out.up && !out.down && !out.left && !out.right && stickRepeatTimer <= 0) {
        if (padBtnDown(p, 12) || padAxisDir(p, 1, -1)) { out.up = true; stickRepeatTimer = 0.17; }
        else if (padBtnDown(p, 13) || padAxisDir(p, 1, 1)) { out.down = true; stickRepeatTimer = 0.17; }
        else if (padBtnDown(p, 14) || padAxisDir(p, 0, -1)) { out.left = true; stickRepeatTimer = 0.17; }
        else if (padBtnDown(p, 15) || padAxisDir(p, 0, 1)) { out.right = true; stickRepeatTimer = 0.17; }
      }
    }
    return out;
  }

  function getPlayerInput(slotIndex, omniMode) {
    const pads = gamepadEnabled ? framePads : [];
    let leftPressed = false, rightPressed = false;
    let actionDown = false, actionPressed = false, actionReleased = false;
    let leftHold = false, rightHold = false, upHold = false, downHold = false;
    let moveX = 0, moveY = 0;
    let firePressed = false, fireDown = false, fireReleased = false;

    if (omniMode) {
      leftPressed = keyPressed('KeyA') || keyPressed('ArrowLeft');
      rightPressed = keyPressed('KeyD') || keyPressed('ArrowRight');
      leftHold = keyDown('KeyA') || keyDown('ArrowLeft');
      rightHold = keyDown('KeyD') || keyDown('ArrowRight');
      upHold = keyDown('KeyW') || keyDown('ArrowUp');
      downHold = keyDown('KeyS') || keyDown('ArrowDown');
      if (leftHold) moveX -= 1;
      if (rightHold) moveX += 1;
      if (upHold) moveY -= 1;
      if (downHold) moveY += 1;

      actionDown = keyDown('Space') || keyDown('KeyW') || keyDown('ArrowUp');
      actionPressed = keyPressed('Space') || keyPressed('KeyW') || keyPressed('ArrowUp');
      actionReleased = keyReleased('Space') || keyReleased('KeyW') || keyReleased('ArrowUp');
      firePressed = keyPressed('Space') || mouse.pressed;
      fireDown = keyDown('Space') || mouse.down;
      fireReleased = keyReleased('Space') || mouse.released;

      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (padBtnPressed(p, 2) || padBtnPressed(p, 4) || padBtnPressed(p, 14) || padAxisPressed(p, 0, -1)) leftPressed = true;
        if (padBtnPressed(p, 1) || padBtnPressed(p, 5) || padBtnPressed(p, 15) || padAxisPressed(p, 0, 1)) rightPressed = true;
        if (padBtnDown(p, 2) || padBtnDown(p, 14) || padAxisDir(p, 0, -1)) leftHold = true;
        if (padBtnDown(p, 1) || padBtnDown(p, 15) || padAxisDir(p, 0, 1)) rightHold = true;
        if (padBtnDown(p, 0) || padBtnDown(p, 3)) actionDown = true;
        if (padBtnPressed(p, 0) || padBtnPressed(p, 3)) actionPressed = true;
        if (padBtnReleased(p, 0) || padBtnReleased(p, 3)) actionReleased = true;
        if (padBtnPressed(p, 0) || padBtnPressed(p, 7) || padBtnPressed(p, 5)) firePressed = true;
        if (padBtnDown(p, 0) || padBtnDown(p, 7) || padBtnDown(p, 5)) fireDown = true;
        if (padBtnReleased(p, 0) || padBtnReleased(p, 7) || padBtnReleased(p, 5)) fireReleased = true;
        if (p.axes.length >= 2) {
          if (Math.abs(p.axes[0]) > 0.16) moveX = p.axes[0];
          if (Math.abs(p.axes[1]) > 0.16) moveY = p.axes[1];
        }
        if (padBtnDown(p, 14)) moveX = -1;
        if (padBtnDown(p, 15)) moveX = 1;
        if (padBtnDown(p, 12)) moveY = -1;
        if (padBtnDown(p, 13)) moveY = 1;
      }
    } else {
      const kbMaps = [
        { left: 'KeyA', right: 'KeyD', act: 'KeyW', act2: 'Space' },
        { left: 'ArrowLeft', right: 'ArrowRight', act: 'ArrowUp', act2: 'Enter' },
        { left: 'KeyJ', right: 'KeyL', act: 'KeyI', act2: 'KeyK' },
        { left: 'Numpad4', right: 'Numpad6', act: 'Numpad8', act2: 'Numpad5' }
      ];
      const map = kbMaps[slotIndex % 4];
      leftPressed = keyPressed(map.left); rightPressed = keyPressed(map.right);
      leftHold = keyDown(map.left); rightHold = keyDown(map.right);
      actionDown = keyDown(map.act) || keyDown(map.act2);
      actionPressed = keyPressed(map.act) || keyPressed(map.act2);
      actionReleased = keyReleased(map.act) || keyReleased(map.act2);
      firePressed = actionPressed; fireDown = actionDown; fireReleased = actionReleased;

      const p = pads[slotIndex];
      if (p) {
        if (padBtnPressed(p, 2) || padBtnPressed(p, 4) || padBtnPressed(p, 14) || padAxisPressed(p, 0, -1)) leftPressed = true;
        if (padBtnPressed(p, 1) || padBtnPressed(p, 5) || padBtnPressed(p, 15) || padAxisPressed(p, 0, 1)) rightPressed = true;
        if (padBtnDown(p, 2) || padBtnDown(p, 14) || padAxisDir(p, 0, -1)) leftHold = true;
        if (padBtnDown(p, 1) || padBtnDown(p, 15) || padAxisDir(p, 0, 1)) rightHold = true;
        if (padBtnDown(p, 0) || padBtnDown(p, 3)) actionDown = true;
        if (padBtnPressed(p, 0) || padBtnPressed(p, 3)) actionPressed = true;
        if (padBtnReleased(p, 0) || padBtnReleased(p, 3)) actionReleased = true;
        if (padBtnPressed(p, 0) || padBtnPressed(p, 7)) firePressed = true;
        if (padBtnDown(p, 0) || padBtnDown(p, 7)) fireDown = true;
        if (padBtnReleased(p, 0) || padBtnReleased(p, 7)) fireReleased = true;
      }
    }

    return {
      leftPressed, rightPressed, leftHold, rightHold, upHold, downHold,
      actionDown, actionPressed, actionReleased, firePressed, fireDown, fireReleased,
      moveX, moveY, mouseX: mouse.x, mouseY: mouse.y, mouseMoved: mouse.moved
    };
  }

  setTimeout(() => {
    const el = document.getElementById('gamepad-status');
    if (el) { el.addEventListener('click', toggleGamepad); updateStatusBadge(); }
  }, 0);

  return {
    bindCanvas, poll, endFrame, toggleGamepad, enableGamepad, disableGamepad,
    getMenuInput, getPlayerInput, keyPressed,
    isGamepadEnabled: () => gamepadEnabled,
    getConnectedCount: () => framePads.length
  };
})();
