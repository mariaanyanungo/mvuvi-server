






const { normalizeUid, parseJsonObject, toNumber, validCoordinates, parseDate } = require('../../utils/normalize');
const locationService = require('../../services/locationService');

function parse(text) {
  const obj = parseJsonObject(text);
  if (!obj) return null;
  const uid = normalizeUid(String(obj.cardId || obj.uid || ''));
  const latitude = toNumber(obj.latitude ?? obj.lat);
  const longitude = toNumber(obj.longitude ?? obj.lon ?? obj.lng);
  if (!uid || !validCoordinates(latitude, longitude)) return null;
  return { uid, latitude, longitude, recordedAt: parseDate(obj.recordedAt) };
}

async function handle(text) {
  const message = parse(text);
  if (!message) {
    console.warn(`[LOCATION] Ignoring malformed payload: ${text}`);
    return;
  }
  await locationService.ingestLocation(message);
}

module.exports = { handle };
