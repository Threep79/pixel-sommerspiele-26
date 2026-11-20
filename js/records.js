window.OlyGame = window.OlyGame || {};

OlyGame.Records = (function () {
  const STORAGE_KEY = 'pixel_sommerspiele_pb_v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveAll(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function formatValue(eventId, val) {
    if (val === null || val === undefined || isNaN(val)) return '---';
    const ev = OlyGame.CONFIG.getEvent(eventId);
    if (ev.unit === 'kg' || ev.unit === 'Pkt') return Math.round(val) + ' ' + ev.unit;
    return Number(val).toFixed(2) + ' ' + ev.unit;
  }

  function isBetter(eventId, newVal, oldVal) {
    if (oldVal === null || oldVal === undefined) return true;
    const ev = OlyGame.CONFIG.getEvent(eventId);
    return ev.lowerIsBetter ? (newVal < oldVal) : (newVal > oldVal);
  }

  function submitScore(eventId, value, holderName) {
    if (value === null || value === undefined || isNaN(value) || value <= 0) {
      return { newPB: false, newWR: false };
    }
    const ev = OlyGame.CONFIG.getEvent(eventId);
    const all = loadAll();
    const cur = all[eventId];
    let newPB = false, newWR = false;
    if (!cur || isBetter(eventId, value, cur.value)) {
      all[eventId] = { value: Number(value.toFixed(2)), holder: holderName || 'Spieler' };
      saveAll(all);
      newPB = true;
    }
    if (isBetter(eventId, value, ev.wr)) newWR = true;
    return { newPB, newWR };
  }

  function getPB(eventId) { return loadAll()[eventId] || null; }
  function reset() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }

  return { getPB, submitScore, formatValue, isBetter, reset };
})();
