function normalizeUid(raw) {
  if (typeof raw !== 'string') return null;
  const hex = raw.trim().replace(/^0x/i, '').toUpperCase();
  if (!/^[0-9A-F]+$/.test(hex) || ![8, 14, 20].includes(hex.length)) return null;
  return `0x${hex}`;
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (err) {
    return null;
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoordinates(lat, lon) {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return !(lat === 0 && lon === 0);
}

function parseDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

module.exports = { normalizeUid, parseJsonObject, toNumber, validCoordinates, parseDate, isUuid, clampInt };
