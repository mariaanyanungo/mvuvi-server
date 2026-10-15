







const { config } = require('../config');
const registry = require('../devices/registry');
const rfid = require('./handlers/rfidHandler');
const location = require('./handlers/locationHandler');
const sos = require('./handlers/sosHandler');
const status = require('./handlers/statusHandler');

const { topics } = config.mqtt;
const routes = new Map([
  [topics.rfid, rfid.handle],
  [topics.location, location.handle],
  [topics.sos, sos.handle],
  [topics.status, status.handle]
]);

async function route(topic, payload) {
  const text = payload.toString().trim();
  console.log(`[MQTT] ${topic}: ${text}`);

  const handler = routes.get(topic);
  if (!handler) {
    console.warn(`[MQTT] No handler for topic ${topic}`);
    return;
  }

  registry.touch(config.station.deviceId, topic);
  await handler(text);
}

module.exports = { route };
