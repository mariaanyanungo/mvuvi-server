const { config } = require('../../config');
const { parseJsonObject } = require('../../utils/normalize');
const registry = require('../../devices/registry');

async function handle(text) {
  const obj = parseJsonObject(text);
  const state = obj && String(obj.state || '').toLowerCase();
  if (state !== 'online' && state !== 'offline') {
    console.warn(`[STATUS] Ignoring malformed payload: ${text}`);
    return;
  }
  registry.setState(String(obj.deviceId || config.station.deviceId), state);
}

module.exports = { handle };
