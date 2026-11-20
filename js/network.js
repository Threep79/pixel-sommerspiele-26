window.OlyGame = window.OlyGame || {};

OlyGame.Network = (function () {
  const PREFIX = 'pixelsommer2026-';
  let peer = null, isHost = false, roomCode = null, myPeerId = null;
  let connections = {}, hostConn = null, handlers = {};

  function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function emit(type, payload, fromId) {
    if (handlers[type]) handlers[type](payload, fromId);
  }

  function disconnect() {
    Object.values(connections).forEach(c => { try { c.close(); } catch (e) {} });
    connections = {};
    if (hostConn) { try { hostConn.close(); } catch (e) {} hostConn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    isHost = false; roomCode = null; myPeerId = null;
  }

  function createRoom(onReady, onError) {
    if (typeof window.Peer === 'undefined') {
      if (onError) onError('PeerJS konnte nicht geladen werden (Internetverbindung erforderlich).');
      return;
    }
    disconnect();
    isHost = true;
    roomCode = randomCode();
    try { peer = new Peer(PREFIX + roomCode, { debug: 0 }); }
    catch (e) { if (onError) onError('PeerJS-Start fehlgeschlagen: ' + e.message); return; }

    peer.on('open', (id) => { myPeerId = id; if (onReady) onReady(roomCode, id); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (Object.keys(connections).length >= 3) {
          conn.send({ type: 'room_full' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        connections[conn.peer] = conn;
        emit('client_connected', { peerId: conn.peer }, conn.peer);
      });
      conn.on('data', (msg) => { if (msg && msg.type) emit(msg.type, msg.payload, conn.peer); });
      conn.on('close', () => { delete connections[conn.peer]; emit('client_disconnected', { peerId: conn.peer }, conn.peer); });
    });
    peer.on('error', (err) => { if (onError) onError('Netzwerkfehler: ' + (err.type || err.message)); });
  }

  function joinRoom(code, onReady, onError) {
    if (typeof window.Peer === 'undefined') {
      if (onError) onError('PeerJS konnte nicht geladen werden.');
      return;
    }
    disconnect();
    isHost = false;
    roomCode = code.trim().toUpperCase();
    const targetId = PREFIX + roomCode;
    try { peer = new Peer(undefined, { debug: 0 }); }
    catch (e) { if (onError) onError('PeerJS-Start fehlgeschlagen.'); return; }

    let connected = false;
    const timeout = setTimeout(() => {
      if (!connected) { disconnect(); if (onError) onError('Raum "' + roomCode + '" nicht gefunden.'); }
    }, 9000);

    peer.on('open', (id) => {
      myPeerId = id;
      hostConn = peer.connect(targetId, { reliable: true });
      hostConn.on('open', () => { connected = true; clearTimeout(timeout); if (onReady) onReady(roomCode, id); });
      hostConn.on('data', (msg) => { if (msg && msg.type) emit(msg.type, msg.payload, targetId); });
      hostConn.on('close', () => emit('host_disconnected', {}));
      hostConn.on('error', () => { clearTimeout(timeout); if (onError) onError('Verbindung fehlgeschlagen.'); });
    });
    peer.on('error', (err) => { clearTimeout(timeout); if (onError) onError('Raumcode nicht erreichbar.'); });
  }

  return {
    createRoom, joinRoom, disconnect,
    sendToHost(type, payload) { if (hostConn && hostConn.open) hostConn.send({ type, payload }); },
    broadcast(type, payload, excludePeerId) {
      Object.keys(connections).forEach(pid => {
        if (pid === excludePeerId) return;
        const c = connections[pid];
        if (c && c.open) c.send({ type, payload });
      });
    },
    on(type, fn) { handlers[type] = fn; },
    clearHandlers() { handlers = {}; },
    isOnline: () => !!peer,
    isHost: () => isHost,
    getRoomCode: () => roomCode,
    getMyId: () => myPeerId
  };
})();
