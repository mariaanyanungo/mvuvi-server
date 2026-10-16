const { normalizeUid, parseJsonObject } = require('../../utils/normalize');
const tripService = require('../../services/tripService');

const KNOWN_EVENTS = new Set(['checkin', 'checkout', 'scan']);

function parse(text) {
  const obj = parseJsonObject(text);
  if (obj) {
    const uid = normalizeUid(String(obj.cardId || obj.uid || ''));
    const event = String(obj.event || 'scan').trim().toLowerCase();
    return uid ? { uid, event: KNOWN_EVENTS.has(event) ? event : 'scan' } : null;
  }
  const uid = normalizeUid(text);
  return uid ? { uid, event: 'scan' } : null;
}

async function handle(text) {
  const message = parse(text);
  if (!message) {
    console.warn(`[RFID] Ignoring malformed payload: ${text}`);
    return;
  }
  await tripService.processRfid(message);
}

module.exports = { handle };