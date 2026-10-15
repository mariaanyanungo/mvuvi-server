





const { normalizeUid, parseJsonObject, toNumber, parseDate } = require('../../utils/normalize');
const alertService = require('../../services/alertService');

function parse(text) {
  const obj = parseJsonObject(text);
  if (obj) {
    const uid = normalizeUid(String(obj.cardId || obj.uid || ''));
    if (!uid) return null;
    return {
      uid,
      latitude: toNumber(obj.latitude ?? obj.lat),
      longitude: toNumber(obj.longitude ?? obj.lon ?? obj.lng),
      triggeredAt: parseDate(obj.triggeredAt)
    };
  }
  const uid = normalizeUid(text);
  return uid ? { uid, latitude: null, longitude: null, triggeredAt: new Date() } : null;
}

async function handle(text) {
  const message = parse(text);
  if (!message) {
    console.warn(`[SOS] Ignoring malformed payload: ${text}`);
    return;
  }
  await alertService.raiseSos(message);
}

module.exports = { handle };
